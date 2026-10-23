import { WELCOME_MARKDOWN } from './welcome'

export interface ISettings {
  theme: 'system' | 'light' | 'dark'
  fontSize: number
  lineHeight: number
  autoSave: boolean
  focusMode: boolean
  spellcheckEnabled: boolean
  wrapCodeBlocks: boolean
  codeBlockLineNumbers: boolean
  autoPair: boolean
  frontMatter: boolean
  math: boolean
  footnote: boolean
  bulletListMarker: string
}

// The open document. `savedMarkdown` is what the file on disk holds, so the
// dirty flag survives the app being killed and relaunched.
export interface ISession {
  uri: string
  name: string
  markdown: string
  savedMarkdown: string
}

export interface IRecentFile {
  uri: string
  name: string
}

export const DEFAULT_SETTINGS: ISettings = {
  theme: 'system',
  fontSize: 17,
  lineHeight: 1.6,
  autoSave: false,
  focusMode: false,
  spellcheckEnabled: false,
  wrapCodeBlocks: true,
  codeBlockLineNumbers: false,
  autoPair: true,
  frontMatter: true,
  math: true,
  footnote: true,
  bulletListMarker: '-'
}

const KEY_SETTINGS = 'mt.settings'
const KEY_SESSION = 'mt.session'
const KEY_RECENT = 'mt.recent'
const MAX_RECENT = 12
export const UNTITLED = 'Untitled.md'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded on a huge document: the in-memory copy is still intact.
  }
}

export const settings: ISettings = {
  ...DEFAULT_SETTINGS,
  ...load<Partial<ISettings>>(KEY_SETTINGS, {})
}
export const session: ISession = load<ISession>(KEY_SESSION, {
  uri: '',
  name: UNTITLED,
  markdown: WELCOME_MARKDOWN,
  savedMarkdown: WELCOME_MARKDOWN
})
let recent: IRecentFile[] = load<IRecentFile[]>(KEY_RECENT, [])

export function persistSettings(): void {
  store(KEY_SETTINGS, settings)
}

export function persistSession(): void {
  store(KEY_SESSION, session)
}

export function isDirty(): boolean {
  return session.markdown !== session.savedMarkdown
}

export function recentFiles(): readonly IRecentFile[] {
  return recent
}

export function addRecent(file: IRecentFile): void {
  recent = [file, ...recent.filter((r) => r.uri !== file.uri)].slice(0, MAX_RECENT)
  store(KEY_RECENT, recent)
}

export function removeRecent(uri: string): void {
  recent = recent.filter((r) => r.uri !== uri)
  store(KEY_RECENT, recent)
}
