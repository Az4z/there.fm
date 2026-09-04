package fm.there.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;

/**
 * NAVEGADOR EMBUTIDO COM CONTROLE DE VÍDEO — versão 2
 *
 * Correções em relação à primeira versão:
 *
 * 1. VÍDEO DENTRO DE QUADROS (iframe). Sites como o TokyVideo colocam o player
 *    num quadro de outro domínio. O detector antigo só enxergava o documento
 *    principal, por isso "não reconhecia o vídeo". Agora o script roda em TODOS
 *    os quadros, e os internos avisam o principal por mensagem — o único caminho
 *    que o navegador permite entre domínios diferentes.
 *
 * 2. VOLTAR À SALA. Antes só existia o "fechar", que matava o vídeo. Agora há uma
 *    barra embaixo com "Voltar à sala", que esconde o navegador e MANTÉM o vídeo
 *    tocando e sincronizado.
 *
 * 3. BOTÃO DE CAPTURAR. Assim que um vídeo é detectado, o botão "Assistir junto"
 *    acende, trava aquele vídeo como o da sessão e volta para a sala.
 */
@CapacitorPlugin(name = "Theater")
public class TheaterPlugin extends Plugin {

    private WebView web;
    private FrameLayout root;
    private EditText urlBar;
    private TextView status;
    private Button capturar;
    private LinearLayout barraTopo, barraAcoes, coluna;
    private boolean modoCard = false;

    /**
     * Roda em TODAS as páginas e em todos os quadros dentro delas.
     *
     * Quadros internos não conseguem falar direto com o aplicativo (a ponte só
     * existe no documento principal), então enviam o estado por mensagem para o
     * topo, que repassa. É assim que o vídeo de um player incorporado passa a
     * ser visto e controlado.
     */
    /*
     * Descobre EXATAMENTE de qual quadro veio o vídeo, comparando a janela que
     * enviou a mensagem com a de cada quadro da página (window.__thrFrame).
     *
     * Antes o isolamento pegava o MAIOR quadro da página. Em sites com anúncio
     * — o TokyVideo entre eles — o maior costuma ser o do anúncio, não o do
     * vídeo. Era exatamente por isso que na outra pessoa "aparecia só a página
     * e não o vídeo": isolávamos o quadro errado.
     */
    private static final String DETECTOR =
        "(function(){" +
        "  if (window.__thrReady) return; window.__thrReady = 1;" +
        "  var TOPO = (window.top === window);" +
        "  function achar(){" +
        "    var l = [].slice.call(document.querySelectorAll('video'));" +
        "    l = l.filter(function(v){ return v.readyState>0 || v.currentSrc || v.src; });" +
        "    l.sort(function(a,b){ return (b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight); });" +
        "    return l[0] || null;" +
        "  }" +
        "  function estado(){" +
        "    var v = achar();" +
        "    if (!v) return {found:false, area:0};" +
        "    return {found:true, t:v.currentTime||0, p:!v.paused, d:v.duration||0," +
        "            area:(v.clientWidth*v.clientHeight)||1," +
        "            title:document.title||'', url:location.href};" +
        "  }" +
        "  function executar(cmd, val){" +
        "    var v = achar(); if (!v) return false;" +
        "    try{" +
        "      if (cmd==='play')  { v.play(); }" +
        "      if (cmd==='pause') { v.pause(); }" +
        "      if (cmd==='seek')  { v.currentTime = val; }" +
        "      if (cmd==='rate')  { v.playbackRate = val; }" +
        "      if (cmd==='mute')  { v.muted = !!val; }" +
        "      if (cmd==='vol')   { v.volume = val; }" +
        "    }catch(e){ return false; }" +
        "    return true;" +
        "  }" +
        "  window.__thrIsolar = function(on){" +
        "    function alvo(){" +
        "      var v = document.querySelector('video'); if (v) return v;" +
        "      if (window.__thrFrame && window.__thrFrame.parentElement) return window.__thrFrame;" +
        "      var fs = [].slice.call(document.querySelectorAll('iframe'));" +
        "      fs.sort(function(a,b){ return (b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight); });" +
        "      return fs[0] || null;" +
        "    }" +
        "    var el = alvo();" +
        "    if (!on) {" +
        "      var g = document.querySelectorAll('[data-thr-hid]');" +
        "      for (var i=0;i<g.length;i++){ g[i].style.display=''; g[i].removeAttribute('data-thr-hid'); }" +
        "      if (window.__thrAlvo) window.__thrAlvo.style.cssText = window.__thrCss || '';" +
        "      document.documentElement.style.background=''; document.body.style.background='';" +
        "    } else if (el) {" +
        "      window.__thrAlvo = el; window.__thrCss = el.style.cssText;" +
        "      var n = el;" +
        "      while (n && n.parentElement) {" +
        "        var ir = n.parentElement.children;" +
        "        for (var i=0;i<ir.length;i++){" +
        "          if (ir[i] !== n && ir[i].style && ir[i].style.display !== 'none') {" +
        "            ir[i].setAttribute('data-thr-hid','1'); ir[i].style.display='none';" +
        "          }" +
        "        }" +
        "        n.style.margin='0'; n.style.padding='0'; n.style.maxWidth='none'; n.style.width='100%';" +
        "        n = n.parentElement;" +
        "      }" +
        "      el.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;max-width:none;max-height:none;z-index:2147483647;background:#000;border:0;object-fit:contain';" +
        "      document.documentElement.style.background='#000'; document.body.style.background='#000';" +
        "    }" +
        "    var fs2 = document.querySelectorAll('iframe');" +
        "    for (var k=0;k<fs2.length;k++){" +
        "      try { fs2[k].contentWindow.postMessage({__thr:'isolar', on:on}, '*'); } catch(e){}" +
        "    }" +
        "  };" +
        "  window.addEventListener('message', function(e){" +
        "    var d = e.data;" +
        "    if (d && d.__thr === 'isolar') { window.__thrIsolar(d.on); return; }" +
        "    if (!d || d.__thr !== 'cmd') return;" +
        "    executar(d.cmd, d.val);" +
        "  });" +
        "  if (!TOPO) {" +
        "    setInterval(function(){" +
        "      var s = estado();" +
        "      if (s.found) { try { window.top.postMessage({__thr:'state', s:s}, '*'); } catch(e){} }" +
        "    }, 500);" +
        "    return;" +
        "  }" +
        "  var deQuadro = {quando:0, s:null};" +
        "  window.addEventListener('message', function(e){" +
        "    var d = e.data;" +
        "    if (d && d.__thr === 'state') {" +
        "      deQuadro = {quando: Date.now(), s: d.s};" +
        "      try{" +
        "        var fs = document.querySelectorAll('iframe');" +
        "        for (var i=0;i<fs.length;i++){" +
        "          if (fs[i].contentWindow === e.source) { window.__thrFrame = fs[i]; break; }" +
        "        }" +
        "      }catch(err){}" +
        "    }" +
        "  });" +
        "  function paraQuadros(cmd, val){" +
        "    var fs = document.querySelectorAll('iframe');" +
        "    for (var i=0; i<fs.length; i++) {" +
        "      try { fs[i].contentWindow.postMessage({__thr:'cmd', cmd:cmd, val:val}, '*'); } catch(e){}" +
        "    }" +
        "  }" +
        "  window.__theater = {" +
        "    play:  function(){ if(!executar('play'))  paraQuadros('play'); }," +
        "    pause: function(){ if(!executar('pause')) paraQuadros('pause'); }," +
        "    seek:  function(t){ if(!executar('seek',t)) paraQuadros('seek',t); }," +
        "    rate:  function(r){ if(!executar('rate',r)) paraQuadros('rate',r); }," +
        "    mute:  function(m){ if(!executar('mute',m)) paraQuadros('mute',m); }," +
        "    vol:   function(x){ if(!executar('vol',x))  paraQuadros('vol',x); }" +
        "  };" +
        "  setInterval(function(){" +
        "    try{" +
        "      var meu = estado();" +
        "      var usar = meu;" +
        "      var recente = (Date.now() - deQuadro.quando) < 2500;" +
        "      if (!meu.found && recente && deQuadro.s) usar = deQuadro.s;" +
        "      else if (meu.found && recente && deQuadro.s && deQuadro.s.area > meu.area) usar = deQuadro.s;" +
        "      if (usar.found && !usar.title) usar.title = document.title || '';" +
        "      if (window.AndroidTheater) window.AndroidTheater.state(JSON.stringify(usar));" +
        "    }catch(e){}" +
        "  }, 500);" +
        "})();";

    /**
     * ISOLAR O VÍDEO — faz o player ocupar a tela inteira do navegador, escondendo
     * cabeçalho, anúncios e o resto da página. É o que permite encaixar o vídeo
     * dentro do card da sala: em vez de mostrar o site todo espremido, mostramos
     * só a imagem do vídeo.
     *
     * Funciona tanto quando o vídeo está na própria página quanto quando está
     * dentro de um quadro: nesse caso isolamos o quadro no documento principal e
     * mandamos o quadro isolar o vídeo dentro dele.
     */
    private static final String ISOLAR =
        "window.__thrIsolar && window.__thrIsolar(%s);";

    /**
     * Diz qual versão do plugin está dentro do APK.
     *
     * Serve para o JavaScript perceber quando o APK foi compilado com um plugin
     * antigo: nesse caso os comandos novos (encaixar no card, isolar o vídeo)
     * simplesmente não existem e falhariam em silêncio, deixando o vídeo tocando
     * invisível — sem nenhuma pista do motivo.
     */
    @PluginMethod
    public void version(PluginCall call) {
        JSObject o = new JSObject();
        o.put("v", 2);
        call.resolve(o);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url", "https://www.google.com");
        getActivity().runOnUiThread(() -> {
            try {
                if (root == null) buildUi();
                root.setBackgroundColor(Color.BLACK);
                if (coluna != null) coluna.setLayoutParams(new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                if (barraTopo  != null) barraTopo.setVisibility(View.VISIBLE);
                if (barraAcoes != null) barraAcoes.setVisibility(View.VISIBLE);
                modoCard = false;
                root.setVisibility(View.VISIBLE);
                urlBar.setText(url);
                web.loadUrl(url);
                call.resolve();
            } catch (Throwable t) { call.reject("open: " + t.getMessage()); }
        });
    }

    /** Fecha de vez: o vídeo para. */
    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (root != null) root.setVisibility(View.GONE);
                if (web != null) web.loadUrl("about:blank");
                call.resolve();
            } catch (Throwable t) { call.reject("close: " + t.getMessage()); }
        });
    }

    /** Esconde mantendo o vídeo tocando — é o "voltar à sala". */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (root != null) root.setVisibility(View.GONE);
                call.resolve();
            } catch (Throwable t) { call.reject("hide: " + t.getMessage()); }
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (root == null) buildUi();
                root.setVisibility(View.VISIBLE);
                call.resolve();
            } catch (Throwable t) { call.reject("show: " + t.getMessage()); }
        });
    }

    @PluginMethod
    public void control(PluginCall call) {
        final String action = call.getString("action", "");
        final Double value = call.getDouble("value", 0.0);
        getActivity().runOnUiThread(() -> {
            try {
                if (web != null) {
                    web.evaluateJavascript(
                        "window.__theater && window.__theater." + action + "(" + value + ")", null);
                }
                call.resolve();
            } catch (Throwable t) { call.reject("control: " + t.getMessage()); }
        });
    }

    /**
     * Coloca o navegador EXATAMENTE onde o card está na sala, escondendo as
     * barras. É isso que faz o vídeo aparecer dentro do card em vez de ficar
     * tocando invisível atrás da sala.
     *
     * As medidas chegam em pixels de CSS (do JavaScript) e precisam ser
     * convertidas para pixels reais da tela.
     */
    @PluginMethod
    public void setBounds(PluginCall call) {
        final double x = call.getDouble("x", 0.0);
        final double y = call.getDouble("y", 0.0);
        final double w = call.getDouble("w", 0.0);
        final double h = call.getDouble("h", 0.0);
        getActivity().runOnUiThread(() -> {
            try {
                if (root == null) buildUi();
                /* CRASH CORRIGIDO: antes eu aplicava FrameLayout.LayoutParams no
                   'root', mas o pai dele é o contêiner do Capacitor, que NÃO é
                   necessariamente um FrameLayout — aplicar parâmetros do tipo
                   errado lança exceção e derruba o app.
                   Agora o root fica sempre ocupando a tela toda (transparente) e
                   quem é posicionado é a 'coluna', cujo pai É o root e portanto
                   aceita FrameLayout.LayoutParams com segurança. */
                float d = getContext().getResources().getDisplayMetrics().density;
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                        Math.max(1, (int) (w * d)), Math.max(1, (int) (h * d)));
                lp.leftMargin = (int) (x * d);
                lp.topMargin  = (int) (y * d);
                if (coluna != null) coluna.setLayoutParams(lp);
                root.setBackgroundColor(Color.TRANSPARENT);   // deixa a sala aparecer em volta
                if (barraTopo  != null) barraTopo.setVisibility(View.GONE);
                if (barraAcoes != null) barraAcoes.setVisibility(View.GONE);
                root.setVisibility(View.VISIBLE);
                modoCard = true;
                call.resolve();
            } catch (Throwable t) {
                // nunca derrubar o app por causa do posicionamento
                call.reject("setBounds: " + t.getMessage());
            }
        });
    }

    /** Volta o navegador para a tela inteira, com as barras de volta. */
    @PluginMethod
    public void setFullscreen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (root == null) buildUi();
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                if (coluna != null) coluna.setLayoutParams(lp);
                root.setBackgroundColor(Color.BLACK);
                if (barraTopo  != null) barraTopo.setVisibility(View.VISIBLE);
                if (barraAcoes != null) barraAcoes.setVisibility(View.VISIBLE);
                root.setVisibility(View.VISIBLE);
                modoCard = false;
                call.resolve();
            } catch (Throwable t) {
                call.reject("setFullscreen: " + t.getMessage());
            }
        });
    }

    /** Liga/desliga o isolamento do vídeo dentro da página. */
    @PluginMethod
    public void isolate(PluginCall call) {
        final boolean on = call.getBoolean("on", true);
        getActivity().runOnUiThread(() -> {
            try {
                if (web != null) web.evaluateJavascript(String.format(ISOLAR, on ? "true" : "false"), null);
                call.resolve();
            } catch (Throwable t) { call.reject("isolate: " + t.getMessage()); }
        });
    }

    private void buildUi() {
        /* Toda a montagem protegida: uma exceção aqui derrubaria o app inteiro,
           e o navegador é um recurso extra — nunca deve levar o app junto. */
        ViewGroup parent = (ViewGroup) getBridge().getWebView().getParent();

        root = new FrameLayout(getContext());
        root.setBackgroundColor(Color.BLACK);

        LinearLayout col = new LinearLayout(getContext());
        coluna = col;
        col.setOrientation(LinearLayout.VERTICAL);

        // ───────── barra de endereço ─────────
        LinearLayout bar = new LinearLayout(getContext());
        barraTopo = bar;
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(Color.parseColor("#0b100e"));
        bar.setPadding(16, 18, 16, 14);
        bar.setGravity(Gravity.CENTER_VERTICAL);

        Button voltar = navButton("‹");
        voltar.setOnClickListener(v -> { if (web.canGoBack()) web.goBack(); });

        Button avancar = navButton("›");
        avancar.setOnClickListener(v -> { if (web.canGoForward()) web.goForward(); });

        urlBar = new EditText(getContext());
        urlBar.setSingleLine(true);
        urlBar.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        urlBar.setTextColor(Color.WHITE);
        urlBar.setHintTextColor(Color.GRAY);
        urlBar.setHint("Buscar ou digitar endereço");
        urlBar.setTextSize(13);
        android.graphics.drawable.GradientDrawable fundoUrl = new android.graphics.drawable.GradientDrawable();
        fundoUrl.setColor(Color.parseColor("#16211c"));
        fundoUrl.setCornerRadius(24f);
        fundoUrl.setStroke(2, Color.parseColor("#2b3a33"));
        urlBar.setBackground(fundoUrl);
        urlBar.setPadding(28, 18, 28, 18);
        urlBar.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        urlBar.setOnEditorActionListener((v, id, ev) -> {
            String t = urlBar.getText().toString().trim();
            if (!t.startsWith("http")) {
                t = (t.contains(".") && !t.contains(" "))
                        ? "https://" + t
                        : "https://www.google.com/search?q=" + android.net.Uri.encode(t);
            }
            web.loadUrl(t);
            return true;
        });

        Button recarregar = navButton("⟳");
        recarregar.setOnClickListener(v -> web.reload());

        bar.addView(voltar); bar.addView(avancar); bar.addView(urlBar); bar.addView(recarregar);

        // ───────── página ─────────
        web = new WebView(getContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));

        web.addJavascriptInterface(new Bridge(), "AndroidTheater");

        boolean cedo = false;
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                // injeta em todos os quadros, antes de a página rodar
                WebViewCompat.addDocumentStartJavaScript(web, DETECTOR, Collections.singleton("*"));
                cedo = true;
            }
        } catch (Throwable ignored) {}

        final boolean cedoOk = cedo;
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String u) {
                urlBar.setText(u);
                if (!cedoOk) v.evaluateJavascript(DETECTOR, null);
                JSObject o = new JSObject();
                o.put("url", u);
                o.put("title", v.getTitle() == null ? "" : v.getTitle());
                notifyListeners("pageChanged", o);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return false;
            }
        });
        web.setWebChromeClient(new WebChromeClient());

        // ───────── barra de ações (embaixo) ─────────
        LinearLayout acoes = new LinearLayout(getContext());
        barraAcoes = acoes;
        acoes.setOrientation(LinearLayout.HORIZONTAL);
        acoes.setBackgroundColor(Color.parseColor("#0b100e"));
        acoes.setPadding(24, 20, 24, 24);
        acoes.setGravity(Gravity.CENTER_VERTICAL);

        Button sala = botaoEstilizado("\u25c0  Voltar à sala", "#16211c", "#e8e6df", "#2b3a33");
        sala.setOnClickListener(v -> {
            // esconde SEM parar o vídeo — era isto que faltava
            root.setVisibility(View.GONE);
            notifyListeners("backToRoom", new JSObject());
        });

        status = new TextView(getContext());
        status.setText("procurando vídeo...");
        status.setTextColor(Color.parseColor("#8a948f"));
        status.setTextSize(11);
        status.setPadding(18, 0, 18, 0);
        status.setGravity(Gravity.CENTER);
        status.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        capturar = botaoEstilizado("Assistir junto", "#7fe0a8", "#0b1310", null);
        capturar.setEnabled(false);
        capturar.setAlpha(0.4f);
        capturar.setOnClickListener(v -> {
            root.setVisibility(View.GONE);
            notifyListeners("captured", new JSObject());
        });

        acoes.addView(sala); acoes.addView(status); acoes.addView(capturar);

        col.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        col.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        col.addView(acoes, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(col, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        parent.addView(root, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    /**
     * Botão no visual do app: cantos arredondados, borda sutil e as mesmas cores
     * do tema. Os botões padrão do Android destoavam completamente do resto.
     */
    private Button botaoEstilizado(String texto, String corFundo, String corTexto, String corBorda) {
        Button b = new Button(getContext());
        b.setText(texto);
        b.setAllCaps(false);
        b.setTextSize(13);
        b.setTextColor(Color.parseColor(corTexto));
        b.setPadding(34, 20, 34, 20);
        b.setStateListAnimator(null);
        b.setElevation(0f);
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(Color.parseColor(corFundo));
        g.setCornerRadius(26f);
        if (corBorda != null) g.setStroke(2, Color.parseColor(corBorda));
        b.setBackground(g);
        return b;
    }

    private Button navButton(String rotulo) {
        Button b = new Button(getContext());
        b.setText(rotulo);
        b.setTextColor(Color.WHITE);
        b.setTextSize(16);
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setPadding(6, 0, 6, 0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        return b;
    }

    /** Atualiza a barra de baixo conforme o vídeo é (ou não) encontrado. */
    private void atualizarStatus(final boolean achou, final String titulo) {
        getActivity().runOnUiThread(() -> {
            if (status == null || capturar == null) return;
            if (achou) {
                status.setText(titulo == null || titulo.isEmpty() ? "vídeo detectado" : titulo);
                status.setTextColor(Color.parseColor("#7fe0a8"));
                capturar.setEnabled(true);
                capturar.setAlpha(1f);
            } else {
                status.setText("nenhum vídeo nesta página");
                status.setTextColor(Color.parseColor("#9aa4a0"));
                capturar.setEnabled(false);
                capturar.setAlpha(0.4f);
            }
        });
    }

    public class Bridge {
        @JavascriptInterface
        public void state(String json) {
            boolean achou = json != null && json.contains("\"found\":true");
            String titulo = "";
            try {
                int i = json.indexOf("\"title\":\"");
                if (i >= 0) {
                    int j = json.indexOf('"', i + 9);
                    titulo = json.substring(i + 9, j);
                }
            } catch (Exception ignored) {}
            atualizarStatus(achou, titulo);

            JSObject o = new JSObject();
            o.put("state", json);
            notifyListeners("videoState", o);
        }
    }
}
