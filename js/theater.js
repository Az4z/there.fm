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
let theaterUid = null;          // id do card que está usando o navegador
let theaterItemId = null;

/* Só existe dentro do app. No site, `Capacitor` não está definido. */
function theaterAvailable(){
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
function initTheater(){
  if(!theaterAvailable()) return false;
  if(Theater) return true;
  try{
    Theater = window.Capacitor.registerPlugin('Theater');
    // estado do vídeo chegando da página aberta, a cada meio segundo
    Theater.addListener('videoState', ({state})=>{
      try{
        const s=JSON.parse(state);
        theaterState=Object.assign({found:false,t:0,p:false,d:0},s);
        if(theaterUid) updateTheaterCard();
      }catch(e){}
    });
    Theater.addListener('pageChanged', ({url,title})=>{
      theaterState.url=url; theaterState.title=title;
    });
    Theater.addListener('theaterClosed', ()=>{ /* janela escondida; vídeo segue tocando */ });
    return true;
  }catch(e){ console.warn('Theater indisponível:',e); return false; }
}

/* Abre o navegador dentro do app. */
async function openTheater(url){
  if(!initTheater()){
    toast('A navegação dentro do app só funciona na versão APK','err');
    return;
  }
  if(!room){ toast('Entre em uma sala primeiro','err'); return; }
  await Theater.open({ url: url || 'https://www.google.com' });
  ensureTheaterCard();
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
    <div class="theater-body">
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
function showTheater(){ if(Theater) Theater.show(); }
function hideTheater(){ if(Theater) Theater.hide(); }
async function closeTheaterCard(){
  if(Theater) await Theater.close();
  const card=qs('[data-ytuid="'+theaterUid+'"]');
  if(card){ card.remove(); els=els.filter(e=>e!==card); }
  if(theaterItemId) broadcast({type:'REMOVE_ITEM',itemId:theaterItemId});
  delete ytPlrs[theaterUid];
  theaterUid=null; theaterItemId=null;
  theaterState={found:false,t:0,p:false,d:0,title:'',url:''};
}

/* Botão na barra da sala — só aparece quando rodando como app. */
function setupTheaterButton(){
  if(!theaterAvailable()) return;
  const btn=$('theaterBtn');
  if(btn) btn.style.display='flex';
}
/* Mostra o botão assim que o app carrega (dentro do APK). No site nada acontece. */
document.addEventListener('DOMContentLoaded',()=>{
  try{ if(initTheater()) setupTheaterButton(); }catch(e){}
});
