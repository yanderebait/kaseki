import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { getPage } from './db/knowledge'
import { pmToMarkdown } from './prosemirror'

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page'
}

// "Export page as Markdown": serializes one page (title as the top heading)
// and writes it via a native save dialog. The whole-tree zip archive and
// PDF/HTML exports are deferred per the agreed Phase 6 scope.
export async function exportPageMarkdown(pageId: number): Promise<{ ok: boolean }> {
  const page = getPage(pageId)
  if (!page) return { ok: false }
  const markdown = pmToMarkdown(page.content, page.title)
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.SaveDialogOptions = {
    defaultPath: `${slug(page.title)}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false }
  writeFileSync(result.filePath, markdown)
  return { ok: true }
}
