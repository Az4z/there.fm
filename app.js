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

/* ── STATE ── */
let U        = {name:'',email:'',photo:'',id:'',color:'#c45c5c',username:'',bio:'',banner:null,frame:null,frame_scale:1,frame_x:0,frame_y:0};
let room     = null;
let els      = [];
let peers    = {};
let ytPlrs   = {};  // uid -> YT.Player
let ytReady  = false;
let gifMode  = 'canvas';
let tbPos    = 'top';
let pendImg  = null;
let zTop     = 10;
let hbTimer  = null;
let _supa    = null;
let _ch      = null;
let channel  = null; // alias for _ch
let ytGToken = localStorage.getItem('tfm_yt_token') || null; // Google OAuth access token para YouTube Data API

/* pendências de upload de perfil */
let pendingAvatarFile = null;
let pendingBannerFile = null;

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
function goAuth(){ setScene('authScene'); $('msgbar').classList.remove('show'); $('ytPanel').classList.remove('on'); hideChatFab(); }
function goLanding(){ setScene('landingScene'); $('msgbar').classList.remove('show'); $('ytPanel').classList.remove('on'); if(U.id){ subscribeIncomingDMs(); showChatFab(); } }
function goRoom(){ setScene('roomScene'); $('msgbar').classList.add('show'); hideChatFab(); }
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
  'https://i.postimg.cc/Sjb0Y6SP/Picsart-26-08-21-05-05-51-656.png'
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
  $('pubName').textContent=p.name||'Usuário'; $('pubUname').textContent=p.username?('@'+p.username):''; $('pubBio').textContent=p.bio||'';
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
    lbl.innerHTML=`<span class="member-name">${p.name||'Usuário'}</span>${p.username?`<span class="member-uname">@${p.username}</span>`:''}`;
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
    info.innerHTML=`<div class="fhub-name">${(p&&p.name)||'Usuário'}${unread?' <span style="color:var(--green)">•</span>':''}</div><div class="fhub-sub">${(last.sender===U.id?'Você: ':'')+(last.content||'').slice(0,40)}</div>`;
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
    info.innerHTML=`<div class="fhub-name">${(p&&p.name)||'Usuário'}</div><div class="fhub-sub">${p&&p.username?'@'+p.username:'quer ser seu amigo'}</div>`;
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
  wrap.appendChild(mkAvEl(U)); wrap.appendChild(mkAvName(U.name||'Você'));
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
function mkAvName(name){ const lbl=document.createElement('div'); lbl.className='av-name'; lbl.textContent=name||'User'; return lbl; }
function refreshAv(wrap,u){ const av=wrap.querySelector('.av'),lbl=wrap.querySelector('.av-name'); if(av)av.innerHTML=avatarHTML(u); if(lbl)lbl.textContent=u.name||'Você'; }

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
    case 'LEAVE':   removePeer(msg.uid); break;
    case 'MOVE_AV': movePeerAv(msg.uid,msg.x,msg.y); break;
    case 'CHAT':    showPeerBubble(msg.uid,msg.text,false); break;
    case 'GIF_CHAT':showPeerBubble(msg.uid,msg.url,true); break;
    case 'ADD_ITEM':    applyAdd(msg.item); break;
    case 'REMOVE_ITEM': applyRm(msg.itemId); break;
    case 'MOVE_ITEM':   applyMv(msg.itemId,msg.x,msg.y); break;
    case 'RESIZE_ITEM': applyRz(msg.itemId,msg.w,msg.h); break;
    case 'VID_SYNC':    applyVS(msg.uid_player,msg.action,msg.time); break;
    case 'DRAW_STROKE': applyDS(msg); break;
    case 'DRAW_CLEAR':  $('drawCanvas').getContext('2d').clearRect(0,0,$('drawCanvas').width,$('drawCanvas').height); break;
    case 'STATE_SYNC':  if(msg.to===U.id)applyState(msg); break;
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
    wrap.appendChild(mkAvEl(info)); wrap.appendChild(mkAvName(info.name||'User'));
    $('items').appendChild(wrap);
  } else {
    refreshAv(wrap,info);
  }
  upsertPart(uid,info);
}
function movePeerAv(uid,x,y){ const w=qs('.av-wrap[data-uid="'+uid+'"]'); if(w){w.style.left=x+'px';w.style.top=y+'px';} if(peers[uid])peers[uid].ts=Date.now(); }
function removePeer(uid){ delete peers[uid]; const w=qs('.av-wrap[data-uid="'+uid+'"]'); if(w)w.remove(); const li=qs('.pi[data-uid="'+uid+'"]'); if(li)li.remove(); }
function showPeerBubble(uid,c,gif){ const w=qs('.av-wrap[data-uid="'+uid+'"]'); if(w)showBubble(w,c,gif); }

/* ── STATE SYNC ── */
function sendState(toUid){
  const items=els.filter(e=>e.dataset.itemId).map(e=>{
    const item={type:e.dataset.type,id:e.dataset.itemId,x:parseInt(e.style.left)||0,y:parseInt(e.style.top)||0,w:parseInt(e.style.width)||0,h:parseInt(e.style.height)||0,src:e.dataset.src||'',vid:e.dataset.vid||''};
    if(e.dataset.type==='music'){item.title=e.dataset.title||'';item.artist=e.dataset.artist||'';item.thumb=e.dataset.thumb||'';}
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
function applyState(msg){
  const c=$('items');
  (msg.items||[]).forEach(item=>{
    if(qs('[data-item-id="'+item.id+'"]'))return;
    if(item.type==='gif')mkGif(item.src,item.x,item.y,item.id,c,false);
    else if(item.type==='image')mkImg(item.src,item.x,item.y,item.id,c,false);
    else if(item.type==='video')mkVid(item.vid,item.x,item.y,item.id,c,false);
    else if(item.type==='music')mkMusicCard(item.vid,item.title||'Música',item.artist||'',item.thumb||'',item.x,item.y,item.id,c,false);
    const el=qs('[data-item-id="'+item.id+'"]');
    if(el&&item.w>0)el.style.width=item.w+'px';
    if(el&&item.h>0)el.style.height=item.h+'px';
  });
  if(msg.drawImg?.length>100){
    const dc=$('drawCanvas'),ctx=dc.getContext('2d'),img=new Image();
    img.onload=()=>ctx.drawImage(img,0,0,dc.width,dc.height); img.src=msg.drawImg;
  }
}
function applyAdd(item){ if(!item||qs('[data-item-id="'+item.id+'"]'))return; const c=$('items'); if(item.type==='gif')mkGif(item.src,item.x,item.y,item.id,c,false); else if(item.type==='image')mkImg(item.src,item.x,item.y,item.id,c,false); else if(item.type==='video')mkVid(item.vid,item.x,item.y,item.id,c,false); else if(item.type==='music')mkMusicCard(item.vid,item.title||'Música',item.artist||'',item.thumb||'',item.x,item.y,item.id,c,false); }
function applyRm(id){ const el=qs('[data-item-id="'+id+'"]'); if(el){el.remove();els=els.filter(e=>e!==el);} }
function applyMv(id,x,y){ const el=qs('[data-item-id="'+id+'"]'); if(el){el.style.left=x+'px';el.style.top=y+'px';} }
function applyRz(id,w,h){ const el=qs('[data-item-id="'+id+'"]'); if(el){el.style.width=w+'px';el.style.height=h+'px'; const uid=el.dataset.ytuid; if(uid){const ypc=$('ypc-'+uid);if(ypc){ypc.style.width=w+'px';ypc.style.height=Math.max(80,h-HEAD-CTRL)+'px';} const p=ytPlrs[uid];if(p&&p.setSize)p.setSize(Math.round(w),Math.max(80,Math.round(h)-HEAD-CTRL));}} }
function applyVS(uid,action,time){ const p=ytPlrs[uid]; if(!p)return; try{if(Math.abs(p.getCurrentTime()-time)>1.5)p.seekTo(time,true);if(action==='play')p.playVideo();else if(action==='pause')p.pauseVideo();}catch(e){} }

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
function addUniversalVideo(url){
  url = (typeof url==='string' ? url : $('univVideoUrl').value).trim(); if(!url){toast('Cole uma URL','err');return;}
  const c=$('items'), id='vid_'+Date.now();
  const x=60+Math.random()*180, y=60+Math.random()*160;
  const ytId=extractYT(url);
  if(ytId){ mkVid(ytId,x,y,id,c,true); $('univVideoPanel').classList.remove('on'); toast('YouTube adicionado · SYNC'); return; }
  const vimId=extractVimeo(url);
  if(vimId){ mkIframeVid('https://player.vimeo.com/video/'+vimId+'?autoplay=0',x,y,id,c,'Vimeo'); $('univVideoPanel').classList.remove('on'); toast('Vimeo adicionado'); return; }
  const tw=extractTwitch(url);
  if(tw){
    const parent=encodeURIComponent(location.hostname);
    let src;
    if(tw.type==='video')src=`https://player.twitch.tv/?video=${tw.id}&parent=${parent}&autoplay=false`;
    else if(tw.type==='clip')src=`https://clips.twitch.tv/embed?clip=${tw.id}&parent=${parent}&autoplay=false`;
    else src=`https://player.twitch.tv/?channel=${tw.id}&parent=${parent}&autoplay=false`;
    mkIframeVid(src,x,y,id,c,'Twitch'); $('univVideoPanel').classList.remove('on'); toast('Twitch adicionado'); return;
  }
  if(isHLS(url) || isDirectVideo(url)){ mkHtmlVid(url,x,y,id,c); $('univVideoPanel').classList.remove('on'); toast('Vídeo direto adicionado'); return; }
  // Generic iframe attempt
  mkIframeVid(url,x,y,id,c,'Vídeo'); $('univVideoPanel').classList.remove('on'); toast('Vídeo incorporado (iframe)');
}
/* ── BROWSE TAB ── */
function uvSwitchTab(tab){
  const isLink=tab==='link';
  $('uvTabLink').style.display=isLink?'block':'none';
  $('uvTabBrowse').style.display=isLink?'none':'block';
  $('uvTabLinkBtn').classList.toggle('active',isLink);
  $('uvTabBrowseBtn').classList.toggle('active',!isLink);
}
function uvBrowseGo(){
  let url=$('uvBrowseUrl').value.trim(); if(!url)return;
  if(!/^https?:\/\//i.test(url))url='https://'+url;
  $('uvBrowseUrl').value=url;
  const hint=$('uvBrowseHint'); if(hint)hint.style.display='none';
  $('uvBrowseFrame').src=url;
}
function uvBrowseConnect(){
  const url=$('uvBrowseUrl').value.trim();
  if(!url){toast('Navegue até uma página primeiro','err');return;}
  addUniversalVideo(url);
}
function mkIframeVid(embedUrl,x,y,id,container,label){
  const w=document.createElement('div'); w.className='card vid-card'; w.dataset.type='video'; w.dataset.vid=''; w.dataset.itemId=id;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:VID_W+'px',height:(HEAD+VID_H+CTRL)+'px',display:'flex',flexDirection:'column'});
  const ifr=document.createElement('iframe'); ifr.src=embedUrl;
  ifr.style.cssText='border:none;display:block;width:100%;flex:1;min-height:0;';
  ifr.allow='autoplay; fullscreen; encrypted-media; picture-in-picture'; ifr.allowFullscreen=true;
  w.innerHTML=`<div class="ch" style="height:${HEAD}px;flex-shrink:0"><span class="ct">▶ ${label}</span><div style="display:flex;align-items:center;gap:.38rem"><button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div></div>`;
  w.appendChild(ifr);
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  container.appendChild(w); els.push(w);
}
function mkHtmlVid(src,x,y,id,container){
  const w=document.createElement('div'); w.className='card vid-card'; w.dataset.type='video'; w.dataset.vid=''; w.dataset.itemId=id;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:VID_W+'px',height:(HEAD+VID_H+CTRL)+'px',display:'flex',flexDirection:'column'});
  const label=isHLS(src)?'Live/HLS':'Vídeo';
  w.innerHTML=`<div class="ch" style="height:${HEAD}px;flex-shrink:0"><span class="ct">▶ ${label}</span><button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div><video controls preload="metadata" playsinline style="flex:1;width:100%;min-height:0;background:#000;display:block;object-fit:contain"></video>`;
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  container.appendChild(w); els.push(w);
  const vidEl=w.querySelector('video');
  if(isHLS(src)){
    if(vidEl.canPlayType('application/vnd.apple.mpegurl')){
      // Safari/iOS: suporte nativo a HLS
      vidEl.src=src;
    }else if(window.Hls && Hls.isSupported()){
      const hls=new Hls();
      hls.loadSource(src);
      hls.attachMedia(vidEl);
    }else{
      // hls.js ainda não carregou ou não é suportado — tenta de novo em breve
      let tries=0;
      const wait=setInterval(()=>{
        tries++;
        if(window.Hls && Hls.isSupported()){ clearInterval(wait); const hls=new Hls(); hls.loadSource(src); hls.attachMedia(vidEl); }
        else if(tries>20){ clearInterval(wait); vidEl.src=src; }
      },150);
    }
  }else{
    vidEl.src=src;
  }
}
/* Keep old openVideoModal as alias */
function openVideoModal(){ openUniversalVideoPanel(); }
function addVideo(){ addUniversalVideo(); }
function mkVid(vid,x,y,id,container,broadcastIt){
  const uid='ytp_'+id;
  const w=document.createElement('div'); w.className='card vid-card'; w.dataset.type='video'; w.dataset.vid=vid; w.dataset.itemId=id; w.dataset.ytuid=uid;
  Object.assign(w.style,{position:'absolute',left:x+'px',top:y+'px',zIndex:++zTop,width:VID_W+'px',height:(HEAD+VID_H+CTRL)+'px',display:'flex',flexDirection:'column'});
  w.innerHTML=`<div class="ch" style="height:${HEAD}px;flex-shrink:0"><span class="ct">▶ YouTube</span><div style="display:flex;align-items:center;gap:.38rem"><span class="vsync">SYNC</span><a class="vcbtn" href="https://www.youtube.com/watch?v=${vid}" target="_blank" rel="noopener" title="Abrir no YouTube" style="line-height:0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg></a><button class="cx" onclick="removeEl(this.closest('.card'))">×</button></div></div><div id="ypc-${uid}" style="flex-shrink:0;width:${VID_W}px;height:${VID_H}px;background:#000;overflow:hidden;position:relative"></div><div class="vctrl" style="height:${CTRL}px;flex-shrink:0"><button class="vcbtn" onclick="vPlay('${uid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5,3 19,12 5,21"/></svg></button><button class="vcbtn" onclick="vPause('${uid}')"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button><button class="vcbtn" onclick="vSeek('${uid}',-10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 100-.49"/></svg></button><button class="vcbtn" onclick="vSeek('${uid}',10)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 110-.49"/></svg></button><span class="vtime" id="vt-${uid}">0:00</span></div>`;
  const rzh=document.createElement('div'); rzh.className='rzh'; w.appendChild(rzh);
  container.appendChild(w); els.push(w);
  if(broadcastIt)broadcast({type:'ADD_ITEM',item:{type:'video',vid,x,y,id}});
  setTimeout(()=>initYT(uid,vid,VID_W,VID_H),300);
}
function initYT(uid,vid,iw,ih,_retries){
  /* ── DESKTOP: YT IFrame API padrão ──────────────────────────────────── */
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
      onReady:()=>{ ytPlrs[uid]=p; setInterval(()=>{ const el=$('vt-'+uid); if(!el)return; try{el.textContent=fmtTime(p.getCurrentTime()||0);}catch(e){} },500); },
      onStateChange:e=>{ if(e.data===YT.PlayerState.PLAYING)broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:p.getCurrentTime()}); if(e.data===YT.PlayerState.PAUSED)broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:p.getCurrentTime()}); }
    }});
}
function vPlay(uid){ const p=ytPlrs[uid]; if(p){p.playVideo();broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:p.getCurrentTime()});} }
function vPause(uid){ const p=ytPlrs[uid]; if(p){p.pauseVideo();broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:p.getCurrentTime()});} }
function vSeek(uid,d){ const p=ytPlrs[uid]; if(p){const t=Math.max(0,(p.getCurrentTime()||0)+d);p.seekTo(t,true);broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:t});} }

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
function removeEl(el){ if(!el)return; const id=el.dataset.itemId; el.remove(); els=els.filter(e=>e!==el); if(id)broadcast({type:'REMOVE_ITEM',itemId:id}); toast('Removido'); }

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
  const c=$('items'),id='msc_'+Date.now();
  mkMusicCard(vid,title,artist,thumb,60+Math.random()*200,60+Math.random()*160,id,c,true);
  toast('♪ '+title.slice(0,28)+(title.length>28?'…':''));
  const bar=$('musicNowPlayingBar'); if(bar){bar.style.display='block';$('musicNowTitle').textContent=title;$('musicNowArtist').textContent=artist;}
  // Painel fica aberto de propósito, pra mostrar as sugestões parecidas logo acima do player
  musicShowSimilar(vid,title,artist);
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
    <div id="mypc-${uid}" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden"></div>`;
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
    playVideo(){_base=proxy.getCurrentTime();_wall=Date.now();_playing=true;msg('playVideo');setDiscPlaying(uid,true);setPlayIcon(uid,true);},
    pauseVideo(){_base=proxy.getCurrentTime();_playing=false;msg('pauseVideo');setDiscPlaying(uid,false);setPlayIcon(uid,false);},
    togglePlay(){if(_playing)proxy.pauseVideo();else proxy.playVideo();},
    seekTo(t){_base=t;_wall=Date.now();msg('seekTo',[t,true]);},
    getCurrentTime(){return _playing?_base+(Date.now()-_wall)/1000:_base;},
    getDuration(){return _dur;},
    isPlaying(){return _playing;}
  };
  ytPlrs[uid]=proxy; mPlaying[uid]=false;
  window.addEventListener('message',ev=>{
    if(ev.source!==ifr.contentWindow)return; // sem isso, cards de música diferentes brigavam pelo mesmo estado (disco/ícone/progresso trocados)
    try{
      const d=JSON.parse(ev.data);
      if(d.event==='onStateChange'){
        if(d.info===1){_base=proxy.getCurrentTime();_wall=Date.now();_playing=true;setDiscPlaying(uid,true);setPlayIcon(uid,true);broadcast({type:'VID_SYNC',uid_player:uid,action:'play',time:_base});}
        else if(d.info===2||d.info===0){_base=proxy.getCurrentTime();_playing=false;setDiscPlaying(uid,false);setPlayIcon(uid,false);broadcast({type:'VID_SYNC',uid_player:uid,action:'pause',time:_base});}
      }
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
  const c=$('items'),id='vid_'+Date.now();
  mkVid(vid,60+Math.random()*180,60+Math.random()*160,id,c,true);
  closeYtPanel();
  toast('Adicionado: '+title.slice(0,30)+(title.length>30?'…':''));
}

/* ── PARTICIPANTS ── */
function toggleParts(){ $('parts').classList.toggle('on'); }
function upsertPart(uid,info,label){
  let li=qs('.pi[data-uid="'+uid+'"]');
  if(!li){li=document.createElement('div');li.className='pi';li.dataset.uid=uid;li.style.cursor='pointer';li.onclick=()=>openProfile(uid);$('partsList').appendChild(li);}
  const avHtml=info.photo?`<img src="${info.photo}">`:(info.name||'?').charAt(0).toUpperCase();
  li.innerHTML=`<div class="pav"><div class="pav-fill" style="background:${info.color||'#c45c5c'}">${avHtml}</div>${frameOverlayHTML(info)}</div><div><div class="pname">${info.name||'User'}</div><div class="pstatus">${label||'Online'}</div></div>`;
}
