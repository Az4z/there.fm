async function joinCall(){
  if(!room){toast('Entre em uma sala primeiro','err');return;}
  if(callActive)return;
  let stream;
  try{
    // CORRIGIDO: os valores abaixo eram exigências RÍGIDAS (não preferências), e
    // "latency:0.01" em especial forçava o driver de áudio a usar buffers de 10ms —
    // ótimo em teoria, péssimo na prática: qualquer pico de CPU (o quadro, um player
    // rodando, etc.) não tem margem nenhuma e o áudio estala. Isso não tinha relação
    // com o supressor de ruído; era essa configuração de captura. Agora tudo é
    // "ideal" (preferência, não obrigação) e sem forçar latência ultra-baixa —
    // o navegador escolhe um buffer estável e a voz sai limpa.
    stream=await navigator.mediaDevices.getUserMedia({audio:{
      echoCancellation:true, noiseSuppression:true, autoGainControl:true,
      channelCount:{ideal:1}, sampleRate:{ideal:48000}
    },video:false});
  }catch(e){
    toast('Não foi possível acessar o microfone — verifique as permissões do navegador','err');
    return;
  }
  localRawStream=stream;
  callAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(callAudioCtx.state==='suspended'){ try{await callAudioCtx.resume();}catch(e){} }

  /* ÁUDIO PIPOCANDO — mudança de estratégia.
     Por padrão a voz agora vai DIRETO do microfone para a rede, sem passar pelo
     AudioContext. Todo processamento em tempo real no navegador (AudioWorklet)
     roda num orçamento de poucos milissegundos por bloco; se o aparelho engasgar
     — e este app faz bastante coisa junto: players, quadro, canvas — o bloco perde
     o prazo e o resultado é exatamente o estalo que você ouve. Não é um ajuste que
     dê pra "acertar", é uma limitação de processar áudio na mesma linha de execução
     que a interface.
     A supressão de ruído NÃO some: as flags echoCancellation/noiseSuppression/
     autoGainControl continuam ativas na captura, e essas rodam em código nativo do
     navegador, fora do JavaScript — não estalam. O supressor extra fica disponível
     no botão do painel pra quem quiser, mas desligado por padrão. */
  if(noiseGateEnabled){
    localSentStream=await setupNoiseGate(localRawStream);
  }else{
    localSentStream=localRawStream;          // caminho limpo, sem processamento
    try{                                     // analisador só pro medidor de nível
      const srcNode=callAudioCtx.createMediaStreamSource(localRawStream);
      rawAnalyser=callAudioCtx.createAnalyser(); rawAnalyser.fftSize=512; rawAnalyser.smoothingTimeConstant=0.5;
      localAnalyser=rawAnalyser;
      srcNode.connect(rawAnalyser);
    }catch(e){}
  }
  callActive=true; localMuted=false; localDeafened=false;
  const idle=$('callActionsIdle'), active=$('callActionsActive');
  if(idle)idle.style.display='none'; if(active)active.style.display='flex';
  renderSelfCallRow();
  updateCallMuteBtnUI(); updateCallDeafenBtnUI();
  startCallMeterLoop();
  startMicWatchdog();
  updateGateBtnUI();
  broadcast({type:'CALL_JOIN',uid:U.id,name:U.name,color:U.color,photo:U.photo});
  toast('Você entrou na chamada 🎙️');
}
function leaveCall(){ if(!callActive)return; endCall(); toast('Você saiu da chamada'); }
function endCall(silent){
  if(!callActive)return;
  broadcast({type:'CALL_LEAVE',uid:U.id});
  Object.keys(callPeers).forEach(uid=>handleCallPeerGone(uid));
  callPeers={}; callParticipants={};
  if(localRawStream){ localRawStream.getTracks().forEach(t=>t.stop()); localRawStream=null; }
  if(localSentStream){ localSentStream.getTracks().forEach(t=>t.stop()); localSentStream=null; }
  if(noiseGateNode){ try{noiseGateNode.disconnect();}catch(e){} noiseGateNode=null; }
  if(callAudioCtx){ try{callAudioCtx.close();}catch(e){} callAudioCtx=null; }
  localAnalyser=null; rawAnalyser=null; _gateBypassed=false; stopMicWatchdog();
  cancelAnimationFrame(callMeterRAF); callMeterRAF=null;
  callActive=false; localMuted=false; localDeafened=false;
  const row=qs('.cpi[data-uid="'+U.id+'"]'); if(row)row.remove();
  const idle=$('callActionsIdle'), active=$('callActionsActive');
  if(idle)idle.style.display='flex'; if(active)active.style.display='none';
  updateCallFabBadge();
}

/* ── conexões WebRTC (malha) ── */
/* Ajusta os parâmetros do Opus direto no SDP — o navegador não expõe isso por API.
   • useinbandfec=1  : recupera pacotes perdidos sem retransmitir (rede instável soa muito melhor)
   • usedtx=1        : para de transmitir no silêncio, economiza banda
   • maxaveragebitrate: teto generoso pra voz (32kbps), bem acima do padrão conservador
   • stereo=0        : mono, coerente com a captura */
function tuneOpusSdp(sdp){
  try{
    const m=sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
    if(!m) return sdp;
    const pt=m[1];
    const opts='useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=32000';
    const re=new RegExp('(a=fmtp:'+pt+' )(.*)');
    if(re.test(sdp)) return sdp.replace(re,(s,a,b)=>a+b+';'+opts);
    return sdp.replace(new RegExp('(a=rtpmap:'+pt+' opus/48000[^\r\n]*)'),'$1\r\na=fmtp:'+pt+' '+opts);
  }catch(e){ return sdp; }
}
function createCallPeerConnection(uid){
  const pc=new RTCPeerConnection({iceServers:CALL_ICE_SERVERS});
  const entry={pc,audioEl:null,analyser:null,pendingCandidates:[]};
  if(localSentStream)localSentStream.getTracks().forEach(t=>pc.addTrack(t,localSentStream));
  pc.onicecandidate=e=>{ if(e.candidate)broadcast({type:'CALL_ICE',uid:U.id,to:uid,candidate:e.candidate}); };
  pc.ontrack=e=>{
    const remoteStream=e.streams[0];
    let audioEl=entry.audioEl;
    if(!audioEl){
      audioEl=document.createElement('audio'); audioEl.autoplay=true; audioEl.style.display='none'; audioEl.dataset.uid=uid;
      document.body.appendChild(audioEl); entry.audioEl=audioEl;
    }
    audioEl.srcObject=remoteStream; audioEl.muted=localDeafened;
    // BUG CORRIGIDO: era `audioEl.play?.catch(...)`, que pega a função `play` e tenta
    // ler `.catch` dela (inexistente) → TypeError lançado dentro do ontrack, abortando
    // o restante do handler. O certo é chamar play() e tratar a Promise.
    const _pr=audioEl.play(); if(_pr&&_pr.catch) _pr.catch(()=>{});
    try{
      const src=callAudioCtx.createMediaStreamSource(remoteStream);
      const an=callAudioCtx.createAnalyser(); an.fftSize=512; src.connect(an); entry.analyser=an;
    }catch(err){}
  };
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='failed'){ try{pc.restartIce();}catch(e){} }
  };
  return entry;
}
function callConnectTo(uid,info){
  if(callPeers[uid])return;
  callParticipants[uid]=Object.assign({muted:false},callParticipants[uid]||{},info||{});
  callPeers[uid]=createCallPeerConnection(uid);
  renderCallParticipant(uid);
  if(U.id<uid)callMakeOffer(uid); // regra determinística: só o uid "menor" oferece, evita glare
}
async function callMakeOffer(uid){
  const entry=callPeers[uid]; if(!entry)return;
  try{
    const offer=await entry.pc.createOffer();
    offer.sdp=tuneOpusSdp(offer.sdp);
    await entry.pc.setLocalDescription(offer);
    broadcast({type:'CALL_OFFER',uid:U.id,to:uid,sdp:entry.pc.localDescription});
  }catch(e){ console.error('callMakeOffer',e); }
}
async function handleCallOffer(uid,sdp){
  if(!callActive)return; // só respondo se eu também estiver na chamada
  if(!callPeers[uid]){ callParticipants[uid]=callParticipants[uid]||{muted:false}; callPeers[uid]=createCallPeerConnection(uid); renderCallParticipant(uid); }
  const entry=callPeers[uid];
  try{
    await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    (entry.pendingCandidates||[]).forEach(c=>entry.pc.addIceCandidate(c).catch(()=>{}));
    entry.pendingCandidates=[];
    const answer=await entry.pc.createAnswer();
    answer.sdp=tuneOpusSdp(answer.sdp);
    await entry.pc.setLocalDescription(answer);
    broadcast({type:'CALL_ANSWER',uid:U.id,to:uid,sdp:entry.pc.localDescription});
  }catch(e){ console.error('handleCallOffer',e); }
}
async function handleCallAnswer(uid,sdp){
  const entry=callPeers[uid]; if(!entry)return;
  try{
    await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    (entry.pendingCandidates||[]).forEach(c=>entry.pc.addIceCandidate(c).catch(()=>{}));
    entry.pendingCandidates=[];
  }catch(e){ console.error('handleCallAnswer',e); }
}
function handleCallIce(uid,candidate){
  const entry=callPeers[uid]; if(!entry||!candidate)return;
  const ice=new RTCIceCandidate(candidate);
  if(entry.pc.remoteDescription&&entry.pc.remoteDescription.type) entry.pc.addIceCandidate(ice).catch(()=>{});
  else{ entry.pendingCandidates=entry.pendingCandidates||[]; entry.pendingCandidates.push(ice); }
}
function handleCallJoin(uid,msg){
  if(uid===U.id)return;
  if(!callParticipants[uid])callParticipants[uid]={name:msg.name,color:msg.color,photo:msg.photo,muted:false};
  if(callActive){
    callConnectTo(uid,{name:msg.name,color:msg.color,photo:msg.photo});
    // responde diretamente pro recém-chegado, pra ele me descobrir mesmo se o join dele cruzar com o meu
    broadcast({type:'CALL_HELLO',uid:U.id,to:uid,name:U.name,color:U.color,photo:U.photo});
  }
}
function handleCallHello(uid,msg){
  if(!callActive)return;
  callConnectTo(uid,{name:msg.name,color:msg.color,photo:msg.photo});
}
function handleCallMuteState(uid,muted){
  if(!callParticipants[uid])return;
  callParticipants[uid].muted=muted;
  const el=$('cpmute-'+uid); if(el)el.style.display=muted?'flex':'none';
}
function handleCallPeerGone(uid){
  const entry=callPeers[uid];
  if(entry){
    try{entry.pc.close();}catch(e){}
    if(entry.audioEl){ entry.audioEl.srcObject=null; entry.audioEl.remove(); }
    delete callPeers[uid];
  }
  delete callParticipants[uid];
  const row=qs('.cpi[data-uid="'+uid+'"]'); if(row)row.remove();
  updateCallFabBadge();
}

/* ── UI ── */
function toggleCallPanel(){ const p=$('callPanel'); if(p)p.classList.toggle('on'); }
function renderCallParticipant(uid){
  const info=callParticipants[uid]||{};
  let row=qs('.cpi[data-uid="'+uid+'"]');
  if(!row){ row=document.createElement('div'); row.className='cpi'; row.dataset.uid=uid; $('callParticipantsList').appendChild(row); }
  const avHtml=info.photo?`<img src="${info.photo}">`:(info.name||'?').charAt(0).toUpperCase();
  row.innerHTML=`<div class="pav cpav" id="cpav-${uid}"><div class="pav-fill" style="background:${info.color||'#c45c5c'}">${avHtml}</div></div>${nameRowHTML(info.name||'Participante',uid,'cpname')}<span class="cp-mute" id="cpmute-${uid}" style="display:${info.muted?'flex':'none'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></span>`;
  updateCallFabBadge();
}
function renderSelfCallRow(){
  let row=qs('.cpi[data-uid="'+U.id+'"]');
  if(!row){ row=document.createElement('div'); row.className='cpi'; row.dataset.uid=U.id; $('callParticipantsList').prepend(row); }
  const avHtml=U.photo?`<img src="${U.photo}">`:(U.name||'?').charAt(0).toUpperCase();
  row.innerHTML=`<div class="pav cpav" id="cpav-${U.id}"><div class="pav-fill" style="background:${U.color||'#c45c5c'}">${avHtml}</div></div>${nameRowHTML('Você',U.id,'cpname')}<span class="cp-mute" id="cpmute-${U.id}" style="display:${localMuted?'flex':'none'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></span>`;
  updateCallFabBadge();
}
function updateCallFabBadge(){
  const n=Object.keys(callParticipants).length+(callActive?1:0);
  const b=$('callFabBadge'); if(!b)return;
  if(n>0){ b.style.display='flex'; b.textContent=n; } else b.style.display='none';
}
function toggleCallMute(){
  if(!callActive||!localSentStream)return;
  localMuted=!localMuted;
  localSentStream.getAudioTracks().forEach(t=>t.enabled=!localMuted);
  broadcast({type:'CALL_MUTE',uid:U.id,muted:localMuted});
  updateCallMuteBtnUI();
  const el=$('cpmute-'+U.id); if(el)el.style.display=localMuted?'flex':'none';
}
function updateCallMuteBtnUI(){
  const b=$('callMuteBtn'); if(!b)return;
  b.classList.toggle('cbtn-off',localMuted);
  b.title=localMuted?'Ativar microfone':'Silenciar microfone';
}
function toggleCallDeafen(){
  if(!callActive)return;
  localDeafened=!localDeafened;
  Object.values(callPeers).forEach(cp=>{ if(cp.audioEl)cp.audioEl.muted=localDeafened; });
  if(localDeafened&&!localMuted)toggleCallMute(); // ensurdecer também silencia o mic, como em qualquer app de chamada
  updateCallDeafenBtnUI();
}
function updateCallDeafenBtnUI(){
  const b=$('callDeafenBtn'); if(!b)return;
  b.classList.toggle('cbtn-off',localDeafened);
  b.title=localDeafened?'Reativar áudio':'Ensurdecer (silenciar todos)';
}
function toggleCallSettings(){ const b=$('callSettingsBox'); if(b)b.classList.toggle('on'); }
function startCallMeterLoop(){
  cancelAnimationFrame(callMeterRAF);
  const data=new Uint8Array(64);
  const lastSpeak={};        // uid -> último estado aplicado (evita mexer no DOM sem necessidade)
  let lastMeter=-1, lastT=0;
  function level(analyser){
    if(!analyser)return 0;
    analyser.getByteTimeDomainData(data);
    let sum=0; for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; }
    return Math.sqrt(sum/data.length);
  }
  function tick(ts){
    if(!callActive){ callMeterRAF=null; return; }
    // ~15fps é mais que suficiente pra um medidor de voz; a 60fps isso competia
    // com o resto da interface por CPU sem ganho visual nenhum.
    if(ts-lastT>65){
      lastT=ts;
      const myLevel=level(localAnalyser);
      const pct=Math.round(Math.min(100,myLevel*260));
      if(pct!==lastMeter){ const meter=$('callMicMeterFill'); if(meter)meter.style.width=pct+'%'; lastMeter=pct; }
      const mySpeak=myLevel>0.05&&!localMuted;
      if(lastSpeak[U.id]!==mySpeak){ lastSpeak[U.id]=mySpeak; const myAv=$('cpav-'+U.id); if(myAv)myAv.classList.toggle('speaking',mySpeak); }
      for(const uid in callPeers){
        const cp=callPeers[uid]; if(!cp)continue;
        const sp=level(cp.analyser)>0.05&&!(callParticipants[uid]&&callParticipants[uid].muted);
        if(lastSpeak[uid]!==sp){ lastSpeak[uid]=sp; const av=$('cpav-'+uid); if(av)av.classList.toggle('speaking',sp); }
      }
    }
    callMeterRAF=requestAnimationFrame(tick);
  }
  callMeterRAF=requestAnimationFrame(tick);
}

/* ── MENU RECOLHÍVEL (✴) ──
   Conversas e Quadro saíram da barra e vivem aqui, abrindo para CIMA com uma
   entrada escalonada. Mantém a barra da sala limpa sem esconder nada de fato:
   se houver mensagem não lida, um ponto aparece no próprio ✴. */
let _moreOpen=false;
function toggleMoreMenu(){ _moreOpen?closeMoreMenu():openMoreMenu(); }
function openMoreMenu(){
  _moreOpen=true;
  $('moreWrap').classList.add('on');
  // fecha ao tocar fora, sem prender o clique que abriu
  setTimeout(()=>document.addEventListener('pointerdown',_moreOutside),0);
}
function closeMoreMenu(){
  _moreOpen=false;
  const w=$('moreWrap'); if(w) w.classList.remove('on');
  document.removeEventListener('pointerdown',_moreOutside);
}
function _moreOutside(e){ if(!e.target.closest('#moreWrap')) closeMoreMenu(); }

/* ── PARTICIPANTS ── */
function toggleParts(){ $('parts').classList.toggle('on'); }
let _partSig={}; // uid -> assinatura da última renderização
function upsertPart(uid,info,label){
  const sig=JSON.stringify([info.name,info.photo,info.color,info.frame,info.frame_scale,info.frame_x,info.frame_y,label]);
  let li=qs('.pi[data-uid="'+uid+'"]');
  if(li && _partSig[uid]===sig)return; // nada mudou desde o último heartbeat — não recria o card à toa (isso reiniciava a animação do gif do badge sem necessidade)
  _partSig[uid]=sig;
  if(!li){li=document.createElement('div');li.className='pi';li.dataset.uid=uid;li.style.cursor='pointer';li.onclick=()=>openProfile(uid);$('partsList').appendChild(li);}
  const avHtml=info.photo?`<img src="${info.photo}">`:(info.name||'?').charAt(0).toUpperCase();
  li.innerHTML=`<div class="pav"><div class="pav-fill" style="background:${info.color||'#c45c5c'}">${avHtml}</div>${frameOverlayHTML(info)}</div><div>${nameRowHTML(info.name||'User',uid,'pname')}<div class="pstatus">${label||'Online'}</div></div>`;
}
