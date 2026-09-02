function openYtPanel(){
  const panel=$('ytPanel'); if(!panel)return;
  // Only open when inside a room
  if(!room){toast('Entre em uma sala primeiro','err');return;}
  panel.classList.toggle('on');
}
function closeYtPanel(e){
  // If called from backdrop click, only close if the click was on the overlay itself
  if(e&&e.currentTarget===e.target||!e) $('ytPanel').classList.remove('on');
}

function ytGoogleLogin(){
  if(!YT_CLIENT_ID||YT_CLIENT_ID.startsWith('SEU_')){
    toast('Configure o YT_CLIENT_ID no código','err'); return;
  }
  const scope='https://www.googleapis.com/auth/youtube.readonly';
  const redirectUri=location.href.split('?')[0].split('#')[0];
  const url=`https://accounts.google.com/o/oauth2/v2/auth`+
    `?client_id=${encodeURIComponent(YT_CLIENT_ID)}`+
    `&redirect_uri=${encodeURIComponent(redirectUri)}`+
    `&response_type=token`+
    `&scope=${encodeURIComponent(scope)}`+
    `&prompt=select_account`;
  // Abre em popup para manter estado da sala
  const w=window.open(url,'_blank','width=520,height=620,toolbar=no,menubar=no');
  // Escuta redirecionamento via hash
  const poll=setInterval(()=>{
    try{
      if(!w||w.closed){clearInterval(poll);return;}
      const hash=w.location.hash||'';
      if(hash.includes('access_token')){
        clearInterval(poll); w.close();
        const params=new URLSearchParams(hash.slice(1));
        ytGToken=params.get('access_token');
        localStorage.setItem('tfm_yt_token', ytGToken);
        ytUpdateLoginUI(); // this will fetch and cache the profile
        toast('Conta Google conectada ✓');
      }
    }catch(e){/* cross-origin enquanto redireciona */}
  },500);
}
function ytGoogleLogout(){
  ytGToken=null; localStorage.removeItem('tfm_yt_token'); localStorage.removeItem('tfm_yt_profile'); ytUpdateLoginUI();
  $('ytResults').innerHTML='';
  toast('Desconectado do Google');
}
function ytUpdateLoginUI(){
  // Login com Google removido — busca fica sempre liberada.
  const loginBtn=$('ytLoginBtn'), logoutBtn=$('ytLogoutBtn'), searchSec=$('ytSearchSec'), userInfo=$('ytUserInfo');
  if(!loginBtn) return;
  loginBtn.style.display='none'; logoutBtn.style.display='none'; searchSec.style.display='flex';
  userInfo.innerHTML='';
}
let ytNextPageToken=null, ytCurrentQuery='';
async function ytSearch(){
  const q=$('ytSearchInput').value.trim(); if(!q)return;
  ytNextPageToken=null; ytCurrentQuery=q;
  $('ytResults').innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--ash);font-size:.8rem">Buscando...</div>';
  await ytFetchPage(true);
}
async function ytLoadMore(){
  if(!ytNextPageToken||!ytCurrentQuery)return;
  await ytFetchPage(false);
}
async function ytFetchPage(isNew){
  try{
    let url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&key=${encodeURIComponent(YT_API_KEY)}&q=${encodeURIComponent(ytCurrentQuery)}`;
    if(ytNextPageToken&&!isNew) url+=`&pageToken=${encodeURIComponent(ytNextPageToken)}`;
    const res=await fetch(url);
    if(!res.ok){
      $('ytResults').innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--ash);font-size:.8rem">Erro ao buscar — verifique a YT_API_KEY no código.</div>';
      toast('Erro na busca do YouTube','err');
      return;
    }
    const data=await res.json();
    if(isNew&&!data.items?.length){$('ytResults').innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--ash);font-size:.8rem">Nenhum resultado</div>';return;}
    ytNextPageToken=data.nextPageToken||null;
    const html=data.items.map(it=>{
      const id=it.id.videoId; const sn=it.snippet;
      const thumb=sn.thumbnails?.medium?.url||sn.thumbnails?.default?.url||'';
      const title=(sn.title||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      return `<div class="ytr" onclick="ytAddVideo('${id}','${title.replace(/'/g,"\\'")}')">
        <img src="${thumb}" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;border-radius:5px 5px 0 0">
        <div class="ytrt"><span class="ytrtitle">${title}</span><span class="ytrchan">${sn.channelTitle||''}</span></div>
      </div>`;
    }).join('');
    const existingBtn=document.getElementById('ytLoadMoreBtn');
    if(existingBtn) existingBtn.remove();
    if(isNew){
      $('ytResults').innerHTML=html;
    } else {
      $('ytResults').insertAdjacentHTML('beforeend',html);
    }
    if(ytNextPageToken){
      $('ytResults').insertAdjacentHTML('beforeend',
        `<div id="ytLoadMoreBtn" style="display:flex;justify-content:center;padding:.75rem 0 .25rem">
          <button class="btn bg2 bsm" onclick="ytLoadMore()" style="font-size:.78rem;width:100%">Carregar mais resultados</button>
        </div>`);
    }
  }catch(e){if(isNew)$('ytResults').innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--ash);font-size:.8rem">Erro ao buscar</div>';console.error(e);}
}
function ytAddVideo(vid,title){
  if(!room){toast('Entre em uma sala primeiro','err');return;}
  loadVideoUnified('youtube',vid);
  closeYtPanel();
}


/* ══════════════════════════════════════════════════════════════════════
   CHAMADA DE VOZ — WebRTC em malha (todo mundo conecta com todo mundo),
   usando o MESMO canal de broadcast do Supabase já usado pro resto da
   sala como sinalização (não precisa de servidor de sinalização à parte).

   Como evita "glare" (as duas pontas oferecendo ao mesmo tempo): sempre
   que dois participantes precisam se conectar, quem tem o uid "menor"
   (comparação de string) é quem manda a oferta; o outro só espera.
   Isso resolve tanto o caso normal (alguém entra na call e todo mundo já
   presente reage) quanto o caso raro de duas pessoas entrarem quase ao
   mesmo tempo.

   Supressor de ruído: além das flags nativas do navegador
   (echoCancellation/noiseSuppression/autoGainControl, que já fazem a
   maior parte do trabalho), passamos o áudio por um AudioWorklet próprio
   que aplica um noise gate (atenua o sinal quando ele está abaixo de um
   limiar, com ataque rápido e alívio suave pra não cortar palavras) antes
   de mandar pra rede. A sensibilidade é ajustável pelo usuário. Se o
   navegador não suportar AudioWorklet por algum motivo, a chamada
   continua funcionando normalmente só com a supressão nativa do browser.
   ══════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   SUPRESSOR DE RUÍDO — reescrito.

   Por que a versão anterior "pipocava": o ganho era recalculado a cada
   AMOSTRA com ataque 0.5, ou seja, saltava de ~0 para ~1 em pouquíssimas
   amostras. Mudança abrupta de ganho = descontinuidade na forma de onda =
   estalo audível (o clássico "zipper noise"). Além disso o gate fechava
   até zero absoluto, então cada pausa entre palavras virava um corte seco.

   Esta versão faz o que um gate profissional faz:
   • Detecção por ENVELOPE suavizado (não pela amostra crua), com constantes
     de tempo em milissegundos convertidas em coeficientes exponenciais.
   • HISTERESE: o limiar pra abrir é maior que o pra fechar, então ruído
     oscilando em volta do limiar não fica ligando/desligando o gate.
   • HOLD: depois que a voz para, o gate segura aberto ~300ms antes de
     começar a fechar — não engole o fim das palavras nem a respiração.
   • Rampa de ganho SUAVE (ataque ~5ms, relaxamento ~200ms), aplicada
     amostra a amostra de forma contínua — sem degraus, sem estalo.
   • PISO de ganho (~-26dB) em vez de silêncio absoluto: o fundo fica
     discreto mas natural, sem o efeito de "chave liga/desliga".
   • Estimador ADAPTATIVO do ruído de fundo: o limiar acompanha o ambiente,
     então funciona tanto num quarto silencioso quanto perto de um ventilador.
   • Filtro passa-altas só no sinal de DETECÇÃO, pra ronco de 50/60Hz e
     trepidação de mesa não abrirem o gate. O áudio enviado continua íntegro.
   ══════════════════════════════════════════════════════════════════ */
const NOISE_GATE_WORKLET_SRC = `
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(){
    return [
      {name:'threshold', defaultValue:0.012, minValue:0.0002, maxValue:0.5, automationRate:'k-rate'},
      {name:'floorGain', defaultValue:0.12,  minValue:0,      maxValue:1,   automationRate:'k-rate'},
      {name:'enabled',   defaultValue:1,     minValue:0,      maxValue:1,   automationRate:'k-rate'}
    ];
  }
  constructor(){
    super();
    const sr = sampleRate;
    const tc = (ms)=>Math.exp(-1/((ms/1000)*sr)); // constante de tempo -> coeficiente
    this.env       = 0;      // envelope do detector
    this.gain      = 0;      // ganho atual (rampa suave)
    this.hold      = 0;      // amostras restantes de hold
    this.HOLD_N    = Math.round(0.30*sr);
    this.envAtk    = tc(3);    // envelope sobe em ~3ms
    this.envRel    = tc(80);   // e desce em ~80ms
    this.gainAtk   = tc(5);    // ganho abre em ~5ms (rápido, mas contínuo: sem estalo)
    this.gainRel   = tc(200);  // e fecha em ~200ms (bem suave)
    this.noiseFloor= 0.003;    // estimativa adaptativa do ruído ambiente
    this.nfUp      = tc(2000); // sobe devagar
    this.open      = false;
    this.closedFor = 0;        // há quanto tempo está fechado com sinal presente
    this.LOCKOUT_N = Math.round(2.5*sr); // 2,5s fechado com voz = trava; abre à força
    this.hpX1=0; this.hpY1=0;  // estado do passa-altas do detector
    this.hpR = Math.exp(-2*Math.PI*110/sr); // corta abaixo de ~110Hz na detecção
  }
  process(inputs, outputs){
    const input = inputs[0], output = outputs[0];
    if(!input || !input.length || !output || !output.length) return true;
    const inCh = input[0], outCh0 = output[0];
    if(!inCh || !outCh0) return true;
    const p = arguments[2];
    const thr      = p.threshold[0];
    const floorG   = p.floorGain[0];
    const enabled  = p.enabled[0] >= 0.5;

    if(!enabled){ // supressor desligado: passa direto, sem tocar no sinal
      for(let ch=0; ch<output.length; ch++){
        const o=output[ch], s=input[Math.min(ch,input.length-1)];
        if(o&&s) o.set(s);
      }
      return true;
    }

    // limiares com histerese, ancorados no ruído medido do ambiente
    const openThr  = Math.max(thr, this.noiseFloor*2.5);
    const closeThr = openThr*0.55;

    for(let i=0;i<inCh.length;i++){
      const x = inCh[i];

      // passa-altas de 1a ordem só pra DETECÇÃO (não altera o áudio de saída)
      const hp = this.hpR*(this.hpY1 + x - this.hpX1);
      this.hpX1 = x; this.hpY1 = hp;
      const mag = hp<0 ? -hp : hp;

      // envelope suave: sobe rápido, desce devagar
      const coef = mag > this.env ? this.envAtk : this.envRel;
      this.env = mag + coef*(this.env - mag);

      // decide abrir/fechar com histerese + hold
      if(this.env > openThr){ this.open = true; this.hold = this.HOLD_N; }
      else if(this.env < closeThr){
        if(this.hold > 0) this.hold--;
        else this.open = false;
      }

      // enquanto está fechado, aprende o nível do ruído de fundo (bem devagar)
      if(!this.open){
        this.noiseFloor = this.env + this.nfUp*(this.noiseFloor - this.env);
        if(this.noiseFloor < 0.0005) this.noiseFloor = 0.0005;
        // TETO BAIXO: sem isso, o estimador subia junto com a própria voz e o limiar
        // ficava alto demais — o gate fechava de vez e a pessoa sumia da chamada.
        if(this.noiseFloor > 0.012)  this.noiseFloor = 0.012;
        // ANTITRAVA: se há sinal claro mas o gate segue fechado por muito tempo,
        // algo está errado na estimativa — abre à força e reseta o piso de ruído.
        if(this.env > 0.02){
          if(++this.closedFor > this.LOCKOUT_N){ this.open=true; this.noiseFloor=0.003; this.closedFor=0; }
        } else this.closedFor=0;
      } else this.closedFor=0;

      // rampa contínua de ganho — a chave pra não estalar
      const target = this.open ? 1 : floorG;
      const gc = target > this.gain ? this.gainAtk : this.gainRel;
      this.gain = target + gc*(this.gain - target);

      outCh0[i] = x * this.gain;
    }
    // replica no restante dos canais, se houver
    for(let ch=1; ch<output.length; ch++){ if(output[ch]) output[ch].set(outCh0); }
    return true;
  }
}
registerProcessor('noise-gate-processor', NoiseGateProcessor);
`;
async function setupNoiseGate(rawStream){
  try{
    const blob=new Blob([NOISE_GATE_WORKLET_SRC],{type:'application/javascript'});
    const url=URL.createObjectURL(blob);
    await callAudioCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const source=callAudioCtx.createMediaStreamSource(rawStream);
    noiseGateNode=new AudioWorkletNode(callAudioCtx,'noise-gate-processor',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    applyGateParams();
    const dest=callAudioCtx.createMediaStreamDestination();
    // Dois medidores: um ANTES do supressor e outro DEPOIS. Comparando os dois o
    // vigia detecta se o supressor está engolindo tudo e se recupera sozinho.
    rawAnalyser=callAudioCtx.createAnalyser(); rawAnalyser.fftSize=512; rawAnalyser.smoothingTimeConstant=0.5;
    localAnalyser=callAudioCtx.createAnalyser(); localAnalyser.fftSize=512; localAnalyser.smoothingTimeConstant=0.5;
    source.connect(rawAnalyser);
    source.connect(noiseGateNode); noiseGateNode.connect(dest); noiseGateNode.connect(localAnalyser);
    return dest.stream;
  }catch(e){
    console.error('Supressor de ruído (AudioWorklet) não pôde iniciar — seguindo só com a supressão nativa do navegador.',e);
    try{
      const source=callAudioCtx.createMediaStreamSource(rawStream);
      localAnalyser=callAudioCtx.createAnalyser(); localAnalyser.fftSize=512; localAnalyser.smoothingTimeConstant=0.5;
      source.connect(localAnalyser);
    }catch(e2){}
    return rawStream;
  }
}
function applyGateParams(){
  if(!noiseGateNode) return;
  try{
    // escala exponencial: o ouvido percebe volume em dB, não linearmente, então
    // um slider linear precisa virar um limiar exponencial pra "andar" de forma natural
    const thr = 0.0015*Math.pow(40, noiseGateSensitivity);
    noiseGateNode.parameters.get('threshold').value = thr;
    noiseGateNode.parameters.get('floorGain').value = 0.12;
    noiseGateNode.parameters.get('enabled').value   = noiseGateEnabled?1:0;
  }catch(e){}
}
function updateNoiseGateSensitivity(val){
  noiseGateSensitivity=Math.max(0,Math.min(1,val/100));
  applyGateParams();
}
/* Liga/desliga o supressor DE VERDADE durante a chamada: como agora o caminho
   padrão não passa pelo AudioContext, não basta mudar um parâmetro — é preciso
   montar (ou desmontar) o processamento e trocar a trilha que está sendo enviada
   aos participantes, via replaceTrack, sem renegociar nem cortar a chamada. */
async function toggleNoiseGate(){
  noiseGateEnabled=!noiseGateEnabled;
  if(noiseGateEnabled) _gateBypassed=false;
  updateGateBtnUI();

  if(!callActive){                       // fora da chamada é só a preferência
    toast(noiseGateEnabled?'Supressor ligado (vale na próxima chamada)':'Supressor desligado');
    return;
  }
  try{
    let newStream;
    if(noiseGateEnabled){
      if(!callAudioCtx || callAudioCtx.state==='closed'){
        callAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
      }
      if(callAudioCtx.state==='suspended'){ try{ await callAudioCtx.resume(); }catch(e){} }
      newStream=await setupNoiseGate(localRawStream);
    }else{
      if(noiseGateNode){ try{ noiseGateNode.disconnect(); }catch(e){} noiseGateNode=null; }
      newStream=localRawStream;
      try{
        const srcNode=callAudioCtx.createMediaStreamSource(localRawStream);
        rawAnalyser=callAudioCtx.createAnalyser(); rawAnalyser.fftSize=512; rawAnalyser.smoothingTimeConstant=0.5;
        localAnalyser=rawAnalyser; srcNode.connect(rawAnalyser);
      }catch(e){}
    }
    const track=newStream.getAudioTracks()[0];
    if(track){
      track.enabled=!localMuted;         // respeita o mudo atual
      Object.values(callPeers).forEach(cp=>{
        try{
          const s=cp.pc.getSenders().find(s=>s.track&&s.track.kind==='audio');
          if(s) s.replaceTrack(track);
        }catch(e){}
      });
      localSentStream=newStream;
    }
    toast(noiseGateEnabled?'Supressor de ruído ligado':'Supressor desligado — voz sem processamento');
  }catch(e){
    console.error('toggleNoiseGate',e);
    toast('Não consegui alternar o supressor; a voz continua funcionando','err');
  }
}

/* ══════════════════════════════════════════════════════════════════
   VIGIA DO MICROFONE — garante que a sua voz nunca pare de sair.
   Três falhas possíveis e a resposta de cada uma:
   1) O AudioContext é suspenso pelo sistema (celular em segundo plano, troca
      de saída de áudio, economia de energia). Resultado: o supressor para de
      processar e sai silêncio absoluto. → detecta e chama resume().
   2) O supressor "trava fechado". → detecta voz na entrada com silêncio na
      saída e desliga o supressor automaticamente.
   3) O caminho de áudio processado morre de vez. → troca a trilha enviada
      pela do microfone cru via replaceTrack, sem derrubar a chamada.
   ══════════════════════════════════════════════════════════════════ */
function analyserLevel(an,buf){
  if(!an) return 0;
  an.getByteTimeDomainData(buf);
  let s=0; for(let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; s+=v*v; }
  return Math.sqrt(s/buf.length);
}
function startMicWatchdog(){
  stopMicWatchdog();
  const buf=new Uint8Array(64);
  _micWatch=setInterval(async ()=>{
    if(!callActive) return;
    // (1) contexto suspenso → retoma
    if(callAudioCtx && callAudioCtx.state==='suspended'){
      try{ await callAudioCtx.resume(); }catch(e){}
    }
    if(localMuted) { _silentTicks=0; return; }   // mudo é intencional, não é falha
    const raw=analyserLevel(rawAnalyser,buf);
    const out=analyserLevel(localAnalyser,buf);
    // (2) entra voz e não sai nada
    if(raw>0.02 && out<0.002){
      if(++_silentTicks>=3){
        if(!_gateBypassed){
          _gateBypassed=true; noiseGateEnabled=false; applyGateParams();
          updateGateBtnUI();
          toast('O supressor estava cortando sua voz — desliguei automaticamente','err');
          _silentTicks=0;
        }else{
          // (3) mesmo sem o supressor continua mudo → envia o microfone cru
          fallbackToRawTrack();
          _silentTicks=0;
        }
      }
    } else _silentTicks=0;
  },1000);
}
function stopMicWatchdog(){ if(_micWatch){ clearInterval(_micWatch); _micWatch=null; } _silentTicks=0; }
/* Troca a trilha enviada a todos os participantes sem renegociar a chamada. */
function fallbackToRawTrack(){
  if(!localRawStream) return;
  const track=localRawStream.getAudioTracks()[0]; if(!track) return;
  let n=0;
  Object.values(callPeers).forEach(cp=>{
    try{
      const s=cp.pc.getSenders().find(s=>s.track&&s.track.kind==='audio');
      if(s){ s.replaceTrack(track); n++; }
    }catch(e){}
  });
  localSentStream=localRawStream;
  if(n) toast('Caminho de áudio restaurado (microfone direto)','ok');
}
function updateGateBtnUI(){
  const b=$('gateToggleBtn'); if(!b) return;
  b.classList.toggle('cbtn-off',!noiseGateEnabled);
  b.textContent=noiseGateEnabled?'Supressor ligado':'Supressor desligado';
}

/* ── entrar/sair da chamada ── */
