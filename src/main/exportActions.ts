import { BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import { getFile, getFilePath } from './db/files'
import { listAnnotations } from './db/annotations'
import { getBundle } from './db/bundles'
import { log } from './logger'

function hexRgb(hex: string | null): ReturnType<typeof rgb> {
  const m = hex ? /^#?([0-9a-f]{6})$/i.exec(hex.trim()) : null
  if (!m) return rgb(0.94, 0.62, 0.15)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// Bakes a PDF's annotations into a new PDF — highlights as translucent
// rectangles, notes as a dot plus their text. Coordinates convert from the
// viewer's top-left page fractions to pdf-lib's bottom-left points. Returns
// the bytes; the original is never touched. Pure, so it can be self-tested.
export async function buildAnnotatedPdf(fileId: number): Promise<Uint8Array | null> {
  const file = getFile(fileId)
  const target = getFilePath(fileId)
  if (!file || !target || file.kind !== 'pdf') return null
  const pdf = await PDFDocument.load(readFileSync(target.path))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const pages = pdf.getPages()
  for (const a of listAnnotations(fileId)) {
    if (!a.position) continue
    const page = pages[a.page - 1]
    if (!page) continue
    const { width: W, height: H } = page.getSize()
    if (a.type === 'highlight') {
      const { x, y, w, h } = a.position
      page.drawRectangle({
        x: x * W,
        y: H - (y + h) * H,
        width: w * W,
        height: h * H,
        color: hexRgb(a.color),
        opacity: 0.38
      })
    } else if (a.type === 'note') {
      const px = a.position.x * W
      const py = H - a.position.y * H
      page.drawCircle({ x: px, y: py, size: 5, color: rgb(0.22, 0.54, 0.87) })
      if (a.content) {
        page.drawText(a.content, {
          x: px + 9,
          y: py - 4,
          size: 9,
          font,
          color: rgb(0.1, 0.1, 0.1),
          maxWidth: Math.max(40, W - px - 18)
        })
      }
    }
  }
  return pdf.save()
}

// Wraps and paginates a text file onto pages of the combined PDF. Text is
// reduced to printable ASCII so it always encodes in the standard font.
function drawTextPages(pdf: PDFDocument, font: PDFFont, title: string, text: string): void {
  const W = 612
  const H = 792
  const margin = 56
  const size = 10
  const lh = 14
  const maxW = W - margin * 2
  const clean = (s: string): string => s.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+$/g, '')
  const wrap = (line: string): string[] => {
    if (line.length === 0) return ['']
    const out: string[] = []
    let cur = ''
    for (const word of line.split(' ')) {
      const test = cur ? `${cur} ${word}` : word
      if (cur && font.widthOfTextAtSize(test, size) > maxW) {
        out.push(cur)
        cur = word
      } else cur = test
    }
    if (cur) out.push(cur)
    return out
  }

  const rows: { text: string; heading?: boolean }[] = [{ text: clean(title), heading: true }]
  for (const raw of text.split('\n')) for (const w of wrap(clean(raw))) rows.push({ text: w })

  let page = pdf.addPage([W, H])
  let y = H - margin
  for (const row of rows) {
    if (y < margin) {
      page = pdf.addPage([W, H])
      y = H - margin
    }
    page.drawText(row.text, { x: margin, y, size: row.heading ? 13 : size, font, color: rgb(0, 0, 0) })
    y -= row.heading ? lh + 8 : lh
  }
}

// Merges a bundle's files into one PDF (Part 9): PDF pages are copied,
// PNG/JPEG images embedded, text rendered; anything else becomes a labelled
// page. Pure, so it can be self-tested.
export async function buildCombinedPdf(bundleId: number): Promise<Uint8Array | null> {
  const bundle = getBundle(bundleId)
  if (!bundle || bundle.files.length === 0) return null
  const combined = await PDFDocument.create()
  const font = await combined.embedFont(StandardFonts.Helvetica)
  for (const file of bundle.files) {
    const target = getFilePath(file.id)
    if (!target) continue
    const bytes = readFileSync(target.path)
    try {
      if (file.kind === 'pdf') {
        const src = await PDFDocument.load(bytes)
        const copied = await combined.copyPages(src, src.getPageIndices())
        copied.forEach((p) => combined.addPage(p))
      } else if (file.kind === 'image' && (target.mime === 'image/png' || target.mime === 'image/jpeg')) {
        const img = target.mime === 'image/png' ? await combined.embedPng(bytes) : await combined.embedJpg(bytes)
        const page = combined.addPage([612, 792])
        const s = Math.min((612 - 96) / img.width, (792 - 96) / img.height, 1)
        page.drawImage(img, {
          x: (612 - img.width * s) / 2,
          y: (792 - img.height * s) / 2,
          width: img.width * s,
          height: img.height * s
        })
      } else {
        const body =
          file.kind === 'text' || file.kind === 'csv' || file.kind === 'markdown'
            ? bytes.toString('utf8')
            : `(${file.name} — not rendered in the combined PDF)`
        drawTextPages(combined, font, file.name, body)
      }
    } catch {
      drawTextPages(combined, font, file.name, `(could not render ${file.name})`)
    }
  }
  return combined.save()
}

export async function exportBundlePdf(bundleId: number): Promise<{ ok: boolean; error?: string }> {
  const bundle = getBundle(bundleId)
  if (!bundle || bundle.files.length === 0) return { ok: false, error: 'Bundle is empty.' }
  try {
    const bytes = await buildCombinedPdf(bundleId)
    if (!bytes) return { ok: false, error: 'Nothing to export.' }
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.SaveDialogOptions = {
      defaultPath: `${bundle.name}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false }
    writeFileSync(result.filePath, bytes)
    return { ok: true }
  } catch (error) {
    log.error('Bundle export failed', error)
    return { ok: false, error: 'Could not export the bundle.' }
  }
}

export async function exportAnnotatedCopy(fileId: number): Promise<{ ok: boolean; error?: string }> {
  const file = getFile(fileId)
  if (!file) return { ok: false, error: 'File not found.' }
  if (file.kind !== 'pdf') return { ok: false, error: 'Annotated export is available for PDFs.' }
  try {
    const bytes = await buildAnnotatedPdf(fileId)
    if (!bytes) return { ok: false, error: 'Nothing to export.' }
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.SaveDialogOptions = {
      defaultPath: `${file.name.replace(/\.pdf$/i, '')}-annotated.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false }
    writeFileSync(result.filePath, bytes)
    return { ok: true }
  } catch (error) {
    log.error('Annotated export failed', error)
    return { ok: false, error: 'Could not export the annotated copy.' }
  }
}
