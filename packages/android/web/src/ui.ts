import { CancelledError } from './native'

// Shared chrome primitives: element lookup, snackbar, and the bottom sheet
// that the toolbar and drawer both open.

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector<T>(sel)!

// ---------- Snackbar ----------

let toastTimer = 0

export function toast(message: string): void {
  const bar = $('#snackbar')
  bar.textContent = message
  bar.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => bar.classList.remove('show'), 2600)
}

export function reportError(action: string, err: unknown): void {
  if (err instanceof CancelledError) return
  toast(`${action} failed: ${err instanceof Error ? err.message : String(err)}`)
}

// ---------- Sheet ----------

export interface ISheetItem {
  label: string
  indent?: number
  run: () => void
}

export function openSheet(title: string, items: ISheetItem[], emptyText = ''): void {
  const sheet = $<HTMLDialogElement>('#sheet')
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

export function closeSheet(): boolean {
  const sheet = $<HTMLDialogElement>('#sheet')
  if (!sheet.open) return false
  sheet.close()
  return true
}

// Tapping the backdrop (the dialog element itself, outside its content) closes it.
export function closeOnBackdrop(dialog: HTMLDialogElement): void {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close()
  })
}

// Tapping a button would otherwise move focus out of the contenteditable,
// collapsing the selection and dismissing the soft keyboard.
export function keepEditorFocus(el: HTMLElement): void {
  el.addEventListener('pointerdown', (e) => e.preventDefault())
}
