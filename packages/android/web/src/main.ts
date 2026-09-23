import type { IMuyaOptions, ITocItem } from '@muyajs/core'
import {
  CodeBlockLanguageSelector,
  EmojiSelector,
  FootnoteTool,
  ImageEditTool,
  ImageResizeBar,
  ImageToolBar,
  InlineFormatToolbar,
  LinkTools,
  MarkdownToHtml,
  Muya,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
  PreviewToolBar,
  TableChessboard,
  TableColumnToolbar,
  TableDragBar,
  TableRowColumMenu,
  wordCount
} from '@muyajs/core'

import { hydrateIcons, icon } from './icons'
import { CancelledError, native } from './native'
import type { IDocument } from './native'
import { WELCOME_MARKDOWN } from './welcome'

import './style.css'

// ---------- Persistence ----------

interface ISettings {
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
interface ISession {
  uri: string
  name: string
  markdown: string
  savedMarkdown: string
}

interface IRecentFile {
  uri: string
  name: string
}

const DEFAULT_SETTINGS: ISettings = {
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
const UNTITLED = 'Untitled.md'

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

const settings: ISettings = { ...DEFAULT_SETTINGS, ...load<Partial<ISettings>>(KEY_SETTINGS, {}) }
const session: ISession = load<ISession>(KEY_SESSION, {
  uri: '',
  name: UNTITLED,
  markdown: WELCOME_MARKDOWN,
  savedMarkdown: WELCOME_MARKDOWN
})
let recent: IRecentFile[] = load<IRecentFile[]>(KEY_RECENT, [])

// ---------- DOM ----------

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!

const scroller = $('#scroller')
const sourceArea = $<HTMLTextAreaElement>('#source')
const drawer = $('#drawer')
const scrim = $('#scrim')
const findbar = $('#findbar')
const findInput = $<HTMLInputElement>('#find-input')
const replaceInput = $<HTMLInputElement>('#replace-input')
const sheet = $<HTMLDialogElement>('#sheet')
const settingsDialog = $<HTMLDialogElement>('#settings')
const settingsForm = $<HTMLFormElement>('#settings-form')

// ---------- Theme ----------

let systemDark = false
let appVersion = ''

function applyTheme(): void {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  native.setStatusBarDark(dark)
}

native.onSystemDarkChanged((dark) => {
  systemDark = dark
  applyTheme()
})

// ---------- Editor ----------

Muya.use(EmojiSelector)
Muya.use(FootnoteTool)
Muya.use(InlineFormatToolbar)
Muya.use(ImageEditTool, {
  imagePathPicker: async() => {
    try {
      return await native.pickImage()
    } catch (err) {
      reportError('Image', err)
      return ''
    }
  }
})
Muya.use(ImageToolBar)
Muya.use(ImageResizeBar)
Muya.use(CodeBlockLanguageSelector)
Muya.use(LinkTools, {
  jumpClick: (linkInfo: { href?: string } | null) => {
    const href = linkInfo?.href
    if (href && /^(?:https?|mailto|tel):/i.test(href)) native.openExternal(href)
  }
})
Muya.use(ParagraphFrontButton)
Muya.use(ParagraphFrontMenu)
Muya.use(TableChessboard)
Muya.use(TableColumnToolbar)
Muya.use(ParagraphQuickInsertMenu)
Muya.use(TableDragBar)
Muya.use(TableRowColumMenu)
Muya.use(PreviewToolBar)

function muyaOptions(): Partial<IMuyaOptions> {
  return {
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    focusMode: settings.focusMode,
    spellcheckEnabled: settings.spellcheckEnabled,
    wrapCodeBlocks: settings.wrapCodeBlocks,
    codeBlockLineNumbers: settings.codeBlockLineNumbers,
    autoPairBracket: settings.autoPair,
    autoPairMarkdownSyntax: settings.autoPair,
    autoPairQuote: settings.autoPair,
    frontMatter: settings.frontMatter,
    math: settings.math,
    footnote: settings.footnote,
    bulletListMarker: settings.bulletListMarker,
    superSubScript: true,
    texMathGfm: true,
    preferLooseListItem: false,
    // The desktop's hover-only hint does not fit touch screens.
    hideQuickInsertHint: true,
    mermaidTheme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default'
  } as Partial<IMuyaOptions>
}

let muya!: Muya
let sourceMode = false

function createEditor(markdown: string): void {
  let host = document.querySelector<HTMLElement>('#editor')
  if (!host) {
    host = document.createElement('div')
    host.id = 'editor'
    scroller.appendChild(host)
  }
  muya = new Muya(host, { markdown, ...muyaOptions() })
  muya.init()
  muya.on('json-change', scheduleChange)
}

function rebuildEditor(): void {
  const markdown = currentMarkdown()
  muya.destroy()
  createEditor(markdown)
}

function currentMarkdown(): string {
  return sourceMode ? sourceArea.value : muya.getMarkdown()
}

// ---------- Change tracking ----------

let changeTimer = 0
let autoSaveTimer = 0

function scheduleChange(): void {
  window.clearTimeout(changeTimer)
  changeTimer = window.setTimeout(flushChange, 300)
}

function flushChange(): void {
  window.clearTimeout(changeTimer)
  session.markdown = currentMarkdown()
  store(KEY_SESSION, session)
  updateTitle()
  if (settings.autoSave && session.uri && isDirty()) {
    window.clearTimeout(autoSaveTimer)
    autoSaveTimer = window.setTimeout(() => save({ quiet: true }), 2000)
  }
}

function isDirty(): boolean {
  return session.markdown !== session.savedMarkdown
}

function updateTitle(): void {
  $('#doc-title').textContent = session.name
  $('#doc-dirty').hidden = !isDirty()
  document.title = `${isDirty() ? '• ' : ''}${session.name} — MarkText`
}

function loadDocument(doc: { uri: string; name: string; content: string }): void {
  if (sourceMode) setSourceMode(false)
  session.uri = doc.uri
  session.name = doc.name || UNTITLED
  muya.setContent(doc.content)
  muya.clearHistory()
  // Compare against Muya's serialization, not the raw file, so formatting
  // differences in an untouched file do not mark it dirty.
  session.markdown = muya.getMarkdown()
  session.savedMarkdown = doc.uri ? session.markdown : ''
  store(KEY_SESSION, session)
  if (doc.uri) addRecent({ uri: doc.uri, name: session.name })
  updateTitle()
  scroller.scrollTop = 0
}

function confirmDiscard(): boolean {
  flushChange()
  return !isDirty() || window.confirm(`Discard unsaved changes to “${session.name}”?`)
}

// ---------- File commands ----------

function reportError(action: string, err: unknown): void {
  if (err instanceof CancelledError) return
  toast(`${action} failed: ${err instanceof Error ? err.message : String(err)}`)
}

function newDocument(): void {
  if (!confirmDiscard()) return
  loadDocument({ uri: '', name: UNTITLED, content: '' })
  muya.focus()
}

async function openDocument(): Promise<void> {
  if (!confirmDiscard()) return
  try {
    loadDocument(await native.openDocument())
  } catch (err) {
    reportError('Open', err)
  }
}

async function openRecent(file: IRecentFile): Promise<void> {
  if (file.uri === session.uri) return
  if (!confirmDiscard()) return
  try {
    loadDocument(await native.readDocument(file.uri))
  } catch (err) {
    recent = recent.filter((r) => r.uri !== file.uri)
    store(KEY_RECENT, recent)
    renderRecent()
    reportError('Open', err)
  }
}

let saving = false

async function save({ quiet = false } = {}): Promise<void> {
  if (!session.uri) return saveAs()
  if (saving) return
  flushChange()
  const content = session.markdown
  saving = true
  try {
    await native.saveDocument(session.uri, content)
    session.savedMarkdown = content
    store(KEY_SESSION, session)
    updateTitle()
    if (!quiet) toast(`Saved ${session.name}`)
  } catch (err) {
    reportError('Save', err)
  } finally {
    saving = false
  }
}

async function saveAs(): Promise<void> {
  flushChange()
  const content = session.markdown
  try {
    const saved = await native.saveDocumentAs(
      ensureExtension(session.name, '.md'),
      'text/markdown',
      content
    )
    if (!saved.uri) return toast(`Downloaded ${saved.name}`)
    session.uri = saved.uri
    session.name = saved.name
    session.savedMarkdown = content
    store(KEY_SESSION, session)
    addRecent({ uri: saved.uri, name: saved.name })
    updateTitle()
    toast(`Saved ${saved.name}`)
  } catch (err) {
    reportError('Save', err)
  }
}

function ensureExtension(name: string, ext: string): string {
  const base = name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')
  return base + ext
}

async function exportHtml(): Promise<void> {
  try {
    const title = session.name.replace(/\.[^.]+$/, '')
    const html = await new MarkdownToHtml(currentMarkdown(), muya).generate({ title })
    const saved = await native.saveDocumentAs(
      ensureExtension(session.name, '.html'),
      'text/html',
      html
    )
    toast(`Exported ${saved.name}`)
  } catch (err) {
    reportError('Export', err)
  }
}

function addRecent(file: IRecentFile): void {
  recent = [file, ...recent.filter((r) => r.uri !== file.uri)].slice(0, MAX_RECENT)
  store(KEY_RECENT, recent)
  renderRecent()
}

function renderRecent(): void {
  const list = $('#recent-list')
  list.replaceChildren()
  $('#recent-section').hidden = recent.length === 0
  for (const file of recent) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'drawer-item'
    btn.innerHTML = icon('history')
    btn.append(file.name)
    btn.addEventListener('click', () => {
      closeDrawer()
      openRecent(file)
    })
    list.appendChild(btn)
  }
}

function openExternalDocument(doc: IDocument): void {
  if (!confirmDiscard()) return
  loadDocument(doc)
}

native.onExternalDocument(openExternalDocument)

// ---------- Source mode ----------

function setSourceMode(on: boolean): void {
  if (on === sourceMode) return
  if (on) {
    sourceArea.value = muya.getMarkdown()
    sourceMode = true
    scroller.hidden = true
    sourceArea.hidden = false
    sourceArea.focus()
  } else {
    const markdown = sourceArea.value
    sourceMode = false
    // replaceContent keeps the source-mode edit as one undoable step.
    if (markdown !== muya.getMarkdown()) muya.replaceContent(markdown)
    sourceArea.hidden = true
    scroller.hidden = false
  }
  $('#btn-source').classList.toggle('active', sourceMode)
  $('#toolbar').classList.toggle('disabled', sourceMode)
}

sourceArea.addEventListener('input', scheduleChange)

// ---------- Formatting toolbar ----------

interface IToolbarItem {
  label: string
  icon?: string
  text?: string
  className?: string
  run: () => void
}

function dispatchTab(shiftKey: boolean): void {
  // Soft keyboards have no Tab key; Muya indents list items on a Tab keydown.
  muya.domNode.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true
    })
  )
}

function chooseHeading(): void {
  const options: Array<[string, string]> = [
    ['Paragraph', 'paragraph'],
    ['Heading 1', 'heading 1'],
    ['Heading 2', 'heading 2'],
    ['Heading 3', 'heading 3'],
    ['Heading 4', 'heading 4'],
    ['Heading 5', 'heading 5'],
    ['Heading 6', 'heading 6']
  ]
  openSheet(
    'Block type',
    options.map(([label, type]) => ({ label, run: () => muya.updateParagraph(type) }))
  )
}

function chooseInsert(): void {
  openSheet('Insert', [
    { label: 'Table (3 × 3)', run: () => muya.createTable({ rows: 3, columns: 3 }) },
    { label: 'Code block', run: () => muya.updateParagraph('pre') },
    { label: 'Math block', run: () => muya.updateParagraph('mathblock') },
    { label: 'Mermaid diagram', run: () => muya.updateParagraph('mermaid') },
    { label: 'HTML block', run: () => muya.updateParagraph('html') },
    { label: 'Front matter', run: () => muya.updateParagraph('front-matter') },
    { label: 'Horizontal rule', run: () => muya.updateParagraph('hr') },
    { label: 'Image', run: () => muya.format('image') }
  ])
}

const TOOLBAR: IToolbarItem[] = [
  { label: 'Block type', text: 'H', className: 'tool-heading', run: chooseHeading },
  { label: 'Bold', text: 'B', className: 'tool-bold', run: () => muya.format('strong') },
  { label: 'Italic', text: 'I', className: 'tool-italic', run: () => muya.format('em') },
  { label: 'Strikethrough', text: 'S', className: 'tool-strike', run: () => muya.format('del') },
  { label: 'Highlight', text: '==', className: 'tool-mark', run: () => muya.format('mark') },
  {
    label: 'Inline code',
    text: '`',
    className: 'tool-code',
    run: () => muya.format('inline_code')
  },
  { label: 'Link', icon: 'link', run: () => muya.format('link') },
  { label: 'Bulleted list', icon: 'list-bullet', run: () => muya.updateParagraph('ul-bullet') },
  { label: 'Numbered list', icon: 'list-number', run: () => muya.updateParagraph('ol-order') },
  { label: 'Task list', icon: 'list-task', run: () => muya.updateParagraph('ul-task') },
  { label: 'Outdent', icon: 'outdent', run: () => dispatchTab(true) },
  { label: 'Indent', icon: 'indent', run: () => dispatchTab(false) },
  { label: 'Quote', icon: 'quote', run: () => muya.updateParagraph('blockquote') },
  { label: 'Code block', icon: 'code-block', run: () => muya.updateParagraph('pre') },
  { label: 'Inline math', icon: 'math', run: () => muya.format('inline_math') },
  { label: 'Table', icon: 'table', run: () => muya.createTable({ rows: 3, columns: 3 }) },
  { label: 'Insert…', text: '+', className: 'tool-insert', run: chooseInsert }
]

function buildToolbar(): void {
  const bar = $('#toolbar')
  for (const item of TOOLBAR) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tool-btn'
    btn.setAttribute('aria-label', item.label)
    btn.title = item.label
    if (item.icon) btn.innerHTML = icon(item.icon)
    else {
      btn.textContent = item.text ?? ''
      if (item.className) btn.classList.add(item.className)
    }
    btn.addEventListener('click', () => {
      if (!sourceMode) item.run()
    })
    bar.appendChild(btn)
  }
}

// Tapping a button would otherwise move focus out of the contenteditable,
// collapsing the selection and dismissing the soft keyboard.
function keepEditorFocus(el: HTMLElement): void {
  el.addEventListener('pointerdown', (e) => e.preventDefault())
}

// ---------- Find & replace ----------

function searchOptions() {
  return {
    isCaseSensitive: $<HTMLInputElement>('#find-case').checked,
    isWholeWord: $<HTMLInputElement>('#find-word').checked,
    isRegexp: $<HTMLInputElement>('#find-regexp').checked
  }
}

function showMatches(result: { matches: unknown[]; index: number }): void {
  const count = result.matches.length
  $('#find-count').textContent = findInput.value
    ? count
      ? `${result.index + 1}/${count}`
      : '0/0'
    : ''
  requestAnimationFrame(() =>
    document.querySelector('.mu-highlight')?.scrollIntoView({ block: 'center' })
  )
}

function runSearch(): void {
  if (sourceMode) setSourceMode(false)
  showMatches(muya.search(findInput.value, { ...searchOptions(), highlightIndex: 0 }))
}

function openFind(): void {
  if (sourceMode) setSourceMode(false)
  findbar.hidden = false
  findInput.focus()
  findInput.select()
  if (findInput.value) runSearch()
}

function closeFind(): void {
  findbar.hidden = true
  muya.search('')
  $('#find-count').textContent = ''
}

findInput.addEventListener('input', runSearch)
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    showMatches(muya.find(e.shiftKey ? 'previous' : 'next'))
  }
})
for (const id of ['#find-case', '#find-word', '#find-regexp']) { $(id).addEventListener('change', runSearch) }
$('#find-prev').addEventListener('click', () => showMatches(muya.find('previous')))
$('#find-next').addEventListener('click', () => showMatches(muya.find('next')))
$('#find-close').addEventListener('click', closeFind)
$('#replace-one').addEventListener('click', () =>
  showMatches(muya.replace(replaceInput.value, { ...searchOptions(), isSingle: true }))
)
$('#replace-all').addEventListener('click', () =>
  showMatches(muya.replace(replaceInput.value, { ...searchOptions(), isSingle: false }))
)

// ---------- Drawer, sheets, dialogs ----------

function openDrawer(): void {
  flushChange()
  const stats = wordCount(session.markdown)
  $('#drawer-stats').textContent = `${stats.word} words · ${stats.character} characters`
  drawer.classList.add('open')
  scrim.hidden = false
}

function closeDrawer(): void {
  drawer.classList.remove('open')
  scrim.hidden = true
}

interface ISheetItem {
  label: string
  indent?: number
  run: () => void
}

function openSheet(title: string, items: ISheetItem[], emptyText = ''): void {
  $('#sheet-title').textContent = title
  const body = $('#sheet-body')
  body.replaceChildren()
  if (items.length === 0) {
    const p = document.createElement('p')
    p.className = 'sheet-empty'
    p.textContent = emptyText
    body.appendChild(p)
  }
  for (const item of items) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sheet-item'
    btn.style.paddingInlineStart = `${16 + (item.indent ?? 0) * 16}px`
    btn.textContent = item.label
    btn.addEventListener('click', () => {
      sheet.close()
      item.run()
    })
    body.appendChild(btn)
  }
  sheet.showModal()
}

// Tapping the backdrop (the dialog element itself, outside its content) closes it.
for (const dialog of [sheet, settingsDialog]) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close()
  })
}

function showOutline(): void {
  if (sourceMode) setSourceMode(false)
  const toc: ITocItem[] = muya.getTOC()
  const minLevel = Math.min(...toc.map((t) => t.lvl))
  openSheet(
    'Outline',
    toc.map((item, index) => ({
      label: item.content,
      indent: item.lvl - minLevel,
      run: () => scrollToHeading(index)
    })),
    'This document has no headings.'
  )
}

function scrollToHeading(index: number): void {
  const headings = scroller.querySelectorAll(
    '.mu-container > h1, .mu-container > h2, .mu-container > h3, .mu-container > h4, .mu-container > h5, .mu-container > h6'
  )
  headings[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function showAbout(): void {
  openSheet('About MarkText', [
    { label: `Version ${appVersion}`, run: () => {} },
    { label: 'Website — marktext.me', run: () => native.openExternal('https://marktext.me') },
    {
      label: 'Source on GitHub',
      run: () => native.openExternal('https://github.com/marktext/marktext')
    },
    { label: 'License: MIT', run: () => {} }
  ])
}

// ---------- Settings ----------

function fillSettingsForm(): void {
  const els = settingsForm.elements
  for (const [key, value] of Object.entries(settings)) {
    const el = els.namedItem(key) as HTMLInputElement | HTMLSelectElement | null
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value)
    else el.value = String(value)
  }
  updateSettingOutputs()
}

function updateSettingOutputs(): void {
  const els = settingsForm.elements
  ;(els.namedItem('fontSizeOut') as HTMLOutputElement).value = `${settings.fontSize}px`
  ;(els.namedItem('lineHeightOut') as HTMLOutputElement).value = settings.lineHeight.toFixed(1)
}

let settingsChanged = false

settingsForm.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement
  const key = el.name as keyof ISettings
  if (!(key in settings)) return
  const current = settings[key]
  const value =
    typeof current === 'boolean'
      ? (el as HTMLInputElement).checked
      : typeof current === 'number'
        ? Number(el.value)
        : el.value
  ;(settings as unknown as Record<string, unknown>)[key] = value
  store(KEY_SETTINGS, settings)
  updateSettingOutputs()
  if (key === 'theme') applyTheme()
  // Font changes are cheap to apply live; everything else waits for the dialog to close.
  if (key === 'fontSize' || key === 'lineHeight') muya.setOptions({ [key]: value })
  settingsChanged = true
})

settingsDialog.addEventListener('close', () => {
  if (!settingsChanged) return
  settingsChanged = false
  flushChange()
  rebuildEditor()
})

// ---------- Snackbar ----------

let toastTimer = 0

function toast(message: string): void {
  const bar = $('#snackbar')
  bar.textContent = message
  bar.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => bar.classList.remove('show'), 2600)
}

// ---------- Wiring ----------

const DRAWER_ACTIONS: Record<string, () => void> = {
  new: newDocument,
  open: () => openDocument(),
  save: () => save(),
  'save-as': () => saveAs(),
  outline: showOutline,
  'export-html': () => exportHtml(),
  share: () => {
    flushChange()
    native.shareText(session.name, session.markdown)
  },
  settings: () => {
    fillSettingsForm()
    settingsDialog.showModal()
  },
  about: showAbout
}

for (const item of document.querySelectorAll<HTMLElement>('.drawer-item[data-action]')) {
  item.addEventListener('click', () => {
    closeDrawer()
    DRAWER_ACTIONS[item.dataset.action ?? '']?.()
  })
}

$('#btn-menu').addEventListener('click', openDrawer)
scrim.addEventListener('click', closeDrawer)
$('#btn-undo').addEventListener('click', () =>
  sourceMode ? document.execCommand('undo') : muya.undo()
)
$('#btn-redo').addEventListener('click', () =>
  sourceMode ? document.execCommand('redo') : muya.redo()
)
$('#btn-find').addEventListener('click', () => (findbar.hidden ? openFind() : closeFind()))
$('#btn-source').addEventListener('click', () => setSourceMode(!sourceMode))
$('#btn-save').addEventListener('click', () => save())

for (const id of ['#btn-undo', '#btn-redo', '#btn-save']) keepEditorFocus($(id))
keepEditorFocus($('#toolbar'))

// Hardware keyboard shortcuts (e.g. a Bluetooth keyboard or OnePlus Pad).
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 's') {
    e.preventDefault()
    if (e.shiftKey) saveAs()
    else save()
  } else if (key === 'o') {
    e.preventDefault()
    openDocument()
  } else if (key === 'f') {
    e.preventDefault()
    openFind()
  } else if (key === 'e' && e.altKey) {
    e.preventDefault()
    setSourceMode(!sourceMode)
  }
})

// Called by the shell for the system back gesture; `false` lets the activity finish.
window.__mtHandleBack = () => {
  if (sheet.open) return (sheet.close(), true)
  if (settingsDialog.open) return (settingsDialog.close(), true)
  if (drawer.classList.contains('open')) return (closeDrawer(), true)
  if (!findbar.hidden) return (closeFind(), true)
  if (sourceMode) return (setSourceMode(false), true)
  flushChange()
  return false
}

window.__mtOnPause = () => {
  flushChange()
  if (settings.autoSave && session.uri && isDirty()) save({ quiet: true })
}

// ---------- Boot ----------

const initState = await native.init()
systemDark = initState.systemDark
appVersion = initState.version

applyTheme()
hydrateIcons()
buildToolbar()
renderRecent()
const wasClean = !isDirty()
createEditor(session.markdown)
if (wasClean) session.markdown = session.savedMarkdown = muya.getMarkdown()
updateTitle()

if (initState.pendingDocument) openExternalDocument(initState.pendingDocument)
