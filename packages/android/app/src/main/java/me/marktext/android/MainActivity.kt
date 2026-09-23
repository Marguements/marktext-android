package me.marktext.android

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Hosts the Muya editor UI (built by Vite into assets/www) in a WebView.
 * Everything the page cannot do itself — the Storage Access Framework,
 * sharing, system bars — goes through [NativeBridge].
 */
class MainActivity : ComponentActivity() {

    private var webView: WebView? = null
    private lateinit var bridge: NativeBridge

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            val view = webView ?: return finish()
            // The page closes its own drawer/dialog/find bar first; `false` means
            // there was nothing to close and the app should go to the background.
            view.evaluateJavascript("window.__mtHandleBack ? window.__mtHandleBack() : false") { result ->
                if (result != "true") {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            setContentView(TextView(this).apply {
                setText(R.string.error_webview_outdated)
                setPadding(48, 160, 48, 48)
                textSize = 18f
            })
            return
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        val root = FrameLayout(this)
        val view = WebView(this)
        root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)
        webView = view

        // Edge-to-edge is mandatory from targetSdk 35, so pad for the status
        // bar, navigation bar, cutout and keyboard ourselves. Shrinking the
        // WebView for the IME keeps the formatting toolbar above the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        bridge = NativeBridge(this, root)
        configureWebView(view)
        onBackPressedDispatcher.addCallback(this, backCallback)

        if (savedInstanceState == null) bridge.handleIntent(intent)
        view.loadUrl(START_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(view: WebView) {
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportZoom(false)
            builtInZoomControls = false
        }

        WebViewCompat.addWebMessageListener(view, BRIDGE_NAME, setOf(APP_ORIGIN), bridge)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                bridge.openExternal(request.url)
                return true
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // The draft lives in localStorage, so a fresh page picks up where it left off.
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                webView = null
                recreate()
                return true
            }
        }
        // A WebChromeClient is what makes window.confirm() show a dialog.
        view.webChromeClient = WebChromeClient()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (webView != null) bridge.handleIntent(intent)
    }

    override fun onPause() {
        webView?.evaluateJavascript("window.__mtOnPause && window.__mtOnPause()", null)
        super.onPause()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (webView != null) bridge.notifySystemDark()
    }

    override fun onDestroy() {
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    companion object {
        private const val MATCH_PARENT = FrameLayout.LayoutParams.MATCH_PARENT
        private const val BRIDGE_NAME = "MarkTextAndroid"
        private const val APP_ORIGIN = "https://${WebViewAssetLoader.DEFAULT_DOMAIN}"
        private const val START_URL = "$APP_ORIGIN/assets/www/index.html"
    }
}
