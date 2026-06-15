import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Annotation } from '../../../../shared/types'
import { fileUrl, hexToRgba } from './viewerUtils'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const HIGHLIGHT_COLORS = ['#EF9F27', '#97C459', '#D4537E', '#378ADD']

// A saved sticky note: a marker at its point that opens a popover with the
// comment and a delete action.
function NoteMarker({
  annotation,
  onDelete
}: {
  annotation: Annotation
  onDelete: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const x = annotation.position?.x ?? 0
  const y = annotation.position?.y ?? 0
  return (
    <div className="annot-note" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <button
        type="button"
        className="annot-note-marker"
        aria-label="Note"
        onClick={() => setOpen((o) => !o)}
      >
        ✎
      </button>
      {open && (
        <div className="annot-note-popover">
          <p className="annot-note-text">{annotation.content || '(no text)'}</p>
          <button type="button" className="row-remove" aria-label="Delete note" onClick={onDelete}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// Toggles the find highlight on every text-layer span containing the query.
function applyFindHighlight(container: HTMLElement, rawQuery: string): void {
  const q = rawQuery.trim().toLowerCase()
  container.querySelectorAll('span').forEach((span) => {
    const hit = q.length > 0 && (span.textContent ?? '').toLowerCase().includes(q)
    span.classList.toggle('pdf-find-hit', hit)
  })
}

// One page rendered small for the thumbnail strip.
function Thumbnail({
  doc,
  pageNum,
  active,
  onClick
}: {
  doc: PDFDocumentProxy
  pageNum: number
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    doc.getPage(pageNum).then((p) => {
      const canvas = ref.current
      if (cancelled || !canvas) return
      const viewport = p.getViewport({ scale: 0.2 })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      p.render({ canvas, canvasContext: ctx, viewport }).promise.catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [doc, pageNum])
  return (
    <button
      type="button"
      className={`pdf-thumb${active ? ' active' : ''}`}
      aria-label={`Page ${pageNum}`}
      onClick={onClick}
    >
      <canvas ref={ref} />
      <span className="pdf-thumb-num">{pageNum}</span>
    </button>
  )
}

// Renders one PDF page at a time to a canvas, with page navigation. The
// bytes are fetched over kaseki-file:// and handed to PDF.js as data, so
// PDF.js never touches the filesystem or the network.
export default function PdfRenderer({ id, zoom }: { id: number; zoom: number }): React.JSX.Element {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [showThumbs, setShowThumbs] = useState(true)
  const [sideTab, setSideTab] = useState<'pages' | 'bookmarks'>('pages')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [bmLabel, setBmLabel] = useState('')
  const [error, setError] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<number[]>([])
  const [matchIdx, setMatchIdx] = useState(0)
  const [addingNote, setAddingNote] = useState(false)
  const [selHi, setSelHi] = useState<{
    norm: { x: number; y: number; w: number; h: number }
    left: number
    top: number
  } | null>(null)
  const [pendingNote, setPendingNote] = useState<{
    norm: { x: number; y: number }
    left: number
    top: number
  } | null>(null)
  const [noteText, setNoteText] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const pageElRef = useRef<HTMLDivElement>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const queryRef = useRef('')
  queryRef.current = query

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setPage(1)
    setError(false)
    fetch(fileUrl(id))
      .then((r) => r.arrayBuffer())
      .then((data) => pdfjs.getDocument({ data }).promise)
      .then((d) => {
        if (cancelled) return
        setDoc(d)
        setNumPages(d.numPages)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    doc.getPage(page).then((p) => {
      const canvas = canvasRef.current
      if (cancelled || !canvas) return
      const viewport = p.getViewport({ scale: zoom * 1.3 })
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      taskRef.current?.cancel()
      taskRef.current = p.render({ canvas, canvasContext: ctx, viewport })
      taskRef.current.promise.catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [doc, page, zoom])

  // Selectable text layer over the canvas — the foundation for find
  // highlighting, text-selection highlight annotations, and accessibility.
  useEffect(() => {
    const container = textLayerRef.current
    if (!doc || !container) return
    let cancelled = false
    doc.getPage(page).then((p) => {
      if (cancelled) return
      const viewport = p.getViewport({ scale: zoom * 1.3 })
      container.innerHTML = ''
      container.style.width = `${viewport.width}px`
      container.style.height = `${viewport.height}px`
      container.style.setProperty('--total-scale-factor', String(viewport.scale))
      const textLayer = new TextLayer({
        textContentSource: p.streamTextContent(),
        container,
        viewport
      })
      textLayer
        .render()
        .then(() => {
          if (!cancelled) applyFindHighlight(container, queryRef.current)
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [doc, page, zoom])

  // Re-highlight when the query changes (the text layer for this page is
  // already rendered).
  useEffect(() => {
    if (textLayerRef.current) applyFindHighlight(textLayerRef.current, query)
  }, [query, page])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'PageDown') {
        e.preventDefault()
        setPage((p) => Math.min(numPages, p + 1))
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        setPage((p) => Math.max(1, p - 1))
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFindOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numPages])

  // Build the list of match locations (one page entry per occurrence) over
  // every page's text layer.
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!doc || q.length === 0) {
      setMatches([])
      return
    }
    let cancelled = false
    ;(async () => {
      const found: number[] = []
      for (let pg = 1; pg <= numPages; pg++) {
        const content = await doc.getPage(pg).then((p) => p.getTextContent())
        const text = content.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .toLowerCase()
        let from = text.indexOf(q)
        while (from >= 0) {
          found.push(pg)
          from = text.indexOf(q, from + q.length)
        }
      }
      if (cancelled) return
      setMatches(found)
      setMatchIdx(0)
      if (found.length > 0) setPage(found[0])
    })()
    return () => {
      cancelled = true
    }
  }, [doc, query, numPages])

  function stepMatch(delta: number): void {
    if (matches.length === 0) return
    const next = (matchIdx + delta + matches.length) % matches.length
    setMatchIdx(next)
    setPage(matches[next])
  }

  const loadAnnotations = useCallback(() => {
    window.kaseki.annotations.list(id).then(setAnnotations)
  }, [id])

  useEffect(loadAnnotations, [loadAnnotations])

  const bookmarks = annotations.filter((a) => a.type === 'bookmark')
  const pageMarks = annotations.filter(
    (a) => a.page === page && (a.type === 'highlight' || a.type === 'note')
  )

  async function addBookmark(): Promise<void> {
    await window.kaseki.annotations.create({
      fileId: id,
      page,
      type: 'bookmark',
      content: bmLabel.trim() || `Page ${page}`
    })
    setBmLabel('')
    loadAnnotations()
  }

  function deleteAnnotation(annId: number): void {
    window.kaseki.annotations.delete(annId).then(loadAnnotations)
  }

  // Selecting text surfaces a colour toolbar to turn the selection into a
  // highlight, with coordinates normalised to the page.
  function onPageMouseUp(): void {
    if (addingNote) return
    const sel = window.getSelection()
    const pageEl = pageElRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !pageEl) {
      setSelHi(null)
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect.width < 2) {
      setSelHi(null)
      return
    }
    const pr = pageEl.getBoundingClientRect()
    setSelHi({
      norm: {
        x: (rect.left - pr.left) / pr.width,
        y: (rect.top - pr.top) / pr.height,
        w: rect.width / pr.width,
        h: rect.height / pr.height
      },
      left: rect.left - pr.left + rect.width / 2,
      top: rect.top - pr.top
    })
  }

  async function createHighlight(color: string): Promise<void> {
    if (!selHi) return
    await window.kaseki.annotations.create({
      fileId: id,
      page,
      type: 'highlight',
      position: selHi.norm,
      color
    })
    window.getSelection()?.removeAllRanges()
    setSelHi(null)
    loadAnnotations()
  }

  // In note mode, a click on the page drops a note point and opens an input.
  function onPageClick(e: React.MouseEvent): void {
    if (!addingNote) return
    const pageEl = pageElRef.current
    if (!pageEl) return
    const pr = pageEl.getBoundingClientRect()
    setPendingNote({
      norm: { x: (e.clientX - pr.left) / pr.width, y: (e.clientY - pr.top) / pr.height },
      left: e.clientX - pr.left,
      top: e.clientY - pr.top
    })
    setAddingNote(false)
    setNoteText('')
  }

  async function saveNote(): Promise<void> {
    if (!pendingNote || noteText.trim().length === 0) {
      setPendingNote(null)
      return
    }
    await window.kaseki.annotations.create({
      fileId: id,
      page,
      type: 'note',
      position: pendingNote.norm,
      content: noteText.trim()
    })
    setPendingNote(null)
    setNoteText('')
    loadAnnotations()
  }

  if (error) return <div className="viewer-placeholder">Could not open this PDF.</div>
  if (!doc) return <div className="viewer-loading">Loading PDF…</div>

  return (
    <div className="pdf">
      {findOpen && (
        <div className="pdf-find">
          <input
            type="text"
            placeholder="Find in document"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1)
              else if (e.key === 'Escape') {
                setFindOpen(false)
                setQuery('')
              }
            }}
            autoFocus
          />
          <span className="pdf-find-count">
            {query.trim().length === 0
              ? ''
              : matches.length === 0
                ? 'No matches'
                : `${matchIdx + 1} of ${matches.length}`}
          </span>
          <button type="button" className="pdf-nav-btn" onClick={() => stepMatch(-1)}>
            ↑
          </button>
          <button type="button" className="pdf-nav-btn" onClick={() => stepMatch(1)}>
            ↓
          </button>
          <button
            type="button"
            className="pdf-nav-btn"
            onClick={() => {
              setFindOpen(false)
              setQuery('')
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="pdf-main">
        {showThumbs && (
          <div className="pdf-side">
            <div className="pdf-side-tabs">
              <button
                type="button"
                className={sideTab === 'pages' ? 'active' : ''}
                onClick={() => setSideTab('pages')}
              >
                Pages
              </button>
              <button
                type="button"
                className={sideTab === 'bookmarks' ? 'active' : ''}
                onClick={() => setSideTab('bookmarks')}
              >
                Bookmarks
              </button>
            </div>
            {sideTab === 'pages' ? (
              <div className="pdf-thumbs">
                {Array.from({ length: numPages }, (_, i) => (
                  <Thumbnail
                    key={i}
                    doc={doc}
                    pageNum={i + 1}
                    active={page === i + 1}
                    onClick={() => setPage(i + 1)}
                  />
                ))}
              </div>
            ) : (
              <div className="pdf-bookmarks">
                {bookmarks.map((b) => (
                  <div key={b.id} className="pdf-bookmark">
                    <button
                      type="button"
                      className="pdf-bookmark-jump"
                      onClick={() => setPage(b.page)}
                    >
                      <span className="pdf-bookmark-label">{b.content || `Page ${b.page}`}</span>
                      <span className="pdf-bookmark-page">p.{b.page}</span>
                    </button>
                    <button
                      type="button"
                      className="row-remove"
                      aria-label="Remove bookmark"
                      onClick={() => deleteAnnotation(b.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {bookmarks.length === 0 && <p className="hint">No bookmarks yet.</p>}
                <div className="pdf-bookmark-add">
                  <input
                    type="text"
                    placeholder={`Page ${page}`}
                    value={bmLabel}
                    onChange={(e) => setBmLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addBookmark()
                    }}
                  />
                  <button type="button" className="pdf-nav-btn" onClick={addBookmark}>
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="pdf-scroll">
          <div
            ref={pageElRef}
            className={`pdf-page${addingNote ? ' adding-note' : ''}`}
            onMouseUp={onPageMouseUp}
            onClick={onPageClick}
          >
            <canvas ref={canvasRef} className="pdf-canvas" />
            <div ref={textLayerRef} className="textLayer" />
            {selHi && (
              <div
                className="annot-hi-toolbar"
                style={{ left: selHi.left, top: selHi.top }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="annot-hi-swatch"
                    style={{ background: c }}
                    aria-label={`Highlight ${c}`}
                    onClick={() => createHighlight(c)}
                  />
                ))}
              </div>
            )}
            {pendingNote && (
              <div
                className="annot-note-input"
                style={{ left: pendingNote.left, top: pendingNote.top }}
                onClick={(e) => e.stopPropagation()}
              >
                <textarea
                  placeholder="Note…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  autoFocus
                />
                <div className="annot-note-actions">
                  <button type="button" onClick={() => setPendingNote(null)}>
                    Cancel
                  </button>
                  <button type="button" className="primary" onClick={saveNote}>
                    Save
                  </button>
                </div>
              </div>
            )}
            <div className="annot-layer">
              {pageMarks.map((a) =>
                a.type === 'highlight' ? (
                  <div
                    key={a.id}
                    className="annot-highlight"
                    style={{
                      left: `${(a.position?.x ?? 0) * 100}%`,
                      top: `${(a.position?.y ?? 0) * 100}%`,
                      width: `${(a.position?.w ?? 0) * 100}%`,
                      height: `${(a.position?.h ?? 0) * 100}%`,
                      background: hexToRgba(a.color ?? '#EF9F27', 0.38)
                    }}
                  >
                    <button
                      type="button"
                      className="annot-del"
                      aria-label="Delete highlight"
                      onClick={() => deleteAnnotation(a.id)}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <NoteMarker key={a.id} annotation={a} onDelete={() => deleteAnnotation(a.id)} />
                )
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="pdf-nav">
        <button
          type="button"
          className="pdf-nav-btn"
          onClick={() => setShowThumbs((s) => !s)}
        >
          Pages
        </button>
        <button
          type="button"
          className={`pdf-nav-btn${addingNote ? ' active' : ''}`}
          onClick={() => {
            setAddingNote((a) => !a)
            setSelHi(null)
          }}
        >
          + Note
        </button>
        <button
          type="button"
          className="pdf-nav-btn"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>
        <span className="pdf-nav-page">
          Page{' '}
          <input
            type="number"
            min={1}
            max={numPages}
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (n >= 1 && n <= numPages) setPage(n)
            }}
          />{' '}
          of {numPages}
        </span>
        <button
          type="button"
          className="pdf-nav-btn"
          disabled={page >= numPages}
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  )
}
