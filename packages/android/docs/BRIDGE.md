# JS ↔ Kotlin bridge

The page (`web/src/native.ts`) and the shell (`app/.../NativeBridge.kt`) talk
over a single `WebViewCompat.addWebMessageListener` channel named
`MarkTextAndroid`, registered for the app's asset origin
(`https://appassets.androidplatform.net`) only. Messages from sub-frames are
ignored. All payloads are JSON strings.

## Requests (page → shell)

```json
{ "id": 7, "method": "saveDocument", "args": { "uri": "content://…", "content": "# Hi" } }
```

- `id > 0`: the page awaits exactly one `resolve` reply with the same id
  (`call()` in `native.ts`).
- `id: 0`: fire-and-forget (`notify()` in `native.ts`); the shell never replies.

## Replies and events (shell → page)

Replies to a request:

```json
{ "type": "resolve", "id": 7, "ok": true, "value": null }
{ "type": "resolve", "id": 7, "ok": false, "error": "Cannot write notes.md" }
{ "type": "resolve", "id": 7, "ok": false, "cancelled": true }
```

`cancelled` becomes a `CancelledError` in the page, which `reportError` in
`main.ts` ignores (the user backed out of a picker).

Unsolicited events:

| type | payload | when |
|---|---|---|
| `externalDocument` | `document: IDocument` | A VIEW/EDIT/SEND intent arrived while the page was loaded |
| `systemDark` | `dark: boolean` | System night mode changed (`onConfigurationChanged`) |

The shell also calls two page globals through `evaluateJavascript`:
`window.__mtHandleBack()` (returns `true` if the page closed something) and
`window.__mtOnPause()` (flush draft, auto-save).

## Method catalog

| method | id | args | resolves with | notes |
|---|---|---|---|---|
| `init` | ✓ | — | `{ systemDark, version, pendingDocument }` | `pendingDocument` is an intent that arrived before the page loaded |
| `openDocument` | ✓ | — | `IDocument` | `ACTION_OPEN_DOCUMENT`, persists the grant |
| `readDocument` | ✓ | `uri` | `IDocument` | Recent files; fails if the grant was revoked |
| `saveDocument` | ✓ | `uri, content` | `null` | "wt", falls back to "w" |
| `saveDocumentAs` | ✓ | `suggestedName, mimeType, content` | `{ uri, name }` | `ACTION_CREATE_DOCUMENT`; used for `.md` and HTML export |
| `pickImage` | ✓ | — | `data:` URL string | Photo picker, 10 MB cap |
| `shareText` | 0 | `title, text` | — | `ACTION_SEND` chooser (~1 MB Binder limit) |
| `openExternal` | 0 | `url` | — | http/https/mailto/tel only |
| `setStatusBarDark` | 0 | `dark` | — | System bar icon colour + root background |

`IDocument` is `{ uri, name, content }`; `uri` is `""` for a document with no
writable file yet (shared text, read-only VIEW intent), so Save becomes Save as.

## Adding a method — checklist

1. **Kotlin:** add a branch to the `when (msg.optString("method"))` in
   `NativeBridge.onPostMessage`. Do I/O on `io.execute { … }`; finish with
   exactly one `resolve`/`reject`/`cancel` (or none for `id: 0`). If it launches
   an activity, register the launcher as a property (not lazily) and cancel any
   superseded request id.
2. **Validate input**: URIs come from the page; only act on schemes/permissions
   the app actually holds. Never expose arbitrary file paths.
3. **TypeScript:** add a typed method on the `native` object in `native.ts`
   using `call<T>()` or `notify()`, plus a browser fallback (or a clean
   rejection) for `pnpm dev`.
4. **New event?** Extend `TNativeMessage`, handle it in `port.onmessage`, and
   expose an `onX(listener)` registration like `onSystemDarkChanged`.
5. Update the catalog above, and `README.md` if user-visible.
6. Test: web unit test with a fake port (once MAT-12 lands), manual test in a
   debug build via `chrome://inspect`.
