import type { ITocItem } from '@muyajs/core'
import { wordCount } from '@muyajs/core'

import { flushChange, isSourceMode, muya, setSourceMode } from './editor'
import {
  exportHtml,
  newDocument,
  openDocument,
  openRecent,
  save,
  saveAs,
  shareDocument
} from './files'
import { icon } from './icons'
import { native } from './native'
import { openSettings } from './settings'
import { recentFiles, session } from './state'
import { $, openSheet } from './ui'

let appVersion = ''

export function isDrawerOpen(): boolean {
  return $('#drawer').classList.contains('open')
}

export function openDrawer(): void {
  flushChange()
  const stats = wordCount(session.markdown)
  $('#drawer-stats').textContent = `${stats.word} words · ${stats.character} characters`
  // The list is only visible here, so rendering on open covers every change to it.
  renderRecent()
  $('#drawer').classList.add('open')
  $('#scrim').hidden = false
}

export function closeDrawer(): void {
  $('#drawer').classList.remove('open')
  $('#scrim').hidden = true
}

function renderRecent(): void {
  const recent = recentFiles()
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

function showOutline(): void {
  if (isSourceMode()) setSourceMode(false)
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
  const headings = $('#scroller').querySelectorAll(
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

// Keyed by `data-action` on the drawer items in index.html.
const DRAWER_ACTIONS: Record<string, () => void> = {
  new: newDocument,
  open: () => openDocument(),
  save: () => save(),
  'save-as': () => saveAs(),
  outline: showOutline,
  'export-html': () => exportHtml(),
  share: shareDocument,
  settings: openSettings,
  about: showAbout
}

export function setAppVersion(version: string): void {
  appVersion = version
}

export function initDrawer(): void {
  for (const item of document.querySelectorAll<HTMLElement>('.drawer-item[data-action]')) {
    item.addEventListener('click', () => {
      closeDrawer()
      DRAWER_ACTIONS[item.dataset.action ?? '']?.()
    })
  }
  $('#btn-menu').addEventListener('click', openDrawer)
  $('#scrim').addEventListener('click', closeDrawer)
}
