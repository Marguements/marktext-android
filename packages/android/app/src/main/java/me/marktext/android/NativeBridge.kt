package me.marktext.android

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.View
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.IntentCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Receives `MarkTextAndroid.postMessage` calls from web/src/native.ts and
 * answers through the reply proxy. Messages are `{ id, method, args }`; a
 * non-zero id expects a `{ type: "resolve", id, ok, value | error | cancelled }`
 * reply. The listener is registered for the app's asset origin only.
 */
class NativeBridge(
    private val activity: ComponentActivity,
    private val root: View,
) : WebViewCompat.WebMessageListener {

    private val documents = Documents(activity.contentResolver)
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    // Main-thread state.
    private var replyProxy: JavaScriptReplyProxy? = null
    private var pendingDocument: JSONObject? = null
    private var openRequestId = 0
    private var imageRequestId = 0
    private var createRequest: CreateRequest? = null

    private class CreateRequest(val id: Int, val content: String)

    private val openLauncher =
        activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val id = openRequestId.also { openRequestId = 0 }
            if (uri == null) return@registerForActivityResult cancel(id)
            persistPermission(uri)
            readDocument(id, uri, uri.toString())
        }

    private val createLauncher =
        activity.registerForActivityResult(CreateDocument()) { uri ->
            val request = createRequest.also { createRequest = null } ?: return@registerForActivityResult
            if (uri == null) return@registerForActivityResult cancel(request.id)
            persistPermission(uri)
            io.execute {
                try {
                    documents.writeText(uri, request.content)
                    val saved = JSONObject()
                        .put("uri", uri.toString())
                        .put("name", documents.displayName(uri))
                    resolve(request.id, saved)
                } catch (e: Exception) {
                    reject(request.id, e)
                }
            }
        }

    private val imageLauncher =
        activity.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            val id = imageRequestId.also { imageRequestId = 0 }
            if (uri == null) return@registerForActivityResult cancel(id)
            io.execute {
                try {
                    val mime = activity.contentResolver.getType(uri) ?: "image/png"
                    val bytes = documents.readBytes(uri, MAX_IMAGE_BYTES)
                    resolve(id, "data:$mime;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
                } catch (e: Exception) {
                    reject(id, e)
                }
            }
        }

    override fun onPostMessage(
        view: WebView,
        message: WebMessageCompat,
        sourceOrigin: Uri,
        isMainFrame: Boolean,
        replyProxy: JavaScriptReplyProxy,
    ) {
        if (!isMainFrame) return
        // A (re)loaded page gets a fresh proxy; replies and events go to the newest one.
        this.replyProxy = replyProxy
        val msg = runCatching { JSONObject(message.data ?: return) }.getOrNull() ?: return
        val id = msg.optInt("id")
        val args = msg.optJSONObject("args") ?: JSONObject()

        when (msg.optString("method")) {
            "init" -> {
                val state = JSONObject()
                    .put("systemDark", isSystemDark())
                    .put("version", BuildConfig.VERSION_NAME)
                    .put("pendingDocument", pendingDocument ?: JSONObject.NULL)
                pendingDocument = null
                resolve(id, state)
            }

            "openDocument" -> {
                cancel(openRequestId)
                openRequestId = id
                launch(id) { openLauncher.launch(arrayOf("*/*")) }
            }

            "readDocument" -> {
                val uri = args.optString("uri")
                readDocument(id, Uri.parse(uri), uri)
            }

            "saveDocument" -> {
                val uri = Uri.parse(args.optString("uri"))
                val content = args.optString("content")
                io.execute {
                    try {
                        documents.writeText(uri, content)
                        resolve(id, null)
                    } catch (e: Exception) {
                        reject(id, e)
                    }
                }
            }

            "saveDocumentAs" -> {
                createRequest?.let { cancel(it.id) }
                createRequest = CreateRequest(id, args.optString("content"))
                val input = CreateDocument.Input(
                    args.optString("suggestedName", "Untitled.md"),
                    args.optString("mimeType", "text/markdown"),
                )
                launch(id) { createLauncher.launch(input) }
            }

            "pickImage" -> {
                cancel(imageRequestId)
                imageRequestId = id
                launch(id) {
                    imageLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                }
            }

            "shareText" -> shareText(args.optString("title"), args.optString("text"))
            "openExternal" -> openExternal(Uri.parse(args.optString("url")))
            "setStatusBarDark" -> setSystemBarsDark(args.optBoolean("dark"))
        }
    }

    /** Opens a file or shared text that another app sent to MarkText. */
    fun handleIntent(intent: Intent?) {
        intent ?: return
        when (intent.action) {
            Intent.ACTION_VIEW, Intent.ACTION_EDIT -> intent.data?.let { receiveFile(intent, it) }

            Intent.ACTION_SEND -> {
                val stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                when {
                    stream != null -> receiveFile(intent, stream)
                    text != null -> {
                        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()
                        val name = if (subject.isNullOrEmpty()) "Shared note.md" else "$subject.md"
                        deliverDocument(JSONObject().put("uri", "").put("name", name).put("content", text))
                    }
                }
            }
        }
    }

    fun notifySystemDark() {
        post(JSONObject().put("type", "systemDark").put("dark", isSystemDark()))
    }

    fun openExternal(uri: Uri) {
        if (uri.scheme?.lowercase() !in EXTERNAL_SCHEMES) return
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (e: ActivityNotFoundException) {
            toast("No app can open $uri")
        }
    }

    private fun receiveFile(intent: Intent, uri: Uri) {
        // Without a write grant the file opens as an untitled copy, so Save
        // asks where to put it instead of failing.
        val writable = intent.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION != 0
        if (intent.flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION != 0) persistPermission(uri)
        io.execute {
            try {
                val doc = JSONObject()
                    .put("uri", if (writable) uri.toString() else "")
                    .put("name", documents.displayName(uri))
                    .put("content", documents.readText(uri))
                main.post { deliverDocument(doc) }
            } catch (e: Exception) {
                main.post { toast("Couldn't open file: ${e.message}") }
            }
        }
    }

    private fun deliverDocument(doc: JSONObject) {
        if (replyProxy == null) {
            pendingDocument = doc
        } else {
            post(JSONObject().put("type", "externalDocument").put("document", doc))
        }
    }

    private fun readDocument(id: Int, uri: Uri, uriString: String) {
        io.execute {
            try {
                val doc = JSONObject()
                    .put("uri", uriString)
                    .put("name", documents.displayName(uri))
                    .put("content", documents.readText(uri))
                resolve(id, doc)
            } catch (e: Exception) {
                reject(id, e)
            }
        }
    }

    private fun persistPermission(uri: Uri) {
        val resolver = activity.contentResolver
        val readWrite = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            resolver.takePersistableUriPermission(uri, readWrite)
        } catch (e: SecurityException) {
            runCatching { resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        }
    }

    private fun shareText(title: String, text: String) {
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, title)
            .putExtra(Intent.EXTRA_TEXT, text)
        try {
            activity.startActivity(Intent.createChooser(send, title))
        } catch (e: RuntimeException) {
            // Binder transactions cap out around 1 MB.
            toast("This document is too large to share as text. Save it and share the file instead.")
        }
    }

    private fun setSystemBarsDark(dark: Boolean) {
        val style = if (dark) {
            SystemBarStyle.dark(Color.TRANSPARENT)
        } else {
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        }
        activity.enableEdgeToEdge(style, style)
        // Shows through the transparent bars; matches --app-surface in style.css.
        root.setBackgroundColor(if (dark) SURFACE_DARK else SURFACE_LIGHT)
    }

    private fun isSystemDark(): Boolean =
        activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
            Configuration.UI_MODE_NIGHT_YES

    private inline fun launch(id: Int, block: () -> Unit) {
        try {
            block()
        } catch (e: ActivityNotFoundException) {
            reject(id, e)
        }
    }

    // ---------- Replies (safe to call from any thread) ----------

    private fun resolve(id: Int, value: Any?) {
        if (id == 0) return
        post(
            JSONObject()
                .put("type", "resolve")
                .put("id", id)
                .put("ok", true)
                .put("value", value ?: JSONObject.NULL)
        )
    }

    private fun reject(id: Int, error: Exception) {
        if (id == 0) return
        post(
            JSONObject()
                .put("type", "resolve")
                .put("id", id)
                .put("ok", false)
                .put("error", error.message ?: error.javaClass.simpleName)
        )
    }

    private fun cancel(id: Int) {
        if (id == 0) return
        post(JSONObject().put("type", "resolve").put("id", id).put("ok", false).put("cancelled", true))
    }

    private fun post(message: JSONObject) {
        val text = message.toString()
        main.post { replyProxy?.postMessage(text) }
    }

    private fun toast(message: String) {
        Toast.makeText(activity, message, Toast.LENGTH_LONG).show()
    }

    /** ACTION_CREATE_DOCUMENT with a MIME type chosen per call (markdown or HTML). */
    private class CreateDocument : ActivityResultContract<CreateDocument.Input, Uri?>() {
        class Input(val name: String, val mimeType: String)

        override fun createIntent(context: Context, input: Input): Intent =
            Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(input.mimeType)
                .putExtra(Intent.EXTRA_TITLE, input.name)

        override fun parseResult(resultCode: Int, intent: Intent?): Uri? =
            if (resultCode == Activity.RESULT_OK) intent?.data else null
    }

    private companion object {
        const val MAX_IMAGE_BYTES = 10 * 1024 * 1024
        val EXTERNAL_SCHEMES = setOf("http", "https", "mailto", "tel")
        const val SURFACE_LIGHT = 0xFFF6F7F8.toInt()
        const val SURFACE_DARK = 0xFF26282C.toInt()
    }
}
