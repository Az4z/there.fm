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
async function leaveRoom(){
  if(!await customConfirm('Sair da sala?',{okLabel:'Sair',danger:true}))return;
  if(callActive)endCall();
  /* Fecha o navegador embutido ANTES de sair. Sem isto ele continuava aberto por
     cima da tela inicial, com o vídeo tocando sobre o menu — porque a janela do
     navegador é nativa e não pertence à sala: trocar de tela no aplicativo não a
     remove sozinha. */
  await fecharNavegadorSeAberto();
  closeChannel(); stopHB(); room=null; els=[]; ytPlrs={}; peers={};
  $('items').innerHTML=''; $('parts').classList.remove('on');
  goLanding();
}
/* Fecha o navegador embutido, se existir. Silencioso e seguro: no site (sem o
   aplicativo) simplesmente não faz nada. */
async function fecharNavegadorSeAberto(){
  try{
    if(typeof fecharTheaterLocal==='function') await fecharTheaterLocal();
  }catch(e){ console.warn('fecharNavegadorSeAberto',e); }
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
/* Cores montadas em JS: color-mix() não existe em navegadores mais antigos e,
   quando falha, a regra inteira é descartada e o chip fica invisível. */
function hexToRgb(h){
  h=String(h||'').replace('#','');
  if(h.length===3) h=h.split('').map(c=>c+c).join('');
  const n=parseInt(h||'e0a35c',16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}
function tagChipHTML(t,small){
  const c=t.color||'#e0a35c';
  const [r,g,b]=hexToRgb(c);
  const st=`color:${c};background:rgba(${r},${g},${b},.14);border:1px solid rgba(${r},${g},${b},.45);`
    +`box-shadow:0 0 10px rgba(${r},${g},${b},.18);`+(small?'font-size:.62rem;':'');
  return `<span class="ptag" style="${st}">${escapeHtml(t.label||'')}</span>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

/* Reconstrói SEMPRE a linha inteira (nome + Owner + tags) de uma vez.
   Antes, as tags eram injetadas dentro de um <span> criado por openProfile; se a
   ordem de execução mudasse, ou se aquele span fosse recriado, as tags sumiam.
   Agora existe uma única fonte de verdade e nada depende de quem desenhou antes. */
let _profileCtx={ uid:null, name:'' };
function renderNameRow(){
  const el=$('pubName'); if(!el||!_profileCtx.uid) return;
  const tags=_tagCache[_profileCtx.uid]||[];
  let tagsHtml='';
  if(tags.length){
    const extra=tags.length-1;
    tagsHtml='<span class="ptags">'+tagChipHTML(tags[0])
      +(extra>0?`<span class="ptag-more" onclick="openTagsPop('${_profileCtx.uid}')" title="Ver todas as tags">+</span>`:'')
      +'</span>';
  }
  const _nc=_profileCtx.nameColor?` style="color:${_profileCtx.nameColor}"`:'';
  el.innerHTML='<span class="pname-row">'
    +`<span class="pname-txt"${_nc}>${escapeHtml(_profileCtx.name)}</span>`
    +(isOwnerUid(_profileCtx.uid)?ownerBadgeHTML():'')
    +tagsHtml
    +'</span>';
}
async function renderProfileTags(uid){
  _tagCtxUid=uid;
  const admin=$('pubTagAdmin'); if(admin) admin.innerHTML='';
  const tags=await loadProfileTags(uid,true);
  if(_profileCtx.uid===uid) renderNameRow();   // já com as tags carregadas
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
  list.innerHTML=tags.length?tags.map(t=>{
    const [r,g,b]=hexToRgb(t.color||'#e0a35c');
    const st=`color:${t.color||'#e0a35c'};background:rgba(${r},${g},${b},.14);border:1px solid rgba(${r},${g},${b},.45);`;
    return `<span class="ptag ptag-editable" style="${st}">${escapeHtml(t.label)}<b onclick="removeProfileTag('${t.id}')" title="Remover">×</b></span>`;
  }).join(''):'<span class="ptag-empty">Nenhuma tag ainda</span>';
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
/* ══════════════════════════════════════════════════════════════════
   CONEXÃO COM RECONEXÃO AUTOMÁTICA
   Antes, quando o canal caía (wi-fi oscilando, celular trocando de rede,
   tela bloqueada, sinal fraco), o app apenas ATUALIZAVA O TEXTO de status
   e ficava parado pra sempre — sem tentar voltar. Era essa a causa de
   "depois de um tempo um some pro outro mas continua na sala": os dois
   seguiam com a tela aberta, mas o canal já estava morto e nenhum
   heartbeat chegava, então cada um removia o outro por timeout.
   Agora: detecta a queda, tenta reconectar com espera crescente, e ao
   voltar se reapresenta e pede o estado atual da sala de volta.
   ══════════════════════════════════════════════════════════════════ */
let _reconnectTries=0, _reconnectTimer=null, _reconnecting=false, _roomCode=null;

function openChannel(code){
  closeChannel();
  _roomCode=code;
  _fechandoDeProposito=false;
  _reconnectTries=0; _reconnecting=false; _caiuDeVerdade=false; _avisouDesistencia=false;
  reopenChannelKeepingState(code);   // um caminho só: menos chance de divergirem
}
function announceSelf(){
  const av=qs('.av-wrap[data-uid="'+U.id+'"]');
  broadcast({type:'JOIN',uid:U.id,name:U.name,color:U.color,photo:U.photo,frame:U.frame,
             frame_scale:U.frame_scale,frame_x:U.frame_x,frame_y:U.frame_y,
             x:av?parseInt(av.style.left)||200:200, y:av?parseInt(av.style.top)||200:200});
}
/* Espera crescente (1s, 2s, 4s... até 15s) pra não martelar o servidor
   quando a rede está fora — e volta rápido quando é só um soluço curto. */
/* ══════════════════════════════════════════════════════════════════
   RECONEXÃO — reescrita.

   O que estava errado (o "reconectando sem parar"):
   • Cada tentativa criava um canal novo, mas o antigo continuava vivo e ainda
     disparando CHANNEL_ERROR/CLOSED. Cada um desses disparos agendava OUTRA
     reconexão — o número de tentativas crescia sozinho, em avalanche.
   • O aviso "Reconectado" aparecia toda vez que o canal reportava sucesso,
     mesmo quando nada tinha caído de fato: daí a enxurrada de notificações.
   • Fechar a sala de propósito também contava como queda e disparava tudo isso.

   Agora: só existe UMA tentativa em andamento por vez, o canal antigo é
   descartado antes de abrir o próximo, e o aviso só aparece quando houve mesmo
   uma queda. Depois de várias falhas seguidas o app para e avisa, em vez de
   ficar tentando para sempre.
   ══════════════════════════════════════════════════════════════════ */
const MAX_TENTATIVAS = 8;
let _fechandoDeProposito = false;   // sair da sala não é queda
let _caiuDeVerdade = false;         // controla se o "Reconectado" faz sentido
let _chGeracao = 0;                 // identifica o canal atual; os antigos são ignorados

function scheduleReconnect(){
  if(!room || _fechandoDeProposito) return;
  if(_reconnectTimer || _reconnecting) return;   // já há uma tentativa em curso
  if(_reconnectTries >= MAX_TENTATIVAS){
    setConnStatus('CLOSED');
    const lbl=$('connLbl'); if(lbl) lbl.textContent='sem conexão';
    if(!_avisouDesistencia){
      _avisouDesistencia=true;
      toast('Não consegui reconectar. Toque para tentar de novo.','err');
      const el=$('connLbl'); if(el){ el.style.cursor='pointer'; el.onclick=()=>reconectarAgora(); }
    }
    return;
  }
  _reconnecting=true;
  _caiuDeVerdade=true;
  const delay=Math.min(15000, 1000*Math.pow(2,_reconnectTries));
  _reconnectTries++;
  setConnStatus('JOINING');
  const lbl=$('connLbl'); if(lbl) lbl.textContent='reconectando...';
  _reconnectTimer=setTimeout(()=>{
    _reconnectTimer=null;
    if(!room || _fechandoDeProposito){ _reconnecting=false; return; }
    descartarCanal();
    reopenChannelKeepingState(_roomCode);
  },delay);
}
let _avisouDesistencia=false;
/* Tentativa manual: zera o contador e tenta na hora. */
function reconectarAgora(){
  _reconnectTries=0; _avisouDesistencia=false; _reconnecting=false;
  clearTimeout(_reconnectTimer); _reconnectTimer=null;
  descartarCanal();
  reopenChannelKeepingState(_roomCode);
}
/* Descarta o canal atual de forma definitiva: sem isso ele continuava vivo,
   disparando erros e agendando novas reconexões em paralelo. */
function descartarCanal(){
  _chGeracao++;
  if(_ch){
    try{ _ch.unsubscribe(); }catch(e){}
    try{ getSupa().removeChannel(_ch); }catch(e){}
  }
  _ch=null; channel=null;
}
/* Reabre o canal SEM limpar a sala: os itens, o quadro e a chamada continuam
   como estavam; só a conexão é refeita e pedimos o estado atualizado. */
function reopenChannelKeepingState(code){
  if(!code || !room) return;
  const geracao = ++_chGeracao;          // marca este canal
  const ch=getSupa().channel('room:'+code,{config:{broadcast:{self:false,ack:false}}});
  _ch=ch; channel=ch;
  ch.on('broadcast',{event:'msg'},payload=>{ if(payload?.payload)handleMsg(payload.payload); });
  ch.subscribe(s=>{
    // callbacks de canais antigos são ignorados — era daqui que vinha a avalanche
    if(geracao !== _chGeracao) return;
    setConnStatus(s);
    if(s==='SUBSCRIBED'){
      _reconnectTries=0; _reconnecting=false; _avisouDesistencia=false;
      clearTimeout(_reconnectTimer); _reconnectTimer=null;
      announceSelf();
      broadcast({type:'REQ_STATE',uid:U.id});
      /* NÃO apagamos mais os avatares ao reconectar.
         Antes eu limpava a lista inteira de participantes e removia os avatares,
         esperando que todos se reanunciassem. Só que quem ainda estava conectado
         não tinha por que se reanunciar na hora — então as pessoas sumiam da
         sala por vários segundos, ou de vez. Agora deixamos os avatares no lugar:
         quem realmente saiu já é removido pelo tempo de silêncio do heartbeat,
         e quem continua ali segue aparecendo sem piscar. */
      const agora=Date.now();
      Object.keys(peers).forEach(uid=>{ if(peers[uid]) peers[uid].ts=agora; });
      if(callActive) recoverCallAfterReconnect();
      if(_caiuDeVerdade){ toast('Reconectado','ok'); _caiuDeVerdade=false; }
    }
    if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'||s==='CLOSED'){
      _reconnecting=false;                // libera para uma nova tentativa
      scheduleReconnect();
    }
  });
}
/* Depois de uma queda, as conexões de voz podem ter morrido. Reconstrói as que
   caíram, sem derrubar as que sobreviveram. */
function recoverCallAfterReconnect(){
  Object.keys(callPeers).forEach(uid=>{
    const cp=callPeers[uid]; if(!cp) return;
    const st=cp.pc && cp.pc.connectionState;
    if(st==='failed'||st==='disconnected'||st==='closed'){
      handleCallPeerGone(uid);
    }
  });
  // reanuncia presença na chamada pra quem estiver ouvindo
  broadcast({type:'CALL_JOIN',uid:U.id,name:U.name,color:U.color,photo:U.photo});
}
/* Sinais do sistema operacional/navegador: mais rápidos que esperar o canal
   perceber a queda sozinho. Cobre wi-fi caindo, troca de rede no celular, e
   o caso comum de voltar pro app depois de um tempo com a tela bloqueada. */
function initNetworkRecovery(){
  if(window._netRecoveryReady) return;
  window._netRecoveryReady=true;

  window.addEventListener('offline',()=>{
    if(!room) return;
    setConnStatus('CLOSED');
    const lbl=$('connLbl'); if(lbl) lbl.textContent='sem internet';
    toast('Você ficou sem conexão — vou reconectar sozinho','err');
  });
  window.addEventListener('online',()=>{
    if(!room) return;
    toast('Conexão de volta, reconectando...');
    _reconnectTries=0;               // rede voltou: tenta já, sem esperar o backoff
    clearTimeout(_reconnectTimer); _reconnectTimer=null;
    try{ if(_ch) getSupa().removeChannel(_ch); }catch(e){}
    _ch=null;
    reopenChannelKeepingState(_roomCode);
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden||!room) return;
    /* BUG CORRIGIDO — era daqui que vinham os "erros de conexão" com o wi-fi bom
       e os avatares sumindo dos dois lados.
       Eu comparava o estado do canal com o texto exato 'joined'. Se essa
       propriedade não existir ou tiver outro nome, a comparação falha SEMPRE —
       e o app disparava uma reconexão a cada vez que você voltava para a aba,
       mesmo com tudo funcionando. Reconectar limpa a lista de participantes,
       então os avatares desapareciam sem motivo.
       Agora só reconectamos quando dá para AFIRMAR que o canal caiu; na dúvida,
       apenas nos reapresentamos, que é inofensivo. */
    let caiu=false;
    try{
      const st=_ch && _ch.state;
      if(typeof st==='string'){
        const s=st.toLowerCase();
        caiu = (s==='closed' || s==='errored' || s==='leaving');
      }
    }catch(e){}
    if(caiu) scheduleReconnect();
    else announceSelf();             // avisa que continuo aqui, caso tenham me removido
  });
}
function closeChannel(){
  // marca a saída como intencional ANTES de derrubar o canal: sem isso, o
  // CLOSED gerado por nós mesmos era tratado como queda e disparava reconexão
  _fechandoDeProposito=true;
  clearTimeout(_reconnectTimer); _reconnectTimer=null;
  _reconnectTries=0; _reconnecting=false; _roomCode=null;
  _caiuDeVerdade=false; _avisouDesistencia=false;
  if(!_ch)return;
  try{ broadcast({type:'LEAVE',uid:U.id}); }catch(e){}
  descartarCanal();
}
function broadcast(msg){ if(!_ch)return; _ch.send({type:'broadcast',event:'msg',payload:msg}).catch(()=>{}); }

/* ── MSG HANDLER ── */
function handleMsg(msg){
  if(!msg?.type||msg.uid===U.id)return;
  switch(msg.type){
    case 'JOIN':
      peers[msg.uid]={name:msg.name,color:msg.color,photo:msg.photo,frame:msg.frame,frame_scale:msg.frame_scale,frame_x:msg.frame_x,frame_y:msg.frame_y,ts:Date.now()};
      renderPeer(msg.uid,msg); broadcastMyInfo(); sendState(msg.uid); break;
    case 'REQ_STATE': broadcastMyInfo(); sendState(msg.uid); break;
    case 'HEARTBEAT':
      peers[msg.uid]={name:msg.name,color:msg.color,photo:msg.photo,frame:msg.frame,frame_scale:msg.frame_scale,frame_x:msg.frame_x,frame_y:msg.frame_y,ts:Date.now()};
      renderPeer(msg.uid,msg); break;
    case 'LEAVE':   removePeer(msg.uid); handleCallPeerGone(msg.uid); break;
    case 'MOVE_AV': movePeerAv(msg.uid,msg.x,msg.y); break;
    case 'CHAT':
      showPeerBubble(msg.uid,msg.text,false);
      registrarMensagem((peers[msg.uid]&&peers[msg.uid].name)||'Alguém',msg.text,false,
                        peers[msg.uid]&&peers[msg.uid].color,false);
      break;
    case 'GIF_CHAT':
      showPeerBubble(msg.uid,msg.url,true);
      registrarMensagem((peers[msg.uid]&&peers[msg.uid].name)||'Alguém',msg.url,true,
                        peers[msg.uid]&&peers[msg.uid].color,false);
      break;
    case 'ADD_ITEM':    applyAdd(msg.item); break;
    case 'REMOVE_ITEM': applyRm(msg.itemId); break;
    case 'MOVE_ITEM':   applyMv(msg.itemId,msg.x,msg.y); break;
    case 'RESIZE_ITEM': applyRz(msg.itemId,msg.w,msg.h); break;
    case 'VID_SYNC':    applyVS(msg.uid_player,msg.action,msg.time,msg.at); break;
    case 'MEDIA_SWITCH':      applyMediaSwitch(msg.itemId,msg.kind,msg.source,msg.uid); break;
    case 'VID_TICK':          applyVidTick(msg.uid_player,msg.time,msg.playing,msg.at); break;
    case 'THEATER_OPEN':      if(typeof abrirTheaterRemoto==='function') abrirTheaterRemoto(msg.url,msg.itemId,msg.host); break;
    case 'THEATER_CLOSE':     if(typeof fecharTheaterRemoto==='function') fecharTheaterRemoto(msg.itemId); break;
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
    case 'MEDIA_VOL':   applyMediaVolumeRemote(msg.v,msg.muted); break;
  }
}
function broadcastMyInfo(){
  const av=qs('.av-wrap[data-uid="'+U.id+'"]');
  broadcast({type:'HEARTBEAT',uid:U.id,name:U.name,color:U.color,photo:U.photo,frame:U.frame,frame_scale:U.frame_scale,frame_x:U.frame_x,frame_y:U.frame_y,x:av?parseInt(av.style.left)||0:200,y:av?parseInt(av.style.top)||0:200});
}
/* Tolerância aumentada de 10s para 30s antes de considerar alguém "sumido".
   Com 10s, qualquer oscilação de rede, tela bloqueada por um instante ou aba em
   segundo plano (onde o navegador reduz timers) já era suficiente pra um remover
   o outro — mesmo os dois continuando na sala. 30s absorve esses soluços, e quem
   realmente saiu manda LEAVE e é removido na hora, sem esperar o timeout. */
function startHB(){
  stopHB();
  hbTimer=setInterval(()=>{
    broadcastMyInfo();
    const now=Date.now();
    Object.keys(peers).forEach(uid=>{ if(now-peers[uid].ts>30000) removePeer(uid); });
  },4000);
}
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
  const _volState={ v:mediaVolume, muted:mediaMuted };
  const items=els.filter(e=>e.dataset.itemId).map(e=>{
    const item={type:e.dataset.type,id:e.dataset.itemId,x:parseInt(e.style.left)||0,y:parseInt(e.style.top)||0,w:parseInt(e.style.width)||0,h:parseInt(e.style.height)||0,src:e.dataset.src||'',vid:e.dataset.vid||''};
    if(e.dataset.type==='music'){item.title=e.dataset.title||'';item.artist=e.dataset.artist||'';item.thumb=e.dataset.thumb||'';}
    if(e.dataset.type==='video'){item.kind=e.dataset.kind||'youtube';item.source=e.dataset.kind==='youtube'?e.dataset.vid:e.dataset.embedUrl;}
    if(e.dataset.type==='iframe'){item.embedUrl=e.dataset.embedUrl||'';}
    return item;
  });
  broadcast({type:'STATE_SYNC',to:toUid,items,drawImg:'',vol:_volState.v,volMuted:_volState.muted});
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
  /* O card do navegador NÃO é criado por aqui de propósito: quem cuida disso é
     a mensagem THEATER_OPEN, que traz o endereço da página e quem é o relógio da
     sessão. Ter dois caminhos criando o mesmo card gerava cards duplicados e
     cards vazios (sem endereço), além de deixar cada lado com um id diferente —
     por isso fechar de um lado não fechava do outro. */
}
function applyState(msg){
  const c=$('items');
  if(typeof msg.vol==='number') applyMediaVolumeRemote(msg.vol,msg.volMuted); // entra já no volume da sala
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
function applyRz(id,w,h){
  const el=qs('[data-item-id="'+id+'"]'); if(!el) return;
  el.style.width=w+'px'; el.style.height=h+'px';
  const uid=el.dataset.ytuid; if(uid) syncPlayerSize(uid);
}
/* Informa ao player o tamanho REAL medido do container (alguns SDKs precisam disso
   pra recalcular a área de vídeo). Como o CSS já força 100%/100%, isso é só um ajuste
   fino — e nunca mais um cálculo manual que pode divergir do layout. */
function syncPlayerSize(uid){
  const cont=$('ypc-'+uid); if(!cont) return;
  const p=ytPlrs[uid]; if(!p||!p.setSize) return;
  const w=Math.round(cont.clientWidth), h=Math.round(cont.clientHeight);
  if(w>0&&h>0){ try{ p.setSize(w,h); }catch(e){} }
}
/* Aplica play/pause/seek recebidos de outro participante.
   Três defesas contra o vídeo "voltar sozinho":
   1) COMPENSA O ATRASO: a mensagem leva um tempo pra chegar; enquanto isso, o
      vídeo do outro continuou correndo. Aplicar o tempo cru significa sempre
      mandar todo mundo pra um instante no passado. Agora somamos o tempo que a
      mensagem levou no caminho.
   2) IGNORA MENSAGEM VELHA: se demorou demais (rede engasgada, aba dormindo),
      obedecer aquele tempo faria o vídeo pular pra trás sem motivo.
   3) TOLERÂNCIA MAIOR (2,5s) antes de mexer: pequenas diferenças naturais entre
      dois players não justificam um seek — e cada seek desnecessário alimentava
      o laço de eco entre os dois lados. */
function applyVS(uid,action,time,sentAt){
  const p=ytPlrs[uid]; if(!p)return;
  try{
    let target=time;
    if(sentAt){
      const lag=(Date.now()-sentAt)/1000;
      if(lag>10) return;                       // mensagem velha demais: ignora
      if(action==='play' && lag>0) target=time+lag;   // compensa o caminho
    }
    suppressSync(uid,2500);
    const cur=p.getCurrentTime();
    if(Math.abs(cur-target)>2.5) p.seekTo(target,true);
    if(action==='play'){ desiredPlaying[uid]=true; p.playVideo(); }
    else if(action==='pause'){ desiredPlaying[uid]=false; p.pauseVideo(); }
  }catch(e){}
}

/* ── DRAW ── */
