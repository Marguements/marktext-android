import { flushChange, muya, rebuildEditor } from './editor'
import { native } from './native'
import { persistSettings, settings } from './state'
import type { ISettings } from './state'
import { $, closeOnBackdrop } from './ui'

const settingsDialog = (): HTMLDialogElement => $<HTMLDialogElement>('#settings')
const settingsForm = (): HTMLFormElement => $<HTMLFormElement>('#settings-form')

// ---------- Theme ----------

let systemDark = false

export function setSystemDark(dark: boolean): void {
  systemDark = dark
  applyTheme()
}

function applyTheme(): void {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  native.setStatusBarDark(dark)
}

// ---------- Dialog ----------

function fillSettingsForm(): void {
  const els = settingsForm().elements
  for (const [key, value] of Object.entries(settings)) {
    const el = els.namedItem(key) as HTMLInputElement | HTMLSelectElement | null
    if (!el) continue
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value)
    else el.value = String(value)
  }
  updateSettingOutputs()
}

function updateSettingOutputs(): void {
  const els = settingsForm().elements
  ;(els.namedItem('fontSizeOut') as HTMLOutputElement).value = `${settings.fontSize}px`
  ;(els.namedItem('lineHeightOut') as HTMLOutputElement).value = settings.lineHeight.toFixed(1)
}

export function openSettings(): void {
  fillSettingsForm()
  settingsDialog().showModal()
}

export function closeSettings(): boolean {
  const dialog = settingsDialog()
  if (!dialog.open) return false
  dialog.close()
  return true
}

let settingsChanged = false

export function initSettings(): void {
  const dialog = settingsDialog()
  closeOnBackdrop(dialog)

  settingsForm().addEventListener('input', (e) => {
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
    persistSettings()
    updateSettingOutputs()
    if (key === 'theme') applyTheme()
    // Font changes are cheap to apply live; everything else waits for the dialog to close.
    if (key === 'fontSize' || key === 'lineHeight') muya.setOptions({ [key]: value })
    settingsChanged = true
  })

  dialog.addEventListener('close', () => {
    if (!settingsChanged) return
    settingsChanged = false
    flushChange()
    rebuildEditor()
  })
}
