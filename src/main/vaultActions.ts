import { BrowserWindow, clipboard, dialog } from 'electron'
import { addFile } from './vault/store'
import { getPreferences } from './db/prefs'
import type { VaultFile } from '../shared/types'

const CLIPBOARD_CLEAR_MS = 30_000
let clipboardTimer: ReturnType<typeof setTimeout> | null = null

// Clipboard auto-clear (Part 11): 30 seconds after sensitive content is
// copied, clear the clipboard — but only if it still holds what was copied,
// so we never clobber something the user copied since. Enabled by default;
// the user can turn it off in settings. Returns whether a clear was armed,
// so the renderer knows to show the countdown toast.
export function scheduleClipboardClear(): boolean {
  if (getPreferences().vaultClipboardClear === false) return false
  const captured = clipboard.readText()
  if (!captured) return false
  if (clipboardTimer) clearTimeout(clipboardTimer)
  clipboardTimer = setTimeout(() => {
    if (clipboard.readText() === captured) clipboard.clear()
    clipboardTimer = null
  }, CLIPBOARD_CLEAR_MS)
  return true
}

// "Add file" to the sensitive folder: a native, user-driven dialog — the only
// way a path enters, and it stays in the main process. The picked file is
// encrypted into the vault immediately.
export async function addFilesViaDialog(): Promise<VaultFile[]> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'All files', extensions: ['*'] }]
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths.map((p) => addFile(p))
}
