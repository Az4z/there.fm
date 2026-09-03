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
 * NAVEGADOR EMBUTIDO COM CONTROLE DE VÍDEO
 *
 * É isto que o site nunca poderia fazer. Num navegador comum, a política de
 * mesma origem impede ler ou controlar o conteúdo de outro domínio. Aqui o
 * aplicativo É o navegador, então pode injetar seu próprio JavaScript em
 * qualquer página — o mesmo mecanismo que uma extensão usa.
 *
 * O que ele faz:
 *   1. Abre uma janela de navegação por cima do app (com barra de endereço,
 *      voltar, avançar e recarregar — navegação de verdade).
 *   2. Injeta um detector em toda página carregada, que acha o <video> da
 *      página e informa posição/estado a cada meio segundo.
 *   3. Aceita comandos (tocar, pausar, saltar, velocidade) vindos do seu
 *      JavaScript — que é o que permite sincronizar com os amigos.
 */
@CapacitorPlugin(name = "Theater")
public class TheaterPlugin extends Plugin {

    private WebView web;
    private FrameLayout root;
    private EditText urlBar;
    private boolean open = false;

    /**
     * Script injetado em TODA página (e, quando o sistema suporta, também
     * dentro dos quadros internos dela). Procura o maior <video> visível —
     * geralmente o player principal, e não um anúncio ou miniatura.
     */
    private static final String DETECTOR =
        "(function(){" +
        "  if (window.__theaterReady) return; window.__theaterReady = 1;" +
        "  function pick(){" +
        "    var list = [].slice.call(document.querySelectorAll('video'));" +
        "    list = list.filter(function(v){ return v.readyState > 0 || v.currentSrc || v.src; });" +
        "    list.sort(function(a,b){ return (b.clientWidth*b.clientHeight) - (a.clientWidth*a.clientHeight); });" +
        "    return list[0] || null;" +
        "  }" +
        "  window.__theater = {" +
        "    play:  function(){ var v=pick(); if(v) v.play(); }," +
        "    pause: function(){ var v=pick(); if(v) v.pause(); }," +
        "    seek:  function(t){ var v=pick(); if(v) v.currentTime = t; }," +
        "    rate:  function(r){ var v=pick(); if(v) v.playbackRate = r; }," +
        "    mute:  function(m){ var v=pick(); if(v) v.muted = !!m; }," +
        "    vol:   function(x){ var v=pick(); if(v) v.volume = x; }" +
        "  };" +
        "  function report(){" +
        "    try {" +
        "      var v = pick();" +
        "      if (!v) { if (window.AndroidTheater) window.AndroidTheater.state('{\"found\":false}'); return; }" +
        "      var s = {found:true, t:v.currentTime||0, p:!v.paused, d:v.duration||0," +
        "               w:v.videoWidth||0, title:document.title||'', url:location.href};" +
        "      if (window.AndroidTheater) window.AndroidTheater.state(JSON.stringify(s));" +
        "    } catch(e) {}" +
        "  }" +
        "  setInterval(report, 500);" +
        "  report();" +
        "})();";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url", "https://www.google.com");
        getActivity().runOnUiThread(() -> {
            if (root == null) buildUi();
            root.setVisibility(View.VISIBLE);
            open = true;
            urlBar.setText(url);
            web.loadUrl(url);
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (root != null) root.setVisibility(View.GONE);
            if (web != null) web.loadUrl("about:blank");
            open = false;
            call.resolve();
        });
    }

    /** Esconde a janela mas mantém o vídeo tocando — para voltar à sala. */
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
            if (root != null) root.setVisibility(View.VISIBLE);
            call.resolve();
        });
    }

    /** Comandos vindos do seu JavaScript: play, pause, seek, rate, mute, vol. */
    @PluginMethod
    public void control(PluginCall call) {
        final String action = call.getString("action", "");
        final Double value = call.getDouble("value", 0.0);
        getActivity().runOnUiThread(() -> {
            if (web != null) {
                String js = "window.__theater && window.__theater." + action + "(" + value + ")";
                web.evaluateJavascript(js, null);
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

        // ── barra de navegação ──
        LinearLayout bar = new LinearLayout(getContext());
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(Color.parseColor("#0d1210"));
        bar.setPadding(12, 12, 12, 12);
        bar.setGravity(Gravity.CENTER_VERTICAL);

        Button back = navButton("‹");
        back.setOnClickListener(v -> { if (web.canGoBack()) web.goBack(); });

        Button fwd = navButton("›");
        fwd.setOnClickListener(v -> { if (web.canGoForward()) web.goForward(); });

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
                // sem ponto = busca; com ponto = endereço
                t = t.contains(".") && !t.contains(" ")
                        ? "https://" + t
                        : "https://www.google.com/search?q=" + android.net.Uri.encode(t);
            }
            web.loadUrl(t);
            return true;
        });

        Button reload = navButton("⟳");
        reload.setOnClickListener(v -> web.reload());

        Button close = navButton("✕");
        close.setOnClickListener(v -> {
            root.setVisibility(View.GONE);
            notifyListeners("theaterClosed", new JSObject());
        });

        bar.addView(back); bar.addView(fwd); bar.addView(urlBar);
        bar.addView(reload); bar.addView(close);

        // ── área da página ──
        web = new WebView(getContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // deixa o sync dar play sozinho
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUserAgentString(s.getUserAgentString().replace("; wv", ""));

        web.addJavascriptInterface(new Bridge(), "AndroidTheater");

        /* Injeção no INÍCIO do documento, quando o sistema suporta. É melhor que
           injetar no fim porque pega também os quadros internos da página — muitos
           sites colocam o player dentro de um <iframe> próprio. Se o aparelho não
           suportar, caímos na injeção ao terminar de carregar. */
        boolean early = false;
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(web, DETECTOR,
                        Collections.singleton("*"));
                early = true;
            }
        } catch (Throwable ignored) {}

        final boolean earlyOk = early;
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String u) {
                urlBar.setText(u);
                if (!earlyOk) v.evaluateJavascript(DETECTOR, null);
                JSObject o = new JSObject();
                o.put("url", u);
                o.put("title", v.getTitle() == null ? "" : v.getTitle());
                notifyListeners("pageChanged", o);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return false;   // navega dentro da janela, não abre outro app
            }
        });
        web.setWebChromeClient(new WebChromeClient());   // habilita tela cheia/HTML5

        col.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        col.addView(web, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        root.addView(col, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        parent.addView(root, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private Button navButton(String label) {
        Button b = new Button(getContext());
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setTextSize(16);
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setPadding(8, 0, 8, 0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        return b;
    }

    /** Ponte de volta: leva o estado do vídeo da página para o seu JavaScript. */
    public class Bridge {
        @JavascriptInterface
        public void state(String json) {
            JSObject o = new JSObject();
            o.put("state", json);
            notifyListeners("videoState", o);
        }
    }
}
