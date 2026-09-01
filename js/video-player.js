/* ── PLAYER DE VÍDEO ÚNICO (YouTube / Vimeo / Twitch / arquivo direto·HLS) ──
   Só existe UM card de vídeo "tocável" por vez: colocar um novo vídeo/link
   carrega dentro do mesmo player (mesmo card, mesmo elemento), em vez de abrir
   um card novo cada vez. Todos os quatro tipos usam a mesma interface
   (playVideo/pauseVideo/seekTo/getCurrentTime/getDuration/isPlaying) registrada
   em ytPlrs[uid], por isso os controles, o SYNC e o watchdog anti-pausa funcionam
   igual pra qualquer um deles. Só o embed "genérico" (site desconhecido) fica de
   fora, porque não existe API pra controlar o play/pause de uma página qualquer. */
function openVideoModal(){ openUniversalVideoPanel(); }
function addVideo(){ addUniversalVideo(); }
function kindLabel(kind,source){
  if(kind==='youtube')return 'YouTube';
  if(kind==='vimeo')return 'Vimeo';
  if(kind==='twitch')return 'Twitch';
  if(kind==='html5')return isHLS(source)?'Live/HLS':'Vídeo';
  return 'Vídeo';
}
function kindOpenHref(kind,source){
  if(kind==='youtube')return 'https://www.youtube.com/watch?v='+source;
  if(kind==='vimeo')return 'https://vimeo.com/'+source;
  if(kind==='twitch'){ const [t,id]=source.split(':'); return t==='channel'?'https://twitch.tv/'+id:'https://twitch.tv/videos/'+id; }
  return null;
}
/* Ponto de entrada único: usa o player já aberto se existir, senão cria um novo (e passa a ser o único). */
function loadVideoUnified(kind,source){
  if(!room){toast('Entre em uma sala primeiro','err');return;}
  const existing = activeVideoCardId && qs('[data-item-id="'+activeVideoCardId+'"]');
  if(existing){ switchVideoCardTo(existing,kind,source,true); }
  else{
    const c=$('items'), id='vid_'+Date.now();
    const x=60+Math.random()*180, y=60+Math.random()*160;
    mkMediaVid(kind,source,x,y,id,c,true);
    activeVideoCardId=id;
  }
  toast(kindLabel(kind,source)+' carregado no player · SYNC');
}
function mkMediaVid(kind,source,x,y,id,container,broadcastIt){
  const uid='ytp_'+id;
  const w=document.createElement('div'); w.className='card vid-card'; w.dataset.type='video'; w.dataset.itemId=id; w.dataset.ytuid=uid; w.dataset.kind=kind;
  if(kind==='youtube'){ w.dataset.vid=source; } else { w.dataset.vid=''; w.dataset.embedUrl=source; }
  const extra=kind==='youtube'?SUGG:0;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:VID_W+'px',height:(HEAD+VID_H+CTRL+extra)+'px',display:'flex',flexDirection:'column'});
  const href=kindOpenHref(kind,source);
  w.innerHTML=`<div class="ch" style="height:${HEAD}px;flex-shrink:0"><span class="ct">▶ ${kindLabel(kind,source)}</span><div style="display:flex;align-items:center;gap:.38rem"><span class="vsync">SYNC</span>${href?`<a class="vcbtn" href="${href}" target="_blank" rel="noopener" title="Abrir original" style="line-height:0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg></a>`:''}<button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div></div><div id="ypc-${uid}" class="ypc" style="flex:1;min-height:0;width:100%;background:#000;overflow:hidden;position:relative"></div><div class="vctrl" style="height:${CTRL}px;flex-shrink:0"><button class="vcbtn" onclick="vPlay('${uid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg></button><button class="vcbtn" onclick="vPause('${uid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button><button class="vcbtn" onclick="vSeek('${uid}',-10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 100-.49"/></svg></button><button class="vcbtn" onclick="vSeek('${uid}',10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 110-.49"/></svg></button><span class="vtime" id="vt-${uid}">0:00</span></div><div class="vupnext" id="vun-${uid}"></div>`;
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  container.appendChild(w); els.push(w);
  if(broadcastIt)broadcast({type:'ADD_ITEM',item:{type:'video',kind,source,x,y,id}});
  setTimeout(()=>initMediaPlayer(uid,kind,source,VID_W,VID_H),300);
  if(kind==='youtube')setTimeout(()=>videoShowSuggestions(uid,source),900);
}
/* Troca o vídeo/embed dentro do MESMO card (mesmo player quando possível — YouTube usa
   loadVideoById nativo, sem recriar o iframe). Chamado tanto ao colocar um link novo
   quanto ao clicar numa sugestão "a seguir". */
function switchVideoCardTo(card,kind,source,broadcastIt){
  const uid=card.dataset.ytuid, oldKind=card.dataset.kind;
  card.dataset.kind=kind;
  if(kind==='youtube'){ card.dataset.vid=source; card.dataset.embedUrl=''; } else { card.dataset.vid=''; card.dataset.embedUrl=source; }
  const ctSpan=card.querySelector('.ct'); if(ctSpan)ctSpan.textContent='▶ '+kindLabel(kind,source);
  const openLink=card.querySelector('a.vcbtn'); const href=kindOpenHref(kind,source);
  if(openLink&&href)openLink.href=href;
  if(oldKind===kind && kind==='youtube' && ytPlrs[uid] && ytPlrs[uid].loadVideoById){
    suppressSync(uid,2000); ytPlrs[uid].loadVideoById(source); desiredPlaying[uid]=true;
  }else{
    const cont=$('ypc-'+uid); if(cont){cont.innerHTML='';delete cont.dataset.ytinit;}
    delete ytPlrs[uid]; delete desiredPlaying[uid]; clearInterval(_vtTimers[uid]); delete _vtTimers[uid];
    setTimeout(()=>initMediaPlayer(uid,kind,source,VID_W,VID_H),50);
  }
  const wrap=$('vun-'+uid);
  if(kind==='youtube')videoShowSuggestions(uid,source); else if(wrap)wrap.innerHTML='';
  if(broadcastIt)broadcast({type:'MEDIA_SWITCH',itemId:card.dataset.itemId,kind,source});
}
function applyMediaSwitch(itemId,kind,source){
  const card=qs('[data-item-id="'+itemId+'"]'); if(!card)return;
  switchVideoCardTo(card,kind,source,false);
}
function initMediaPlayer(uid,kind,source,iw,ih,retries){
  if(kind==='youtube')return initYT(uid,source,iw,ih,retries);
  if(kind==='vimeo')return initVimeo(uid,source,iw,ih,retries);
  if(kind==='twitch')return initTwitch(uid,source,iw,ih,retries);
  if(kind==='html5'){ const cont=$('ypc-'+uid); if(!cont||cont.dataset.ytinit)return; cont.dataset.ytinit='1'; return initHtml5(uid,source,cont); }
}
function initYT(uid,vid,iw,ih,_retries){
  _retries=(_retries||0)+1;
  if(!ytReady && window.YT && window.YT.Player){ ytReady=true; }
  if(!ytReady){
    if(_retries>40){
      const cont=$('ypc-'+uid);
      if(cont)cont.innerHTML=`<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;color:#9a9aa5;font-size:.72rem;text-align:center;padding:.5rem">
        <span>Não foi possível carregar o player aqui.</span>
        <a href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener" style="color:#8fd6b0;text-decoration:underline">Abrir no YouTube ↗</a>
      </div>`;
      return;
    }
    setTimeout(()=>initYT(uid,vid,iw,ih,_retries),500);
    return;
  }
  const cont=$('ypc-'+uid); if(!cont||cont.dataset.ytinit)return; cont.dataset.ytinit='1';
  const p=new YT.Player(cont,{width:String(iw||VID_W),height:String(ih||VID_H),videoId:vid,
    playerVars:{autoplay:0,controls:0,modestbranding:1,rel:0,fs:1,iv_load_policy:3,playsinline:1},
    events:{
      onReady:()=>{ ytPlrs[uid]=p; desiredPlaying[uid]=false;
        p.setVolumeUnified=v=>{ try{ p.setVolume(Math.round(v*100)); }catch(e){} };
        applyVolumeToPlayer(uid);
        // Timer registrado em _vtTimers pra ser limpo quando o card sai (antes vazava:
        // um setInterval por player, pra sempre, mesmo depois de trocar de vídeo).
        clearInterval(_vtTimers[uid]);
        _vtTimers[uid]=setInterval(()=>{
          if(document.hidden)return;              // não gasta CPU com a aba em segundo plano
          const el=$('vt-'+uid); if(!el){ clearInterval(_vtTimers[uid]); delete _vtTimers[uid]; return; }
          try{el.textContent=fmtTime(p.getCurrentTime()||0);}catch(e){}
        },500); },
      onStateChange:e=>{
        if(isSuppressed(uid))return; // eco de uma sync que acabamos de aplicar — ignora, evita loop
        if(e.data===YT.PlayerState.PLAYING){ desiredPlaying[uid]=true; broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:p.getCurrentTime()}); }
        if(e.data===YT.PlayerState.PAUSED){ desiredPlaying[uid]=false; broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:p.getCurrentTime()}); }
      },
      onError:()=>{ toast('Esse vídeo não pôde ser reproduzido (indisponível/bloqueado)','err'); }
    }});
}
/* Vimeo — usa o SDK oficial (player.js), API assíncrona baseada em Promise;
   mantemos um cache local (_cur/_dur/_playing) atualizado via evento timeupdate
   pra expor a mesma interface síncrona que o resto do player usa. */
function initVimeo(uid,vid,iw,ih,_retries){
  _retries=(_retries||0)+1;
  if(!(window.Vimeo && window.Vimeo.Player)){
    if(_retries>40){ const cont=$('ypc-'+uid); if(cont)cont.innerHTML='<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9a9aa5;font-size:.72rem;text-align:center;padding:.5rem">Não foi possível carregar o player do Vimeo aqui.</div>'; return; }
    setTimeout(()=>initVimeo(uid,vid,iw,ih,_retries),500); return;
  }
  const cont=$('ypc-'+uid); if(!cont||cont.dataset.ytinit)return; cont.dataset.ytinit='1';
  let _cur=0,_dur=0,_playing=false;
  const player=new Vimeo.Player(cont,{id:Number(vid),width:iw,height:ih,controls:false,autoplay:false});
  desiredPlaying[uid]=false;
  player.on('play',()=>{ if(isSuppressed(uid))return; _playing=true; desiredPlaying[uid]=true; broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:_cur}); });
  player.on('pause',()=>{ if(isSuppressed(uid))return; _playing=false; desiredPlaying[uid]=false; broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:_cur}); });
  player.on('timeupdate',d=>{ _cur=d.seconds||0; _dur=d.duration||0; const el=$('vt-'+uid); if(el)el.textContent=fmtTime(_cur); });
  player.on('error',()=>{ toast('Esse vídeo do Vimeo não pôde ser reproduzido','err'); });
  ytPlrs[uid]={
    playVideo(){ desiredPlaying[uid]=true; player.play().catch(()=>{}); },
    pauseVideo(){ desiredPlaying[uid]=false; player.pause().catch(()=>{}); },
    seekTo(t){ _cur=t; player.setCurrentTime(t).catch(()=>{}); },
    getCurrentTime(){ return _cur; },
    getDuration(){ return _dur; },
    isPlaying(){ return _playing; },
    setVolume(v){ player.setVolume(v).catch(()=>{}); }   // Vimeo usa 0..1
  };
  applyVolumeToPlayer(uid);
}
/* Twitch — usa o SDK oficial de embed (Twitch.Player), que já expõe play/pause/seek/getCurrentTime. */
function initTwitch(uid,source,iw,ih,_retries){
  _retries=(_retries||0)+1;
  if(!(window.Twitch && window.Twitch.Player)){
    if(_retries>40){ const cont=$('ypc-'+uid); if(cont)cont.innerHTML='<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9a9aa5;font-size:.72rem;text-align:center;padding:.5rem">Não foi possível carregar o player da Twitch aqui.</div>'; return; }
    setTimeout(()=>initTwitch(uid,source,iw,ih,_retries),500); return;
  }
  const cont=$('ypc-'+uid); if(!cont||cont.dataset.ytinit)return; cont.dataset.ytinit='1';
  const [type,tid]=source.split(':');
  const opts={width:iw,height:ih,parent:[location.hostname]};
  if(type==='video')opts.video=tid; else if(type==='clip')opts.clip=tid; else opts.channel=tid;
  const player=new Twitch.Player(cont.id,opts);
  let _playing=false;
  desiredPlaying[uid]=false;
  player.addEventListener(Twitch.Player.PLAY,()=>{ if(isSuppressed(uid))return; _playing=true; desiredPlaying[uid]=true; try{broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:player.getCurrentTime()||0});}catch(e){} });
  player.addEventListener(Twitch.Player.PAUSE,()=>{ if(isSuppressed(uid))return; _playing=false; desiredPlaying[uid]=false; try{broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:player.getCurrentTime()||0});}catch(e){} });
  ytPlrs[uid]={
    playVideo(){ desiredPlaying[uid]=true; try{player.play();}catch(e){} },
    pauseVideo(){ desiredPlaying[uid]=false; try{player.pause();}catch(e){} },
    seekTo(t){ try{player.seek(t);}catch(e){} },
    getCurrentTime(){ try{return player.getCurrentTime()||0;}catch(e){return 0;} },
    getDuration(){ try{return player.getDuration()||0;}catch(e){return 0;} },
    isPlaying(){ return _playing; },
    setVolume(v){ try{ player.setVolume(v); }catch(e){} }  // Twitch usa 0..1
  };
  applyVolumeToPlayer(uid);
}
/* Arquivo direto (mp4/webm/...) ou HLS (.m3u8) — <video> nativo. Os eventos play/pause/seeked
   do próprio elemento cobrem qualquer forma de interação (nossos botões ou os controles nativos). */
function initHtml5(uid,src,cont){
  const vidEl=document.createElement('video'); vidEl.controls=true; vidEl.preload='metadata'; vidEl.playsInline=true;
  vidEl.style.cssText='width:100%;height:100%;background:#000;display:block;object-fit:contain';
  cont.appendChild(vidEl);
  if(isHLS(src)){
    if(vidEl.canPlayType('application/vnd.apple.mpegurl')){ vidEl.src=src; }
    else if(window.Hls && Hls.isSupported()){ const hls=new Hls(); hls.loadSource(src); hls.attachMedia(vidEl); }
    else{
      let tries=0;
      const wait=setInterval(()=>{
        tries++;
        if(window.Hls && Hls.isSupported()){ clearInterval(wait); const hls=new Hls(); hls.loadSource(src); hls.attachMedia(vidEl); }
        else if(tries>20){ clearInterval(wait); vidEl.src=src; }
      },150);
    }
  }else{ vidEl.src=src; }
  desiredPlaying[uid]=false;
  vidEl.addEventListener('play',()=>{ if(isSuppressed(uid))return; desiredPlaying[uid]=true; broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:vidEl.currentTime}); });
  vidEl.addEventListener('pause',()=>{ if(isSuppressed(uid))return; desiredPlaying[uid]=false; broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:vidEl.currentTime}); });
  vidEl.addEventListener('seeked',()=>{ if(isSuppressed(uid))return; broadcast({type:'VID_SYNC',uid_player:uid,action:vidEl.paused?'pause':'play',time:vidEl.currentTime}); });
  vidEl.addEventListener('timeupdate',()=>{ const el=$('vt-'+uid); if(el)el.textContent=fmtTime(vidEl.currentTime||0); });
  vidEl.addEventListener('error',()=>{ toast('Não foi possível carregar esse vídeo','err'); });
  ytPlrs[uid]={
    playVideo(){ desiredPlaying[uid]=true; vidEl.play().catch(()=>{}); },
    pauseVideo(){ desiredPlaying[uid]=false; vidEl.pause(); },
    seekTo(t){ vidEl.currentTime=t; },
    getCurrentTime(){ return vidEl.currentTime||0; },
    getDuration(){ return vidEl.duration||0; },
    isPlaying(){ return !vidEl.paused; },
    setVolume(v){ vidEl.volume=Math.max(0,Math.min(1,v)); }
  };
  applyVolumeToPlayer(uid);
}
function vPlay(uid){ const p=ytPlrs[uid]; if(p){desiredPlaying[uid]=true;p.playVideo();broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:p.getCurrentTime()});} }
function vPause(uid){ const p=ytPlrs[uid]; if(p){desiredPlaying[uid]=false;p.pauseVideo();broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:p.getCurrentTime()});} }
function vSeek(uid,d){ const p=ytPlrs[uid]; if(p){const t=Math.max(0,(p.getCurrentTime()||0)+d);p.seekTo(t,true);broadcast({type:'VID_SYNC',uid_player:uid,action:p.isPlaying()?'play':'pause',time:t});} }
/* "A seguir": busca vídeos parecidos com o que está tocando (por tags/título — a API do
   YouTube não tem mais busca "relacionados", então usamos o mesmo truque que já funciona
   pro player de música) e mostra dentro do próprio card pra continuar sem sair do player. */
async function videoShowSuggestions(uid,vid){
  const wrap=$('vun-'+uid); if(!wrap)return;
  wrap.innerHTML='<span class="vun-lbl">Buscando a seguir...</span>';
  try{
    let query='';
    try{
      const infoUrl=`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(vid)}&key=${encodeURIComponent(YT_API_KEY)}`;
      const infoRes=await fetch(infoUrl);
      if(infoRes.ok){
        const infoData=await infoRes.json();
        const sn=infoData.items?.[0]?.snippet;
        query = sn?.tags?.length ? sn.tags.slice(0,3).join(' ') : (sn?.title||'');
      }
    }catch(e){}
    if(!query){ wrap.innerHTML=''; return; }
    const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&key=${encodeURIComponent(YT_API_KEY)}&q=${encodeURIComponent(query)}`;
    const res=await fetch(url);
    if(!res.ok){ wrap.innerHTML=''; return; }
    const data=await res.json();
    const items=(data.items||[]).filter(it=>it.id.videoId!==vid).slice(0,8);
    if(!items.length){ wrap.innerHTML=''; return; }
    wrap.innerHTML='<span class="vun-lbl">A seguir</span>'+items.map(it=>{
      const id=it.id.videoId, sn=it.snippet;
      const thumb=sn.thumbnails?.default?.url||'';
      const t=(sn.title||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      return `<div class="vun-item" onclick="videoPlayNext('${uid}','${id}')" title="${t.replace(/"/g,'&quot;')}">`
        +`<div class="vun-thumb"><img src="${thumb}" loading="lazy" onerror="this.style.display='none'">`
        +`<span class="vun-pl"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="6,4 20,12 6,20"/></svg></span></div>`
        +`<span class="vun-t">${t}</span></div>`;
    }).join('');
  }catch(e){ wrap.innerHTML=''; }
}
function videoPlayNext(uid,newVid){
  const card=qs('[data-ytuid="'+uid+'"]'); if(!card)return;
  switchVideoCardTo(card,'youtube',newVid,true);
}
/* Embed genérico (site desconhecido) — sem API de controle disponível, então só a posição
   e a presença do card são sincronizadas entre os participantes; deixamos isso claro na UI. */
function addGenericIframe(url){
  const c=$('items'), id='ifr_'+Date.now();
  const x=60+Math.random()*180, y=60+Math.random()*160;
  mkGenericIframe(url,x,y,id,c,true);
  toast('Vídeo incorporado — posição sincronizada, mas o play/pause não é controlável nesse site');
}
function mkGenericIframe(embedUrl,x,y,id,container,broadcastIt){
  const w=document.createElement('div'); w.className='card vid-card'; w.dataset.type='iframe'; w.dataset.itemId=id; w.dataset.embedUrl=embedUrl;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:VID_W+'px',height:(HEAD+VID_H+NOTE_H)+'px',display:'flex',flexDirection:'column'});
  const ifr=document.createElement('iframe'); ifr.src=embedUrl;
  ifr.style.cssText='border:none;display:block;width:100%;flex:1;min-height:0;';
  ifr.allow='autoplay; fullscreen; encrypted-media; picture-in-picture'; ifr.allowFullscreen=true;
  w.innerHTML=`<div class="ch" style="height:${HEAD}px;flex-shrink:0"><span class="ct">▶ Vídeo</span><div style="display:flex;align-items:center;gap:.38rem"><button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div></div>`;
  w.appendChild(ifr);
  const note=document.createElement('div'); note.className='vun-note'; note.textContent='Este site não permite controle externo — só a posição do card é sincronizada.';
  w.appendChild(note);
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  container.appendChild(w); els.push(w);
  if(broadcastIt)broadcast({type:'ADD_ITEM',item:{type:'iframe',embedUrl,x,y,id}});
}

/* ── CARD CREATORS ── */
function mkGif(src,x,y,id,c,emit){
  const w=document.createElement('div'); w.className='card gif-card'; w.dataset.type='gif'; w.dataset.src=src; w.dataset.itemId=id;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:'240px',height:'210px',display:'flex',flexDirection:'column'});
  w.innerHTML=`<div class="ch"><span class="ct">GIF</span><button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div><div class="cb" style="flex:1;min-height:0;overflow:hidden;padding:0;cursor:default"><img src="${src}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></div>`;
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  c.appendChild(w); els.push(w);
  if(emit)broadcast({type:'ADD_ITEM',item:{type:'gif',src,x,y,id}});
}
function mkImg(src,x,y,id,c,emit){
  const w=document.createElement('div'); w.className='card img-card'; w.dataset.type='image'; w.dataset.itemId=id;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:'260px',height:'220px',display:'flex',flexDirection:'column'});
  const img=document.createElement('img'); img.loading='lazy'; img.src=src; img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';
  const cb=document.createElement('div'); cb.className='cb'; cb.style.cssText='flex:1;min-height:0;overflow:hidden;padding:0;cursor:default'; cb.appendChild(img);
  w.innerHTML=`<div class="ch"><span class="ct">Imagem</span><button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div>`;
  w.appendChild(cb); const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  w.dataset.src=src; // necessário para sendState() reenviar a imagem a quem entra depois na sala
  c.appendChild(w); els.push(w);
  if(emit)broadcast({type:'ADD_ITEM',item:{type:'image',src,x,y,id}});
}
function removeEl(el){
  if(!el)return; const id=el.dataset.itemId, uid=el.dataset.ytuid;
  if(uid){ delete ytPlrs[uid]; delete desiredPlaying[uid]; clearInterval(_vtTimers[uid]); delete _vtTimers[uid]; }
  if(id===activeVideoCardId)activeVideoCardId=null;
  if(id===activeMusicCardId)activeMusicCardId=null;
  el.remove(); els=els.filter(e=>e!==el); if(id)broadcast({type:'REMOVE_ITEM',itemId:id}); toast('Removido');
}

/* ── MUSIC PANEL ── */
