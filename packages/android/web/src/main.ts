import { closeDrawer, initDrawer, isDrawerOpen, setAppVersion } from './drawer'
import {
  createEditor,
  flushChange,
  initEditor,
  isSourceMode,
  muya,
  registerPlugins,
  setSourceMode,
  updateTitle
} from './editor'
import { autoSaveNow, initFiles, openDocument, openExternalDocument, save, saveAs } from './files'
import { closeFind, initFind, isFindOpen, openFind } from './find'
import { hydrateIcons } from './icons'
import { native } from './native'
import { closeSettings, initSettings, setSystemDark } from './settings'
import { isDirty, session } from './state'
import { buildToolbar } from './toolbar'
import { $, closeOnBackdrop, closeSheet, keepEditorFocus } from './ui'

import './style.css'

native.onSystemDarkChanged(setSystemDark)
native.onExternalDocument(openExternalDocument)

registerPlugins()
initEditor()
initFiles()
initFind()
initSettings()
initDrawer()
closeOnBackdrop($<HTMLDialogElement>('#sheet'))

$('#btn-undo').addEventListener('click', () =>
  isSourceMode() ? document.execCommand('undo') : muya.undo()
)
$('#btn-redo').addEventListener('click', () =>
  isSourceMode() ? document.execCommand('redo') : muya.redo()
)
$('#btn-find').addEventListener('click', () => (isFindOpen() ? closeFind() : openFind()))
$('#btn-source').addEventListener('click', () => setSourceMode(!isSourceMode()))
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
    setSourceMode(!isSourceMode())
  }
})

// Called by the shell for the system back gesture; `false` lets the activity finish.
window.__mtHandleBack = () => {
  if (closeSheet()) return true
  if (closeSettings()) return true
  if (isDrawerOpen()) return (closeDrawer(), true)
  if (isFindOpen()) return (closeFind(), true)
  if (isSourceMode()) return (setSourceMode(false), true)
  flushChange()
  return false
}

window.__mtOnPause = () => {
  flushChange()
  autoSaveNow()
}

// ---------- Boot ----------

const initState = await native.init()
setAppVersion(initState.version)
setSystemDark(initState.systemDark)

hydrateIcons()
buildToolbar()
const wasClean = !isDirty()
createEditor(session.markdown)
// Adopt Muya's serialization of an unmodified draft so it does not boot dirty.
if (wasClean) session.markdown = session.savedMarkdown = muya.getMarkdown()
updateTitle()

if (initState.pendingDocument) openExternalDocument(initState.pendingDocument)
