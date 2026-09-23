// Bridge to the Kotlin shell (NativeBridge.kt). The shell registers
// `MarkTextAndroid` with `WebViewCompat.addWebMessageListener`, restricted to
// the app's own asset origin, so only this page (never an embedded frame) can
// reach file APIs. When the page runs in a desktop browser
// (`pnpm --filter marktext-android dev`) the same API falls back to
// <input type=file> and anchor downloads.

export interface IDocument {
  // Empty for a document that has no file yet (e.g. text shared from another app).
  uri: string
  name: string
  content: string
}

export interface ISavedDocument {
  uri: string
  name: string
}

interface IInitState {
  systemDark: boolean
  version: string
  pendingDocument: IDocument | null
}

interface IWebMessagePort {
  postMessage(message: string): void
  onmessage: ((event: MessageEvent<string>) => void) | null
}

type TNativeMessage =
  | { type: 'resolve'; id: number; ok: true; value?: unknown }
  | { type: 'resolve'; id: number; ok: false; cancelled?: boolean; error?: string }
  | { type: 'externalDocument'; document: IDocument }
  | { type: 'systemDark'; dark: boolean }

declare global {
  interface Window {
    MarkTextAndroid?: IWebMessagePort
    // Invoked by the shell through evaluateJavascript.
    __mtHandleBack?: () => boolean
    __mtOnPause?: () => void
  }
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
  }
}

const port = window.MarkTextAndroid
const pending = new Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void }>()
let nextId = 0

let onExternalDocument: (doc: IDocument) => void = () => {}
let onSystemDark: (dark: boolean) => void = () => {}

if (port) {
  port.onmessage = (event) => {
    const msg = JSON.parse(event.data) as TNativeMessage
    if (msg.type === 'externalDocument') {
      onExternalDocument(msg.document)
    } else if (msg.type === 'systemDark') {
      onSystemDark(msg.dark)
    } else {
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.ok) entry.resolve(msg.value)
      else entry.reject(msg.cancelled ? new CancelledError() : new Error(msg.error ?? 'Unknown error'))
    }
  }
}

function call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!port) return Promise.reject(new Error('Not available in the browser'))
  const id = ++nextId
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    port.postMessage(JSON.stringify({ id, method, args }))
  })
}

function notify(method: string, args: Record<string, unknown> = {}): void {
  port?.postMessage(JSON.stringify({ id: 0, method, args }))
}

// ---------- Browser fallbacks ----------

function browserPickFile(): Promise<IDocument> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain'
    input.addEventListener('change', async() => {
      const file = input.files?.[0]
      if (!file) return reject(new CancelledError())
      resolve({ uri: '', name: file.name, content: await file.text() })
    })
    input.addEventListener('cancel', () => reject(new CancelledError()))
    input.click()
  })
}

function browserDownload(name: string, mimeType: string, content: string): ISavedDocument {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { uri: '', name }
}

// ---------- Public API ----------

export const native = {
  // Resolves once the shell has answered with its startup state, including
  // any document another app sent before the page loaded.
  init(): Promise<IInitState> {
    if (!port) {
      return Promise.resolve({
        systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
        version: 'web',
        pendingDocument: null
      })
    }
    return call<IInitState>('init')
  },

  onExternalDocument(listener: (doc: IDocument) => void): void {
    onExternalDocument = listener
  },

  onSystemDarkChanged(listener: (dark: boolean) => void): void {
    onSystemDark = listener
  },

  openDocument(): Promise<IDocument> {
    return port ? call('openDocument') : browserPickFile()
  },

  readDocument(uri: string): Promise<IDocument> {
    return call('readDocument', { uri })
  },

  saveDocument(uri: string, content: string): Promise<void> {
    return call('saveDocument', { uri, content })
  },

  saveDocumentAs(suggestedName: string, mimeType: string, content: string): Promise<ISavedDocument> {
    if (!port) return Promise.resolve(browserDownload(suggestedName, mimeType, content))
    return call('saveDocumentAs', { suggestedName, mimeType, content })
  },

  // Resolves to a `data:` URL: the WebView cannot load `content://` URIs, and
  // a picked photo has no path relative to the markdown file.
  pickImage(): Promise<string> {
    return call('pickImage')
  },

  shareText(title: string, text: string): void {
    if (port) notify('shareText', { title, text })
    else navigator.share?.({ title, text }).catch(() => {})
  },

  openExternal(url: string): void {
    if (port) notify('openExternal', { url })
    else window.open(url, '_blank', 'noopener,noreferrer')
  },

  setStatusBarDark(dark: boolean): void {
    notify('setStatusBarDark', { dark })
  }
}
