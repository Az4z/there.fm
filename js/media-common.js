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

/* ── TEMA + IDIOMA (painel Configurações) ── */
function setTheme(t){
  const b=document.body;
  b.classList.remove('light','eclipse');
  if(t==='light') b.classList.add('light');
  else if(t==='eclipse') b.classList.add('eclipse');
  localStorage.setItem('tfm_theme',t);
  const opts=[...document.querySelectorAll('.theme-opt')];
  opts.forEach(o=>o.classList.toggle('on',o.dataset.theme===t));
  // move o realce deslizante para a opção escolhida
  const idx=Math.max(0,opts.findIndex(o=>o.dataset.theme===t));
  const gl=$('themeGlide');
  if(gl) gl.style.setProperty('--tgi','calc('+idx+' * (100% + 0px))');
}
function toggleTheme(){ // mantido por compatibilidade com atalhos antigos
  const cur=localStorage.getItem('tfm_theme')||'dark';
  setTheme(cur==='dark'?'light':cur==='light'?'eclipse':'dark');
}
function currentTheme(){ return localStorage.getItem('tfm_theme')||'dark'; }
function openPrefs(){
  $('prefsPanel').classList.add('on');
  setTheme(currentTheme());
  setLang(currentLang(),true);
}
function closePrefs(){ $('prefsPanel').classList.remove('on'); }

/* Traduções: só o que aparece na interface fixa. Textos vindos do banco
   (nomes, bios, mensagens) obviamente continuam como foram escritos. */
const I18N={
  pt:{
    'prefs.title':'Configurações','prefs.theme':'Tema','prefs.lang':'Idioma','prefs.account':'Conta',
    'prefs.logout':'Sair da conta','prefs.madeby':'feito por','theme.dark':'Escuro','theme.light':'Claro','theme.eclipse':'Eclipse',
    'land.tag':'salas sincronizadas em tempo real<br>para assistir junto',
    'land.join':'Entrar','land.create':'✦ Criar Sala','land.profile':'Perfil','land.members':'Membros','land.prefs':'Configurações',
    'room.leave':'Sair','music.title':'Música','board.title':'Quadro','call.title':'Chamada de voz',
    'call.join':'Entrar na chamada','prefs.close':'Fechar'
  },
  en:{
    'prefs.title':'Settings','prefs.theme':'Theme','prefs.lang':'Language','prefs.account':'Account',
    'prefs.logout':'Sign out','prefs.madeby':'made by','theme.dark':'Dark','theme.light':'Light','theme.eclipse':'Eclipse',
    'land.tag':'real-time synced rooms<br>to watch together',
    'land.join':'Join','land.create':'✦ Create Room','land.profile':'Profile','land.members':'Members','land.prefs':'Settings',
    'room.leave':'Leave','music.title':'Music','board.title':'Board','call.title':'Voice call',
    'call.join':'Join call','prefs.close':'Close'
  }
};
function currentLang(){ return localStorage.getItem('tfm_lang')||'pt'; }
function t(key){ const l=I18N[currentLang()]||I18N.pt; return l[key]||I18N.pt[key]||key; }
function setLang(lang,silent){
  if(!I18N[lang]) lang='pt';
  localStorage.setItem('tfm_lang',lang);
  document.documentElement.lang = lang==='en'?'en':'pt-BR';
  document.querySelectorAll('.lang-opt').forEach(o=>o.classList.toggle('on',o.dataset.lang===lang));
  applyI18n();
  if(!silent) toast(lang==='en'?'Language set to English':'Idioma alterado para Português');
}
function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const v=t(el.dataset.i18n);
    if(/<[a-z]/i.test(v)) el.innerHTML=v; else el.textContent=v;
  });
}
(function(){
  const th=localStorage.getItem('tfm_theme');
  if(th==='light') document.body.classList.add('light');
  else if(th==='eclipse') document.body.classList.add('eclipse');
  document.addEventListener('DOMContentLoaded',()=>{ applyI18n(); });
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

/* ══════════════════════════════════════════════════════════════════
   VOLUME UNIVERSAL DE MÍDIA (sincronizado)
   Um controle só, sempre visível na lateral da sala, que rege TODOS os
   players ao mesmo tempo: YouTube, Vimeo, Twitch, arquivo direto/HLS e o
   card de música. Cada plataforma usa uma escala diferente (o YouTube vai
   de 0 a 100, os demais de 0 a 1), então cada proxy converte internamente
   e aqui trabalhamos sempre com 0..1.
   Serve principalmente pra quem está em chamada: dá pra abaixar o vídeo
   sem mexer no volume da voz das pessoas, que passa por outro caminho de
   áudio (WebRTC) e não é afetado por este controle.
   O valor é sincronizado entre todos na sala, então "abaixar pra todo mundo"
   funciona de verdade — quem entrar depois também recebe o valor atual. */
let mediaVolume = 0.7;      // 0..1
let mediaMuted  = false;
let _volPrev    = 0.7;      // volume guardado antes de silenciar

function applyVolumeToPlayer(uid){
  const p=ytPlrs[uid]; if(!p) return;
  const v=mediaMuted?0:mediaVolume;
  try{
    if(typeof p.setVolumeUnified==='function') p.setVolumeUnified(v); // YouTube (0..100)
    else if(typeof p.setVolume==='function')   p.setVolume(v);        // demais (0..1)
  }catch(e){}
}
function applyVolumeAll(){
  Object.keys(ytPlrs).forEach(applyVolumeToPlayer);
  updateVolumeUI();
}
function setMediaVolume(v,broadcastIt){
  mediaVolume=Math.max(0,Math.min(1,v));
  if(mediaVolume>0) mediaMuted=false;
  applyVolumeAll();
  if(broadcastIt!==false) broadcast({type:'MEDIA_VOL',v:mediaVolume,muted:mediaMuted});
}
function toggleMediaMute(){
  if(mediaMuted){ mediaMuted=false; if(mediaVolume<=0) mediaVolume=_volPrev||0.7; }
  else { _volPrev=mediaVolume; mediaMuted=true; }
  applyVolumeAll();
  broadcast({type:'MEDIA_VOL',v:mediaVolume,muted:mediaMuted});
}
function applyMediaVolumeRemote(v,muted){
  mediaVolume=Math.max(0,Math.min(1,typeof v==='number'?v:mediaVolume));
  mediaMuted=!!muted;
  applyVolumeAll();
}
function volIconHTML(){
  const v=mediaMuted?0:mediaVolume;
  if(v<=0)  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
  if(v<0.5) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 010 7"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M18.5 5.5a9 9 0 010 13"/></svg>';
}
function updateVolumeUI(){
  const fill=$('volFill'), ico=$('volIcon'), lbl=$('volPct');
  const v=mediaMuted?0:mediaVolume;
  if(fill) fill.style.height=Math.round(v*100)+'%';
  if(ico)  ico.innerHTML=volIconHTML();
  if(lbl)  lbl.textContent=Math.round(v*100);
  const bar=$('volBar'); if(bar) bar.classList.toggle('muted',mediaMuted||v<=0);
}
/* arrastar no trilho vertical (o zero fica embaixo, como qualquer mixer) */
function initVolumeControl(){
  const track=$('volTrack'); if(!track||track.dataset.ready) return;
  track.dataset.ready='1';
  let dragging=false, _volRAF=null, _volPendingY=null;
  const setFromEvent=e=>{
    const r=track.getBoundingClientRect();
    const ratio=1-((e.clientY-r.top)/r.height);
    setMediaVolume(ratio);
  };
  track.addEventListener('pointerdown',e=>{ dragging=true; try{track.setPointerCapture(e.pointerId);}catch(_){ } setFromEvent(e); e.preventDefault(); });
  // OTIMIZADO: antes cada pixel arrastado disparava um broadcast de rede + ajuste
  // em todos os players imediatamente — dezenas de vezes por segundo. Agora fica
  // no máximo 1 atualização por frame, arrastar continua instantâneo pro olho.
  track.addEventListener('pointermove',e=>{
    if(!dragging) return;
    _volPendingY=e;
    if(_volRAF) return;
    _volRAF=requestAnimationFrame(()=>{ _volRAF=null; if(_volPendingY) setFromEvent(_volPendingY); });
  });
  const stop=()=>{ dragging=false; };
  track.addEventListener('pointerup',stop);
  track.addEventListener('pointercancel',stop);
  // roda do mouse também ajusta
  track.addEventListener('wheel',e=>{ e.preventDefault(); setMediaVolume(mediaVolume+(e.deltaY<0?0.05:-0.05)); },{passive:false});
  updateVolumeUI();
}
