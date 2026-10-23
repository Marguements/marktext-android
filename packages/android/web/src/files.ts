import { MarkdownToHtml } from '@muyajs/core'

import {
  currentMarkdown,
  flushChange,
  isSourceMode,
  muya,
  onFlush,
  setSourceMode,
  updateTitle
} from './editor'
import { native } from './native'
import type { IDocument } from './native'
import {
  addRecent,
  isDirty,
  persistSession,
  removeRecent,
  session,
  settings,
  UNTITLED
} from './state'
import type { IRecentFile } from './state'
import { $, reportError, toast } from './ui'

export function loadDocument(doc: IDocument): void {
  if (isSourceMode()) setSourceMode(false)
  session.uri = doc.uri
  session.name = doc.name || UNTITLED
  muya.setContent(doc.content)
  muya.clearHistory()
  // Compare against Muya's serialization, not the raw file, so formatting
  // differences in an untouched file do not mark it dirty.
  session.markdown = muya.getMarkdown()
  session.savedMarkdown = doc.uri ? session.markdown : ''
  persistSession()
  if (doc.uri) addRecent({ uri: doc.uri, name: session.name })
  updateTitle()
  $('#scroller').scrollTop = 0
}

function confirmDiscard(): boolean {
  flushChange()
  return !isDirty() || window.confirm(`Discard unsaved changes to “${session.name}”?`)
}

export function newDocument(): void {
  if (!confirmDiscard()) return
  loadDocument({ uri: '', name: UNTITLED, content: '' })
  muya.focus()
}

export async function openDocument(): Promise<void> {
  if (!confirmDiscard()) return
  try {
    loadDocument(await native.openDocument())
  } catch (err) {
    reportError('Open', err)
  }
}

export async function openRecent(file: IRecentFile): Promise<void> {
  if (file.uri === session.uri) return
  if (!confirmDiscard()) return
  try {
    loadDocument(await native.readDocument(file.uri))
  } catch (err) {
    removeRecent(file.uri)
    reportError('Open', err)
  }
}

export function openExternalDocument(doc: IDocument): void {
  if (!confirmDiscard()) return
  loadDocument(doc)
}

let saving = false

export async function save({ quiet = false } = {}): Promise<void> {
  if (!session.uri) return saveAs()
  if (saving) return
  flushChange()
  const content = session.markdown
  saving = true
  try {
    await native.saveDocument(session.uri, content)
    session.savedMarkdown = content
    persistSession()
    updateTitle()
    if (!quiet) toast(`Saved ${session.name}`)
  } catch (err) {
    reportError('Save', err)
  } finally {
    saving = false
  }
}

export async function saveAs(): Promise<void> {
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
    persistSession()
    addRecent({ uri: saved.uri, name: saved.name })
    updateTitle()
    toast(`Saved ${saved.name}`)
  } catch (err) {
    reportError('Save', err)
  }
}

export function ensureExtension(name: string, ext: string): string {
  const base = name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')
  return base + ext
}

export async function exportHtml(): Promise<void> {
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

export function shareDocument(): void {
  flushChange()
  native.shareText(session.name, session.markdown)
}

// Saves only a document that already has a file; never opens a picker.
export function autoSaveNow(): void {
  if (settings.autoSave && session.uri && isDirty()) save({ quiet: true })
}

let autoSaveTimer = 0

export function initFiles(): void {
  onFlush(() => {
    if (settings.autoSave && session.uri && isDirty()) {
      window.clearTimeout(autoSaveTimer)
      autoSaveTimer = window.setTimeout(() => save({ quiet: true }), 2000)
    }
  })
}
