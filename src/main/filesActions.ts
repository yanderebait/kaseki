import { BrowserWindow, dialog, shell } from 'electron'
import { copyFileSync } from 'node:fs'
import { ingestFile, getFile, getFilePath } from './db/files'
import type { FileRecord } from '../shared/types'

// Cmd+O / "Open file": pick a file from disk and ingest it into uploads/.
// The only path the renderer can introduce a file by, and it's a native,
// user-driven dialog.
export async function pickAndIngest(): Promise<FileRecord | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      {
        name: 'Documents',
        extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'md', 'markdown', 'csv', 'txt', 'log', 'json']
      },
      { name: 'All files', extensions: ['*'] }
    ]
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return ingestFile(result.filePaths[0])
}

// "Save as…": copy the stored blob to a user-chosen location (no in-app
// download folder — the file goes straight where the user wants it).
export async function saveCopy(id: number): Promise<{ ok: boolean; error?: string }> {
  const file = getFile(id)
  const target = getFilePath(id)
  if (!file || !target) return { ok: false, error: 'File not found.' }
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.SaveDialogOptions = { defaultPath: file.name }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false }
  copyFileSync(target.path, result.filePath)
  return { ok: true }
}

export function revealFile(id: number): void {
  const target = getFilePath(id)
  if (target) shell.showItemInFolder(target.path)
}
