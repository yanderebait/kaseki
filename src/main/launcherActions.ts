import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron'
import { spawn } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { paths } from './paths'
import { createAppItem, getItemTarget, getLauncherItem, listLauncherItems, setItemIcon } from './db/launcher'
import type { LauncherItem } from '../shared/types'
import { log } from './logger'

const ICON_PX = 64

export interface LaunchResult {
  ok: boolean
  error?: string
}

// spawn() reports launch failures (EACCES, ENOENT, ENOEXEC) asynchronously
// on the child's 'error' event — a try/catch around the call cannot see
// them, and in 0.1.0 they surfaced as an unhandled 'error' event after
// launchItem had already returned ok. This wraps the handshake: resolve on
// 'spawn', reject on 'error'.
function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

// Resolves the item by id (the renderer never passes a path) and launches
// it. URLs go to the default browser; apps go to the OS — shell.openPath on
// Windows/macOS, a detached spawn on Linux where openPath would not execute
// a plain binary. Linux .desktop entries (the most common thing a user picks
// when browsing for an "app") are text files, not executables — they go
// through gio launch, which reads the Exec line properly.
export async function launchItem(id: number): Promise<LaunchResult> {
  const target = getItemTarget(id)
  if (!target) return { ok: false, error: 'Item not found.' }
  if (!target.available) return { ok: false, error: 'Not available on this machine.' }
  try {
    if (target.kind === 'url') {
      if (!/^https?:\/\//i.test(target.pathOrUrl)) {
        return { ok: false, error: 'Only http(s) links can be opened.' }
      }
      await shell.openExternal(target.pathOrUrl)
    } else if (process.platform === 'linux') {
      if (extname(target.pathOrUrl).toLowerCase() === '.desktop') {
        await spawnDetached('gio', ['launch', target.pathOrUrl])
      } else {
        await spawnDetached(target.pathOrUrl, [])
      }
    } else {
      const err = await shell.openPath(target.pathOrUrl)
      if (err) return { ok: false, error: err }
    }
    return { ok: true }
  } catch (error) {
    log.error('Launch failed', error)
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'EACCES' || code === 'ENOEXEC') {
      return { ok: false, error: 'That file is not executable.' }
    }
    if (code === 'ENOENT') {
      return { ok: false, error: 'The program was not found.' }
    }
    return { ok: false, error: 'Could not launch this item.' }
  }
}

// Removes the on-disk icon files for every launcher item in a space —
// called before the space itself is deleted so the icons/ directory does
// not accumulate orphans.
export function removeSpaceLauncherIcons(spaceId: number): void {
  for (const item of listLauncherItems(spaceId)) {
    try {
      rmSync(join(paths.icons, `icon-${item.id}.png`), { force: true })
    } catch {
      // best-effort cleanup
    }
  }
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

async function pickFile(options: Electron.OpenDialogOptions): Promise<string | null> {
  const win = parentWindow()
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

function appFilters(): Electron.FileFilter[] {
  if (process.platform === 'win32') {
    return [{ name: 'Programs', extensions: ['exe', 'lnk', 'bat', 'cmd'] }]
  }
  if (process.platform === 'darwin') {
    return [{ name: 'Applications', extensions: ['app'] }]
  }
  return [{ name: 'All files', extensions: ['*'] }]
}

// Browse for an executable, create the item, then extract its native icon
// (no network) into icons/. Icon files are named by item id.
export async function addAppViaDialog(spaceId: number): Promise<LauncherItem | null> {
  const appPath = await pickFile({ properties: ['openFile'], filters: appFilters() })
  if (!appPath) return null
  const name = basename(appPath, extname(appPath))
  const item = createAppItem(spaceId, name, appPath, null)
  try {
    const image = await app.getFileIcon(appPath, { size: 'large' })
    if (!image.isEmpty()) {
      const file = `app-${item.id}.png`
      writeFileSync(join(paths.icons, file), image.resize({ width: ICON_PX, height: ICON_PX }).toPNG())
      setItemIcon(item.id, file)
    }
  } catch (error) {
    log.warn('App icon extraction failed', error)
  }
  return getLauncherItem(item.id)
}

// Upload a custom icon: resize to icon dimensions with nativeImage and store
// it. No extra image dependency.
export async function setIconViaDialog(id: number): Promise<LauncherItem | null> {
  const imagePath = await pickFile({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
  })
  if (!imagePath) return null
  const image = nativeImage.createFromPath(imagePath)
  if (image.isEmpty()) return null
  const file = `icon-${id}.png`
  writeFileSync(join(paths.icons, file), image.resize({ width: ICON_PX, height: ICON_PX }).toPNG())
  setItemIcon(id, file)
  return getLauncherItem(id)
}
