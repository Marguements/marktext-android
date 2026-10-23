import type { IMuyaOptions } from '@muyajs/core'
import {
  CodeBlockLanguageSelector,
  EmojiSelector,
  FootnoteTool,
  ImageEditTool,
  ImageResizeBar,
  ImageToolBar,
  InlineFormatToolbar,
  LinkTools,
  Muya,
  ParagraphFrontButton,
  ParagraphFrontMenu,
  ParagraphQuickInsertMenu,
  PreviewToolBar,
  TableChessboard,
  TableColumnToolbar,
  TableDragBar,
  TableRowColumMenu
} from '@muyajs/core'

import { native } from './native'
import { isDirty, persistSession, session, settings } from './state'
import { $, reportError } from './ui'

const sourceArea = (): HTMLTextAreaElement => $<HTMLTextAreaElement>('#source')

export function registerPlugins(): void {
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
}

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

// Replaced by `rebuildEditor`; importers see the current instance through the live binding.
export let muya!: Muya
let sourceMode = false

export function isSourceMode(): boolean {
  return sourceMode
}

export function createEditor(markdown: string): void {
  let host = document.querySelector<HTMLElement>('#editor')
  if (!host) {
    host = document.createElement('div')
    host.id = 'editor'
    $('#scroller').appendChild(host)
  }
  muya = new Muya(host, { markdown, ...muyaOptions() })
  muya.init()
  muya.on('json-change', scheduleChange)
}

export function rebuildEditor(): void {
  const markdown = currentMarkdown()
  muya.destroy()
  createEditor(markdown)
}

export function currentMarkdown(): string {
  return sourceMode ? sourceArea().value : muya.getMarkdown()
}

// ---------- Source mode ----------

export function setSourceMode(on: boolean): void {
  if (on === sourceMode) return
  const scroller = $('#scroller')
  const area = sourceArea()
  if (on) {
    area.value = muya.getMarkdown()
    sourceMode = true
    scroller.hidden = true
    area.hidden = false
    area.focus()
  } else {
    const markdown = area.value
    sourceMode = false
    // replaceContent keeps the source-mode edit as one undoable step.
    if (markdown !== muya.getMarkdown()) muya.replaceContent(markdown)
    area.hidden = true
    scroller.hidden = false
  }
  $('#btn-source').classList.toggle('active', sourceMode)
  $('#toolbar').classList.toggle('disabled', sourceMode)
}

// ---------- Change tracking ----------

let changeTimer = 0
let afterFlush: () => void = () => {}

export function scheduleChange(): void {
  window.clearTimeout(changeTimer)
  changeTimer = window.setTimeout(flushChange, 300)
}

export function flushChange(): void {
  window.clearTimeout(changeTimer)
  session.markdown = currentMarkdown()
  persistSession()
  updateTitle()
  afterFlush()
}

// Lets `files.ts` schedule auto-save without this module depending on it.
export function onFlush(listener: () => void): void {
  afterFlush = listener
}

export function updateTitle(): void {
  $('#doc-title').textContent = session.name
  $('#doc-dirty').hidden = !isDirty()
  document.title = `${isDirty() ? '• ' : ''}${session.name} — MarkText`
}

export function initEditor(): void {
  sourceArea().addEventListener('input', scheduleChange)
}
