import { BrowserWindow } from 'electron'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { marked } from 'marked'
import { parseCsv } from '../shared/csv'
import { getFile, getFilePath } from './db/files'
import { buildCombinedPdf } from './exportActions'
import { paths } from './paths'
import type { FileRecord } from '../shared/types'
import { log } from './logger'

export interface PrintResult {
  ok: boolean
  error?: string
}

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string
  )
}

// Uses the same RFC-4180 parser as the on-screen viewer (shared/csv) — the
// print path previously split on raw commas and mangled quoted fields.
function csvToTable(text: string): string {
  const rows = parseCsv(text.trim()).filter((r) => r.length > 1 || (r[0] ?? '').length > 0)
  const head = (rows[0] ?? []).map((c) => `<th>${esc(c)}</th>`).join('')
  const body = rows
    .slice(1)
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

// A print-friendly HTML document for the non-PDF kinds. The CSP blocks
// everything except local file images and inline styles, so even rendered
// markdown from an untrusted file is inert in the (sandboxed, capability-
// free) print window.
function buildPrintHtml(file: FileRecord, id: number, path: string): string {
  let inner: string
  if (file.kind === 'image') {
    inner = `<img src="kaseki-file://doc/${id}" style="max-width:100%">`
  } else {
    const content = readFileSync(path, 'utf8')
    if (file.kind === 'csv') inner = csvToTable(content)
    else if (file.kind === 'markdown') inner = marked.parse(content, { async: false })
    else inner = `<pre>${esc(content)}</pre>`
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src kaseki-file: data:; font-src data:">` +
    `<style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;padding:24px;color:#000;background:#fff}` +
    `pre{white-space:pre-wrap;font-family:monospace;font-size:13px}` +
    `table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 8px;text-align:left}` +
    `h1,h2,h3{margin:.6em 0 .3em}img{display:block}</style></head><body>${inner}</body></html>`
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Prints a document with no download. The file goes into a
// hidden, sandboxed BrowserWindow — the original PDF/image via the file
// protocol (Chromium renders and prints it natively), or a print-friendly
// HTML render — and from there to the OS print dialog.
export async function printFile(id: number): Promise<PrintResult> {
  const file = getFile(id)
  const target = getFilePath(id)
  if (!file || !target) return { ok: false, error: 'File not found.' }

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, plugins: true, contextIsolation: true }
  })
  try {
    if (file.kind === 'pdf') {
      await win.loadURL(`kaseki-file://doc/${id}`)
    } else {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPrintHtml(file, id, target.path))}`)
    }
    await delay(400) // let layout settle before printing
    await new Promise<void>((resolve) => {
      win.webContents.print({}, () => resolve()) // a cancelled dialog is not an error
    })
    return { ok: true }
  } catch (error) {
    log.error('Print failed', error)
    return { ok: false, error: 'Could not print this document.' }
  } finally {
    if (!win.isDestroyed()) win.close()
  }
}

// Prints a whole bundle in one job: the files merged into a single PDF
// (the "open the bundle, print everything" workflow). Written to a temp
// file and printed via a hidden window, then cleaned up.
export async function printBundle(bundleId: number): Promise<PrintResult> {
  let tmp: string | null = null
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, plugins: true, contextIsolation: true }
  })
  try {
    const bytes = await buildCombinedPdf(bundleId)
    if (!bytes) return { ok: false, error: 'Bundle is empty.' }
    tmp = join(paths.root, '.bundle-print.pdf')
    writeFileSync(tmp, bytes)
    await win.loadFile(tmp)
    await delay(400)
    await new Promise<void>((resolve) => {
      win.webContents.print({}, () => resolve())
    })
    return { ok: true }
  } catch (error) {
    log.error('Bundle print failed', error)
    return { ok: false, error: 'Could not print the bundle.' }
  } finally {
    if (!win.isDestroyed()) win.close()
    if (tmp) {
      try {
        unlinkSync(tmp)
      } catch {
        // best-effort cleanup
      }
    }
  }
}
