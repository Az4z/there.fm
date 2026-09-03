/* ══════════════════════════════════════════════════════════════════
   NAVEGADOR EMBUTIDO — lado JavaScript

   Este arquivo só faz efeito dentro do APK. No site aberto pelo navegador
   comum ele simplesmente não ativa (a checagem no topo cuida disso), então
   pode ficar no projeto sem quebrar nada.

   A ideia central: o navegador embutido é registrado em `ytPlrs` com a MESMA
   interface dos outros players (playVideo, pauseVideo, seekTo, getCurrentTime,
   isPlaying, setRate, setVolume). Como toda a sincronia do app conversa com
   essa interface, o vídeo de qualquer site passa a sincronizar sozinho —
   inclusive a correção contínua de deriva. Não foi preciso escrever
   sincronia nova.
   ══════════════════════════════════════════════════════════════════ */

let Theater = null;
let theaterState = { found:false, t:0, p:false, d:0, title:'', url:'' };
let theaterUid = null;
let _ultimoAchado = 0;   // quando vimos um vídeo pela última vez (para a carência)          // id do card que está usando o navegador
let theaterItemId = null;

/* Só existe dentro do app. No site, `Capacitor` não está definido. */
function theaterAvailable(){
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
function initTheater(){
  if(!theaterAvailable()) return false;
  if(Theater) return true;
  try{
    Theater = pegarPlugin();
    if(!Theater) return false;
    // estado do vídeo chegando da página aberta, a cada meio segundo
    Theater.addListener('videoState', ({state})=>{
      try{
        const s=JSON.parse(state);
        if(s.found){
          theaterState=Object.assign({found:true,t:0,p:false,d:0},s);
          _ultimoAchado=Date.now();
        }else{
          /* CARÊNCIA DE 6s: ao trocar de página ou durante um recarregamento, o
             detector reporta "sem vídeo" por alguns instantes. Antes eu zerava o
             card na hora — era por isso que ele voltava para "Nenhum vídeo
             detectado · 0:00" mesmo com o vídeo ainda tocando. */
          if(Date.now()-_ultimoAchado>6000) theaterState.found=false;
        }
        if(theaterUid) updateTheaterCard();
      }catch(e){}
    });
    // botões da barra do navegador
    Theater.addListener('captured',()=>{
      ensureTheaterCard();
      setTimeout(entrarModoCard,120);   // espera o card existir no layout
      toast('Vídeo capturado · sincronizado com a sala');
    });
    Theater.addListener('backToRoom',()=>{
      ensureTheaterCard();
      setTimeout(entrarModoCard,120);
    });
    Theater.addListener('pageChanged', ({url,title})=>{
      theaterState.url=url; theaterState.title=title;
    });
    Theater.addListener('theaterClosed', ()=>{ /* janela escondida; vídeo segue tocando */ });
    return true;
  }catch(e){ console.warn('Theater indisponível:',e); return false; }
}

/* Abre o navegador dentro do app. */
/* Diz exatamente o que está faltando, em vez de falhar em silêncio.
   Antes o botão ficava escondido quando algo dava errado, e não havia como
   saber se o problema era estar no site, o plugin não ter entrado no APK,
   ou outra coisa. */
/* Obtém o plugin por dois caminhos.
   1) registerPlugin — vem da biblioteca JavaScript do Capacitor.
   2) Capacitor.Plugins.Theater — exposto pela parte NATIVA, funciona mesmo
      se a biblioteca não tiver sido carregada.
   O segundo existe justamente porque o primeiro falhou antes: eu instalava o
   pacote no build mas não levava o arquivo JavaScript para dentro do app. */
function pegarPlugin(){
  const C=window.Capacitor; if(!C) return null;
  if(typeof C.registerPlugin==='function'){
    try{ const p=C.registerPlugin('Theater'); if(p) return p; }catch(e){}
  }
  if(C.Plugins && C.Plugins.Theater) return C.Plugins.Theater;
  return null;
}
function theaterDiagnostico(){
  const C=window.Capacitor;
  if(!(C && C.isNativePlatform && C.isNativePlatform()))
    return 'Você está no site pelo navegador. Esta função só existe no aplicativo (APK).';
  if(!pegarPlugin())
    return 'O plugin não foi encontrado no APK. Confira se native/TheaterPlugin.java e native/MainActivity.java estão no repositório e refaça o build.';
  return null;
}
async function openTheater(url){
  const problema=theaterDiagnostico();
  if(problema){ toast(problema,'err'); console.warn('[navegador]',problema); return; }
  if(!initTheater()){ toast('Não consegui iniciar o navegador embutido','err'); return; }
  if(!room){ toast('Entre em uma sala primeiro','err'); return; }
  try{
    await Theater.open({ url: url || 'https://www.google.com' });
    ensureTheaterCard();
  }catch(e){
    console.error('[navegador] falha ao abrir',e);
    toast('Falha ao abrir o navegador: '+(e.message||e),'err');
  }
}

/* Cria (uma vez) o card na sala que representa o vídeo do navegador, e o
   registra como player para a sincronia enxergar. */
function ensureTheaterCard(){
  if(theaterUid && qs('[data-ytuid="'+theaterUid+'"]')) return;
  const c=$('items'), id='thr_'+Date.now();
  theaterItemId=id;
  theaterUid='ytp_'+id;

  const w=document.createElement('div');
  w.className='card vid-card'; w.dataset.type='theater';
  w.dataset.itemId=id; w.dataset.ytuid=theaterUid;
  Object.assign(w.style,{position:'absolute',left:'80px',top:'80px',zIndex:++zTop,
    width:VID_W+'px',height:(HEAD+120+CTRL)+'px',display:'flex',flexDirection:'column'});
  w.innerHTML=`<div class="ch" style="height:${HEAD}px;flex-shrink:0">
      <span class="ct">▶ Navegador</span>
      <div style="display:flex;align-items:center;gap:.38rem">
        <span class="vsync">SYNC</span>
        <button class="cx" onclick="closeTheaterCard()">×</button>
      </div>
    </div>
    <div class="theater-body" id="thr-body-${theaterUid}">
      <div class="theater-title" id="thr-title-${theaterUid}">Nenhum vídeo detectado</div>
      <div class="theater-sub" id="thr-sub-${theaterUid}">Abra uma página com vídeo</div>
      <button class="btn bp bsm" onclick="showTheater()" style="margin-top:.5rem">Abrir navegador</button>
    </div>
    <div class="vctrl" style="height:${CTRL}px;flex-shrink:0">
      <button class="vcbtn" onclick="vPlay('${theaterUid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg></button>
      <button class="vcbtn" onclick="vPause('${theaterUid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>
      <button class="vcbtn" onclick="vSeek('${theaterUid}',-10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 100-.49"/></svg></button>
      <button class="vcbtn" onclick="vSeek('${theaterUid}',10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 110-.49"/></svg></button>
      <span class="vtime" id="vt-${theaterUid}">0:00</span>
    </div>`;
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  c.appendChild(w); els.push(w);

  /* Registro como player: daqui pra frente a sincronia trata este vídeo
     exatamente como trataria um do YouTube. */
  ytPlrs[theaterUid]={
    playVideo(){  desiredPlaying[theaterUid]=true;  Theater.control({action:'play'}); },
    pauseVideo(){ desiredPlaying[theaterUid]=false; Theater.control({action:'pause'}); },
    seekTo(t){    Theater.control({action:'seek', value:Number(t)||0}); theaterState.t=t; },
    setRate(r){   Theater.control({action:'rate', value:Number(r)||1}); },
    setVolume(v){ Theater.control({action:'vol',  value:Number(v)||0}); },
    getCurrentTime(){ return theaterState.t||0; },
    getDuration(){    return theaterState.d||0; },
    isPlaying(){      return !!theaterState.p; }
  };
  desiredPlaying[theaterUid]=false;
  setSyncHost(theaterUid,U.id);      // quem abriu o navegador é o relógio
  startSyncTicker();
  applyVolumeToPlayer(theaterUid);

  // avisa os outros que existe um card de navegador na sala
  broadcast({type:'ADD_ITEM',item:{type:'theater',x:80,y:80,id}});
}

/* ══════════════════════════════════════════════════════════════════
   VÍDEO DENTRO DO CARD
   Antes o vídeo tocava no navegador escondido e o card mostrava só texto —
   você ouvia mas não via. Agora o navegador nativo é posicionado EXATAMENTE
   sobre a área do card, com as barras escondidas e a página isolada (só o
   player visível). O resultado é o vídeo aparecendo dentro do card, como
   qualquer outro player da sala.
   ══════════════════════════════════════════════════════════════════ */
let _modoCard=false, _boundsRAF=null;

function areaDoCard(){
  const card=qs('[data-ytuid="'+theaterUid+'"]'); if(!card) return null;
  const corpo=$('thr-body-'+theaterUid) || card;
  const r=corpo.getBoundingClientRect();
  if(r.width<10||r.height<10) return null;
  return { x:Math.round(r.left), y:Math.round(r.top),
           w:Math.round(r.width), h:Math.round(r.height) };
}
/* Reposiciona o navegador quando o card é arrastado, redimensionado ou a tela gira. */
function encaixarNoCard(){
  if(!_modoCard||!Theater) return;
  if(_boundsRAF) return;
  _boundsRAF=requestAnimationFrame(()=>{
    _boundsRAF=null;
    const a=areaDoCard(); if(!a) return;
    Theater.setBounds(a).catch(()=>{});
  });
}
async function entrarModoCard(){
  if(!Theater) return;
  const a=areaDoCard(); if(!a) return;
  try{
    await Theater.isolate({on:true});     // esconde o resto da página
    await Theater.setBounds(a);           // encaixa o navegador no card
    _modoCard=true;
    const card=qs('[data-ytuid="'+theaterUid+'"]');
    if(card) card.classList.add('theater-embed');
    // acompanha movimento/redimensionamento do card
    window.addEventListener('resize',encaixarNoCard);
    if(!window.__thrObs){
      window.__thrObs=setInterval(()=>{ if(_modoCard) encaixarNoCard(); },400);
    }
  }catch(e){ console.error('modo card',e); }
}
async function sairModoCard(){
  if(!Theater) return;
  _modoCard=false;
  const card=qs('[data-ytuid="'+theaterUid+'"]');
  if(card) card.classList.remove('theater-embed');
  try{ await Theater.isolate({on:false}); await Theater.setFullscreen(); }catch(e){}
}
/* Mantém o card em dia com o que está tocando na página. */
function updateTheaterCard(){
  const t=$('thr-title-'+theaterUid), s=$('thr-sub-'+theaterUid), vt=$('vt-'+theaterUid);
  if(t) t.textContent = theaterState.found
      ? (theaterState.title||'Vídeo detectado')
      : 'Nenhum vídeo detectado';
  if(s) s.textContent = theaterState.found
      ? (theaterState.p?'tocando · sincronizado':'pausado · sincronizado')
      : 'Abra uma página com vídeo';
  if(vt) vt.textContent=fmtTime(theaterState.t||0);
  const card=qs('[data-ytuid="'+theaterUid+'"]');
  if(card) card.classList.toggle('theater-live',!!theaterState.found);
}
async function showTheater(){
  if(!Theater) return;
  await sairModoCard();     // devolve a página ao normal antes de navegar
  Theater.show();
}
function hideTheater(){ if(Theater) Theater.hide(); }
async function closeTheaterCard(){
  if(Theater){ await sairModoCard(); await Theater.close(); }
  if(window.__thrObs){ clearInterval(window.__thrObs); window.__thrObs=null; }
  const card=qs('[data-ytuid="'+theaterUid+'"]');
  if(card){ card.remove(); els=els.filter(e=>e!==card); }
  if(theaterItemId) broadcast({type:'REMOVE_ITEM',itemId:theaterItemId});
  delete ytPlrs[theaterUid];
  theaterUid=null; theaterItemId=null;
  theaterState={found:false,t:0,p:false,d:0,title:'',url:''};
}

/* Botão na barra da sala — só aparece quando rodando como app. */
/* O botão fica sempre visível: se a função não estiver disponível, ele explica
   o motivo ao ser tocado (ver theaterDiagnostico). */
document.addEventListener('DOMContentLoaded',()=>{
  try{
    if(initTheater()) console.log('[navegador] plugin pronto');
    else console.log('[navegador] indisponível:', theaterDiagnostico());
  }catch(e){ console.warn('[navegador]',e); }
});
