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

    /**
     * Roda em TODAS as páginas e em todos os quadros dentro delas.
     *
     * Quadros internos não conseguem falar direto com o aplicativo (a ponte só
     * existe no documento principal), então enviam o estado por mensagem para o
     * topo, que repassa. É assim que o vídeo de um player incorporado passa a
     * ser visto e controlado.
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
        "  window.addEventListener('message', function(e){" +
        "    var d = e.data;" +
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
        "    if (d && d.__thr === 'state') { deQuadro = {quando: Date.now(), s: d.s}; }" +
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

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url", "https://www.google.com");
        getActivity().runOnUiThread(() -> {
            if (root == null) buildUi();
            root.setVisibility(View.VISIBLE);
            urlBar.setText(url);
            web.loadUrl(url);
            call.resolve();
        });
    }

    /** Fecha de vez: o vídeo para. */
    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (root != null) root.setVisibility(View.GONE);
            if (web != null) web.loadUrl("about:blank");
            call.resolve();
        });
    }

    /** Esconde mantendo o vídeo tocando — é o "voltar à sala". */
    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (root != null) root.setVisibility(View.GONE);
            call.resolve();
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (root == null) buildUi();
            root.setVisibility(View.VISIBLE);
            call.resolve();
        });
    }

    @PluginMethod
    public void control(PluginCall call) {
        final String action = call.getString("action", "");
        final Double value = call.getDouble("value", 0.0);
        getActivity().runOnUiThread(() -> {
            if (web != null) {
                web.evaluateJavascript(
                    "window.__theater && window.__theater." + action + "(" + value + ")", null);
            }
            call.resolve();
        });
    }

    private void buildUi() {
        ViewGroup parent = (ViewGroup) getBridge().getWebView().getParent();

        root = new FrameLayout(getContext());
        root.setBackgroundColor(Color.BLACK);

        LinearLayout col = new LinearLayout(getContext());
        col.setOrientation(LinearLayout.VERTICAL);

        // ───────── barra de endereço ─────────
        LinearLayout bar = new LinearLayout(getContext());
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(Color.parseColor("#0d1210"));
        bar.setPadding(10, 12, 10, 12);
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
        urlBar.setBackgroundColor(Color.parseColor("#1a211e"));
        urlBar.setPadding(20, 14, 20, 14);
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
        acoes.setOrientation(LinearLayout.HORIZONTAL);
        acoes.setBackgroundColor(Color.parseColor("#0d1210"));
        acoes.setPadding(14, 12, 14, 12);
        acoes.setGravity(Gravity.CENTER_VERTICAL);

        Button sala = new Button(getContext());
        sala.setText("◀  Voltar à sala");
        sala.setTextColor(Color.WHITE);
        sala.setTextSize(13);
        sala.setAllCaps(false);
        sala.setBackgroundColor(Color.parseColor("#1a211e"));
        sala.setOnClickListener(v -> {
            // esconde SEM parar o vídeo — era isto que faltava
            root.setVisibility(View.GONE);
            notifyListeners("backToRoom", new JSObject());
        });

        status = new TextView(getContext());
        status.setText("procurando vídeo...");
        status.setTextColor(Color.parseColor("#9aa4a0"));
        status.setTextSize(11);
        status.setGravity(Gravity.CENTER);
        status.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        capturar = new Button(getContext());
        capturar.setText("Assistir junto");
        capturar.setTextColor(Color.parseColor("#0d1210"));
        capturar.setTextSize(13);
        capturar.setAllCaps(false);
        capturar.setBackgroundColor(Color.parseColor("#7fe0a8"));
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
