import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { exportIcs } from './ics'
import { getSpace } from './db/spaces'

const pad = (n: number): string => String(n).padStart(2, '0')

function nowStamp(): string {
  const d = new Date()
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'calendar'
}

// "Export calendar": writes an .ics for the whole calendar (spaceId null) or
// one space plus Global events, via a native save dialog.
export async function saveIcs(spaceId: number | null): Promise<{ ok: boolean }> {
  const name = spaceId == null ? 'Kaseki — All events' : `${getSpace(spaceId).name} — Kaseki`
  const ics = exportIcs(name, nowStamp(), spaceId)
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.SaveDialogOptions = {
    defaultPath: `${slug(name)}.ics`,
    filters: [{ name: 'Calendar', extensions: ['ics'] }]
  }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false }
  writeFileSync(result.filePath, ics)
  return { ok: true }
}
