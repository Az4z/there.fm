'use strict';
/* ── CONSTANTS ── */
const SUPA_URL  = 'https://vhflsjrawbvmokyzegef.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZmxzanJhd2J2bW9reXplZ2VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjY4OTksImV4cCI6MjA5NDU0Mjg5OX0._ej361ZjDBcnFuBHn3YIhvGmpRhZLWhG8Rth4p6ugZ0';
const KLIPY_KEY = 'hc7D7nAjR0hmqWoHyNrgifqGKw2TdZAIMugS0SJCOqlVk7OrIgIe1pjExXBlaz4r';
const DISC_THEME_URL = 'https://i.postimg.cc/j5f4ysBr/3fd216ae1e7d0755e48b1b6268b3ad61.jpg'; // imagem fixa do disco — mesma em todos os cards, não gira
const YT_CLIENT_ID = '1076461455830-tgstle9p0ofpviqr8qd5puc9frp9321n.apps.googleusercontent.com'; // não usado mais, mantido por compatibilidade
const YT_API_KEY = 'AIzaSyD6KXzYmg42GL9thLhmEOvKPoyjc90MMA8'; // chave simples da YouTube Data API v3 — não expira, sem login
const DRAWCOLORS = ['#eae6de','#c45c5c','#5c7ec4','#5cc47e','#c4a05c','#f97316','#9b5cc4','#000000'];
const HEAD=32, CTRL=40, VID_W=460, VID_H=258; // video card dimensions
const SUGG=92, NOTE_H=34; // altura extra: faixa "a seguir" (YouTube) e nota do embed genérico
/* Badge "Owner" — aparece permanentemente ao lado do nome de quem faz login com este e-mail,
   em qualquer lugar do app onde o nome dessa pessoa apareça (sala, perfil, chat, chamada, etc). */
const OWNER_EMAIL = 'tenya152408@gmail.com'; // e-mail de login do dono da plataforma
const OWNER_BADGE_GIF = 'https://i.postimg.cc/htHhLbRX/Suoming-chibi-cartoon-dance-hold-mouth-hand-shake.gif';
let OWNER_UID = null; // resolvido uma vez a partir do e-mail acima e guardado em cache

/* ── STATE ── */
let U        = {name:'',email:'',photo:'',id:'',color:'#c45c5c',username:'',bio:'',banner:null,frame:null,frame_scale:1,frame_x:0,frame_y:0};
let room     = null;
let els      = [];
let peers    = {};
let ytPlrs   = {};  // uid -> YT.Player (ou proxy compatível: playVideo/pauseVideo/seekTo/getCurrentTime/getDuration/isPlaying)
let _vtTimers = {}; // uid -> id do setInterval que atualiza o tempo exibido (limpo ao remover o card)
let ytReady  = false;
let activeVideoCardId = null; // itemId do card de vídeo único que é reaproveitado (não abre outro item a cada vídeo novo)
let activeMusicCardId = null; // itemId do card de música único, mesma lógica
let desiredPlaying = {};      // uid -> true/false: o que deveria estar tocando (usado pra "curar" pausas sozinhas)
let _syncSuppress   = {};     // uid -> true enquanto aplicamos uma sync recebida (evita eco/loop de broadcast)
let gifMode  = 'canvas';
let tbPos    = 'top';
let pendImg  = null;
let zTop     = 10;
let hbTimer  = null;
let _supa    = null;
let _ch      = null;
let channel  = null; // alias for _ch
let ytGToken = localStorage.getItem('tfm_yt_token') || null; // Google OAuth access token para YouTube Data API

/* ── QUADRO COLABORATIVO (estilo Miro) ── */
let boardNodes = {};           // id -> row do banco (board_nodes)
let boardEdges = {};           // id -> row do banco (board_edges)
let boardPollTimer = null;
let boardConnectMode = false;
let boardConnectFrom = null;
let boardDrag = null;          // {id,startX,startY,startLeft,startTop}
const BOARD_COLORS = ['#f5d78a','#a8e6b0','#a8d4f5','#f5a8c8','#d7c1f0'];

/* pendências de upload de perfil */
let pendingAvatarFile = null;
let pendingBannerFile = null;

/* ── CHAMADA DE VOZ (WebRTC em malha, sinalização pelo mesmo canal do Supabase) ── */
const CALL_ICE_SERVERS = [
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'}
]; // sem servidor TURN próprio: funciona na grande maioria das redes, mas redes muito restritas (algumas corporativas) podem falhar sem um TURN dedicado
let callActive   = false;      // estou na chamada agora?
let callPeers    = {};         // uid -> {pc, audioEl, analyser, level, pendingCandidates}
let callParticipants = {};     // uid -> {name,color,photo,muted}
let localRawStream  = null;    // stream cru do microfone (antes do supressor)
let localSentStream = null;    // stream já tratada pelo supressor — é o que vai pros outros
let localMuted    = false;
let localDeafened = false;
let callAudioCtx  = null;
let noiseGateNode = null;      // AudioWorkletNode (ou ScriptProcessorNode de fallback) que faz o gate de ruído
let noiseGateSensitivity = 0.35; // 0..1 — abaixo desse nível de energia, o áudio é atenuado
let noiseGateEnabled = true;     // permite desligar o supressor sem sair da chamada
let localAnalyser = null;      // pra mostrar o medidor de nível / indicador de "falando"
let callMeterRAF  = null;

/* drag/resize */
let D=null, R=null, raf=null, px=0,py=0,pw=0,ph=0;

/* draw */
let drawMode=false, drawing=false, eraser=false;
let drawColor='#eae6de', drawHist=[], lastDX=0, lastDY=0;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', ()=>{
  buildDrawColors(); buildFramePresets();
  ytUpdateLoginUI();
  initProfileSystem();
  checkAuth();
  initPointer();
  initDraw();
  initCropDrag();
  startPlaybackWatchdog();
  resolveOwnerUid();
  window.addEventListener('pagehide',()=>{ if(callActive)endCall(true); });
  window.addEventListener('resize', ()=>{ drawGrid(); resizeDC(); });
  document.querySelectorAll('.modal').forEach(m=>
    m.addEventListener('click', e=>{ if(e.target===m) m.classList.remove('on'); }));
  document.getElementById('settingsPanel').addEventListener('click', e=>{
    if(e.target===document.getElementById('settingsPanel')) closeSettings();
  });
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){ document.querySelectorAll('.modal').forEach(m=>m.classList.remove('on')); closeSettings(); }
    if((e.key==='Delete'||e.key==='Backspace')&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA') delSel();
  });
  setTimeout(()=>{
    const el=document.getElementById('intro');
    const iv=document.getElementById('introV');
    // Cross-fade: both animate simultaneously
    el.classList.add('out');
    iv.classList.add('vis');
    setTimeout(()=>el.remove(), 750);
    setTimeout(()=>{
      iv.classList.add('out');
      setTimeout(()=>iv.remove(), 950);
    }, 3800);
  }, 3300);
});
function onYouTubeIframeAPIReady(){ ytReady=true; }

/* ── HELPERS ── */
const $  = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);
function toast(msg,type='',onClick=null){
  const t=document.createElement('div'); t.className='toast '+type+(onClick?' clickable':''); t.textContent=msg;
  if(onClick){ t.onclick=()=>{ onClick(); t.remove(); }; }
  document.body.appendChild(t);
  const dur=onClick?5200:2800;
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(40px)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),320); }, dur);
}
function closeModal(id){ $(id).classList.remove('on'); }
function darken(hex){
  if(!hex||hex.length<7) return '#222';
  return `rgb(${Math.max(0,parseInt(hex.slice(1,3),16)-55)},${Math.max(0,parseInt(hex.slice(3,5),16)-55)},${Math.max(0,parseInt(hex.slice(5,7),16)-55)})`;
}
function fmtTime(t){ return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0'); }

/* ── ANTI-ECO / ANTI-PAUSA ESPONTÂNEA ──
   Problema original: ao aplicar uma sync recebida (play/pause/seek de outra pessoa),
   o player local disparava seu próprio evento de estado, que era rebroadcast, criando
   loops de play/pause entre participantes — e, em cima disso, iframes escondidos ou fora
   da tela (ex: player de música em -9999px) eram pausados sozinhos pelo navegador por
   otimização de energia. As funções abaixo resolvem os dois problemas:
   1) suppressSync/isSuppressed: enquanto aplicamos uma ação vinda da rede, ignoramos o
      eco do próprio evento do player, evitando o loop.
   2) startPlaybackWatchdog: verifica periodicamente se algo que "deveria" estar tocando
      parou sozinho (throttle do navegador, perda de foco, etc) e retoma automaticamente. */
function suppressSync(uid,ms){
  _syncSuppress[uid]=true;
  clearTimeout(_syncSuppress['_t_'+uid]);
  _syncSuppress['_t_'+uid]=setTimeout(()=>{_syncSuppress[uid]=false;},ms||1200);
}
function isSuppressed(uid){ return !!_syncSuppress[uid]; }
function startPlaybackWatchdog(){
  setInterval(()=>{
    if(document.hidden)return; // com a aba oculta o navegador pausa de propósito; não brigar com ele
    const uids=Object.keys(ytPlrs);
    if(!uids.length)return;    // sem players, não faz nada
    uids.forEach(uid=>{
      if(!desiredPlaying[uid]||isSuppressed(uid))return;
      const p=ytPlrs[uid]; if(!p)return;
      try{ if(!p.isPlaying())p.playVideo(); }catch(e){}
    });
  },3000);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    // Ao voltar pra aba/app, retoma o que devia estar tocando (mobile/OS costuma pausar iframes em background)
    Object.keys(ytPlrs).forEach(uid=>{
      if(!desiredPlaying[uid])return;
      const p=ytPlrs[uid]; if(!p)return;
      try{ if(!p.isPlaying())p.playVideo(); }catch(e){}
    });
  });
}
function setConnStatus(s){
  const dot=$('connDot'), lbl=$('connLbl'); if(!dot||!lbl) return;
  const states={SUBSCRIBED:['#5cc47e','conectado'],JOINING:['#c4a060','conectando...'],CHANNEL_ERROR:['#c45c5c','erro · reconectando'],TIMED_OUT:['#c45c5c','timeout'],CLOSED:['#4a4540','desconectado']};
  const [color,text]=states[s]||['#c4a060','conectando...'];
  dot.style.background=color; lbl.textContent=text;
}

/* ── AUTH PHOTO ── */
function handlePhoto(input,form){
  const f=input.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=e=>openCropModal(e.target.result,f.type||'image/png',form); r.readAsDataURL(f);
  input.value='';
}

/* ── AUTH ── */
function goAuth(){ setScene('authScene'); $('msgbar').classList.remove('show'); $('ytPanel').classList.remove('on'); hideChatFab(); hideBoardFab(); }
function goLanding(){ setScene('landingScene'); $('msgbar').classList.remove('show'); $('ytPanel').classList.remove('on'); if(U.id){ subscribeIncomingDMs(); showChatFab(); showBoardFab(); } }
function goRoom(){ setScene('roomScene'); $('msgbar').classList.add('show'); hideChatFab(); hideBoardFab(); }
function setScene(id){ document.querySelectorAll('.scene').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); }
function toSignup(){ $('loginForm').style.display='none'; $('signupForm').style.display='flex'; }
function toLogin(){ $('signupForm').style.display='none'; $('loginForm').style.display='flex'; }
function saveU(){ localStorage.setItem('tfm_u',JSON.stringify(U)); }

/* Checa sessão do Supabase primeiro; cai para localStorage se não houver conta */
function checkAuth(){
  try{
    const supa=getSupa();
    supa.auth.getSession().then(({data})=>{
      if(data?.session){
        const uid=data.session.user.id, authUser=data.session.user;
        supa.from('profiles').select('*').eq('id',uid).maybeSingle().then(async r=>{
          if(r.data){ U={...U,...r.data}; saveU(); goLanding(); }
          else{
            // sessão válida mas sem linha em profiles ainda: cria em vez de jogar pro login
            const nm=authUser.user_metadata?.full_name||(authUser.email?authUser.email.split('@')[0]:'User');
            let photoUrl=null;
            if(pendingAvatarFile){ const path=`${uid}/avatar-${Date.now()}.png`; photoUrl=await uploadProfileFile(pendingAvatarFile,path); pendingAvatarFile=null; }
            const basic={ id:uid, name:nm, username:genUsername(nm), email:authUser.email, color:U.color||'#c45c5c', photo:photoUrl };
            const up=await supa.from('profiles').upsert(basic,{onConflict:'id'});
            if(up.error){ toast('Erro ao criar perfil: '+up.error.message,'err'); console.error('checkAuth upsert error',up.error); }
            U={...U,...basic}; saveU(); goLanding();
          }
        });
      } else {
        const s=localStorage.getItem('tfm_u'); if(s){ U=JSON.parse(s); goLanding(); } else goAuth();
      }
    }).catch(()=>{ const s=localStorage.getItem('tfm_u'); if(s){U=JSON.parse(s);goLanding();}else goAuth(); });
  }catch{ goAuth(); }
}

/* Gera um @usuario a partir do nome/email, garantindo que nunca fique null.
   Ex: "João Silva" -> "joao.silva7k2" */
function genUsername(base){
  const slug=(base||'user').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'').slice(0,20)||'user';
  const suffix=Math.random().toString(36).slice(2,7);
  return `${slug}${suffix}`;
}

/* Observador de auth: mantém o perfil sincronizado com o Supabase */
async function initProfileSystem(){
  const supa=getSupa();
  supa.auth.onAuthStateChange(async (event,session)=>{
    const user=session?.user;
    if(user){
      const { data, error }=await supa.from('profiles').select('*').eq('id',user.id).maybeSingle();
      if(error){ toast('Erro ao ler perfil: '+error.message,'err'); console.error('profile load error',error); }
      if(data){ U={...U,...data}; U.id=user.id; U.email=user.email; saveU(); }
      else{
        const nm=user.user_metadata?.full_name||(user.email?user.email.split('@')[0]:'User');
        let photoUrl=null;
        if(pendingAvatarFile){ const path=`${user.id}/avatar-${Date.now()}.png`; photoUrl=await uploadProfileFile(pendingAvatarFile,path); pendingAvatarFile=null; }
        const basic={ id:user.id, name:nm, username:genUsername(nm), email:user.email, color:U.color||'#c45c5c', photo:photoUrl };
        const up=await supa.from('profiles').upsert(basic,{onConflict:'id'});
        if(up.error){ toast('Erro ao criar perfil: '+up.error.message,'err'); console.error('initProfileSystem upsert error',up.error); }
        U={...U,...basic}; saveU();
      }
    }
  });
}

async function doSignupAuth(){
  const n=$('sName').value.trim(), e=$('sEmail').value.trim(), p=$('sPass').value;
  if(!n||!e||!p){toast('Preencha todos os campos','err');return;}
  if(p.length<6){toast('Senha mínimo 6 caracteres','err');return;}
  const supa=getSupa();
  const res=await supa.auth.signUp({ email:e, password:p, options:{ data:{ full_name:n } } });
  if(res.error){ toast('Erro no cadastro: '+res.error.message,'err'); return; }
  // fallback local imediato (útil enquanto confirmação de email não chega)
  U.name=n; U.email=e; if(res.data?.user) U.id=res.data.user.id; saveU();
  toast('Conta criada, '+n,'ok'); goLanding();
}
async function doLoginAuth(){
  const e=$('lEmail').value.trim(), p=$('lPass').value;
  if(!e||!p){toast('Preencha email e senha','err');return;}
  const supa=getSupa();
  const res=await supa.auth.signInWithPassword({ email:e, password:p });
  if(res.error){ toast('Erro ao autenticar: '+res.error.message,'err'); return; }
  const uid=res.data.user.id;
  const { data }=await supa.from('profiles').select('*').eq('id',uid).maybeSingle();
  if(data){ U={...U,...data}; } else { U.email=e; U.id=uid; if(!U.name) U.name=e.split('@')[0]; }
  saveU(); toast('Bem-vindo, '+(U.name||''),'ok'); goLanding();
}
async function doLogoutAuth(){
  if(!confirm('Sair da conta?'))return;
  try{ await getSupa().auth.signOut(); }catch(e){}
  localStorage.removeItem('tfm_u'); location.reload();
}

/* ── SETTINGS ── */
function openSettings(){
  pendingAvatarFile=null; pendingBannerFile=null; // evita reenviar um arquivo antigo de uma edição cancelada anteriormente
  $('sNm').value=U.name||''; $('sEm').value=U.email||'';
  if($('sUname')) $('sUname').value=U.username||'';
  if($('sBio')) $('sBio').value=U.bio||'';
  if($('frameScale')) $('frameScale').value=U.frame_scale||1;
  if($('frameX')) $('frameX').value=U.frame_x||0;
  if($('frameY')) $('frameY').value=U.frame_y||0;
  const sp=$('sphoto');
  sp.innerHTML=U.photo?`<img src="${U.photo}"><input type="file" id="spFile" accept="image/*" onchange="handleSPhoto(this)">`:`<span class="sinit">${(U.name||'A').charAt(0).toUpperCase()}</span><input type="file" id="spFile" accept="image/*" onchange="handleSPhoto(this)">`;
  const sb=$('sbanner');
  if(sb) sb.innerHTML=U.banner?`<img src="${U.banner}"><input type="file" id="spBannerFile" accept="image/*" onchange="handleSBanner(this)">`:`<span class="sb-ph">Banner</span><input type="file" id="spBannerFile" accept="image/*" onchange="handleSBanner(this)">`;
  updateFramePreview(); $('settingsPanel').classList.add('on');
}
function closeSettings(){ $('settingsPanel').classList.remove('on'); }
function handleSPhoto(input){
  const f=input.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=e=>openCropModal(e.target.result,f.type||'image/png','settings'); r.readAsDataURL(f);
  input.value='';
}
function handleSBanner(input){
  const f=input.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=e=>openCropModal(e.target.result,f.type||'image/png','banner','rect'); r.readAsDataURL(f);
  input.value='';
}

/* ── CROP/ZOOM DE FOTO ──
   Antes o upload ia direto pro círculo (avatar) ou pro retângulo (banner) com
   object-fit:cover/background-size:cover, cortando cegamente partes importantes
   da imagem sem deixar a pessoa escolher o enquadramento.
   Agora a pessoa ajusta zoom e posição num editor antes de confirmar, e o
   resultado já sai "assado" num canvas (quadrado pro avatar, retangular 3:1
   pro banner) — sem mais cortes surpresa em nenhum lugar do app (avatar,
   moldura, banner do perfil público, etc).
   shape: 'circle' (avatar, padrão) ou 'rect' (banner) — controla a forma do
   stage e as proporções do canvas de saída. */
let cropState=null, cropTarget=null, cropDrag=null;
function openCropModal(dataUrl,mime,target,shape){
  shape=shape||'circle';
  const stage=$('cropStage'), modal=$('cropModal'), cImg=$('cropImg');
  stage.classList.toggle('rect',shape==='rect');
  const title=$('cropTitle'), desc=$('cropDesc');
  if(shape==='rect'){
    if(title) title.textContent='Ajustar banner';
    if(desc) desc.textContent='Arraste a imagem para posicionar e use o zoom para enquadrar o banner.';
  } else {
    if(title) title.textContent='Ajustar foto';
    if(desc) desc.textContent='Arraste a imagem para posicionar e use o zoom para enquadrar melhor.';
  }
  // esconde a imagem antiga enquanto a nova carrega, pra não piscar conteúdo/tamanho errados
  cImg.style.visibility='hidden';
  // CRÍTICO: o modal precisa estar visível (display:flex) ANTES de medir o stage.
  // Com display:none (estado padrão do modal), clientWidth/clientHeight sempre retornam 0.
  modal.classList.add('on');
  // A altura do stage do banner é calculada e fixada em PIXELS aqui, em vez de depender de
  // "aspect-ratio" do CSS (que pode não estar disponível/aplicado a tempo em todo navegador
  // ou webview). Isso garante 3:1 sempre — é o que evita o banner "quase quadrado" e a imagem
  // parecendo dar zoom sozinha (o zoom mínimo era calculado achando que o stage era quadrado).
  if(shape==='rect'){
    const w=stage.clientWidth||300;
    stage.style.height=Math.round(w/3)+'px';
  } else {
    stage.style.height='';
  }
  const img=new Image();
  img.onload=()=>{
    // lê o tamanho real (em px) do stage já visível, já com a altura correta aplicada
    const stageW=stage.clientWidth||(shape==='rect'?300:240), stageH=stage.clientHeight||(shape==='rect'?100:240);
    const minScale=Math.max(stageW/img.naturalWidth, stageH/img.naturalHeight);
    const outW=shape==='rect'?900:480, outH=shape==='rect'?300:480;
    cropState={ mime:(mime&&mime.startsWith('image/'))?mime:'image/png', natW:img.naturalWidth, natH:img.naturalHeight, stageW, stageH, minScale, scale:minScale, x:0, y:0, shape, outW, outH };
    cropTarget=target;
    cImg.src=dataUrl;
    cImg.onload=()=>{
      // centraliza a imagem no meio do stage ao abrir
      cropState.x=(stageW-cropState.natW*cropState.scale)/2;
      cropState.y=(stageH-cropState.natH*cropState.scale)/2;
      $('cropZoom').value=1;
      cropRender();
      cImg.style.visibility='visible';
    };
  };
  img.src=dataUrl;
}
function cropRender(){
  if(!cropState) return;
  const s=cropState, w=s.natW*s.scale, h=s.natH*s.scale;
  const minX=s.stageW-w, minY=s.stageH-h;
  s.x=Math.min(0,Math.max(minX,s.x));
  s.y=Math.min(0,Math.max(minY,s.y));
  const cImg=$('cropImg');
  cImg.style.width=w+'px'; cImg.style.height=h+'px';
  cImg.style.transform=`translate(${s.x}px,${s.y}px)`;
}
function cropUpdateZoom(){
  if(!cropState) return;
  const s=cropState, zoom=parseFloat($('cropZoom').value)||1;
  const oldScale=s.scale, newScale=s.minScale*zoom;
  const cx=s.stageW/2, cy=s.stageH/2;
  // mantém o ponto central da tela fixo enquanto o zoom muda
  const relX=(cx-s.x)/oldScale, relY=(cy-s.y)/oldScale;
  s.scale=newScale;
  s.x=cx-relX*newScale; s.y=cy-relY*newScale;
  cropRender();
}
function initCropDrag(){
  const stage=$('cropStage'); if(!stage) return;
  const onDown=(x,y,pid)=>{ if(!cropState) return; cropDrag={sx:x,sy:y,ox:cropState.x,oy:cropState.y}; stage.classList.add('dragging'); };
  const onMove=(x,y)=>{ if(!cropDrag||!cropState) return; cropState.x=cropDrag.ox+(x-cropDrag.sx); cropState.y=cropDrag.oy+(y-cropDrag.sy); cropRender(); };
  const onUp=()=>{ cropDrag=null; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerdown',e=>{ e.preventDefault(); stage.setPointerCapture(e.pointerId); onDown(e.clientX,e.clientY); });
  stage.addEventListener('pointermove',e=>{ if(cropDrag) e.preventDefault(); onMove(e.clientX,e.clientY); });
  window.addEventListener('pointerup',onUp);
  stage.addEventListener('pointercancel',onUp);
}
function cropCancel(){ $('cropModal').classList.remove('on'); $('cropStage').classList.remove('rect'); cropState=null; cropTarget=null; cropDrag=null; }
function cropConfirm(){
  if(!cropState){ cropCancel(); return; }
  const s=cropState;
  const canvas=document.createElement('canvas'); canvas.width=s.outW; canvas.height=s.outH;
  const ctx=canvas.getContext('2d');
  const kx=s.outW/s.stageW, ky=s.outH/s.stageH;
  ctx.drawImage($('cropImg'), s.x*kx, s.y*ky, s.natW*s.scale*kx, s.natH*s.scale*ky);
  const mime=s.mime, target=cropTarget, shape=s.shape;
  canvas.toBlob(blob=>{
    if(!blob){ toast('Erro ao processar imagem','err'); cropCancel(); return; }
    const ext=mime==='image/png'?'png':'jpg';
    // IMPORTANTE: esta "url" é um blob: local — só existe nesta aba, morre ao recarregar
    // a página e nunca é visível para outras pessoas. Por isso ela é usada SOMENTE para
    // pré-visualização imediata na tela, nunca atribuída a U.photo/U.banner, salva no banco
    // ou transmitida pra sala. O valor real e permanente só entra em U.photo/U.banner depois
    // do upload bem-sucedido pro Supabase Storage (feito em saveSettings/criação de perfil).
    const url=URL.createObjectURL(blob);
    if(target==='banner'){
      const file=new File([blob],'banner.'+ext,{type:mime});
      pendingBannerFile=file;
      const sb=$('sbanner'); if(sb) sb.innerHTML=`<img src="${url}"><input type="file" id="spBannerFile" accept="image/*" onchange="handleSBanner(this)">`;
    } else {
      const file=new File([blob],'avatar.'+ext,{type:mime});
      pendingAvatarFile=file;
      if(target==='settings'){
        $('sphoto').innerHTML=`<img src="${url}"><input type="file" id="spFile" accept="image/*" onchange="handleSPhoto(this)">`;
        updateFramePreview();
      } else {
        const wrapId=target==='login'?'loginPP':'signupPP';
        const w=$(wrapId);
        if(w) w.innerHTML=`<img src="${url}"><input type="file" accept="image/*" onchange="handlePhoto(this,'${target}')">`;
      }
    }
    $('cropModal').classList.remove('on'); $('cropStage').classList.remove('rect'); cropState=null; cropTarget=null;
  },mime,0.92);
}
function updateFramePreview(){
  const scaleEl=$('frameScale'), xEl=$('frameX'), yEl=$('frameY');
  if(scaleEl) U.frame_scale=parseFloat(scaleEl.value);
  if(xEl) U.frame_x=parseInt(xEl.value);
  if(yEl) U.frame_y=parseInt(yEl.value);
  // A moldura é anexada no wrapper (avatarFrameWrap), não dentro de #sphoto — #sphoto
  // tem overflow:hidden pra recortar a foto em círculo, o que cortava a moldura junto
  // sempre que ela vazava pra fora do círculo (ex: asas, pontas decorativas). O wrapper
  // não tem overflow:hidden, então a moldura pode vazar livremente por cima do avatar.
  const wrap=$('avatarFrameWrap'); if(!wrap) return;
  wrap.querySelector('.frame-preview')?.remove();
  if(U.frame){
    const fr=document.createElement('img'); fr.className='frame-preview'; fr.src=U.frame;
    fr.style.position='absolute'; fr.style.left=(50+(U.frame_x||0))+'%'; fr.style.top=(50+(U.frame_y||0))+'%';
    fr.style.transform=`translate(-50%,-50%) scale(${(U.frame_scale||1)*1.45})`; fr.style.width='100%'; fr.style.height='100%'; fr.style.pointerEvents='none'; fr.style.zIndex='2';
    wrap.appendChild(fr);
  }
}
/* Molduras disponíveis — imagens hospedadas.
   Para adicionar uma nova moldura, é só me mandar o design que eu incluo aqui na lista. */
const FRAME_PRESETS=[
  'https://i.postimg.cc/Sjb0Y6SP/Picsart-26-08-21-05-05-51-656.png',
  'https://i.postimg.cc/QtGzVhjd/IMG-20260825-WA0004.png',
  'https://i.postimg.cc/KYgVZRhK/IMG-20260825-WA0003.png'
];

function buildFramePresets(){
  const box=$('framePresets'); if(!box) return; box.innerHTML='';
  const none=document.createElement('div'); none.className='gi'+(!U.frame?' sel':''); none.title='Sem moldura';
  none.style.display='flex'; none.style.alignItems='center'; none.style.justifyContent='center'; none.style.fontSize='.68rem'; none.style.color='var(--ash)';
  none.textContent='Nenhuma'; none.onclick=()=>{ U.frame=null; buildFramePresets(); updateFramePreview(); };
  box.appendChild(none);
  FRAME_PRESETS.forEach(url=>{
    const d=document.createElement('div'); d.className='gi'+(U.frame===url?' sel':'');
    d.onclick=()=>{ U.frame=url; buildFramePresets(); updateFramePreview(); };
    const img=document.createElement('img'); img.src=url; d.appendChild(img); box.appendChild(d);
  });
}

/* Upload no Supabase Storage (bucket 'profiles') */
async function uploadProfileFile(file,destPath){
  if(!file) return null;
  const supa=getSupa();
  try{
    const { data:userData }=await supa.auth.getUser(); const user=userData.user;
    const { error }=await supa.storage.from('profiles').upload(destPath,file,{ cacheControl:'3600', upsert:true, contentType:file.type, metadata:{ user_id:user?.id } });
    if(error){ console.error('uploadProfileFile error:',error.message||error); return null; }
    // BUG CORRIGIDO: getPublicUrl() retorna { data: { publicUrl } } no supabase-js v2.
    // O código antigo lia ".publicUrl" direto no objeto de fora (sem passar por ".data"),
    // então SEMPRE retornava undefined — mesmo com o upload funcionando perfeitamente.
    // Por isso a foto/banner nunca recebiam a URL real e ficavam presas na pré-visualização
    // temporária (blob:), que não existe fora da sua aba e some ao recarregar a página.
    const { data:pub }=supa.storage.from('profiles').getPublicUrl(destPath);
    if(!pub?.publicUrl){ console.error('uploadProfileFile: getPublicUrl não retornou URL', pub); return null; }
    return pub.publicUrl;
  }catch(e){ console.error('uploadProfileFile exception:',e); return null; }
}

async function saveSettings(){
  const supa=getSupa();
  const { data:userData }=await supa.auth.getUser(); const user=userData.user;
  const n=$('sNm').value.trim(), em=$('sEm').value.trim();
  const un=$('sUname')?$('sUname').value.trim():U.username;
  const bio=$('sBio')?$('sBio').value.trim():U.bio;
  if(n)U.name=n; if(em)U.email=em; U.username=un||U.username; U.bio=bio||U.bio;

  if(!user){ // sem conta: salva só local
    saveU();
    const aw=qs('.av-wrap[data-uid="'+U.id+'"]'); if(aw)refreshAv(aw,U);
    if(qs('.pi[data-uid="'+U.id+'"]')) upsertPart(U.id,U,'Você');
    broadcastMyInfo(); toast('Salvo localmente (faça login para sincronizar)','ok'); closeSettings(); return;
  }

  if(pendingAvatarFile){ const path=`${user.id}/avatar-${Date.now()}.png`; const url=await uploadProfileFile(pendingAvatarFile,path); if(url){ U.photo=url; } else { toast('Falha ao enviar a foto de perfil — mantendo a anterior','err'); } pendingAvatarFile=null; }
  if(pendingBannerFile){ const path=`${user.id}/banner-${Date.now()}.png`; const url=await uploadProfileFile(pendingBannerFile,path); if(url){ U.banner=url; } else { toast('Falha ao enviar o banner — mantendo o anterior','err'); } pendingBannerFile=null; }

  const payload={ id:user.id, name:U.name, email:U.email, username:U.username, bio:U.bio, color:U.color, photo:U.photo||null, banner:U.banner||null, frame:U.frame||null, frame_scale:U.frame_scale||1, frame_x:U.frame_x||0, frame_y:U.frame_y||0 };
  const { data, error }=await supa.from('profiles').upsert(payload,{onConflict:'id'}).select().maybeSingle();
  if(error){ console.error(error); toast('Erro ao salvar perfil: '+error.message,'err'); return; }
  U={...U,...payload}; saveU();
  const aw=qs('.av-wrap[data-uid="'+U.id+'"]'); if(aw)refreshAv(aw,U);
  if(qs('.pi[data-uid="'+U.id+'"]')) upsertPart(U.id,U,'Você');
  broadcastMyInfo(); toast('Perfil salvo','ok'); closeSettings();
}

/* ── PERFIL PÚBLICO / AMIGOS ── */
async function openMyPublicProfile(){ if(!U.id){ toast('Faça login para abrir seu perfil público','err'); return; } closeSettings(); openProfile(U.id); }
async function openProfile(uid){
  const supa=getSupa();
  const { data, error }=await supa.from('profiles').select('*').eq('id',uid).maybeSingle();
  if(error){ console.warn(error); toast('Erro ao carregar perfil','err'); return; }
  const p=data||(uid===U.id?U:null);
  if(!p){ toast('Perfil não encontrado','err'); return; }
  const fr=await supa.from('friendships').select('*').or(`requester.eq.${uid},recipient.eq.${uid}`).eq('status','accepted');
  $('pubBanner').style.backgroundImage=p.banner?`url('${p.banner}')`:'none';
  $('pubAvatar').style.position='relative'; $('pubAvatar').style.overflow='visible';
  $('pubAvatar').innerHTML=avatarHTML(p);
  await resolveOwnerUid();
  $('pubName').innerHTML=`<span style="display:inline-flex;align-items:center;flex-wrap:wrap;row-gap:.3rem;gap:.4rem">${p.name||'Usuário'}${isOwnerUid(uid)?ownerBadgeHTML():''}</span>`; $('pubUname').textContent=p.username?('@'+p.username):''; $('pubBio').textContent=p.bio||'';
  renderProfileTags(uid);
  const actions=$('pubActions'); actions.innerHTML='';
  if(uid!==U.id){
    const q=await supa.from('friendships').select('*').or(`and(requester.eq.${U.id},recipient.eq.${uid}),and(requester.eq.${uid},recipient.eq.${U.id})`).maybeSingle();
    const rel=q.data;
    if(!rel){ const b=document.createElement('button'); b.className='btn bp'; b.textContent='Adicionar'; b.onclick=()=>sendFriendRequest(uid); actions.appendChild(b); }
    else if(rel.status==='pending'){ if(rel.requester===U.id){ const b=document.createElement('button'); b.className='btn bg2'; b.textContent='Cancelar pedido'; b.onclick=()=>cancelFriendRequest(uid); actions.appendChild(b); } else { const b=document.createElement('button'); b.className='btn bp'; b.textContent='Aceitar'; b.onclick=()=>acceptFriendRequest(uid); actions.appendChild(b); } }
    else if(rel.status==='accepted'){ const b=document.createElement('button'); b.className='btn bg2'; b.textContent='Remover'; b.onclick=()=>removeFriend(uid); actions.appendChild(b); }
    const dm=document.createElement('button'); dm.className='btn bg2'; dm.textContent='Mensagem'; dm.onclick=()=>openDM(uid); actions.appendChild(dm);
  } else { const b=document.createElement('button'); b.className='btn bp'; b.textContent='Editar'; b.onclick=()=>openSettings(); actions.appendChild(b); }
  const fl=$('pubFriends'); fl.innerHTML='';
  if(fr.data && fr.data.length){
    const seen=new Set();
    fr.data.forEach(f=>{
      const friendId=f.requester===uid?f.recipient:f.requester;
      if(seen.has(friendId)) return; seen.add(friendId); // evita duplicata visual se houver linhas repetidas no banco
      const wrap=document.createElement('div'); wrap.style.cssText='position:relative;width:40px;height:40px;flex-shrink:0;cursor:pointer';
      wrap.onclick=()=>openProfile(friendId);
      getSupa().from('profiles').select('id,name,photo,color,frame,frame_scale,frame_x,frame_y').eq('id',friendId).maybeSingle().then(rr=>{ wrap.innerHTML=avatarHTML(rr.data||{name:'U'}); });
      fl.appendChild(wrap);
    });
  }
  $('profileModal').classList.add('on');
}
function openMemberSearchModal(){ $('memberSearchModal').classList.add('on'); }
async function searchMembers(){
  let q=$('memberSearchInput').value.trim(); if(!q) return;
  if(q.startsWith('@')) q=q.slice(1).trim();
  if(!q) return;
  const supa=getSupa();
  const box=$('memberSearchResults'); box.className='member-list'; box.innerHTML='<div class="ge">Buscando...</div>';
  const safe=q.replace(/[%,]/g,''); // evita quebrar o filtro .or() do PostgREST
  const { data, error }=await supa.from('profiles').select('id,name,username,photo,color,frame,frame_scale,frame_x,frame_y').or(`name.ilike.%${safe}%,username.ilike.%${safe}%`).limit(30);
  box.innerHTML='';
  if(error){ console.error('searchMembers error:',error); toast('Erro na busca: '+(error.message||'ver console'),'err'); return; }
  if(!data||!data.length){ box.innerHTML='<div class="ge">Nenhum resultado para "'+safe+'".</div>'; return; }
  data.forEach(p=>{
    const row=document.createElement('div'); row.className='member-row'; row.onclick=()=>{ openProfile(p.id); closeModal('memberSearchModal'); };
    const av=document.createElement('div'); av.className='member-av'; av.innerHTML=avatarHTML(p);
    const lbl=document.createElement('div'); lbl.className='member-lbl';
    lbl.innerHTML=`${nameRowHTML(p.name||'Usuário',p.id,'member-name')}${p.username?`<span class="member-uname">@${p.username}</span>`:''}`;
    row.appendChild(av); row.appendChild(lbl); box.appendChild(row);
  });
}

/* ── MENSAGENS PRIVADAS (DM) ── funciona por polling, sem depender de Realtime/Replication.
   Requer a tabela "dm_messages" no Supabase:
   create table dm_messages(id uuid primary key default gen_random_uuid(), sender uuid not null, recipient uuid not null, content text not null, created_at timestamptz not null default now());
   alter table dm_messages enable row level security;
   create policy dm_select on dm_messages for select using (auth.uid()=sender or auth.uid()=recipient);
   create policy dm_insert on dm_messages for insert with check (auth.uid()=sender);
*/
let dmTargetId=null, dmPollTimer=null, dmInboxTimer=null, dmLastSeenAt=null, dmInboxLastAt=null, dmKnownIds=new Set();
let dmTargetProfile=null, dmUnreadBySender={};
async function openDM(uid){
  if(!U.id){ toast('Faça login para enviar mensagens','err'); return; }
  if(uid===U.id){ toast('Você não pode enviar mensagem para si mesmo','err'); return; }
  dmTargetId=uid; dmLastSeenAt=null; dmKnownIds=new Set(); closeModal('profileModal'); closeFriendsHub();
  const supa=getSupa();
  const { data:p }=await supa.from('profiles').select('id,name,username,photo,color,frame,frame_scale,frame_x,frame_y').eq('id',uid).maybeSingle();
  dmTargetProfile=p||{id:uid,name:'Usuário'};
  $('dmTitle').textContent=p?(p.name||(p.username?'@'+p.username:'Conversa')):'Conversa';
  $('dmMessages').innerHTML='<div class="ge">Carregando...</div>';
  $('dmModal').classList.add('on');
  // Ao abrir a conversa, o que estava pendente desse remetente é considerado lido
  if(dmUnreadBySender[uid]){ fabUnreadMsgs=Math.max(0,fabUnreadMsgs-dmUnreadBySender[uid]); dmUnreadBySender[uid]=0; updateFabBadge(); }
  await loadDMHistory(uid);
  startDMPolling(uid);
}
async function loadDMHistory(uid){
  const supa=getSupa();
  const { data, error }=await supa.from('dm_messages').select('*').or(`and(sender.eq.${U.id},recipient.eq.${uid}),and(sender.eq.${uid},recipient.eq.${U.id})`).order('created_at',{ascending:true}).limit(200);
  const box=$('dmMessages'); box.innerHTML='';
  if(error){ console.error('loadDMHistory error:',error); box.innerHTML='<div class="ge">Erro ao carregar mensagens — confira se a tabela "dm_messages" existe no Supabase.</div>'; return; }
  (data||[]).forEach(m=>{ appendDMBubble(m); dmKnownIds.add(m.id); dmLastSeenAt=m.created_at; });
  box.scrollTop=box.scrollHeight;
}
function appendDMBubble(m){
  const box=$('dmMessages'); const mine=m.sender===U.id;
  const row=document.createElement('div'); row.className='dm-row'+(mine?' mine':'');
  const av=document.createElement('div'); av.className='dm-av';
  av.innerHTML=avatarHTML(mine?U:(dmTargetProfile||{name:'U'}));
  const b=document.createElement('div'); b.className='dm-bubble'+(mine?' mine':'');
  b.textContent=m.content;
  row.appendChild(av); row.appendChild(b);
  box.appendChild(row);
}
function startDMPolling(uid){
  stopDMPolling();
  dmPollTimer=setInterval(async ()=>{
    if(dmTargetId!==uid || !$('dmModal').classList.contains('on')) return;
    const supa=getSupa();
    let q=supa.from('dm_messages').select('*').or(`and(sender.eq.${U.id},recipient.eq.${uid}),and(sender.eq.${uid},recipient.eq.${U.id})`).order('created_at',{ascending:true});
    if(dmLastSeenAt) q=q.gt('created_at',dmLastSeenAt);
    const { data, error }=await q;
    if(error||!data||!data.length) return;
    data.forEach(m=>{ if(!dmKnownIds.has(m.id)){ dmKnownIds.add(m.id); appendDMBubble(m); dmLastSeenAt=m.created_at; } });
    $('dmMessages').scrollTop=$('dmMessages').scrollHeight;
  },3000);
}
function stopDMPolling(){ if(dmPollTimer){ clearInterval(dmPollTimer); dmPollTimer=null; } }
function subscribeIncomingDMs(){
  stopIncomingDMPolling();
  dmInboxLastAt=new Date().toISOString();
  pollFriendRequestsCount();
  dmInboxTimer=setInterval(async ()=>{
    if(!U.id) return;
    const supa=getSupa();
    const { data, error }=await supa.from('dm_messages').select('*').eq('recipient',U.id).gt('created_at',dmInboxLastAt).order('created_at',{ascending:true});
    pollFriendRequestsCount();
    if(error||!data||!data.length) return;
    for(const m of data){
      dmInboxLastAt=m.created_at;
      if(dmTargetId===m.sender && $('dmModal').classList.contains('on')){
        if(!dmKnownIds.has(m.id)){ dmKnownIds.add(m.id); appendDMBubble(m); dmLastSeenAt=m.created_at; $('dmMessages').scrollTop=$('dmMessages').scrollHeight; }
      } else {
        dmUnreadBySender[m.sender]=(dmUnreadBySender[m.sender]||0)+1; fabUnreadMsgs++; updateFabBadge();
        const { data:p }=await supa.from('profiles').select('name').eq('id',m.sender).maybeSingle();
        toast('Nova mensagem de '+(p?.name||'alguém'),'ok',()=>openDM(m.sender));
      }
    }
  },8000);
}
function stopIncomingDMPolling(){ if(dmInboxTimer){ clearInterval(dmInboxTimer); dmInboxTimer=null; } }
async function sendDM(){
  const input=$('dmInput'); const text=input.value.trim(); if(!text||!dmTargetId) return;
  input.value='';
  const supa=getSupa();
  const row={sender:U.id,recipient:dmTargetId,content:text};
  const { data, error }=await supa.from('dm_messages').insert(row).select().maybeSingle();
  if(error){ console.error('sendDM error:',error); toast('Erro ao enviar: '+(error.message||'ver console'),'err'); return; }
  if(data){ dmKnownIds.add(data.id); dmLastSeenAt=data.created_at; appendDMBubble(data); }
  else appendDMBubble({...row,created_at:new Date().toISOString()});
  $('dmMessages').scrollTop=$('dmMessages').scrollHeight;
}
function closeDM(){ $('dmModal').classList.remove('on'); stopDMPolling(); dmTargetId=null; }

/* ── CHAT FAB + HUB DE AMIGOS/CONVERSAS (global, dentro e fora de salas) ── */
let fabPendingReq=0, fabUnreadMsgs=0, currentFhubTab='conv';
function showChatFab(){ $('chatFab').style.display='flex'; }
function hideChatFab(){ $('chatFab').style.display='none'; $('friendsHubPanel').classList.remove('on'); }
function showBoardFab(){ $('boardFab').style.display='flex'; }
function hideBoardFab(){ $('boardFab').style.display='none'; }
function updateFabBadge(){
  const total=fabPendingReq+fabUnreadMsgs;
  [$('fabBadge'),$('roomFabBadge')].forEach(b=>{
    if(!b) return;
    if(total>0){ b.textContent=total>9?'9+':total; b.style.display='flex'; } else b.style.display='none';
  });
  const rb=$('reqBadge'); if(rb){ if(fabPendingReq>0){ rb.textContent=fabPendingReq>9?'9+':fabPendingReq; rb.style.display='flex'; } else rb.style.display='none'; }
}
async function pollFriendRequestsCount(){
  if(!U.id) return;
  const supa=getSupa();
  const { count } = await supa.from('friendships').select('*',{count:'exact',head:true}).eq('recipient',U.id).eq('status','pending');
  fabPendingReq=count||0; updateFabBadge();
}

/* ══════════════════ QUADRO COLABORATIVO (estilo Miro) ══════════════════
   Notas de texto, imagens e correntes (conexões) num quadro compartilhado,
   visível e editável por qualquer pessoa logada. Persistido nas tabelas
   board_nodes/board_edges do Supabase + bucket de Storage "board".        */

/* ══════════════════════════════════════════════════════════════════
   QUADRO COLABORATIVO (estilo Miro) — reescrito para:
   • Tela infinita com zoom (roda/pinça) e pan (arrastar vazio, botão do
     meio ou espaço+arrastar), tudo via CSS transform numa única camada —
     muito mais leve que rolar um <div> gigante.
   • Notas que crescem sozinhas conforme o texto e podem ser
     redimensionadas manualmente pela alça do canto.
   • Conectores em curva de Bézier, com seta, que podem ser entortados
     arrastando a alça do meio. Sem "×" poluindo a tela: clique no
     conector pra selecioná-lo e aí sim aparecem as ações.
   • Pipeline de render otimizado: nada de recriar o SVG inteiro a cada
     movimento — os <path> são reaproveitados por id e as atualizações
     entram numa fila de requestAnimationFrame.
   ══════════════════════════════════════════════════════════════════ */

/* ── viewport ── */
const BOARD_W = 12000, BOARD_H = 9000;   // tela útil (bem maior que antes)
const BOARD_MIN_SCALE = 0.15, BOARD_MAX_SCALE = 3;
let boardView = { x:0, y:0, scale:1 };
let boardPan = null;             // {startX,startY,ox,oy} enquanto arrasta o fundo
let boardSpaceDown = false;      // barra de espaço segurada = modo pan
let boardPinch = null;           // {dist,scale,cx,cy} durante pinça de 2 dedos
let boardSelectedEdge = null;    // id do conector selecionado (mostra ações)
let boardEdgeDrag = null;        // {id} enquanto entorta um conector
let boardResize = null;          // {id,startX,startY,startW,startH}
let _edgeEls = {};               // id -> {path,hit,handle,arrow} reaproveitados
let _edgeRAF = null;             // fila de redesenho (coalesce vários pedidos num frame só)
let _nodeStamp = {};             // id -> updated_at já aplicado (evita re-render à toa)

let _zoomLblRAF=null;
function applyBoardTransform(){
  const inner=$('boardInner');
  if(inner) inner.style.transform=`translate3d(${boardView.x}px,${boardView.y}px,0) scale(${boardView.scale})`;
  // a grade é desenhada pelo .board-outer (tamanho da tela) e segue o transform via CSS vars
  const outer=$('boardOuter');
  if(outer){
    outer.style.setProperty('--bs',boardView.scale);
    outer.style.setProperty('--bx',boardView.x+'px');
    outer.style.setProperty('--by',boardView.y+'px');
  }
  // atualizar texto força layout; uma vez por frame basta
  if(!_zoomLblRAF) _zoomLblRAF=requestAnimationFrame(()=>{
    _zoomLblRAF=null;
    const zl=$('boardZoomLabel'); if(zl) zl.textContent=Math.round(boardView.scale*100)+'%';
  });
}
/* converte coordenada de tela → coordenada do quadro */
function boardPoint(clientX,clientY){
  const r=$('boardOuter').getBoundingClientRect();
  return { x:(clientX-r.left-boardView.x)/boardView.scale, y:(clientY-r.top-boardView.y)/boardView.scale };
}
function boardViewportCenter(){
  const o=$('boardOuter'); if(!o) return {x:0,y:0};
  const r=o.getBoundingClientRect();
  return boardPoint(r.left+r.width/2, r.top+r.height/2);
}
/* zoom mantendo fixo o ponto sob o cursor/dedos */
function boardZoomAt(clientX,clientY,factor){
  const old=boardView.scale;
  const next=Math.min(BOARD_MAX_SCALE,Math.max(BOARD_MIN_SCALE,old*factor));
  if(next===old) return;
  const r=$('boardOuter').getBoundingClientRect();
  const px=clientX-r.left, py=clientY-r.top;
  boardView.x = px-(px-boardView.x)*(next/old);
  boardView.y = py-(py-boardView.y)*(next/old);
  boardView.scale=next;
  applyBoardTransform();
}
function boardZoomBy(f){
  const r=$('boardOuter').getBoundingClientRect();
  boardZoomAt(r.left+r.width/2, r.top+r.height/2, f);
}
function boardZoomReset(){ boardView={x:0,y:0,scale:1}; applyBoardTransform(); }
/* enquadra todo o conteúdo na tela */
function boardFitAll(){
  const ns=Object.values(boardNodes); if(!ns.length){ boardZoomReset(); return; }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  ns.forEach(n=>{ const w=n.w||180,h=n.h||120;
    minX=Math.min(minX,n.x||0); minY=Math.min(minY,n.y||0);
    maxX=Math.max(maxX,(n.x||0)+w); maxY=Math.max(maxY,(n.y||0)+h); });
  const o=$('boardOuter').getBoundingClientRect();
  const pad=80;
  const s=Math.min(BOARD_MAX_SCALE,Math.max(BOARD_MIN_SCALE,
    Math.min((o.width-pad*2)/(maxX-minX||1),(o.height-pad*2)/(maxY-minY||1))));
  boardView.scale=s;
  boardView.x=(o.width-(maxX-minX)*s)/2-minX*s;
  boardView.y=(o.height-(maxY-minY)*s)/2-minY*s;
  applyBoardTransform();
}

/* ── ciclo de vida ── */
async function openBoard(){
  if(!U.id){ toast('Faça login para usar o quadro','err'); return; }
  $('boardPanel').classList.add('on');
  initBoardViewportEvents();
  applyBoardTransform();
  await loadBoardFull();
  startBoardPolling();
}
function closeBoard(){
  $('boardPanel').classList.remove('on');
  stopBoardPolling();
  boardConnectMode=false; boardConnectFrom=null; boardSelectedEdge=null;
  $('boardConnectBtn').classList.remove('on'); $('boardHint').style.display='none';
  document.querySelectorAll('.board-node.connect-sel').forEach(e=>e.classList.remove('connect-sel'));
}
let _boardLoading=false;
function startBoardPolling(){
  stopBoardPolling();
  boardPollTimer=setInterval(()=>{
    if(document.hidden)return;      // aba em segundo plano: não gasta rede/CPU
    if(_boardLoading)return;        // já tem uma carga em andamento — não empilha requisições
    if(boardDrag||boardResize||boardEdgeDrag)return; // não recarrega no meio de uma interação
    loadBoardFull();
  },6000);
}
function stopBoardPolling(){ if(boardPollTimer){ clearInterval(boardPollTimer); boardPollTimer=null; } }

let _boardEventsReady=false;
function initBoardViewportEvents(){
  if(_boardEventsReady) return; _boardEventsReady=true;
  const outer=$('boardOuter');

  // zoom pela roda / trackpad (ctrl+scroll = pinça no trackpad)
  let _wheelRAF=null, _wAcc={x:0,y:0,z:0,cx:0,cy:0};
  outer.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){ _wAcc.z+=e.deltaY; _wAcc.cx=e.clientX; _wAcc.cy=e.clientY; }
    else if(e.shiftKey){ _wAcc.x-=e.deltaY; }
    else { _wAcc.x-=e.deltaX; _wAcc.y-=e.deltaY; }
    if(_wheelRAF) return;
    _wheelRAF=requestAnimationFrame(()=>{
      _wheelRAF=null;
      if(_wAcc.z){ boardZoomAt(_wAcc.cx,_wAcc.cy,Math.pow(1.0016,-_wAcc.z)); _wAcc.z=0; }
      if(_wAcc.x||_wAcc.y){ boardView.x+=_wAcc.x; boardView.y+=_wAcc.y; _wAcc.x=_wAcc.y=0; applyBoardTransform(); }
    });
  },{passive:false});

  // pan arrastando o fundo (ou com botão do meio / espaço em qualquer lugar)
  outer.addEventListener('pointerdown',e=>{
    const onEmpty = e.target===outer || e.target===$('boardInner') || e.target===$('boardSvg');
    if(e.button===1 || boardSpaceDown || onEmpty){
      if(!onEmpty && e.button!==1 && !boardSpaceDown) return;
      boardPan={ startX:e.clientX, startY:e.clientY, ox:boardView.x, oy:boardView.y };
      outer.classList.add('panning');
      try{ outer.setPointerCapture(e.pointerId); }catch(err){}
      if(onEmpty){ boardSelectedEdge=null; scheduleEdgeRedraw(); }
    }
  });
  // pointermove pode disparar mais rápido que a tela atualiza; limitamos a 1 por frame
  let _panRAF=null;
  outer.addEventListener('pointermove',e=>{
    if(!boardPan) return;
    boardPan.lx=e.clientX; boardPan.ly=e.clientY;
    if(_panRAF) return;
    _panRAF=requestAnimationFrame(()=>{
      _panRAF=null; if(!boardPan) return;
      boardView.x=boardPan.ox+(boardPan.lx-boardPan.startX);
      boardView.y=boardPan.oy+(boardPan.ly-boardPan.startY);
      applyBoardTransform();
    });
  });
  const endPan=()=>{ boardPan=null; outer.classList.remove('panning'); };
  outer.addEventListener('pointerup',endPan);
  outer.addEventListener('pointercancel',endPan);

  // pinça de dois dedos no celular
  outer.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      const [a,b]=e.touches;
      boardPinch={ dist:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY) };
      endPan();
    }
  },{passive:true});
  outer.addEventListener('touchmove',e=>{
    if(e.touches.length===2&&boardPinch){
      e.preventDefault();
      const [a,b]=e.touches;
      const d=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);
      boardZoomAt((a.clientX+b.clientX)/2,(a.clientY+b.clientY)/2,d/boardPinch.dist);
      boardPinch.dist=d;
    }
  },{passive:false});
  outer.addEventListener('touchend',()=>{ if(boardPinch) boardPinch=null; },{passive:true});

  // atalhos: espaço = pan, Delete = apaga conector selecionado, +/- zoom, 0 reset
  document.addEventListener('keydown',e=>{
    if(!$('boardPanel').classList.contains('on')) return;
    const typing=document.activeElement&&document.activeElement.isContentEditable;
    if(e.code==='Space'&&!typing){ boardSpaceDown=true; outer.classList.add('pan-ready'); e.preventDefault(); }
    if((e.key==='Delete'||e.key==='Backspace')&&boardSelectedEdge&&!typing){ e.preventDefault(); deleteBoardEdge(boardSelectedEdge); }
    if(e.key==='Escape'){ boardSelectedEdge=null; scheduleEdgeRedraw(); if(boardConnectMode) toggleBoardConnect(); }
    if(!typing&&(e.key==='+'||e.key==='=')) boardZoomBy(1.15);
    if(!typing&&e.key==='-') boardZoomBy(1/1.15);
    if(!typing&&e.key==='0') boardZoomReset();
  });
  document.addEventListener('keyup',e=>{
    if(e.code==='Space'){ boardSpaceDown=false; outer.classList.remove('pan-ready'); }
  });
}

/* ── carga / sincronização ── */
async function loadBoardFull(){
  if(_boardLoading)return;
  _boardLoading=true;
  try{
  const supa=getSupa();
  const [nodesRes,edgesRes]=await Promise.all([
    supa.from('board_nodes').select('*').order('created_at',{ascending:true}),
    supa.from('board_edges').select('*')
  ]);
  if(nodesRes.error){ console.error('loadBoardFull nodes error',nodesRes.error); toast('Erro ao carregar o quadro: '+nodesRes.error.message,'err'); return; }
  if(edgesRes.error){ console.error('loadBoardFull edges error',edgesRes.error); }
  const nodes=nodesRes.data||[], edges=edgesRes.data||[];
  const freshNodeIds=new Set(nodes.map(n=>n.id));
  Object.keys(boardNodes).forEach(id=>{
    if(!freshNodeIds.has(id) && !(boardDrag&&boardDrag.id===id)){
      const el=document.getElementById('bn-'+id); if(el) el.remove();
      delete boardNodes[id]; delete _nodeStamp[id];
    }
  });
  nodes.forEach(n=>{
    if(boardDrag&&boardDrag.id===n.id) return;      // não atropela o que estou arrastando
    if(boardResize&&boardResize.id===n.id) return;  // nem o que estou redimensionando
    const el=document.getElementById('bn-'+n.id);
    const bodyFocused=el&&document.activeElement&&el.contains(document.activeElement)&&document.activeElement.isContentEditable;
    if(bodyFocused) return;                          // nem o que estou escrevendo
    // só re-renderiza se realmente mudou desde a última vez (evita trabalho de DOM a cada 6s)
    const stamp=n.updated_at||n.created_at||'';
    if(_nodeStamp[n.id]===stamp && boardNodes[n.id]) return;
    _nodeStamp[n.id]=stamp;
    boardNodes[n.id]=n; renderBoardNode(n);
  });
  const freshEdgeIds=new Set(edges.map(e=>e.id));
  Object.keys(boardEdges).forEach(id=>{
    if(!freshEdgeIds.has(id)){ delete boardEdges[id]; removeEdgeEls(id); }
  });
  edges.forEach(e=>{
    const prev=boardEdges[e.id];
    // BUG CORRIGIDO (conector voltava a ficar reto): se as colunas bend_x/bend_y
    // ainda não existem no banco, a linha que volta do servidor não traz a
    // curvatura — e sobrescrever cegamente zerava o que você acabou de entortar.
    // Só aceitamos a curvatura do servidor quando ela realmente veio.
    if(prev && e.bend_x==null && e.bend_y==null){ e.bend_x=prev.bend_x||0; e.bend_y=prev.bend_y||0; }
    // e nunca atropela o conector que está sendo entortado neste instante
    if(boardEdgeDrag && boardEdgeDrag.id===e.id && prev){ e.bend_x=prev.bend_x; e.bend_y=prev.bend_y; }
    boardEdges[e.id]=e;
  });
  rebuildEdgeIndex();
  scheduleEdgeRedraw();
  }finally{ _boardLoading=false; }
}

/* ── nós ── */
/* translate3d em vez de left/top: sai do caminho de layout e vai direto pro
   compositor da GPU — é a diferença entre arrastar travando e arrastar liso. */
function setNodePos(el,x,y){ el.style.transform=`translate3d(${x}px,${y}px,0)`; }
/* Índice nó -> conectores, pra redesenhar SÓ o que o movimento afeta
   (antes, mexer numa nota redesenhava todos os conectores do quadro). */
let _edgeIndex={};
function rebuildEdgeIndex(){
  _edgeIndex={};
  Object.values(boardEdges).forEach(e=>{
    (_edgeIndex[e.from_node]=_edgeIndex[e.from_node]||[]).push(e.id);
    (_edgeIndex[e.to_node]=_edgeIndex[e.to_node]||[]).push(e.id);
  });
}
function edgesOfNode(id){ return _edgeIndex[id]||[]; }
function renderBoardNode(n){
  let el=document.getElementById('bn-'+n.id);
  const isImg=n.type==='image';
  if(!el){
    el=document.createElement('div');
    el.id='bn-'+n.id; el.className='board-node'+(isImg?' board-node-img':'');
    el.dataset.bnId=n.id;
    const canEdit=n.created_by===U.id;
    el.innerHTML=`<div class="board-node-head" data-drag>
        <span class="board-node-owner"></span>
        <span class="board-node-actions">
          <span class="board-node-link" data-link title="Conectar a partir desta">⤳</span>
          ${canEdit?'<span class="board-node-del" data-del title="Apagar">×</span>':''}
        </span>
      </div>
      ${isImg?`<img src="${n.image_url||''}" draggable="false">`:'<div class="board-node-body" contenteditable="true" spellcheck="false"></div>'}
      <span class="board-node-rz" data-rz title="Redimensionar"></span>`;
    el.querySelector('[data-drag]').addEventListener('pointerdown',e=>startBoardDrag(e,n.id));
    el.querySelector('[data-rz]').addEventListener('pointerdown',e=>startBoardResize(e,n.id));
    el.querySelector('[data-link]').addEventListener('click',e=>{ e.stopPropagation(); startConnectFrom(n.id); });
    const del=el.querySelector('[data-del]'); if(del) del.addEventListener('click',e=>{ e.stopPropagation(); deleteBoardNode(n.id); });
    if(!isImg){
      const body=el.querySelector('.board-node-body');
      body.addEventListener('blur',()=>saveBoardNodeContent(n.id,body.innerText));
      body.addEventListener('pointerdown',e=>e.stopPropagation());
      // cresce sozinha conforme o texto — o problema antigo de "texto grande e a nota não acompanha"
      body.addEventListener('input',()=>autoGrowNode(n.id));
    }
    el.addEventListener('pointerdown',()=>{ el.style.zIndex=++zTop; },{passive:true});
    el.addEventListener('click',()=>{ if(boardConnectMode) handleBoardConnectClick(n.id); });
    $('boardInner').appendChild(el);
  }
  setNodePos(el,n.x||0,n.y||0);
  el.style.width=(n.w||180)+'px';
  if(isImg) el.style.height=(n.h||220)+'px';
  else el.style.height=n.h?(n.h+'px'):'auto';
  n._w=null; n._h=null;               // invalida o cache; remedimos fora do caminho crítico
  requestAnimationFrame(()=>{ if(boardNodes[n.id]){ const e2=document.getElementById('bn-'+n.id); if(e2){ n._w=e2.offsetWidth; n._h=e2.offsetHeight; } } });
  if(!isImg){
    el.style.background=n.color||'#f5d78a';
    const body=el.querySelector('.board-node-body');
    if(body && document.activeElement!==body) body.innerText=n.content||'';
  }
  const ownerEl=el.querySelector('.board-node-owner'); if(ownerEl) ownerEl.textContent=(n.created_by===U.id)?'você':'';
}
/* garante que a nota nunca "corte" o texto: cresce a altura até caber */
let _growRAF={};
function autoGrowNode(id){
  // Agrupa num frame: digitar rápido disparava uma medição de layout por tecla.
  if(_growRAF[id]) return;
  _growRAF[id]=requestAnimationFrame(()=>{
    delete _growRAF[id];
    const el=document.getElementById('bn-'+id); if(!el) return;
    const n=boardNodes[id]; if(!n) return;
    el.style.height='auto';
    const needed=el.scrollHeight;
    if(!n.h || needed>n.h){ n.h=needed; }
    el.style.height=n.h+'px';
    n._w=el.offsetWidth; n._h=el.offsetHeight;
    scheduleEdgeRedraw(edgesOfNode(id));
  });
}

async function addBoardNote(){
  const supa=getSupa();
  const c=boardViewportCenter();
  const color=BOARD_COLORS[Math.floor(Math.random()*BOARD_COLORS.length)];
  const row={ type:'text', content:'Nova nota', x:Math.round(c.x-90), y:Math.round(c.y-60), w:200, h:130, color, created_by:U.id };
  const { data, error }=await supa.from('board_nodes').insert(row).select().maybeSingle();
  if(error){ console.error('addBoardNote error',error); toast('Erro ao criar nota: '+error.message,'err'); return; }
  boardNodes[data.id]=data; _nodeStamp[data.id]=data.updated_at||data.created_at||''; renderBoardNode(data);
  const el=document.getElementById('bn-'+data.id); const body=el?.querySelector('.board-node-body');
  if(body){ body.focus(); const range=document.createRange(); range.selectNodeContents(body); const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
}

function handleBoardImage(input){
  const file=input.files[0]; if(!file) return;
  uploadBoardImage(file); input.value='';
}
async function uploadBoardImage(file){
  const supa=getSupa();
  const { data:userData }=await supa.auth.getUser(); const user=userData.user;
  if(!user){ toast('Sessão expirada, faça login de novo','err'); return; }
  toast('Enviando imagem...','ok');
  const ext=(file.type.split('/')[1]||'png').replace('jpeg','jpg');
  const path=`${user.id}/img-${Date.now()}.${ext}`;
  const { error:upErr }=await supa.storage.from('board').upload(path,file,{ cacheControl:'3600', upsert:true, contentType:file.type });
  if(upErr){ console.error('uploadBoardImage error',upErr); toast('Erro ao enviar imagem: '+upErr.message,'err'); return; }
  const { data:pub }=supa.storage.from('board').getPublicUrl(path);
  if(!pub?.publicUrl){ toast('Erro ao gerar link da imagem','err'); return; }
  const c=boardViewportCenter();
  const row={ type:'image', image_url:pub.publicUrl, x:Math.round(c.x-110), y:Math.round(c.y-110), w:220, h:220, created_by:U.id };
  const { data, error }=await supa.from('board_nodes').insert(row).select().maybeSingle();
  if(error){ console.error('uploadBoardImage insert error',error); toast('Erro ao adicionar imagem: '+error.message,'err'); return; }
  boardNodes[data.id]=data; _nodeStamp[data.id]=data.updated_at||data.created_at||''; renderBoardNode(data);
}

function saveBoardNodeContent(id,text){
  const n=boardNodes[id]; if(!n||n.content===text) return; n.content=text;
  const el=document.getElementById('bn-'+id);
  const h=el?Math.round(el.offsetHeight):null;
  if(h) n.h=h;
  const patch={ content:text, updated_at:new Date().toISOString() };
  if(h) patch.h=h;
  getSupa().from('board_nodes').update(patch).eq('id',id).then(({error})=>{
    if(error){ console.error('saveBoardNodeContent error',error); toast('Erro ao salvar nota: '+error.message,'err'); }
    else _nodeStamp[id]=patch.updated_at;
  });
}

/* ── arrastar nó ── */
function startBoardDrag(e,id){
  if(boardConnectMode) return;
  e.preventDefault(); e.stopPropagation();
  const el=document.getElementById('bn-'+id); if(!el) return;
  const n0=boardNodes[id]||{};
  boardDrag={ id, startX:e.clientX, startY:e.clientY, startLeft:n0.x||0, startTop:n0.y||0, edges:edgesOfNode(id) };
  try{ el.setPointerCapture(e.pointerId); }catch(err){}
  el.style.zIndex=++zTop; el.classList.add('dragging');
  el.addEventListener('pointermove',onBoardDragMove);
  el.addEventListener('pointerup',endBoardDrag,{once:true});
  el.addEventListener('pointercancel',endBoardDrag,{once:true});
}
function onBoardDragMove(e){
  if(!boardDrag) return;
  const el=document.getElementById('bn-'+boardDrag.id); if(!el) return;
  // divide pela escala: no zoom out, 1px de mouse = mais px de quadro
  const dx=(e.clientX-boardDrag.startX)/boardView.scale, dy=(e.clientY-boardDrag.startY)/boardView.scale;
  const nx=Math.max(0,Math.min(BOARD_W,boardDrag.startLeft+dx)), ny=Math.max(0,Math.min(BOARD_H,boardDrag.startTop+dy));
  setNodePos(el,nx,ny);
  if(boardNodes[boardDrag.id]){ boardNodes[boardDrag.id].x=nx; boardNodes[boardDrag.id].y=ny; }
  if(boardDrag.edges.length) scheduleEdgeRedraw(boardDrag.edges);
}
function endBoardDrag(){
  if(!boardDrag) return;
  const id=boardDrag.id; const el=document.getElementById('bn-'+id);
  if(el){ el.removeEventListener('pointermove',onBoardDragMove); el.classList.remove('dragging'); }
  const n=boardNodes[id];
  boardDrag=null;
  if(n){
    const stamp=new Date().toISOString();
    getSupa().from('board_nodes').update({ x:Math.round(n.x), y:Math.round(n.y), updated_at:stamp }).eq('id',id).then(({error})=>{
      if(error){ console.error('endBoardDrag save error',error); toast('Erro ao salvar posição: '+error.message,'err'); }
      else _nodeStamp[id]=stamp;
    });
  }
}

/* ── redimensionar nó ── */
function startBoardResize(e,id){
  e.preventDefault(); e.stopPropagation();
  const el=document.getElementById('bn-'+id); if(!el) return;
  boardResize={ id, startX:e.clientX, startY:e.clientY, startW:el.offsetWidth, startH:el.offsetHeight };
  try{ el.setPointerCapture(e.pointerId); }catch(err){}
  el.classList.add('resizing');
  el.addEventListener('pointermove',onBoardResizeMove);
  el.addEventListener('pointerup',endBoardResize,{once:true});
  el.addEventListener('pointercancel',endBoardResize,{once:true});
}
function onBoardResizeMove(e){
  if(!boardResize) return;
  const el=document.getElementById('bn-'+boardResize.id); if(!el) return;
  const dx=(e.clientX-boardResize.startX)/boardView.scale, dy=(e.clientY-boardResize.startY)/boardView.scale;
  const w=Math.max(120,boardResize.startW+dx), h=Math.max(80,boardResize.startH+dy);
  el.style.width=w+'px'; el.style.height=h+'px';
  const n=boardNodes[boardResize.id]; if(n){ n.w=w; n.h=h; n._w=w; n._h=h; }
  scheduleEdgeRedraw(edgesOfNode(boardResize.id));
}
function endBoardResize(){
  if(!boardResize) return;
  const id=boardResize.id, el=document.getElementById('bn-'+id);
  if(el){ el.removeEventListener('pointermove',onBoardResizeMove); el.classList.remove('resizing'); }
  const n=boardNodes[id]; boardResize=null;
  if(n){
    const stamp=new Date().toISOString();
    getSupa().from('board_nodes').update({ w:Math.round(n.w), h:Math.round(n.h), updated_at:stamp }).eq('id',id).then(({error})=>{
      if(error){ console.error('endBoardResize save error',error); toast('Erro ao salvar tamanho: '+error.message,'err'); }
      else _nodeStamp[id]=stamp;
    });
  }
}

/* ── conectores ── */
function toggleBoardConnect(){
  boardConnectMode=!boardConnectMode; boardConnectFrom=null;
  $('boardConnectBtn').classList.toggle('on',boardConnectMode);
  $('boardHint').style.display=boardConnectMode?'block':'none';
  document.querySelectorAll('.board-node.connect-sel').forEach(e=>e.classList.remove('connect-sel'));
}
function startConnectFrom(id){
  if(!boardConnectMode){ boardConnectMode=true; $('boardConnectBtn').classList.add('on'); $('boardHint').style.display='block'; }
  boardConnectFrom=id;
  document.querySelectorAll('.board-node.connect-sel').forEach(e=>e.classList.remove('connect-sel'));
  document.getElementById('bn-'+id)?.classList.add('connect-sel');
}
async function handleBoardConnectClick(id){
  if(!boardConnectFrom){ startConnectFrom(id); return; }
  if(boardConnectFrom===id) return;
  const fromId=boardConnectFrom;
  document.getElementById('bn-'+fromId)?.classList.remove('connect-sel');
  boardConnectFrom=null;
  const { data, error }=await getSupa().from('board_edges').insert({ from_node:fromId, to_node:id, created_by:U.id }).select().maybeSingle();
  if(error){ console.error('handleBoardConnectClick error',error); toast('Erro ao conectar: '+error.message,'err'); return; }
  boardEdges[data.id]=data; rebuildEdgeIndex(); scheduleEdgeRedraw();
}

/* Geometria: liga as bordas dos cards (não o centro) e curva a linha.
   O quanto entorta vem de bend_x/bend_y — deslocamento perpendicular guardado
   por conector. Se essas colunas não existirem no banco, a curva ainda funciona
   na sessão atual, só não persiste (ver saveEdgeBend). */
/* Dimensões vêm do CACHE (n._w/n._h), nunca de offsetWidth/offsetHeight.
   Ler offsetWidth força o navegador a recalcular o layout na hora ("layout
   thrashing"); fazendo isso para cada conector a cada frame de arrasto, o
   quadro inteiro engasgava. Agora medimos só quando o nó muda de verdade. */
function nodeDims(n,id){
  if(n._w&&n._h) return [n._w,n._h];
  const el=document.getElementById('bn-'+id);
  if(el){ n._w=el.offsetWidth; n._h=el.offsetHeight; return [n._w,n._h]; }
  return [n.w||180,n.h||120];
}
function edgeGeometry(edge){
  const a=boardNodes[edge.from_node], b=boardNodes[edge.to_node];
  if(!a||!b) return null;
  const [aw,ah]=nodeDims(a,edge.from_node);
  const [bw,bh]=nodeDims(b,edge.to_node);
  const acx=(a.x||0)+aw/2, acy=(a.y||0)+ah/2;
  const bcx=(b.x||0)+bw/2, bcy=(b.y||0)+bh/2;
  const mx=(acx+bcx)/2, my=(acy+bcy)/2;
  const bx=mx+(edge.bend_x||0), by=my+(edge.bend_y||0);
  const p1=rectAnchor(a.x||0,a.y||0,aw,ah,bx,by);
  const p2=rectAnchor(b.x||0,b.y||0,bw,bh,bx,by);
  return { p1,p2,cx:bx,cy:by,mx,my };
}
function rectAnchor(x,y,w,h,tx,ty){
  const cx=x+w/2, cy=y+h/2, dx=tx-cx, dy=ty-cy;
  if(!dx&&!dy) return {x:cx,y:cy};
  const sx=dx?(w/2)/Math.abs(dx):Infinity, sy=dy?(h/2)/Math.abs(dy):Infinity;
  const s=Math.min(sx,sy);
  return { x:cx+dx*s, y:cy+dy*s };
}
/* Coalesce vários pedidos de redesenho num único frame — antes isso rodava
   dezenas de vezes por segundo recriando o SVG inteiro, principal fonte de travamento. */
let _edgeDirty=null; // null = redesenhar tudo; Set = só esses conectores
function scheduleEdgeRedraw(ids){
  if(ids&&_edgeDirty){ ids.forEach(i=>_edgeDirty.add(i)); }
  else if(ids&&!_edgeRAF){ _edgeDirty=new Set(ids); }
  else _edgeDirty=null;
  if(_edgeRAF) return;
  _edgeRAF=requestAnimationFrame(()=>{ _edgeRAF=null; const d=_edgeDirty; _edgeDirty=null; redrawBoardEdges(d); });
}
function removeEdgeEls(id){
  const g=_edgeEls[id];
  if(g){ Object.values(g).forEach(el=>el&&el.remove()); delete _edgeEls[id]; }
  if(boardSelectedEdge===id) boardSelectedEdge=null;
}
function redrawBoardEdges(only){
  const svg=$('boardSvg'); if(!svg) return;
  ensureEdgeDefs(svg);
  if(!only) Object.keys(_edgeEls).forEach(id=>{ if(!boardEdges[id]) removeEdgeEls(id); });
  const list=only?[...only].map(id=>boardEdges[id]).filter(Boolean):Object.values(boardEdges);
  list.forEach(edge=>{
    const geo=edgeGeometry(edge);
    if(!geo){ removeEdgeEls(edge.id); return; }
    const sel=boardSelectedEdge===edge.id;
    let g=_edgeEls[edge.id];
    if(!g){  // cria uma vez e reaproveita — nada de innerHTML='' a cada frame
      const NS='http://www.w3.org/2000/svg';
      const hit=document.createElementNS(NS,'path');   // traço invisível e grosso: facilita clicar
      hit.setAttribute('class','board-edge-hit'); hit.setAttribute('fill','none');
      hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','18');
      hit.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); boardSelectedEdge=edge.id; scheduleEdgeRedraw(); });
      hit.addEventListener('dblclick',ev=>{ ev.stopPropagation(); resetEdgeBend(edge.id); });
      const path=document.createElementNS(NS,'path');
      path.setAttribute('class','board-edge'); path.setAttribute('fill','none');
      const handle=document.createElementNS(NS,'circle'); // alça pra entortar
      handle.setAttribute('class','board-edge-handle'); handle.setAttribute('r','7');
      handle.addEventListener('pointerdown',ev=>startEdgeBend(ev,edge.id));
      const del=document.createElementNS(NS,'g');         // ação de apagar, só quando selecionado
      del.setAttribute('class','board-edge-del');
      const dc=document.createElementNS(NS,'circle'); dc.setAttribute('r','9'); dc.setAttribute('fill','rgba(196,92,92,.95)');
      const dt=document.createElementNS(NS,'text'); dt.setAttribute('text-anchor','middle'); dt.setAttribute('dy','3.5');
      dt.setAttribute('font-size','11'); dt.setAttribute('fill','#fff'); dt.textContent='×';
      del.appendChild(dc); del.appendChild(dt);
      del.addEventListener('pointerdown',ev=>{ ev.stopPropagation(); deleteBoardEdge(edge.id); });
      svg.appendChild(hit); svg.appendChild(path); svg.appendChild(handle); svg.appendChild(del);
      g=_edgeEls[edge.id]={hit,path,handle,del};
    }
    const d=`M ${geo.p1.x} ${geo.p1.y} Q ${geo.cx} ${geo.cy} ${geo.p2.x} ${geo.p2.y}`;
    g.path.setAttribute('d',d); g.hit.setAttribute('d',d);
    g.path.setAttribute('marker-end','url(#boardArrow)');
    g.path.classList.toggle('sel',sel);
    // alça aparece ao passar o mouse/selecionar; o ponto da curva em t=0.5
    const hx=0.25*geo.p1.x+0.5*geo.cx+0.25*geo.p2.x, hy=0.25*geo.p1.y+0.5*geo.cy+0.25*geo.p2.y;
    g.handle.setAttribute('cx',hx); g.handle.setAttribute('cy',hy);
    g.handle.classList.toggle('show',sel);
    const canDel=edge.created_by===U.id;
    g.del.style.display=(sel&&canDel)?'':'none';
    g.del.setAttribute('transform',`translate(${hx+22},${hy-16})`);
  });
}
function ensureEdgeDefs(svg){
  if(svg.querySelector('#boardArrow')) return;
  const NS='http://www.w3.org/2000/svg';
  const defs=document.createElementNS(NS,'defs');
  const m=document.createElementNS(NS,'marker');
  m.setAttribute('id','boardArrow'); m.setAttribute('viewBox','0 0 10 10');
  m.setAttribute('refX','9'); m.setAttribute('refY','5');
  m.setAttribute('markerWidth','6'); m.setAttribute('markerHeight','6');
  m.setAttribute('orient','auto-start-reverse');
  const p=document.createElementNS(NS,'path');
  p.setAttribute('d','M 0 0 L 10 5 L 0 10 z'); p.setAttribute('fill','rgba(120,235,170,.9)');
  m.appendChild(p); defs.appendChild(m); svg.appendChild(defs);
}
/* entortar o conector arrastando a alça */
function startEdgeBend(e,id){
  e.preventDefault(); e.stopPropagation();
  boardEdgeDrag={ id };
  boardSelectedEdge=id;
  const move=ev=>{
    const edge=boardEdges[id]; if(!edge) return;
    const geo=edgeGeometry(edge); if(!geo) return;
    const p=boardPoint(ev.clientX,ev.clientY);
    // a alça fica no ponto médio da curva; o controle precisa ir ao dobro da distância
    edge.bend_x=(p.x-geo.mx)*2; edge.bend_y=(p.y-geo.my)*2;
    scheduleEdgeRedraw();
  };
  const up=()=>{
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',up);
    boardEdgeDrag=null; saveEdgeBend(id);
  };
  document.addEventListener('pointermove',move);
  document.addEventListener('pointerup',up);
}
function resetEdgeBend(id){
  const edge=boardEdges[id]; if(!edge) return;
  edge.bend_x=0; edge.bend_y=0; scheduleEdgeRedraw(); saveEdgeBend(id);
}
/* Persiste a curvatura. Se o banco ainda não tiver as colunas bend_x/bend_y,
   ignoramos o erro silenciosamente: a curva continua valendo nesta sessão e o
   resto do quadro segue funcionando normalmente. */
function saveEdgeBend(id){
  const edge=boardEdges[id]; if(!edge) return;
  getSupa().from('board_edges').update({ bend_x:Math.round(edge.bend_x||0), bend_y:Math.round(edge.bend_y||0) }).eq('id',id).then(({error})=>{
    if(error) console.warn('Curvatura não persistida (adicione as colunas bend_x/bend_y em board_edges para salvar):',error.message);
  });
}

async function deleteBoardNode(id){
  const { error }=await getSupa().from('board_nodes').delete().eq('id',id);
  if(error){ console.error('deleteBoardNode error',error); toast('Erro ao apagar: '+error.message,'err'); return; }
  delete boardNodes[id]; delete _nodeStamp[id]; document.getElementById('bn-'+id)?.remove();
  Object.keys(boardEdges).forEach(eid=>{ const e=boardEdges[eid]; if(e.from_node===id||e.to_node===id){ delete boardEdges[eid]; removeEdgeEls(eid); } });
  rebuildEdgeIndex(); scheduleEdgeRedraw();
}
async function deleteBoardEdge(id){
  const { error }=await getSupa().from('board_edges').delete().eq('id',id);
  if(error){ console.error('deleteBoardEdge error',error); toast('Erro ao apagar corrente: '+error.message,'err'); return; }
  delete boardEdges[id]; removeEdgeEls(id); rebuildEdgeIndex(); scheduleEdgeRedraw();
}

function openFriendsHub(){
  if(!U.id){ toast('Faça login para ver amigos e conversas','err'); return; }
  $('friendsHubPanel').classList.add('on');
  switchFhubTab(currentFhubTab);
}
function closeFriendsHub(e){
  if(e && e.target!==$('friendsHubPanel')) return;
  $('friendsHubPanel').classList.remove('on');
}
function switchFhubTab(tab){
  currentFhubTab=tab;
  document.querySelectorAll('.fhub-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  $('fhubConvList').style.display=tab==='conv'?'flex':'none';
  $('fhubReqList').style.display=tab==='req'?'flex':'none';
  if(tab==='conv') loadConversations(); else loadFriendRequests();
}
async function loadConversations(){
  if(!U.id) return;
  const supa=getSupa();
  const box=$('fhubConvList');
  const { data, error }=await supa.from('dm_messages').select('*').or(`sender.eq.${U.id},recipient.eq.${U.id}`).order('created_at',{ascending:false}).limit(300);
  if(error){ console.error('loadConversations error:',error); box.innerHTML='<div class="ge">Erro ao carregar conversas</div>'; return; }
  if(!data||!data.length){ box.innerHTML='<div class="ge">Nenhuma conversa ainda. Busque membros para começar.</div>'; return; }
  const order=[], map=new Map();
  data.forEach(m=>{
    const otherId=m.sender===U.id?m.recipient:m.sender;
    if(!map.has(otherId)){ map.set(otherId,m); order.push(otherId); }
  });
  box.innerHTML='';
  for(const otherId of order){
    const last=map.get(otherId);
    const { data:p } = await supa.from('profiles').select('id,name,username,photo,color,frame,frame_scale,frame_x,frame_y').eq('id',otherId).maybeSingle();
    const row=document.createElement('div'); row.className='fhub-row'; row.onclick=()=>openDM(otherId);
    const av=document.createElement('div'); av.className='fhub-av'; av.innerHTML=avatarHTML(p||{name:'U'});
    const info=document.createElement('div'); info.className='fhub-info';
    const unread=dmUnreadBySender[otherId]||0;
    info.innerHTML=`${nameRowHTML((p&&p.name)||'Usuário',otherId,'fhub-name')}<div class="fhub-sub">${(last.sender===U.id?'Você: ':'')+(last.content||'').slice(0,40)}</div>`;
    if(unread)info.querySelector('.name-row').insertAdjacentHTML('beforeend','<span style="color:var(--green);flex-shrink:0">•</span>');
    row.appendChild(av); row.appendChild(info); box.appendChild(row);
  }
}
async function loadFriendRequests(){
  if(!U.id) return;
  const supa=getSupa();
  const box=$('fhubReqList');
  const { data, error }=await supa.from('friendships').select('*').eq('recipient',U.id).eq('status','pending').order('created_at',{ascending:false});
  if(error){ console.error('loadFriendRequests error:',error); box.innerHTML='<div class="ge">Erro ao carregar solicitações</div>'; return; }
  fabPendingReq=(data||[]).length; updateFabBadge();
  if(!data||!data.length){ box.innerHTML='<div class="ge">Nenhuma solicitação pendente</div>'; return; }
  box.innerHTML='';
  for(const f of data){
    const { data:p } = await supa.from('profiles').select('id,name,username,photo,color,frame,frame_scale,frame_x,frame_y').eq('id',f.requester).maybeSingle();
    const row=document.createElement('div'); row.className='fhub-row';
    const av=document.createElement('div'); av.className='fhub-av'; av.innerHTML=avatarHTML(p||{name:'U'});
    const openReq=()=>{ closeFriendsHub(); openProfile(f.requester); };
    av.onclick=openReq;
    const info=document.createElement('div'); info.className='fhub-info'; info.onclick=openReq;
    info.innerHTML=`${nameRowHTML((p&&p.name)||'Usuário',f.requester,'fhub-name')}<div class="fhub-sub">${p&&p.username?'@'+p.username:'quer ser seu amigo'}</div>`;
    const acts=document.createElement('div'); acts.className='fhub-acts';
    const acceptBtn=document.createElement('button'); acceptBtn.className='btn bp bsm'; acceptBtn.textContent='Aceitar';
    acceptBtn.onclick=async(e)=>{ e.stopPropagation(); await acceptFriendRequest(f.requester,true); loadFriendRequests(); };
    const declineBtn=document.createElement('button'); declineBtn.className='btn bg2 bsm'; declineBtn.textContent='Recusar';
    declineBtn.onclick=async(e)=>{ e.stopPropagation(); await declineFriendRequest(f.requester,true); loadFriendRequests(); };
    acts.appendChild(acceptBtn); acts.appendChild(declineBtn);
    row.appendChild(av); row.appendChild(info); row.appendChild(acts);
    box.appendChild(row);
  }
}

/* Amigos */
async function sendFriendRequest(toId){
  const supa=getSupa(); const { data:meData }=await supa.auth.getUser(); if(!meData.user){ toast('Faça login para adicionar amigos','err'); return; }
  const from=meData.user.id; if(from===toId) return;
  const exists=await supa.from('friendships').select('status').or(`and(requester.eq.${from},recipient.eq.${toId}),and(requester.eq.${toId},recipient.eq.${from})`).maybeSingle();
  if(exists.data){ toast(exists.data.status==='accepted'?'Vocês já são amigos':'Pedido já existe','err'); openProfile(toId); return; }
  const { error }=await supa.from('friendships').insert({ requester:from, recipient:toId, status:'pending' });
  if(error){ console.warn(error); toast('Erro','err'); return; }
  toast('Pedido enviado','ok'); openProfile(toId);
}
async function acceptFriendRequest(fromId,silent){ const supa=getSupa(); const me=(await supa.auth.getUser()).data.user.id; const { error }=await supa.from('friendships').update({ status:'accepted' }).match({ requester:fromId, recipient:me }); if(error){ console.warn(error); toast('Erro','err'); return; } toast('Amigo adicionado','ok'); if(!silent) openProfile(fromId); pollFriendRequestsCount(); }
async function declineFriendRequest(fromId,silent){ const supa=getSupa(); const me=(await supa.auth.getUser()).data.user.id; const { error }=await supa.from('friendships').delete().match({ requester:fromId, recipient:me }); if(error){ console.warn(error); toast('Erro','err'); return; } toast('Solicitação recusada','ok'); if(!silent) closeModal('profileModal'); pollFriendRequestsCount(); }
async function cancelFriendRequest(toId){ const supa=getSupa(); const me=(await supa.auth.getUser()).data.user.id; const { error }=await supa.from('friendships').delete().match({ requester:me, recipient:toId }); if(error){ console.warn(error); toast('Erro','err'); return; } toast('Pedido cancelado','ok'); openProfile(toId); }
async function removeFriend(uid){ const supa=getSupa(); const me=(await supa.auth.getUser()).data.user.id; const { error }=await supa.from('friendships').delete().or(`and(requester.eq.${me},recipient.eq.${uid}),and(requester.eq.${uid},recipient.eq.${me})`); if(error){ console.warn(error); toast('Erro','err'); return; } toast('Removido','ok'); openProfile(uid); }
function applyTbPos(pos){
  if(document.body.classList.contains('light'))return;
  const tb=$('toolbar'),rs=$('roomScene'),rb=$('rbody'),cw=$('cw');
  tb.className='toolbar'; rb.style.flexDirection='';
  if(tb.parentNode)tb.parentNode.removeChild(tb);
  if(pos==='top') rs.insertBefore(tb,rb);
  else if(pos==='bottom'){tb.classList.add('tb-bottom');rs.appendChild(tb);}
  else if(pos==='left'){tb.classList.add('tb-left');rb.style.flexDirection='row';rb.insertBefore(tb,cw);}
  else if(pos==='right'){tb.classList.add('tb-right');rb.style.flexDirection='row';rb.appendChild(tb);}
}

/* ── ROOM ── */
function createRoom(){ const c='THERE'+Math.random().toString(36).substr(2,6).toUpperCase(); room={code:c}; toast('Sala '+c+' criada','ok'); enterRoom(); }
function joinRoom(){ const c=$('roomInput').value.trim().toUpperCase(); if(!c){toast('Digite um código','err');return;} room={code:c}; enterRoom(); }
function enterRoom(){
  $('rcode').textContent=room.code;
  $('items').innerHTML=''; $('partsList').innerHTML='';
  $('parts').classList.remove('on');
  els=[]; ytPlrs={}; peers={}; zTop=10;
  // Reset draw state
  drawMode=false; drawing=false; eraser=false; drawHist=[];
  $('drawCanvas').classList.remove('active');
  $('drawBtn').classList.remove('active');
  $('drawBar').classList.remove('on');
  $('items').style.pointerEvents='';
  $('drawCanvas').getContext('2d').clearRect(0,0,$('drawCanvas').width,$('drawCanvas').height);
  // Toolbar position
  const pos=localStorage.getItem('tfm_tb')||'top'; tbPos=pos;
  const rs=$('roomScene'),rb=$('rbody'),tb=$('toolbar');
  if(tb.parentNode)tb.parentNode.removeChild(tb); rs.insertBefore(tb,rb); applyTbPos(pos);
  drawGrid();
  spawnMyAv(); upsertPart(U.id,U,'Você');
  openChannel(room.code);
  startHB();
  goRoom();
  updateFabBadge();
  // Init drawCanvas size AFTER scene is visible (double rAF ensures layout is complete)
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const dc=$('drawCanvas'),cw=$('cw');
    if(dc&&cw&&cw.clientWidth>0){ dc.width=cw.clientWidth; dc.height=cw.clientHeight; }
    drawGrid();
  }));
}
function leaveRoom(){
  if(!confirm('Sair da sala?'))return;
  if(callActive)endCall();
  closeChannel(); stopHB(); room=null; els=[]; ytPlrs={}; peers={};
  $('items').innerHTML=''; $('parts').classList.remove('on');
  goLanding();
}
function copyCode(){ if(!room)return; navigator.clipboard.writeText(room.code).then(()=>toast('Código copiado','ok')).catch(()=>toast('Erro','err')); }

/* ── CANVAS ── */
function drawGrid(){
  const cv=$('bgCanvas'),w=$('cw'); if(!cv||!w)return;
  cv.width=w.clientWidth; cv.height=w.clientHeight;
  const ctx=cv.getContext('2d'); ctx.clearRect(0,0,cv.width,cv.height);
}
function resizeDC(){
  const dc=$('drawCanvas'),cw=$('cw'); if(!dc||!cw||!cw.clientWidth)return;
  const nw=cw.clientWidth,nh=cw.clientHeight;
  if(dc.width===nw&&dc.height===nh)return;
  let saved=null;
  if(dc.width>0&&dc.height>0){ try{saved=dc.getContext('2d').getImageData(0,0,dc.width,dc.height);}catch(e){} }
  dc.width=nw; dc.height=nh;
  if(saved)dc.getContext('2d').putImageData(saved,0,0);
}

/* ── AVATAR ── */
function spawnMyAv(){
  const c=$('items');
  const ex=c.querySelector('.av-wrap[data-uid="'+U.id+'"]'); if(ex)ex.remove();
  const wrap=document.createElement('div'); wrap.className='av-wrap'; wrap.dataset.uid=U.id;
  wrap.style.left=(100+Math.random()*180)+'px'; wrap.style.top=(80+Math.random()*130)+'px';
  wrap.appendChild(mkAvEl(U)); wrap.appendChild(mkAvName(U.name||'Você',U.id));
  c.appendChild(wrap);
}
/* ── Sistema universal de avatar + moldura ──
   Toda foto/inicial fica num círculo clipado; a moldura (PNG) é sobreposta por cima,
   sem cortar, respeitando escala/posição salvas (frame_scale/frame_x/frame_y). */
function avatarFillHTML(p){
  if(p && p.photo) return `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  const c=(p&&p.color)||'#c45c5c';
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${c},${darken(c)});font-weight:700;font-family:'Cinzel',serif;color:var(--bone);">${((p&&p.name)||'U').charAt(0).toUpperCase()}</div>`;
}
/* Resolve o UID do dono a partir do e-mail configurado (uma vez só, com cache). Chamado no
   boot e sempre que abrimos um perfil, pra garantir que o badge apareça assim que possível. */
async function resolveOwnerUid(){
  if(OWNER_UID || !OWNER_EMAIL || /troque-pelo-seu-email/i.test(OWNER_EMAIL))return;
  try{
    const supa=getSupa();
    const { data }=await supa.from('profiles').select('id').ilike('email',OWNER_EMAIL).maybeSingle();
    if(data)OWNER_UID=data.id;
  }catch(e){}
}
function isOwnerUid(uid){ return !!OWNER_UID && uid===OWNER_UID; }
/* Estilos aplicados inline de propósito (não só via classe .owner-badge do style.css): assim o
   badge sempre fica com o tamanho e o espaçamento certos mesmo que o style.css do servidor esteja
   desatualizado ou em cache. Se o gif não carregar por algum motivo, o onerror esconde só a imagem
   (sem quadrado/círculo preto quebrado) e a pílula "Owner" continua aparecendo normalmente.

   IMPORTANTE sobre o gif congelar no primeiro frame: isso acontece quando border-radius/box-shadow
   são aplicados DIRETO na tag <img> animada — o navegador precisa "rasterizar" a imagem pra recortar
   o círculo, e nesse processo o Safari/Chrome em vários casos param de animar o bitmap. A correção é
   colocar o recorte circular e a sombra num elemento por FORA da <img>, deixando a própria <img> sem
   nenhum border-radius/box-shadow/transform — assim o navegador nunca precisa rasterizar o gif e ele
   continua animando normalmente. */
function ownerBadgeHTML(){
  return `<span class="owner-badge" title="Dono da plataforma" style="display:inline-flex;align-items:center;gap:.24rem;flex-shrink:0;margin-left:.5rem;padding:.08rem .46rem .08rem .08rem;border-radius:100px;background:linear-gradient(90deg,rgba(255,196,64,.22),rgba(255,142,0,.12));border:1px solid rgba(255,196,64,.55);box-shadow:0 0 9px rgba(255,176,40,.3);line-height:1;white-space:nowrap;vertical-align:middle"><span class="owner-badge-clip" style="display:block;width:16px;height:16px;min-width:16px;min-height:16px;border-radius:50%;overflow:hidden;flex-shrink:0;box-shadow:0 0 5px rgba(255,196,64,.7);background:#3a2a12"><img src="${OWNER_BADGE_GIF}" alt="" width="16" height="16" decoding="async" style="width:16px !important;height:16px !important;object-fit:cover;display:block;border-radius:0 !important;box-shadow:none !important;transform:none !important" onerror="this.parentElement.style.display='none'"></span><b style="font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#ffd579;font-family:'Cinzel',serif;font-style:normal">Owner</b></span>`;
}
/* Linha flex com nome + badge — evita que a reticência (...) de nomes compridos corte o badge,
   já que o badge fica fora da caixa que trunca o texto, não dentro dela. flex-wrap deixa o badge
   descer pra uma segunda linha em vez de espremer/sobrepor quando o espaço é curto. */
function nameRowHTML(name,uid,nameClass){
  return `<div class="name-row" style="display:flex;align-items:center;min-width:0;flex:1;flex-wrap:wrap;row-gap:.2rem"><div class="${nameClass}">${name||'Usuário'}</div>${isOwnerUid(uid)?ownerBadgeHTML():''}</div>`;
}
/* ── TAGS DE PERFIL ──
   Rótulos que só o dono da plataforma pode atribuir a um perfil. Aparecem para
   todo mundo que abre aquele perfil; o que é restrito é a permissão de criar e
   apagar — os controles nem chegam a ser renderizados para quem não é dono, e
   o banco deve reforçar isso via RLS (ver SQL na conversa).
   Exibição: mostra a primeira tag e, havendo mais, um "+N" que abre a janelinha. */
const TAG_COLORS = ['#e0a35c','#7fc8a9','#8ab4f5','#e08fb0','#b79ae0','#d4c48a','#89d0d8','#e08f8f'];
let _tagCache = {};   // uid -> array de tags (evita reconsultar o banco a cada abertura)
let _tagCtxUid = null;// perfil aberto no momento (usado pelo editor do dono)

async function loadProfileTags(uid,force){
  if(!force && _tagCache[uid]) return _tagCache[uid];
  try{
    const { data, error }=await getSupa().from('profile_tags').select('*').eq('user_id',uid).order('created_at',{ascending:true});
    if(error){ _tagCache[uid]=[]; return []; }
    _tagCache[uid]=data||[];
    return _tagCache[uid];
  }catch(e){ _tagCache[uid]=[]; return []; }
}
function tagChipHTML(t,small){
  const c=t.color||'#e0a35c';
  return `<span class="ptag" style="--tagc:${c}${small?';font-size:.62rem':''}">${escapeHtml(t.label||'')}</span>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

async function renderProfileTags(uid){
  _tagCtxUid=uid;
  const box=$('pubTags'); const admin=$('pubTagAdmin');
  if(box) box.innerHTML=''; if(admin) admin.innerHTML='';
  const tags=await loadProfileTags(uid,true);
  if(box){
    if(tags.length){
      const extra=tags.length-1;
      box.innerHTML=tagChipHTML(tags[0])+(extra>0?`<span class="ptag-more" onclick="openTagsPop('${uid}')" title="Ver todas">+${extra}</span>`:'');
    }
  }
  // Área de administração: só existe no DOM se EU for o dono. Para qualquer outra
  // pessoa não há botão, dica ou vestígio de que o recurso exista.
  if(admin && isOwnerUid(U.id)) renderTagAdmin(uid,tags);
}
function renderTagAdmin(uid,tags){
  const admin=$('pubTagAdmin');
  admin.innerHTML=`<div class="ptag-admin">
    <div class="ptag-admin-h">Tags deste perfil</div>
    <div class="ptag-admin-list" id="ptagAdminList"></div>
    <div class="ptag-admin-row">
      <input class="mi ptag-input" id="ptagNewLabel" maxlength="24" placeholder="Nova tag..." onkeydown="if(event.key==='Enter')addProfileTag()">
      <span class="ptag-colors" id="ptagColors"></span>
      <button class="btn bp bsm" onclick="addProfileTag()" style="padding:.35rem .7rem;font-size:.72rem">Add</button>
    </div>
  </div>`;
  const list=$('ptagAdminList');
  list.innerHTML=tags.length?tags.map(t=>`<span class="ptag ptag-editable" style="--tagc:${t.color||'#e0a35c'}">${escapeHtml(t.label)}<b onclick="removeProfileTag('${t.id}')" title="Remover">×</b></span>`).join(''):'<span class="ptag-empty">Nenhuma tag ainda</span>';
  const cols=$('ptagColors');
  cols.innerHTML=TAG_COLORS.map((c,i)=>`<i data-c="${c}" class="${i===0?'on':''}" style="background:${c}" onclick="pickTagColor(this)"></i>`).join('');
}
function pickTagColor(el){
  el.parentElement.querySelectorAll('i').forEach(i=>i.classList.remove('on'));
  el.classList.add('on');
}
async function addProfileTag(){
  if(!isOwnerUid(U.id)||!_tagCtxUid) return;
  const inp=$('ptagNewLabel'); const label=(inp.value||'').trim();
  if(!label){ inp.focus(); return; }
  const sel=$('ptagColors').querySelector('i.on');
  const color=sel?sel.dataset.c:TAG_COLORS[0];
  const { data, error }=await getSupa().from('profile_tags').insert({ user_id:_tagCtxUid, label, color, created_by:U.id }).select().maybeSingle();
  if(error){ console.error('addProfileTag',error); toast('Erro ao salvar tag: '+error.message,'err'); return; }
  inp.value='';
  delete _tagCache[_tagCtxUid];
  renderProfileTags(_tagCtxUid);
  toast('Tag adicionada');
}
async function removeProfileTag(id){
  if(!isOwnerUid(U.id)) return;
  const { error }=await getSupa().from('profile_tags').delete().eq('id',id);
  if(error){ console.error('removeProfileTag',error); toast('Erro ao remover: '+error.message,'err'); return; }
  delete _tagCache[_tagCtxUid];
  renderProfileTags(_tagCtxUid);
}
async function openTagsPop(uid){
  const tags=await loadProfileTags(uid);
  $('ptagsPopList').innerHTML=tags.map(t=>tagChipHTML(t)).join('');
  $('ptagsPop').classList.add('on');
}
function closeTagsPop(){ $('ptagsPop').classList.remove('on'); }

function frameOverlayHTML(p){
  if(!p || !p.frame) return '';
  const x=50+(p.frame_x||0), y=50+(p.frame_y||0), s=(p.frame_scale||1)*1.45;
  return `<img class="frame-overlay" src="${p.frame}" style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%) scale(${s});width:100%;height:100%;pointer-events:none">`;
}
/* HTML pronto pra colocar em innerHTML de qualquer container circular com position:relative */
function avatarHTML(p){
  return `<div style="position:absolute;inset:0;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.12)">${avatarFillHTML(p)}</div>${frameOverlayHTML(p)}`;
}
function mkAvEl(u){ const av=document.createElement('div'); av.className='av'; av.innerHTML=avatarHTML(u); return av; }
function mkAvName(name,uid){ const lbl=document.createElement('div'); lbl.className='av-name'; lbl.innerHTML=`<span class="av-name-text">${name||'User'}</span>`; return lbl; }
function refreshAv(wrap,u){ const av=wrap.querySelector('.av'),lbl=wrap.querySelector('.av-name'); if(av)av.innerHTML=avatarHTML(u); if(lbl)lbl.innerHTML=`<span class="av-name-text">${u.name||'Você'}</span>`; }

/* ── SUPABASE CHANNEL ── */
function getSupa(){ if(!_supa)_supa=window.supabase.createClient(SUPA_URL,SUPA_ANON); return _supa; }
function openChannel(code){
  closeChannel();
  _ch=getSupa().channel('room:'+code,{config:{broadcast:{self:false,ack:false}}});
  _ch.on('broadcast',{event:'msg'},payload=>{ if(payload?.payload)handleMsg(payload.payload); });
  _ch.subscribe(s=>{ setConnStatus(s); if(s==='SUBSCRIBED'){broadcast({type:'JOIN',uid:U.id,name:U.name,color:U.color,photo:U.photo,frame:U.frame,frame_scale:U.frame_scale,frame_x:U.frame_x,frame_y:U.frame_y,x:200,y:200});} });
  channel=_ch;
}
function closeChannel(){ if(!_ch)return; broadcast({type:'LEAVE',uid:U.id}); try{getSupa().removeChannel(_ch);}catch(e){} _ch=null; channel=null; }
function broadcast(msg){ if(!_ch)return; _ch.send({type:'broadcast',event:'msg',payload:msg}).catch(()=>{}); }

/* ── MSG HANDLER ── */
function handleMsg(msg){
  if(!msg?.type||msg.uid===U.id)return;
  switch(msg.type){
    case 'JOIN':
      peers[msg.uid]={name:msg.name,color:msg.color,photo:msg.photo,frame:msg.frame,frame_scale:msg.frame_scale,frame_x:msg.frame_x,frame_y:msg.frame_y,ts:Date.now()};
      renderPeer(msg.uid,msg); broadcastMyInfo(); sendState(msg.uid); break;
    case 'HEARTBEAT':
      peers[msg.uid]={name:msg.name,color:msg.color,photo:msg.photo,frame:msg.frame,frame_scale:msg.frame_scale,frame_x:msg.frame_x,frame_y:msg.frame_y,ts:Date.now()};
      renderPeer(msg.uid,msg); break;
    case 'LEAVE':   removePeer(msg.uid); handleCallPeerGone(msg.uid); break;
    case 'MOVE_AV': movePeerAv(msg.uid,msg.x,msg.y); break;
    case 'CHAT':    showPeerBubble(msg.uid,msg.text,false); break;
    case 'GIF_CHAT':showPeerBubble(msg.uid,msg.url,true); break;
    case 'ADD_ITEM':    applyAdd(msg.item); break;
    case 'REMOVE_ITEM': applyRm(msg.itemId); break;
    case 'MOVE_ITEM':   applyMv(msg.itemId,msg.x,msg.y); break;
    case 'RESIZE_ITEM': applyRz(msg.itemId,msg.w,msg.h); break;
    case 'VID_SYNC':    applyVS(msg.uid_player,msg.action,msg.time); break;
    case 'MEDIA_SWITCH':      applyMediaSwitch(msg.itemId,msg.kind,msg.source); break;
    case 'MEDIA_SWITCH_MUSIC':applyMusicSwitch(msg.itemId,msg.vid,msg.title,msg.artist,msg.thumb); break;
    case 'DRAW_STROKE': applyDS(msg); break;
    case 'DRAW_CLEAR':  $('drawCanvas').getContext('2d').clearRect(0,0,$('drawCanvas').width,$('drawCanvas').height); break;
    case 'STATE_SYNC':  if(msg.to===U.id)applyState(msg); break;
    case 'CALL_JOIN':   handleCallJoin(msg.uid,msg); break;
    case 'CALL_HELLO':  if(msg.to===U.id)handleCallHello(msg.uid,msg); break;
    case 'CALL_OFFER':  if(msg.to===U.id)handleCallOffer(msg.uid,msg.sdp); break;
    case 'CALL_ANSWER': if(msg.to===U.id)handleCallAnswer(msg.uid,msg.sdp); break;
    case 'CALL_ICE':    if(msg.to===U.id)handleCallIce(msg.uid,msg.candidate); break;
    case 'CALL_MUTE':   handleCallMuteState(msg.uid,msg.muted); break;
    case 'CALL_LEAVE':  handleCallPeerGone(msg.uid); break;
  }
}
function broadcastMyInfo(){
  const av=qs('.av-wrap[data-uid="'+U.id+'"]');
  broadcast({type:'HEARTBEAT',uid:U.id,name:U.name,color:U.color,photo:U.photo,frame:U.frame,frame_scale:U.frame_scale,frame_x:U.frame_x,frame_y:U.frame_y,x:av?parseInt(av.style.left)||0:200,y:av?parseInt(av.style.top)||0:200});
}
function startHB(){ stopHB(); hbTimer=setInterval(()=>{ broadcastMyInfo(); const now=Date.now(); Object.keys(peers).forEach(uid=>{if(now-peers[uid].ts>10000)removePeer(uid);}); },4000); }
function stopHB(){ clearInterval(hbTimer); hbTimer=null; }

/* ── PEERS ── */
function renderPeer(uid,info){
  if(uid===U.id)return;
  let wrap=qs('.av-wrap[data-uid="'+uid+'"]');
  if(!wrap){
    wrap=document.createElement('div'); wrap.className='av-wrap'; wrap.dataset.uid=uid;
    wrap.style.left=(info.x||200)+'px'; wrap.style.top=(info.y||200)+'px';
    wrap.appendChild(mkAvEl(info)); wrap.appendChild(mkAvName(info.name||'User',uid));
    $('items').appendChild(wrap);
  } else {
    refreshAv(wrap,info);
  }
  upsertPart(uid,info);
}
function movePeerAv(uid,x,y){ const w=qs('.av-wrap[data-uid="'+uid+'"]'); if(w){w.style.left=x+'px';w.style.top=y+'px';} if(peers[uid])peers[uid].ts=Date.now(); }
function removePeer(uid){ delete peers[uid]; delete _partSig[uid]; const w=qs('.av-wrap[data-uid="'+uid+'"]'); if(w)w.remove(); const li=qs('.pi[data-uid="'+uid+'"]'); if(li)li.remove(); }
function showPeerBubble(uid,c,gif){ const w=qs('.av-wrap[data-uid="'+uid+'"]'); if(w)showBubble(w,c,gif); }

/* ── STATE SYNC ── */
function sendState(toUid){
  const items=els.filter(e=>e.dataset.itemId).map(e=>{
    const item={type:e.dataset.type,id:e.dataset.itemId,x:parseInt(e.style.left)||0,y:parseInt(e.style.top)||0,w:parseInt(e.style.width)||0,h:parseInt(e.style.height)||0,src:e.dataset.src||'',vid:e.dataset.vid||''};
    if(e.dataset.type==='music'){item.title=e.dataset.title||'';item.artist=e.dataset.artist||'';item.thumb=e.dataset.thumb||'';}
    if(e.dataset.type==='video'){item.kind=e.dataset.kind||'youtube';item.source=e.dataset.kind==='youtube'?e.dataset.vid:e.dataset.embedUrl;}
    if(e.dataset.type==='iframe'){item.embedUrl=e.dataset.embedUrl||'';}
    return item;
  });
  broadcast({type:'STATE_SYNC',to:toUid,items,drawImg:''});
  setTimeout(()=>{
    const dc=$('drawCanvas'); if(!dc?.width||!dc?.height)return;
    try{
      // Skip entirely when the canvas has no actual drawing on it.
      // (Sending an "empty" canvas as JPEG used to fill it solid black,
      // since JPEG has no transparency — that black image then covered
      // the whole screen for whoever just joined.)
      const raw=dc.getContext('2d').getImageData(0,0,dc.width,dc.height).data;
      let hasContent=false;
      for(let i=3;i<raw.length;i+=4){ if(raw[i]!==0){hasContent=true;break;} }
      if(!hasContent)return;
      const sc=Math.min(1,800/dc.width); const tmp=document.createElement('canvas');
      tmp.width=Math.round(dc.width*sc); tmp.height=Math.round(dc.height*sc);
      tmp.getContext('2d').drawImage(dc,0,0,tmp.width,tmp.height);
      const img=tmp.toDataURL('image/png'); // PNG keeps transparency (JPEG doesn't)
      if(img.length<1400000)broadcast({type:'STATE_SYNC',to:toUid,items:[],drawImg:img});
    }catch(e){}
  },300);
}
/* Cria qualquer tipo de item a partir dos dados recebidos pela rede (usado tanto no
   estado inicial ao entrar numa sala quanto em itens adicionados em tempo real).
   Centralizado aqui pra nunca ficar dessincronizado entre os dois casos. */
function createItemFromData(item,c){
  if(!item)return;
  if(item.type==='gif')mkGif(item.src,item.x,item.y,item.id,c,false);
  else if(item.type==='image')mkImg(item.src,item.x,item.y,item.id,c,false);
  else if(item.type==='video'){ mkMediaVid(item.kind||'youtube',item.source||item.vid,item.x,item.y,item.id,c,false); activeVideoCardId=item.id; }
  else if(item.type==='iframe') mkGenericIframe(item.embedUrl,item.x,item.y,item.id,c,false);
  else if(item.type==='music'){ mkMusicCard(item.vid,item.title||'Música',item.artist||'',item.thumb||'',item.x,item.y,item.id,c,false); activeMusicCardId=item.id; }
}
function applyState(msg){
  const c=$('items');
  (msg.items||[]).forEach(item=>{
    if(qs('[data-item-id="'+item.id+'"]'))return;
    createItemFromData(item,c);
    const el=qs('[data-item-id="'+item.id+'"]');
    if(el&&item.w>0)el.style.width=item.w+'px';
    if(el&&item.h>0)el.style.height=item.h+'px';
  });
  if(msg.drawImg?.length>100){
    const dc=$('drawCanvas'),ctx=dc.getContext('2d'),img=new Image();
    img.onload=()=>ctx.drawImage(img,0,0,dc.width,dc.height); img.src=msg.drawImg;
  }
}
function applyAdd(item){ if(!item||qs('[data-item-id="'+item.id+'"]'))return; createItemFromData(item,$('items')); }
function applyRm(id){
  const el=qs('[data-item-id="'+id+'"]');
  if(el){ const uid=el.dataset.ytuid; if(uid){delete ytPlrs[uid]; delete desiredPlaying[uid]; clearInterval(_vtTimers[uid]); delete _vtTimers[uid];} el.remove(); els=els.filter(e=>e!==el); }
  if(id===activeVideoCardId)activeVideoCardId=null;
  if(id===activeMusicCardId)activeMusicCardId=null;
}
function applyMv(id,x,y){ const el=qs('[data-item-id="'+id+'"]'); if(el){el.style.left=x+'px';el.style.top=y+'px';} }
function applyRz(id,w,h){ const el=qs('[data-item-id="'+id+'"]'); if(el){el.style.width=w+'px';el.style.height=h+'px'; const uid=el.dataset.ytuid; if(uid){const ypc=$('ypc-'+uid);if(ypc){ypc.style.width=w+'px';ypc.style.height=Math.max(80,h-HEAD-CTRL)+'px';} const p=ytPlrs[uid];if(p&&p.setSize)p.setSize(Math.round(w),Math.max(80,Math.round(h)-HEAD-CTRL));}} }
function applyVS(uid,action,time){
  const p=ytPlrs[uid]; if(!p)return;
  try{
    suppressSync(uid);
    if(Math.abs(p.getCurrentTime()-time)>1.5)p.seekTo(time,true);
    if(action==='play'){ desiredPlaying[uid]=true; p.playVideo(); }
    else if(action==='pause'){ desiredPlaying[uid]=false; p.pauseVideo(); }
  }catch(e){}
}

/* ── DRAW ── */
function buildDrawColors(){
  const row=$('drawColors'); if(!row)return;
  DRAWCOLORS.forEach(c=>{ const ch=document.createElement('div'); ch.className='dc'+(c===drawColor?' active':''); ch.style.background=c; ch.title=c; ch.onclick=()=>setDrawColor(c); row.appendChild(ch); });
}
function setDrawColor(c){ drawColor=c; eraser=false; $('eraserBtn').classList.remove('active'); document.querySelectorAll('.dc').forEach(x=>x.classList.remove('active')); const m=Array.from(document.querySelectorAll('.dc')).find(x=>x.title===c); if(m)m.classList.add('active'); updateBPreview(); }
function updateBPreview(){ const sz=parseInt($('brushSize').value),op=parseInt($('brushOpacity').value)/100,dot=$('bprevdot'); if(!dot)return; const d=Math.min(sz,24); dot.style.width=d+'px'; dot.style.height=d+'px'; dot.style.background=eraser?'rgba(255,255,255,.3)':drawColor; dot.style.opacity=op; }
function getBR(){ return parseInt($('brushSize').value)/2; }
function getBOP(){ return parseInt($('brushOpacity').value)/100; }
function getXY(e){ const dc=$('drawCanvas'),r=dc.getBoundingClientRect(),s=e.touches?e.touches[0]:e; return{x:s.clientX-r.left,y:s.clientY-r.top}; }
function toggleDraw(){ drawMode=!drawMode; $('drawCanvas').classList.toggle('active',drawMode); $('drawBtn').classList.toggle('active',drawMode); $('drawBar').classList.toggle('on',drawMode); $('items').style.pointerEvents=drawMode?'none':''; if(drawMode)updateBPreview(); }
function toggleEraser(){ eraser=!eraser; $('eraserBtn').classList.toggle('active',eraser); updateBPreview(); }
function clearDraw(){ const dc=$('drawCanvas'),ctx=dc.getContext('2d'); drawHist.push(ctx.getImageData(0,0,dc.width,dc.height)); ctx.clearRect(0,0,dc.width,dc.height); broadcast({type:'DRAW_CLEAR',uid:U.id}); }
function undoDraw(){ if(!drawHist.length){toast('Nada para desfazer','err');return;} const dc=$('drawCanvas'); dc.getContext('2d').putImageData(drawHist.pop(),0,0); }
function applyDS(msg){ const dc=$('drawCanvas'),ctx=dc.getContext('2d'); ctx.save(); ctx.globalAlpha=msg.opacity||1; ctx.globalCompositeOperation=msg.eraser?'destination-out':'source-over'; ctx.strokeStyle=msg.color||'#eae6de'; ctx.lineWidth=msg.size||8; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); ctx.moveTo(msg.x0,msg.y0); ctx.lineTo(msg.x1,msg.y1); ctx.stroke(); ctx.restore(); }

function initDraw(){
  const dc=$('drawCanvas');
  function onDown(e){
    if(!drawMode)return;
    e.preventDefault(); e.stopPropagation();
    drawing=true;
    const p=getXY(e); lastDX=p.x; lastDY=p.y;
    const ctx=dc.getContext('2d');
    drawHist.push(ctx.getImageData(0,0,dc.width,dc.height));
    if(drawHist.length>40)drawHist.shift();
    ctx.save(); ctx.globalAlpha=getBOP(); ctx.globalCompositeOperation=eraser?'destination-out':'source-over';
    ctx.fillStyle=drawColor; ctx.beginPath(); ctx.arc(p.x,p.y,getBR(),0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  function onMove(e){
    if(!drawMode||!drawing)return;
    e.preventDefault();
    const p=getXY(e),ctx=dc.getContext('2d');
    ctx.save(); ctx.globalAlpha=getBOP(); ctx.globalCompositeOperation=eraser?'destination-out':'source-over';
    ctx.strokeStyle=drawColor; ctx.lineWidth=getBR()*2; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(lastDX,lastDY); ctx.lineTo(p.x,p.y); ctx.stroke(); ctx.restore();
    broadcast({type:'DRAW_STROKE',uid:U.id,x0:lastDX,y0:lastDY,x1:p.x,y1:p.y,color:drawColor,size:getBR()*2,opacity:getBOP(),eraser});
    lastDX=p.x; lastDY=p.y;
  }
  function onUp(){ drawing=false; }
  // Mouse: start on canvas, continue on document
  dc.addEventListener('mousedown',onDown,{passive:false});
  document.addEventListener('mousemove',e=>{if(drawMode&&drawing)onMove(e);},{passive:false});
  document.addEventListener('mouseup',onUp);
  // Touch: capture phase so it beats initPointer's bubble listeners
  dc.addEventListener('touchstart',e=>{if(!drawMode||e.touches.length!==1)return; e.preventDefault(); e.stopPropagation(); onDown(e);},{passive:false,capture:true});
  document.addEventListener('touchmove',e=>{if(!drawMode||!drawing||e.touches.length!==1)return; e.preventDefault(); onMove(e);},{passive:false,capture:true});
  document.addEventListener('touchend',()=>{if(drawing)onUp();},{capture:true});
}

/* ── POINTER (drag + resize) ── */
function initPointer(){
  const items=$('items'),cap=$('capture');
  // Keep iframes pointer-events:none so rzh handle always works
  // Re-enable briefly on vcbtn click so YT can process it
  const disIf=()=>document.querySelectorAll('iframe').forEach(f=>f.style.pointerEvents='none');
  const enIf= ()=>document.querySelectorAll('iframe').forEach(f=>f.style.pointerEvents='');
  disIf();
  document.addEventListener('click',e=>{ if(e.target.closest('.vcbtn')){ enIf(); setTimeout(disIf,1200); } });
  /* Em mobile/WebView, touchstart chega antes do click; habilita o iframe
     a tempo de o YT.Player receber o playVideo() programático. */
  document.addEventListener('touchstart',e=>{ if(e.target.closest('.vcbtn')){ enIf(); setTimeout(disIf,1500); } },{passive:true});

  items.addEventListener('mousedown',e=>{ if(e.button!==0||drawMode)return; if(beginIA(e.target,e.clientX,e.clientY))e.preventDefault(); },{passive:false});
  cap.addEventListener('mousemove',e=>{ if(D||R)move(e.clientX,e.clientY); });
  cap.addEventListener('mouseup',()=>endIA());
  document.addEventListener('mousemove',e=>{ if(D||R)move(e.clientX,e.clientY); },{passive:false});
  document.addEventListener('mouseup',()=>endIA());

  let tid=null;
  items.addEventListener('touchstart',e=>{ if(drawMode||e.touches.length!==1)return; const t=e.touches[0]; tid=t.identifier; if(beginIA(t.target,t.clientX,t.clientY)){e.preventDefault();e.stopPropagation();} },{passive:false});
  document.addEventListener('touchmove',e=>{ if(!D&&!R)return; const t=Array.from(e.touches).find(x=>x.identifier===tid); if(!t)return; move(t.clientX,t.clientY); e.preventDefault(); },{passive:false});
  document.addEventListener('touchend',()=>{ tid=null; endIA(); });
  $('cw').addEventListener('mousedown',e=>{ if(!e.target.closest('.card,.av-wrap'))deselect(); });
}
function beginIA(target,cx,cy){
  if(target.closest('.cx,.vcbtn,.vctrl'))return false;
  if(target.closest('.rzh')){
    const card=target.closest('.card'); if(!card)return false;
    const w0=card.offsetWidth,h0=card.offsetHeight; card.style.width=w0+'px'; card.style.height=h0+'px';
    R={el:card,x0:cx,y0:cy,w0,h0,l0:parseInt(card.style.left)||0,t0:parseInt(card.style.top)||0};
    select(card); startCap('se-resize'); return true;
  }
  const ch=target.closest('.ch'); const card=ch?.closest('.card');
  if(card){ D={type:'card',el:card,ox:cx-card.offsetLeft,oy:cy-card.offsetTop}; card.style.zIndex=++zTop; select(card); startCap('grab'); return true; }
  const av=target.closest('.av-wrap[data-uid="'+U.id+'"]');
  if(av){ D={type:'av',el:av,ox:cx-av.offsetLeft,oy:cy-av.offsetTop}; av.classList.add('drag-av'); startCap('grabbing'); return true; }
  return false;
}
function startCap(cur){ const c=$('capture'); c.style.cursor=cur; c.classList.add('on'); document.body.style.userSelect='none'; }
function stopCap(){ const c=$('capture'); c.classList.remove('on'); c.style.cursor=''; document.body.style.userSelect=''; }
function move(cx,cy){
  const cw=$('cw');
  if(D){
    let x=cx-D.ox,y=cy-D.oy; x=Math.max(0,Math.min(x,cw.clientWidth-(D.el.offsetWidth||50))); y=Math.max(0,Math.min(y,cw.clientHeight-(D.el.offsetHeight||50)));
    px=x; py=y; if(!raf)raf=requestAnimationFrame(()=>{D.el.style.left=px+'px';D.el.style.top=py+'px';raf=null;});
    if(D.type==='av')broadcast({type:'MOVE_AV',uid:U.id,x:Math.round(px),y:Math.round(py)});
    return;
  }
  if(R){
    const dx=cx-R.x0,dy=cy-R.y0;
    pw=Math.min(cw.clientWidth-R.l0,Math.max(200,R.w0+dx));
    ph=Math.min(cw.clientHeight-R.t0,Math.max(150,R.h0+dy));
    if(!raf)raf=requestAnimationFrame(()=>{
      if(!R){raf=null;return;}
      R.el.style.width=pw+'px'; R.el.style.height=ph+'px';
      const uid=R.el.dataset.ytuid;
      if(uid){
        const vidW=Math.round(pw),vidH=Math.max(80,Math.round(ph)-HEAD-CTRL);
        const ypc=$('ypc-'+uid); if(ypc){ypc.style.width=vidW+'px';ypc.style.height=vidH+'px';}
        const p=ytPlrs[uid]; if(p&&p.setSize)p.setSize(vidW,vidH);
      }
      raf=null;
    });
  }
}
function endIA(){
  if(!D&&!R){stopCap();return;} stopCap();
  if(raf){cancelAnimationFrame(raf);raf=null;}
  if(D){ if(D.type==='av')D.el.classList.remove('drag-av'); if(D.type==='card'){const id=D.el.dataset.itemId;if(id)broadcast({type:'MOVE_ITEM',itemId:id,x:parseInt(D.el.style.left)||0,y:parseInt(D.el.style.top)||0});} D=null; }
  if(R){ const id=R.el.dataset.itemId;if(id)broadcast({type:'RESIZE_ITEM',itemId:id,w:R.el.offsetWidth,h:R.el.offsetHeight}); R=null; }
}
function select(el){ deselect(); el.classList.add('sel'); }
function deselect(){ document.querySelectorAll('.sel').forEach(e=>e.classList.remove('sel')); }
function delSel(){ const s=qs('.card.sel'); if(!s)return; const id=s.dataset.itemId; s.remove(); els=els.filter(e=>e!==s); if(id)broadcast({type:'REMOVE_ITEM',itemId:id}); toast('Removido'); }

/* ── MESSAGES ── */
function handleMsgKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} }
function sendMsg(){
  const inp=$('msgInput'),txt=inp.value.trim(); if(!txt)return;
  let av=qs('.av-wrap[data-uid="'+U.id+'"]')||qs('.av-wrap'); if(!av){toast('Avatar não encontrado','err');return;}
  showBubble(av,txt,false); broadcast({type:'CHAT',uid:U.id,text:txt}); inp.value=''; inp.focus();
}
function showBubble(wrap,content,isGif){
  let ex=wrap.querySelector('.bubble'); if(ex)ex.remove();
  const b=document.createElement('div'); b.className='bubble'+(isGif?' gbub':'');
  if(isGif){const img=document.createElement('img');img.src=content;b.appendChild(img);}else b.textContent=content;
  wrap.appendChild(b);
  setTimeout(()=>{ if(b.parentElement){b.classList.add('fading');setTimeout(()=>b.remove(),480);} },isGif?10000:8000);
}

/* ── GIF — Klipy ── */
function openGifPicker(mode){ gifMode=mode; $('gifModal').classList.add('on'); setTimeout(()=>$('gifSearch').focus(),80); }
// Extrai a melhor url de thumb/full de um item da Klipy, cobrindo variações de schema (file.{sm,md,hd}.{gif,webp}.url)
function klipyPickUrls(item){
  const f=item.file||item.files||{};
  const sizes=['xs','sm','md','hd','lg']; // menor → maior
  let thumb=null, full=null;
  for(const s of sizes){
    const grp=f[s]; if(!grp)continue;
    const url=grp.gif?.url||grp.webp?.url||grp.url;
    if(!url)continue;
    if(!thumb)thumb=url;
    full=url; // fica sempre com a maior disponível
  }
  // fallback: alguns formatos vêm direto em item.url / item.gif
  if(!full) full = item.url || item.gif?.url || item.original?.url || null;
  if(!thumb) thumb = item.thumbnail || item.preview || full;
  return {thumb, full};
}
async function searchGifs(){
  const q=$('gifSearch').value.trim(), r=$('gifResults');
  if(!q){r.innerHTML='<div class="ge">Digite algo para buscar</div>';return;}
  r.innerHTML='<div class="ge">Buscando...</div>';
  try{
    const res=await fetch(`https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/search?q=${encodeURIComponent(q)}&per_page=24&page=1&content_filter=low`);
    if(!res.ok)throw new Error('HTTP '+res.status);
    const d=await res.json();
    const items=d.data?.data||d.data||d.results||[];
    if(!items.length){r.innerHTML='<div class="ge">Nenhum resultado</div>';return;}
    r.innerHTML='';
    items.forEach(g=>{
      const {thumb,full}=klipyPickUrls(g);
      if(!thumb||!full)return;
      const it=document.createElement('div'); it.className='gi';
      const img=document.createElement('img'); img.src=thumb; img.loading='lazy';
      it.appendChild(img); it.onclick=()=>pickGif(full); r.appendChild(it);
    });
    if(!r.children.length) r.innerHTML='<div class="ge">Nenhum resultado</div>';
  }catch(e){ r.innerHTML='<div class="ge">Erro ao buscar. Tente novamente.</div>'; console.error(e); }
}
function pickGif(url){
  closeModal('gifModal');
  if(gifMode==='chat'){ const av=qs('.av-wrap[data-uid="'+U.id+'"]')||qs('.av-wrap'); if(av){showBubble(av,url,true);broadcast({type:'GIF_CHAT',uid:U.id,url});} }
  else{ const c=$('items'),id='gif_'+Date.now(); mkGif(url,100+Math.random()*300,100+Math.random()*220,id,c,true); toast('GIF adicionado'); }
}

/* ── IMAGE ── */
function openImageModal(){ $('imageModal').classList.add('on'); $('imgPrev').style.display='none'; $('imgFile').value=''; pendImg=null; }
function previewImg(){ const f=$('imgFile').files[0]; if(!f)return; const r=new FileReader(); r.onload=e=>{ pendImg=e.target.result; $('imgPrevEl').src=pendImg; $('imgPrev').style.display='block'; }; r.readAsDataURL(f); }
function confirmImg(){ if(!pendImg){toast('Selecione uma imagem','err');return;} const c=$('items'),id='img_'+Date.now(); mkImg(pendImg,80+Math.random()*300,80+Math.random()*220,id,c,true); toast('Imagem adicionada'); pendImg=null; closeModal('imageModal'); }
function clearImg(){ pendImg=null; $('imgPrev').style.display='none'; $('imgFile').value=''; }

/* ── THEME TOGGLE ── */
function toggleTheme(){
  const b=document.body;
  let next;
  if(b.classList.contains('light')){ b.classList.remove('light'); b.classList.add('eclipse'); next='eclipse'; }
  else if(b.classList.contains('eclipse')){ b.classList.remove('eclipse'); next='dark'; }
  else { b.classList.add('light'); next='light'; }
  localStorage.setItem('tfm_theme',next);
}
(function(){
  const t=localStorage.getItem('tfm_theme');
  if(t==='light') document.body.classList.add('light');
  else if(t==='eclipse') document.body.classList.add('eclipse');
})();

/* ── UNIVERSAL VIDEO ── */
function openUniversalVideoPanel(){ if(!room){toast('Entre em uma sala primeiro','err');return;} $('univVideoPanel').classList.add('on'); setTimeout(()=>$('univVideoUrl').focus(),80); }
function closeUniversalVideoPanel(e){ if(!e||e.currentTarget===e.target||!e.type) $('univVideoPanel').classList.remove('on'); }
function extractYT(url){ const m=url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/); return m?m[1]:null; }
function extractVimeo(url){ const m=url.match(/vimeo\.com\/(?:video\/)?(\d+)/); return m?m[1]:null; }
function extractTwitch(url){
  try{
    const u=new URL(url);
    if(!/(^|\.)twitch\.tv$/.test(u.hostname))return null;
    const vod=u.pathname.match(/\/videos\/(\d+)/); if(vod)return{type:'video',id:vod[1]};
    const clip=u.pathname.match(/\/(?:[^/]+\/clip|clip)\/([A-Za-z0-9-_]+)/); if(clip)return{type:'clip',id:clip[1]};
    const chan=u.pathname.match(/^\/([A-Za-z0-9_]{2,25})\/?$/); if(chan && !['videos','directory','p','settings'].includes(chan[1].toLowerCase()))return{type:'channel',id:chan[1]};
  }catch(e){}
  return null;
}
function isDirectVideo(url){ return /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(url); }
function isHLS(url){ return /\.m3u8(\?|$)/i.test(url); }
async function addUniversalVideo(url){
  url = (typeof url==='string' ? url : $('univVideoUrl').value).trim(); if(!url){toast('Cole uma URL','err');return;}
  if(!/^https?:\/\//i.test(url)) url='https://'+url;
  const btn=$('uvAddBtn'); if(btn) btn.classList.add('loading');
  // 1) plataformas conhecidas: entra direto como player sincronizado
  const known=matchKnown(url);
  if(known){ loadVideoUnified(known.kind,known.source); $('univVideoPanel').classList.remove('on'); if(btn)btn.classList.remove('loading'); return; }
  // 2) página qualquer: tenta descobrir o vídeo embutido nela via oEmbed
  toast('Procurando o vídeo nessa página...');
  const found=await resolveVideoUrl(url);
  if(btn) btn.classList.remove('loading');
  if(found && found.kind!=='iframe'){
    loadVideoUnified(found.kind,found.source);
    $('univVideoPanel').classList.remove('on');
    toast('Vídeo encontrado na página · SYNC');
    return;
  }
  if(found && found.kind==='iframe'){
    // achamos o player embutido: usar a URL de embed funciona muito melhor que a URL da página,
    // porque páginas normais bloqueiam iframe, mas o endereço de embed é feito justamente pra isso
    addGenericIframe(found.source);
    $('univVideoPanel').classList.remove('on');
    toast('Player da página incorporado'+(found.provider?' ('+found.provider+')':''));
    return;
  }
  // 3) nada identificado: incorpora a página como veio
  addGenericIframe(url); $('univVideoPanel').classList.remove('on');
}
/* ══════════════════════════════════════════════════════════════════════
   DESCOBRIR — substitui a antiga aba "Navegar".

   POR QUE A ABA ANTIGA NÃO TINHA COMO FUNCIONAR:
   ela era um <iframe> apontando pro site que você digitasse. Dois muros
   intransponíveis do navegador tornavam a ideia inviável:
   1) X-Frame-Options / CSP frame-ancestors: YouTube, Google e a maioria
      dos sites de vídeo PROIBEM ser abertos dentro de um iframe. Por isso
      a página nem carregava e não dava pra "deslizar" navegando.
   2) Same-origin policy: mesmo quando o site carrega, o JavaScript da
      página de fora NÃO consegue ler a URL nem o conteúdo do iframe. Ou
      seja, "detectar automaticamente o vídeo que está tocando lá dentro"
      é impossível — não é limitação de esforço, é barreira de segurança
      do navegador, igual pra qualquer site do mundo.

   O QUE FOI FEITO NO LUGAR (e entrega o mesmo objetivo, funcionando):
   • RESOLVEDOR UNIVERSAL: você cola o link da PÁGINA (não do embed) e nós
     descobrimos o vídeo que existe nela via oEmbed, transformando em player
     sincronizado. É exatamente "reconhecer o vídeo embed e virar player",
     só que feito do lado de fora, que é o único lugar onde é possível.
   • DESCOBRIR: busca real com páginas navegáveis por deslize (swipe),
     setas, teclado, categorias e resultados ricos (duração, views, canal).
   ══════════════════════════════════════════════════════════════════════ */

const DS_CATEGORIES = [
  { id:'trend',  label:'🔥 Em alta',   q:'' },
  { id:'music',  label:'🎵 Música',    q:'música' },
  { id:'live',   label:'🔴 Ao vivo',   q:'ao vivo' },
  { id:'games',  label:'🎮 Games',     q:'gameplay' },
  { id:'movies', label:'🎬 Filmes',    q:'filme completo' },
  { id:'anime',  label:'🌸 Anime',     q:'anime' },
  { id:'lofi',   label:'☕ Lofi',      q:'lofi hip hop' },
  { id:'news',   label:'📰 Notícias',  q:'notícias hoje' }
];
let dsQuery='', dsTokens=[null], dsPage=0, dsNext=null, dsLoading=false, dsCat='trend';
let dsSwipe=null, dsInited=false;

function uvSwitchTab(tab){
  const isLink=tab==='link';
  $('uvTabLink').style.display=isLink?'block':'none';
  $('uvTabBrowse').style.display=isLink?'none':'block';
  $('uvTabLinkBtn').classList.toggle('active',isLink);
  $('uvTabBrowseBtn').classList.toggle('active',!isLink);
  if(!isLink) dsInit();
}
function dsInit(){
  if(dsInited) return; dsInited=true;
  const chips=$('dsChips');
  chips.innerHTML=DS_CATEGORIES.map(c=>`<button class="ds-chip${c.id===dsCat?' on':''}" data-cat="${c.id}">${c.label}</button>`).join('');
  chips.addEventListener('click',e=>{
    const b=e.target.closest('.ds-chip'); if(!b) return;
    dsCat=b.dataset.cat;
    chips.querySelectorAll('.ds-chip').forEach(x=>x.classList.toggle('on',x===b));
    const cat=DS_CATEGORIES.find(c=>c.id===dsCat);
    $('dsSearchInput').value='';
    dsStart(cat?cat.q:'', dsCat==='trend');
  });
  // delegação de evento: um listener só para todos os cards (mais leve que N handlers)
  $('dsResults').addEventListener('click',e=>{
    const card=e.target.closest('.ds-card'); if(!card) return;
    const vid=card.dataset.vid; if(!vid) return;
    if(!room){ toast('Entre em uma sala primeiro','err'); return; }
    loadVideoUnified('youtube',vid);
    closeUniversalVideoPanel();
  });
  dsSetupSwipe();
  dsStart('',true);
}

/* ── paginação real, com pilha de tokens pra poder voltar ── */
function dsStart(q,trending){
  dsQuery=q||''; dsTokens=[null]; dsPage=0; dsNext=null; dsTrending=!!trending;
  dsFetch(0,'none');
}
let dsTrending=true;
function dsGoPage(delta){
  if(dsLoading) return;
  const target=dsPage+delta;
  if(target<0) return;
  if(delta>0 && !dsNext) { dsBounce('left'); return; }
  if(target<0) { dsBounce('right'); return; }
  dsFetch(target, delta>0?'next':'prev');
}
async function dsFetch(pageIdx,dir){
  if(dsLoading) return;
  dsLoading=true;
  dsRenderLoading(dir);
  try{
    let url;
    const token=dsTokens[pageIdx];
    if(dsTrending && !dsQuery){
      url=`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&regionCode=BR&maxResults=24&key=${encodeURIComponent(YT_API_KEY)}`;
      if(token) url+=`&pageToken=${encodeURIComponent(token)}`;
    }else{
      url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=24&key=${encodeURIComponent(YT_API_KEY)}&q=${encodeURIComponent(dsQuery)}`;
      if(token) url+=`&pageToken=${encodeURIComponent(token)}`;
    }
    const res=await fetch(url);
    if(!res.ok){ dsRenderMsg('Não foi possível buscar agora. Verifique a conexão ou a chave da API.'); dsLoading=false; return; }
    const data=await res.json();
    let items=data.items||[];
    if(!items.length){ dsRenderMsg('Nenhum resultado encontrado.'); dsLoading=false; return; }
    dsNext=data.nextPageToken||null;
    dsPage=pageIdx;
    dsTokens[pageIdx+1]=dsNext;
    // busca (numa chamada só) duração e views quando vieram da busca, que não traz esses campos
    if(!(dsTrending && !dsQuery)){
      const ids=items.map(i=>i.id.videoId).filter(Boolean);
      const det=await dsFetchDetails(ids);
      items=items.map(i=>({ ...i, _d:det[i.id.videoId] }));
    }else{
      items=items.map(i=>({ ...i, _d:{ dur:i.contentDetails?.duration, views:i.statistics?.viewCount } }));
    }
    dsRender(items,dir);
  }catch(e){ console.error('dsFetch',e); dsRenderMsg('Erro ao buscar.'); }
  dsLoading=false;
}
async function dsFetchDetails(ids){
  const out={};
  if(!ids.length) return out;
  try{
    const url=`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${ids.join(',')}&key=${encodeURIComponent(YT_API_KEY)}`;
    const r=await fetch(url); if(!r.ok) return out;
    const d=await r.json();
    (d.items||[]).forEach(v=>{ out[v.id]={ dur:v.contentDetails?.duration, views:v.statistics?.viewCount }; });
  }catch(e){}
  return out;
}
/* ISO-8601 (PT1H4M13S) → 1:04:13 */
function dsFmtDur(iso){
  if(!iso) return '';
  const m=iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if(!m) return '';
  const h=+(m[1]||0), mi=+(m[2]||0), s=+(m[3]||0);
  return h ? `${h}:${String(mi).padStart(2,'0')}:${String(s).padStart(2,'0')}`
           : `${mi}:${String(s).padStart(2,'0')}`;
}
function dsFmtViews(v){
  if(!v) return '';
  const n=+v;
  if(n>=1e9) return (n/1e9).toFixed(1).replace('.',',')+' bi';
  if(n>=1e6) return (n/1e6).toFixed(1).replace('.',',')+' mi';
  if(n>=1e3) return Math.round(n/1e3)+' mil';
  return String(n);
}
function dsRenderLoading(dir){
  const box=$('dsResults');
  if(dir==='none'||!box.children.length){
    box.innerHTML=Array.from({length:6}).map(()=>`<div class="ds-card ds-skel"><div class="ds-thumb"></div><div class="ds-meta"><i></i><i class="s"></i></div></div>`).join('');
  }else{
    box.classList.add('ds-fading');
  }
}
function dsRenderMsg(msg){
  $('dsResults').classList.remove('ds-fading');
  $('dsResults').innerHTML=`<div class="ds-msg">${msg}</div>`;
  dsUpdatePager();
}
function dsRender(items,dir){
  const box=$('dsResults');
  box.classList.remove('ds-fading');
  box.innerHTML=items.map(it=>{
    const id=it.id?.videoId||it.id;
    const sn=it.snippet||{};
    const thumb=sn.thumbnails?.medium?.url||sn.thumbnails?.default?.url||'';
    const title=dsEsc(sn.title||'');
    const chan=dsEsc(sn.channelTitle||'');
    const dur=dsFmtDur(it._d?.dur);
    const views=dsFmtViews(it._d?.views);
    return `<div class="ds-card" data-vid="${id}" title="${title}">
      <div class="ds-thumb"><img src="${thumb}" loading="lazy" alt="">
        ${dur?`<span class="ds-dur">${dur}</span>`:''}
        <span class="ds-play"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><polygon points="6,4 20,12 6,20"/></svg></span>
      </div>
      <div class="ds-meta"><span class="ds-title">${title}</span>
        <span class="ds-sub">${chan}${views?' · '+views+' views':''}</span></div>
    </div>`;
  }).join('');
  // animação de entrada conforme a direção do deslize
  box.classList.remove('ds-in-l','ds-in-r');
  void box.offsetWidth; // força reflow pra reiniciar a animação
  if(dir==='next') box.classList.add('ds-in-r');
  else if(dir==='prev') box.classList.add('ds-in-l');
  dsUpdatePager();
  box.scrollTop=0;
}
function dsEsc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function dsUpdatePager(){
  const lbl=$('dsPageLbl'); if(lbl) lbl.textContent='Página '+(dsPage+1);
  const prev=$('dsPrev'), next=$('dsNext');
  if(prev) prev.disabled=dsPage===0;
  if(next) next.disabled=!dsNext;
}
function dsBounce(side){
  const box=$('dsResults');
  box.classList.remove('ds-bounce-l','ds-bounce-r');
  void box.offsetWidth;
  box.classList.add(side==='left'?'ds-bounce-l':'ds-bounce-r');
}
/* deslizar entre páginas: arrastar na área de resultados (toque ou mouse) */
function dsSetupSwipe(){
  const box=$('dsResults');
  box.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0) return;
    dsSwipe={ x:e.clientX, y:e.clientY, dx:0, active:false, id:e.pointerId };
  });
  box.addEventListener('pointermove',e=>{
    if(!dsSwipe||e.pointerId!==dsSwipe.id) return;
    const dx=e.clientX-dsSwipe.x, dy=e.clientY-dsSwipe.y;
    // só assume o gesto se for claramente horizontal — senão deixa a rolagem vertical em paz
    if(!dsSwipe.active && Math.abs(dx)>14 && Math.abs(dx)>Math.abs(dy)*1.4) dsSwipe.active=true;
    if(dsSwipe.active){
      dsSwipe.dx=dx;
      const damp=(dx>0&&dsPage===0)||(dx<0&&!dsNext) ? .28 : .55; // resistência quando não há pra onde ir
      box.style.transform=`translateX(${dx*damp}px)`;
      box.style.transition='none';
    }
  });
  const finish=e=>{
    if(!dsSwipe) return;
    const dx=dsSwipe.dx, was=dsSwipe.active;
    dsSwipe=null;
    box.style.transition=''; box.style.transform='';
    if(!was) return;
    if(dx<-70) dsGoPage(1);
    else if(dx>70) dsGoPage(-1);
  };
  box.addEventListener('pointerup',finish);
  box.addEventListener('pointercancel',finish);
  box.addEventListener('pointerleave',finish);
  // teclado
  document.addEventListener('keydown',e=>{
    if(!$('univVideoPanel').classList.contains('on')) return;
    if($('uvTabBrowse').style.display==='none') return;
    if(document.activeElement&&document.activeElement.tagName==='INPUT') return;
    if(e.key==='ArrowRight') dsGoPage(1);
    if(e.key==='ArrowLeft') dsGoPage(-1);
  });
}
function dsSearchNow(){
  const q=$('dsSearchInput').value.trim();
  $('dsChips').querySelectorAll('.ds-chip').forEach(x=>x.classList.remove('on'));
  dsStart(q,!q);
}

/* ══════════════════════════════════════════════════════════════════
   RESOLVEDOR UNIVERSAL DE LINKS
   Recebe a URL de uma PÁGINA qualquer e descobre o vídeo dentro dela.
   Ordem de tentativa:
   1) Extratores diretos (YouTube/Vimeo/Twitch/arquivo) — instantâneo.
   2) oEmbed via noembed.com: padrão aberto que centenas de sites publicam;
      devolve o HTML do player, de onde tiramos a URL real do embed.
   3) Se o embed resolvido for de uma plataforma conhecida, vira player
      SINCRONIZADO; senão entra como iframe (posição sincronizada).
   É esta etapa que entrega, na prática, "reconhecer o vídeo da página e
   transformar em player" — feito de fora, que é onde o navegador permite.
   ══════════════════════════════════════════════════════════════════ */
async function resolveVideoUrl(url){
  const direct=matchKnown(url);
  if(direct) return direct;
  try{
    const r=await fetch('https://noembed.com/embed?url='+encodeURIComponent(url));
    if(r.ok){
      const d=await r.json();
      if(d && !d.error){
        const html=d.html||'';
        const m=html.match(/src=["']([^"']+)["']/i);
        if(m){
          let src=m[1];
          if(src.startsWith('//')) src='https:'+src;
          const known=matchKnown(src);
          if(known) return known;
          return { kind:'iframe', source:src, title:d.title||'', provider:d.provider_name||'' };
        }
      }
    }
  }catch(e){ /* sem conexão com o resolvedor: cai no caminho genérico */ }
  return null;
}
function matchKnown(url){
  const yt=extractYT(url);          if(yt) return { kind:'youtube', source:yt };
  const vm=extractVimeo(url);       if(vm) return { kind:'vimeo',   source:vm };
  const tw=extractTwitch(url);      if(tw) return { kind:'twitch',  source:tw.type+':'+tw.id };
  if(isHLS(url)||isDirectVideo(url))return { kind:'html5',  source:url };
  return null;
}

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
  w.innerHTML=`<div class="ch" style="height:${HEAD}px;flex-shrink:0"><span class="ct">▶ ${kindLabel(kind,source)}</span><div style="display:flex;align-items:center;gap:.38rem"><span class="vsync">SYNC</span>${href?`<a class="vcbtn" href="${href}" target="_blank" rel="noopener" title="Abrir original" style="line-height:0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg></a>`:''}<button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div></div><div id="ypc-${uid}" style="flex-shrink:0;width:${VID_W}px;height:${VID_H}px;background:#000;overflow:hidden;position:relative"></div><div class="vctrl" style="height:${CTRL}px;flex-shrink:0"><button class="vcbtn" onclick="vPlay('${uid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg></button><button class="vcbtn" onclick="vPause('${uid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button><button class="vcbtn" onclick="vSeek('${uid}',-10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 100-.49"/></svg></button><button class="vcbtn" onclick="vSeek('${uid}',10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 110-.49"/></svg></button><span class="vtime" id="vt-${uid}">0:00</span></div><div class="vupnext" id="vun-${uid}"></div>`;
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
    isPlaying(){ return _playing; }
  };
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
    isPlaying(){ return _playing; }
  };
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
    isPlaying(){ return !vidEl.paused; }
  };
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
      return `<div class="vun-item" onclick="videoPlayNext('${uid}','${id}')" title="${t.replace(/"/g,'&quot;')}"><img src="${thumb}" loading="lazy" onerror="this.style.display='none'"><span>${t}</span></div>`;
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
function openMusicPanel(){
  if(!room){toast('Entre em uma sala primeiro','err');return;}
  const wasOn=$('musicPanel').classList.contains('on');
  $('musicPanel').classList.toggle('on');
  musicUpdateLoginUI();
  // Ao abrir sem nada buscado ainda, já mostra sugestões em alta — assim dá pra escolher sem saber o nome de nada
  if(!wasOn && !musicCurrentQuery && !$('musicSearchInput').value.trim()) musicLoadTrending();
}
function closeMusicPanel(e){ if(!e||e.currentTarget===e.target||!e.type) $('musicPanel').classList.remove('on'); }
function musicUpdateLoginUI(){
  // Login com Google removido — busca fica sempre liberada.
  const loginBtn=$('musicLoginBtn'),logoutBtn=$('musicLogoutBtn'),searchSec=$('musicSearchSec'),userInfo=$('musicUserInfo');
  if(!loginBtn) return;
  loginBtn.style.display='none'; logoutBtn.style.display='none'; searchSec.style.display='flex';
  userInfo.innerHTML='';
}
let musicNextToken=null, musicCurrentQuery='', musicTypeTimer=null;
// Busca "ao vivo": dispara sozinha ~500ms depois que a pessoa para de digitar — não precisa apertar Enter nem saber o nome exato
function musicOnType(){
  clearTimeout(musicTypeTimer);
  const q=$('musicSearchInput').value.trim();
  if(!q){ musicTypeTimer=setTimeout(musicLoadTrending,300); return; }
  musicTypeTimer=setTimeout(()=>musicSearch(true),500);
}
function musicQuick(query){ $('musicSearchInput').value=query; musicSearch(); }
async function musicSearch(silent){
  const q=$('musicSearchInput').value.trim(); if(!q) return;
  musicNextToken=null; musicCurrentQuery=q;
  if(!silent) $('musicResults').innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--ash);font-size:.8rem">Buscando...</div>';
  hideMusicSectionLabel();
  await musicFetchPage(true);
}
function hideMusicSectionLabel(){ const l=qs('#musicSearchSec .msec-lbl.mdisc-lbl'); if(l)l.remove(); }
// "Descobrir": mostra música em alta assim que o painel abre, sem precisar digitar nada
async function musicLoadTrending(){
  musicCurrentQuery=''; musicNextToken=null;
  $('musicResults').innerHTML='<div style="text-align:center;padding:1.5rem;color:var(--ash);font-size:.8rem">Carregando sugestões...</div>';
  try{
    const url=`https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&videoCategoryId=10&regionCode=BR&maxResults=20&key=${encodeURIComponent(YT_API_KEY)}`;
    const res=await fetch(url);
    if(!res.ok){ $('musicResults').innerHTML=''; return; } // silencioso — não é erro crítico, é só a tela inicial
    const data=await res.json();
    if(!data.items?.length){ $('musicResults').innerHTML=''; return; }
    const html=data.items.map(it=>{
      const id=it.id; const sn=it.snippet;
      const thumb=sn.thumbnails?.default?.url||'';
      const title=(sn.title||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      const chan=sn.channelTitle||'';
      return musicTrackRowHtml(id,title,chan,thumb);
    }).join('');
    $('musicResults').innerHTML=`<div class="msec-lbl mdisc-lbl" style="margin-bottom:.15rem">🔥 Em alta agora</div>`+html;
  }catch(e){ $('musicResults').innerHTML=''; console.error(e); }
}
function musicTrackRowHtml(id,title,chan,thumb){
  return `<div class="mtr" onclick="musicAddTrack('${id}','${title.replace(/'/g,"\\'")}','${chan.replace(/'/g,"\\'")}','${thumb}')">
    <img class="mtr-thumb" src="${thumb}" loading="lazy" onerror="this.style.display='none'">
    <div class="mtr-info"><div class="mtr-title">${title}</div><div class="mtr-chan">${chan}</div></div>
    <svg class="mtr-dur" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12"><polygon points="5,3 19,12 5,21"/></svg>
  </div>`;
}
async function musicFetchPage(isNew){
  try{
    let url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=30&key=${encodeURIComponent(YT_API_KEY)}&q=${encodeURIComponent(musicCurrentQuery)}`;
    if(musicNextToken&&!isNew) url+=`&pageToken=${encodeURIComponent(musicNextToken)}`;
    const res=await fetch(url);
    if(!res.ok){$('musicResults').innerHTML='<div style="text-align:center;padding:1rem;color:var(--ash);font-size:.8rem">Erro ao buscar — verifique a YT_API_KEY no código.</div>';return;}
    const data=await res.json();
    musicNextToken=data.nextPageToken||null;
    if(isNew&&!data.items?.length){$('musicResults').innerHTML='<div style="text-align:center;padding:1rem;color:var(--ash);font-size:.8rem">Nenhum resultado</div>';return;}
    const html=data.items.map(it=>{
      const id=it.id.videoId; const sn=it.snippet;
      const thumb=sn.thumbnails?.default?.url||'';
      const title=(sn.title||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      const chan=sn.channelTitle||'';
      return musicTrackRowHtml(id,title,chan,thumb);
    }).join('');
    if(isNew) $('musicResults').innerHTML=html; else $('musicResults').insertAdjacentHTML('beforeend',html);
    if(musicNextToken) $('musicResults').insertAdjacentHTML('beforeend',`<div style="display:flex;justify-content:center;padding:.75rem 0 .25rem"><button class="btn bg2 bsm" onclick="musicFetchPage(false)" style="font-size:.78rem;width:100%">Carregar mais</button></div>`);
  }catch(e){if(isNew)$('musicResults').innerHTML='<div style="text-align:center;padding:1rem;color:var(--ash);font-size:.8rem">Erro ao buscar</div>';console.error(e);}
}
function musicAddTrack(vid,title,artist,thumb){
  if(!room){toast('Entre em uma sala primeiro','err');return;}
  const existing = activeMusicCardId && qs('[data-item-id="'+activeMusicCardId+'"]');
  if(existing){ switchMusicCardTo(existing,vid,title,artist,thumb,true); }
  else{
    const c=$('items'),id='msc_'+Date.now();
    mkMusicCard(vid,title,artist,thumb,60+Math.random()*200,60+Math.random()*160,id,c,true);
    activeMusicCardId=id;
  }
  toast('♪ '+title.slice(0,28)+(title.length>28?'…':''));
  const bar=$('musicNowPlayingBar'); if(bar){bar.style.display='block';$('musicNowTitle').textContent=title;$('musicNowArtist').textContent=artist;}
  // Painel fica aberto de propósito, pra mostrar as sugestões parecidas logo acima do player
  musicShowSimilar(vid,title,artist);
}
/* Troca a faixa dentro do MESMO card/player de música (usa loadVideoById via postMessage,
   sem recriar o iframe) — é o que faz "colocar outra música" nunca abrir um card novo. */
function switchMusicCardTo(card,vid,title,artist,thumb,broadcastIt){
  const uid=card.dataset.ytuid;
  card.dataset.vid=vid; card.dataset.title=title; card.dataset.artist=artist; card.dataset.thumb=thumb;
  const titleEl=card.querySelector('.music-title'); if(titleEl){titleEl.textContent=title;titleEl.title=title;}
  const artistEl=card.querySelector('.music-artist'); if(artistEl)artistEl.textContent=artist;
  const p=ytPlrs[uid]; if(p&&p.loadVideoById)p.loadVideoById(vid);
  if(broadcastIt)broadcast({type:'MEDIA_SWITCH_MUSIC',itemId:card.dataset.itemId,vid,title,artist,thumb});
}
function applyMusicSwitch(itemId,vid,title,artist,thumb){
  const card=qs('[data-item-id="'+itemId+'"]'); if(!card)return;
  switchMusicCardTo(card,vid,title,artist,thumb,false);
}
// Sugere músicas parecidas com a que acabou de ser escolhida, sem precisar saber nomes de outras faixas
async function musicShowSimilar(vid,title,artist){
  const sec=$('musicSimilarSec'), grid=$('musicSimilarResults');
  sec.style.display='flex'; grid.innerHTML='<div style="color:var(--ash);font-size:.72rem;padding:.4rem 0">Buscando parecidas...</div>';
  try{
    // Tenta usar as tags reais do vídeo (mais preciso); se não tiver, cai pro artista/título
    let query=artist||title;
    try{
      const infoUrl=`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(vid)}&key=${encodeURIComponent(YT_API_KEY)}`;
      const infoRes=await fetch(infoUrl);
      if(infoRes.ok){
        const infoData=await infoRes.json();
        const tags=infoData.items?.[0]?.snippet?.tags;
        if(tags?.length) query=tags.slice(0,3).join(' ');
      }
    }catch(e){}
    const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&key=${encodeURIComponent(YT_API_KEY)}&q=${encodeURIComponent(query)}`;
    const res=await fetch(url);
    if(!res.ok){ grid.innerHTML=''; sec.style.display='none'; return; }
    const data=await res.json();
    const items=(data.items||[]).filter(it=>it.id.videoId!==vid).slice(0,8);
    if(!items.length){ sec.style.display='none'; return; }
    grid.innerHTML=items.map(it=>{
      const id=it.id.videoId, sn=it.snippet;
      const thumb=sn.thumbnails?.default?.url||'';
      const t=(sn.title||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      const chan=sn.channelTitle||'';
      return `<div class="msug" onclick="musicAddTrack('${id}','${t.replace(/'/g,"\\'")}','${chan.replace(/'/g,"\\'")}','${thumb}')">
        <img src="${thumb}" loading="lazy" onerror="this.style.display='none'"><span>${t}</span>
      </div>`;
    }).join('');
  }catch(e){ sec.style.display='none'; console.error(e); }
}
function mkMusicCard(vid,title,artist,thumb,x,y,id,container,emit){
  const uid='mcp_'+id;
  const cardW=340, cardH=200;
  const w=document.createElement('div'); w.className='card music-card'; w.dataset.type='music'; w.dataset.vid=vid; w.dataset.itemId=id; w.dataset.ytuid=uid; w.dataset.title=title; w.dataset.artist=artist; w.dataset.thumb=thumb;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:cardW+'px',height:cardH+'px',display:'flex',flexDirection:'column'});
  const titleSafe=title.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const artistSafe=artist.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  w.innerHTML=`
    <div class="ch" style="flex-shrink:0"><span class="ct">♪ Música</span><button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div>
    <div class="music-card-inner">
      <div class="disc-wrap" id="disc-${uid}">
        <div class="disc-ring"></div>
        <div class="disc-ring2"></div>
        <img class="disc-art" src="${DISC_THEME_URL}" onerror="this.style.background='var(--ridge)';this.src=''" alt="">
      </div>
      <div class="music-info" style="flex:1;min-width:0">
        <div class="music-title" title="${titleSafe}">${titleSafe}</div>
        <div class="music-artist">${artistSafe}</div>
        <div class="music-ctrls">
          <button class="mcbtn" onclick="mSeek('${uid}',-10)" title="-10s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 100-.49"/></svg></button>
          <button class="mcbtn play-btn" id="mplay-${uid}" onclick="mToggle('${uid}')"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>
          <button class="mcbtn" onclick="mSeek('${uid}',10)" title="+10s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 110-.49"/></svg></button>
        </div>
        <div class="music-prog">
          <div class="prog-bar-wrap" onclick="mProgClick(event,'${uid}')">
            <div class="prog-bar-fill" id="mprog-${uid}"></div>
          </div>
          <div class="prog-times"><span id="mct-${uid}">0:00</span><span id="mdt-${uid}">—:——</span></div>
        </div>
      </div>
    </div>
    <div id="mypc-${uid}" style="position:absolute;right:1px;bottom:1px;width:2px;height:2px;overflow:hidden;opacity:.01;pointer-events:none"></div>`;
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  container.appendChild(w); els.push(w);
  if(emit) broadcast({type:'ADD_ITEM',item:{type:'music',vid,title,artist,thumb,x,y,id}});
  setTimeout(()=>initMusicYT(uid,vid),300);
}
let mPlaying={};
function initMusicYT(uid,vid){
  const cont=document.getElementById('mypc-'+uid); if(!cont||cont.dataset.ytinit)return; cont.dataset.ytinit='1';
  const origin=location.origin||'https://localhost';
  const src=`https://www.youtube.com/embed/${vid}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&controls=0&iv_load_policy=3&origin=${encodeURIComponent(origin)}`;
  const ifr=document.createElement('iframe');
  ifr.src=src; ifr.width='1'; ifr.height='1';
  ifr.style.cssText='border:none;display:block;width:1px;height:1px;'; 
  ifr.allow='autoplay; fullscreen; encrypted-media; picture-in-picture'; ifr.setAttribute('playsinline','');
  cont.appendChild(ifr);
  let _base=0,_playing=false,_wall=0,_dur=0;
  const msg=(func,args)=>{try{ifr.contentWindow.postMessage(JSON.stringify({event:'command',func,args:args||''}),'*');}catch(e){}};
  const proxy={
    playVideo(){desiredPlaying[uid]=true;_base=proxy.getCurrentTime();_wall=Date.now();_playing=true;msg('playVideo');setDiscPlaying(uid,true);setPlayIcon(uid,true);},
    pauseVideo(){desiredPlaying[uid]=false;_base=proxy.getCurrentTime();_playing=false;msg('pauseVideo');setDiscPlaying(uid,false);setPlayIcon(uid,false);},
    togglePlay(){if(_playing)proxy.pauseVideo();else proxy.playVideo();},
    seekTo(t){_base=t;_wall=Date.now();msg('seekTo',[t,true]);},
    loadVideoById(newVid){ suppressSync(uid,2000); _base=0;_wall=Date.now();_dur=0;_playing=true;desiredPlaying[uid]=true; msg('loadVideoById',[newVid]); setDiscPlaying(uid,true); setPlayIcon(uid,true); },
    getCurrentTime(){return _playing?_base+(Date.now()-_wall)/1000:_base;},
    getDuration(){return _dur;},
    isPlaying(){return _playing;}
  };
  ytPlrs[uid]=proxy; mPlaying[uid]=false; desiredPlaying[uid]=false;
  window.addEventListener('message',ev=>{
    if(ev.source!==ifr.contentWindow)return; // sem isso, cards de música diferentes brigavam pelo mesmo estado (disco/ícone/progresso trocados)
    try{
      const d=JSON.parse(ev.data);
      if(d.event==='onStateChange'){
        if(d.info===1){_base=proxy.getCurrentTime();_wall=Date.now();_playing=true;desiredPlaying[uid]=true;setDiscPlaying(uid,true);setPlayIcon(uid,true);if(!isSuppressed(uid))broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:_base});}
        else if(d.info===2||d.info===0){_base=proxy.getCurrentTime();_playing=false;desiredPlaying[uid]=false;setDiscPlaying(uid,false);setPlayIcon(uid,false);if(!isSuppressed(uid))broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:_base});}
      }
      if(d.event==='onError'){ toast('Essa música não pôde ser reproduzida (indisponível/bloqueada)','err'); }
      if(!_playing&&d.info?.currentTime!=null)_base=d.info.currentTime;
      if(d.info?.duration)_dur=d.info.duration;
    }catch(e){}
  });
  setInterval(()=>{
    const ct=document.getElementById('mct-'+uid),prog=document.getElementById('mprog-'+uid),dt=document.getElementById('mdt-'+uid);
    if(!ct)return;
    const t=proxy.getCurrentTime(),dur=_dur;
    ct.textContent=fmtTime(t);
    if(dur>0){if(dt)dt.textContent=fmtTime(dur);if(prog)prog.style.width=Math.min(100,(t/dur)*100)+'%';}
  },500);
}
function setDiscPlaying(uid,playing){
  const disc=document.getElementById('disc-'+uid); if(!disc)return;
  if(playing)disc.classList.add('disc-playing'); else disc.classList.remove('disc-playing');
}
function setPlayIcon(uid,playing){
  const btn=document.getElementById('mplay-'+uid); if(!btn)return;
  btn.innerHTML=playing?
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>':
    '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
}
function mToggle(uid){const p=ytPlrs[uid];if(!p)return;if(p.isPlaying()){p.pauseVideo();broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:p.getCurrentTime()});}else{p.playVideo();broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:p.getCurrentTime()});}}
function mSeek(uid,d){const p=ytPlrs[uid];if(!p)return;const t=Math.max(0,(p.getCurrentTime()||0)+d);p.seekTo(t);broadcast({type:'VID_SYNC',uid_player:uid,action:p.isPlaying()?'play':'pause',time:t});}
function mProgClick(e,uid){const p=ytPlrs[uid];if(!p)return;const r=e.currentTarget.getBoundingClientRect();const pct=(e.clientX-r.left)/r.width;const dur=p.getDuration();if(dur>0){const t=pct*dur;p.seekTo(t);broadcast({type:'VID_SYNC',uid_player:uid,action:p.isPlaying()?'play':'pause',time:t});}}

/* ── YOUTUBE PANEL ── */
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
      {name:'floorGain', defaultValue:0.05,  minValue:0,      maxValue:1,   automationRate:'k-rate'},
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
        if(this.noiseFloor > 0.05)   this.noiseFloor = 0.05;
      }

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
    localAnalyser=callAudioCtx.createAnalyser(); localAnalyser.fftSize=512; localAnalyser.smoothingTimeConstant=0.5;
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
    noiseGateNode.parameters.get('floorGain').value = 0.05;
    noiseGateNode.parameters.get('enabled').value   = noiseGateEnabled?1:0;
  }catch(e){}
}
function updateNoiseGateSensitivity(val){
  noiseGateSensitivity=Math.max(0,Math.min(1,val/100));
  applyGateParams();
}
function toggleNoiseGate(){
  noiseGateEnabled=!noiseGateEnabled;
  applyGateParams();
  const b=$('gateToggleBtn'); if(b){ b.classList.toggle('cbtn-off',!noiseGateEnabled); b.textContent=noiseGateEnabled?'Supressor ligado':'Supressor desligado'; }
  toast(noiseGateEnabled?'Supressor de ruído ligado':'Supressor de ruído desligado');
}

/* ── entrar/sair da chamada ── */
async function joinCall(){
  if(!room){toast('Entre em uma sala primeiro','err');return;}
  if(callActive)return;
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:{
      echoCancellation:true, noiseSuppression:true, autoGainControl:true,
      channelCount:1,          // voz é mono: metade dos dados, zero perda de qualidade
      sampleRate:48000,        // taxa nativa do Opus, evita reamostragem
      latency:0.01
    },video:false});
  }catch(e){
    toast('Não foi possível acessar o microfone — verifique as permissões do navegador','err');
    return;
  }
  localRawStream=stream;
  callAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(callAudioCtx.state==='suspended'){ try{await callAudioCtx.resume();}catch(e){} }
  localSentStream=await setupNoiseGate(localRawStream);
  callActive=true; localMuted=false; localDeafened=false;
  const idle=$('callActionsIdle'), active=$('callActionsActive');
  if(idle)idle.style.display='none'; if(active)active.style.display='flex';
  renderSelfCallRow();
  updateCallMuteBtnUI(); updateCallDeafenBtnUI();
  startCallMeterLoop();
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
  localAnalyser=null; cancelAnimationFrame(callMeterRAF); callMeterRAF=null;
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
    audioEl.play?.catch(()=>{}); // autoplay pode exigir um play() explícito em alguns navegadores
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
