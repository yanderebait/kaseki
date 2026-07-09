import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { log } from './logger'

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report'
}

// "Export CSV" from the time & billing report: the renderer composes the CSV
// (it already holds the rows and the billing math); main just writes it to a
// user-chosen path via a native save dialog.
export async function exportReportCsv(name: string, csv: string): Promise<{ ok: boolean }> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.SaveDialogOptions = {
    defaultPath: `${slug(name)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false }
  try {
    writeFileSync(result.filePath, csv)
  } catch (error) {
    // A failed write (permissions, disk full, network share gone) previously
    // rejected the IPC promise and surfaced nowhere in the UI.
    log.error('Report CSV write failed', error)
    return { ok: false }
  }
  return { ok: true }
}
