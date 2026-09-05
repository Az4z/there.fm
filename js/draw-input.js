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
let _ultimoMoveAv=0, _moveAvFinal=null;
function move(cx,cy){
  const cw=$('cw');
  if(D){
    let x=cx-D.ox,y=cy-D.oy; x=Math.max(0,Math.min(x,cw.clientWidth-(D.el.offsetWidth||50))); y=Math.max(0,Math.min(y,cw.clientHeight-(D.el.offsetHeight||50)));
    px=x; py=y; if(!raf)raf=requestAnimationFrame(()=>{D.el.style.left=px+'px';D.el.style.top=py+'px';raf=null;});
    /* CORRIGIDO — causa de "erro de conexão com o wi-fi bom".
       Antes cada movimento do dedo enviava uma mensagem: dezenas por segundo
       durante um arrasto. Isso estoura o limite de mensagens do servidor, que
       responde derrubando o canal — daí os erros de conexão do nada e os
       avatares sumindo. Agora enviamos no máximo 10 posições por segundo, o que
       é suficiente para o movimento parecer contínuo do outro lado. */
    if(D.type==='av'){
      const agora=Date.now();
      if(agora-_ultimoMoveAv>100){
        _ultimoMoveAv=agora;
        broadcast({type:'MOVE_AV',uid:U.id,x:Math.round(px),y:Math.round(py)});
      }else{
        clearTimeout(_moveAvFinal);   // garante que a posição final sempre chegue
        _moveAvFinal=setTimeout(()=>{
          _ultimoMoveAv=Date.now();
          broadcast({type:'MOVE_AV',uid:U.id,x:Math.round(px),y:Math.round(py)});
        },110);
      }
    }
    return;
  }
  if(R){
    const dx=cx-R.x0,dy=cy-R.y0;
    pw=Math.min(cw.clientWidth-R.l0,Math.max(200,R.w0+dx));
    ph=Math.min(cw.clientHeight-R.t0,Math.max(150,R.h0+dy));
    if(!raf)raf=requestAnimationFrame(()=>{
      if(!R){raf=null;return;}
      R.el.style.width=pw+'px'; R.el.style.height=ph+'px';
      // O container do vídeo é flex:1 e o iframe é 100%/100% via CSS, então ele
      // acompanha sozinho. Antes a altura era calculada na mão sem contar a faixa
      // "a seguir", e sobrava aquele retângulo preto no card.
      const uid=R.el.dataset.ytuid;
      if(uid) syncPlayerSize(uid);
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

/* ══════════════════════════════════════════════════════════════════
   HISTÓRICO DE MENSAGENS DA SALA
   As mensagens apareciam em balões que somem em 8 segundos — o que é bom para
   não poluir a tela, mas quem estava distraído perdia o que foi dito.
   Aqui elas ficam guardadas para consulta, separadas POR SALA (o histórico de
   uma sala não aparece em outra) e mantidas no próprio aparelho, então
   sobrevivem a recarregar a página e a quedas de conexão.
   ══════════════════════════════════════════════════════════════════ */
const LOG_MAX = 300;      // teto de mensagens exibidas
let _logNaoLidas = 0;
let _logCarregando = false;

/* O histórico fica no Supabase para TODOS na sala verem o mesmo.
   O armazenamento local segue existindo como cópia: garante que as mensagens
   apareçam na hora (sem esperar a rede) e que você ainda veja o histórico se a
   conexão cair ou se a tabela ainda não tiver sido criada no banco. */
function logChave(){ return 'tfm_log_' + ((room && room.code) || 'sem-sala'); }
function lerCacheLocal(){
  try{ return JSON.parse(localStorage.getItem(logChave()) || '[]'); }catch(e){ return []; }
}
function gravarCacheLocal(lista){
  try{ localStorage.setItem(logChave(), JSON.stringify(lista.slice(-LOG_MAX))); }catch(e){}
}
function juntarNoCache(msg){
  const lista=lerCacheLocal();
  // evita repetir a mesma mensagem (chega pelo canal e também vem do banco)
  if(lista.some(m=>m.h===msg.h && m.n===msg.n && m.t===msg.t)) return lista;
  lista.push(msg); gravarCacheLocal(lista); return lista;
}

/* Registra uma mensagem.
   `souEu` diz se fui eu quem enviou — só nesse caso gravamos no banco, senão
   cada pessoa gravaria a mesma mensagem de novo e o histórico ficaria repetido. */
function registrarMensagem(nome, texto, isGif, cor, souEu){
  if(!room) return;
  const meu = (souEu===undefined) ? !nome : souEu;
  const msg = { n: nome || U.name || 'Você', t: texto, g: !!isGif,
                c: cor || U.color || '#c45c5c', eu: meu, h: Date.now() };
  juntarNoCache(msg);

  if(meu) salvarNoBanco(msg);

  const aberto=$('roomLog') && $('roomLog').classList.contains('on');
  if(aberto) renderRoomLog(false);
  else if(!meu){ _logNaoLidas++; atualizarPontoLog(); }
}
/* Grava no banco. Se a tabela ainda não existir, avisa uma vez no console e
   segue funcionando só com a cópia local — nada quebra. */
let _avisouTabela=false;
function salvarNoBanco(msg){
  try{
    getSupa().from('room_messages').insert({
      room_code: room.code,
      sender_id: U.id || null,
      sender_name: msg.n,
      sender_color: msg.c,
      content: msg.t,
      is_gif: msg.g
    }).then(({error})=>{
      if(error && !_avisouTabela){
        _avisouTabela=true;
        console.warn('Histórico não salvo no banco (crie a tabela room_messages):', error.message);
      }
    });
  }catch(e){}
}
/* Busca o histórico compartilhado da sala. */
async function carregarDoBanco(){
  if(!room) return null;
  try{
    const { data, error }=await getSupa()
      .from('room_messages').select('*')
      .eq('room_code', room.code)
      .order('created_at',{ascending:true})
      .limit(LOG_MAX);
    if(error) return null;
    return (data||[]).map(r=>({
      n:r.sender_name||'Alguém', t:r.content, g:!!r.is_gif,
      c:r.sender_color||'#c45c5c', eu:(r.sender_id===U.id),
      h:new Date(r.created_at).getTime()
    }));
  }catch(e){ return null; }
}
function atualizarPontoLog(){
  const d=$('logDot'); if(!d) return;
  d.style.display=_logNaoLidas>0?'block':'none';
}
function toggleRoomLog(){
  const p=$('roomLog'); if(!p) return;
  const abrindo=!p.classList.contains('on');
  p.classList.toggle('on',abrindo);
  if(abrindo){ _logNaoLidas=0; atualizarPontoLog(); renderRoomLog(true); }
}
/* `buscarNoBanco` só é verdadeiro ao abrir o painel: durante a conversa o
   cache já está em dia e uma consulta a cada mensagem seria desperdício. */
async function renderRoomLog(buscarNoBanco){
  const box=$('roomLogList'); if(!box) return;
  let lista=lerCacheLocal();
  if(lista.length) desenharLog(box,lista);
  else box.innerHTML='<div class="rl-vazio">Carregando...</div>';

  if(buscarNoBanco && !_logCarregando){
    _logCarregando=true;
    const doBanco=await carregarDoBanco();
    _logCarregando=false;
    if(doBanco){
      gravarCacheLocal(doBanco);      // o banco é a fonte de verdade
      lista=doBanco;
    }
    desenharLog(box,lista);
  }
}
function desenharLog(box,lista){
  if(!lista.length){
    box.innerHTML='<div class="rl-vazio">Nenhuma mensagem nesta sala ainda.</div>';
    return;
  }
  box.innerHTML=lista.map(m=>{
    const hora=new Date(m.h).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const corpo=m.g
      ? `<img class="rl-gif" src="${m.t}" loading="lazy" alt="">`
      : `<span class="rl-txt">${escapeHtml(m.t)}</span>`;
    return `<div class="rl-item${m.eu?' rl-eu':''}">
       <div class="rl-topo"><span class="rl-nome" style="color:${m.c}">${escapeHtml(m.n)}</span>
       <span class="rl-hora">${hora}</span></div>${corpo}</div>`;
  }).join('');
  box.scrollTop=box.scrollHeight;
}
/* Limpa só a sua cópia local; o histórico da sala continua para os outros. */
function limparRoomLog(){
  try{ localStorage.removeItem(logChave()); }catch(e){}
  _logNaoLidas=0; atualizarPontoLog();
  const box=$('roomLogList'); if(box) desenharLog(box,[]);
  toast('Sua cópia local foi limpa (o histórico da sala continua)');
}

/* ── MESSAGES ── */
function handleMsgKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} }
function sendMsg(){
  const inp=$('msgInput'),txt=inp.value.trim(); if(!txt)return;
  let av=qs('.av-wrap[data-uid="'+U.id+'"]')||qs('.av-wrap'); if(!av){toast('Avatar não encontrado','err');return;}
  showBubble(av,txt,false); broadcast({type:'CHAT',uid:U.id,text:txt});
  registrarMensagem(null,txt,false,null,true);
  inp.value=''; inp.focus();
}
function showBubble(wrap,content,isGif){
  let ex=wrap.querySelector('.bubble'); if(ex)ex.remove();
  const b=document.createElement('div'); b.className='bubble'+(isGif?' gbub':'');
  if(isGif){const img=document.createElement('img');img.src=content;b.appendChild(img);}else b.textContent=content;
  wrap.appendChild(b);
  setTimeout(()=>{ if(b.parentElement){b.classList.add('fading');setTimeout(()=>b.remove(),480);} },isGif?10000:8000);
}

/* ── GIF — Klipy ── */
