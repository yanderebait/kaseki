import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { fileUrl } from '../viewer/viewerUtils'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// A read-only PDF display for the sensitive folder — no annotations, no
// persistence (the document viewer's annotation features key on the regular
// files table, a different id space). The bytes arrive decrypted in memory
// over the vault protocol; each page renders to a stacked canvas.
export default function VaultPdfRenderer({ id }: { id: number }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    if (container) container.innerHTML = ''
    setError(false)

    fetch(fileUrl(id, true))
      .then((r) => {
        if (!r.ok) throw new Error('unavailable')
        return r.arrayBuffer()
      })
      .then((data) => pdfjs.getDocument({ data }).promise)
      .then(async (d: PDFDocumentProxy) => {
        if (cancelled) return
        for (let n = 1; n <= d.numPages && !cancelled; n++) {
          const page = await d.getPage(n)
          const viewport = page.getViewport({ scale: 1.4 })
          const canvas = document.createElement('canvas')
          canvas.className = 'vault-pdf-page'
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          containerRef.current?.appendChild(canvas)
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (error) return <div className="viewer-placeholder">Could not open this PDF.</div>
  return <div ref={containerRef} className="vault-pdf" />
}
