import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FileRecord } from '../../../../shared/types'
import { CatalogIcon } from '../../iconCatalog'
import { Dots, Info, Minus, Plus, Printer, Sidebar, X } from '../../icons'
import { formatSize } from './viewerUtils'
import ImageRenderer from './ImageRenderer'
import TextRenderer from './TextRenderer'
import CsvRenderer from './CsvRenderer'
import PdfRenderer from './PdfRenderer'
import MarkdownRenderer from './MarkdownRenderer'
import MetadataPane from './MetadataPane'
import AddToBundleModal from './AddToBundleModal'
import ContextMenu, { type ContextItem } from './ContextMenu'

type Scope = 'task' | 'matter' | 'space' | 'all'

const SCOPES: { value: Scope; label: string; enabled: boolean }[] = [
  { value: 'task', label: 'This task', enabled: false },
  { value: 'matter', label: 'This matter', enabled: false },
  { value: 'space', label: 'This space', enabled: false },
  { value: 'all', label: 'All files', enabled: true }
]

const KIND_ICON: Record<FileRecord['kind'], string> = {
  pdf: 'books',
  image: 'camera',
  text: 'pencil',
  markdown: 'pencil',
  csv: 'chart-bar',
  other: 'folder'
}

// The full-screen document viewer (Part 9). Opened on a file id; the sidebar
// lists the current scope (only All is populated until the task system
// links files to tasks/matters/spaces) and arrow keys step through it.
export default function DocumentViewer({
  fileId,
  bundleId,
  onClose
}: {
  fileId: number
  bundleId?: number
  onClose: () => void
}): React.JSX.Element {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [bundleName, setBundleName] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState(fileId)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [metaOpen, setMetaOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [addToBundleFileId, setAddToBundleFileId] = useState<number | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; fileId: number } | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (bundleId != null) {
      window.kaseki.bundles.get(bundleId).then((b) => {
        if (b) {
          setFiles(b.files)
          setBundleName(b.name)
        }
      })
    } else {
      window.kaseki.files.list().then(setFiles)
    }
  }, [bundleId])

  const index = files.findIndex((f) => f.id === currentId)
  const current = index >= 0 ? files[index] : null
  const zoomable = current?.kind === 'image' || current?.kind === 'pdf'

  function contextItems(fileId: number): ContextItem[] {
    const f = files.find((x) => x.id === fileId)
    return [
      { label: 'Print', onClick: () => window.kaseki.files.print(fileId) },
      { label: 'Save a copy…', onClick: () => window.kaseki.files.saveCopy(fileId) },
      {
        label: 'Save annotated copy…',
        disabled: f?.kind !== 'pdf',
        onClick: () => window.kaseki.files.exportAnnotated(fileId)
      },
      { label: 'Add to bundle…', onClick: () => setAddToBundleFileId(fileId) },
      { label: 'Open containing folder', onClick: () => window.kaseki.files.reveal(fileId) },
      {
        label: 'View metadata',
        onClick: () => {
          setCurrentId(fileId)
          setMetaOpen(true)
        }
      }
    ]
  }

  const step = useCallback(
    (delta: number) => {
      setCurrentId((id) => {
        const i = files.findIndex((f) => f.id === id) + delta
        if (i < 0 || i >= files.length) return id
        setZoom(1)
        return files[i].id
      })
    },
    [files]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'b' || e.key === 'B') setSidebarOpen((o) => !o)
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (currentId) window.kaseki.files.print(currentId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onClose, currentId])

  const canvas = useMemo(() => {
    if (!current) return <div className="viewer-loading">Loading…</div>
    switch (current.kind) {
      case 'image':
        return <ImageRenderer id={current.id} zoom={zoom} />
      case 'text':
        return <TextRenderer id={current.id} />
      case 'markdown':
        return <MarkdownRenderer id={current.id} />
      case 'csv':
        return <CsvRenderer id={current.id} />
      case 'pdf':
        return <PdfRenderer id={current.id} zoom={zoom} />
      default:
        return <div className="viewer-placeholder">No preview available for this file type.</div>
    }
  }, [current, zoom])

  return (
    <div className="viewer">
      <div className="viewer-topbar">
        <button
          type="button"
          className="icon-button"
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen((o) => !o)}
        >
          <Sidebar size={18} />
        </button>
        <span className="viewer-title">{current?.name ?? '—'}</span>
        <span className="viewer-scope-indicator">
          {files.length > 0 && index >= 0
            ? `${bundleName ?? 'All files'}: ${index + 1} of ${files.length}`
            : ''}
        </span>
        <span className="viewer-spacer" />
        {zoomable && (
          <div className="viewer-zoom">
            <button
              type="button"
              className="icon-button"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            >
              <Minus size={18} />
            </button>
            <span className="viewer-zoom-level">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            >
              <Plus size={18} />
            </button>
          </div>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Print"
          onClick={() => current && window.kaseki.files.print(current.id)}
        >
          <Printer size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="File details"
          onClick={() => setMetaOpen((o) => !o)}
        >
          <Info size={18} />
        </button>
        <div className="viewer-more">
          <button
            type="button"
            className="icon-button"
            aria-label="More actions"
            onClick={() => setMoreOpen((o) => !o)}
          >
            <Dots size={18} />
          </button>
          {moreOpen && (
            <>
              <div className="viewer-more-backdrop" onClick={() => setMoreOpen(false)} />
              <div className="viewer-more-menu">
                {bundleId != null && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false)
                        window.kaseki.bundles.print(bundleId)
                      }}
                    >
                      Print bundle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false)
                        window.kaseki.bundles.exportPdf(bundleId)
                      }}
                    >
                      Export bundle as PDF…
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={!current}
                  onClick={() => {
                    setMoreOpen(false)
                    if (current) setAddToBundleFileId(current.id)
                  }}
                >
                  Add to bundle…
                </button>
                {current?.kind === 'pdf' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false)
                      window.kaseki.files.exportAnnotated(current.id)
                    }}
                  >
                    Export annotated copy…
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <button type="button" className="icon-button" aria-label="Close viewer" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="viewer-body">
        {sidebarOpen && (
          <div className="viewer-sidebar">
            {bundleName ? (
              <span className="viewer-scope-bundle">{bundleName}</span>
            ) : (
              <select className="viewer-scope-select" value="all" onChange={() => {}}>
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value} disabled={!s.enabled}>
                    {s.label}
                    {s.enabled ? '' : ' (needs tasks)'}
                  </option>
                ))}
              </select>
            )}
            <div className="viewer-file-list">
              {files.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`viewer-file-row${f.id === currentId ? ' active' : ''}`}
                  onClick={() => {
                    setCurrentId(f.id)
                    setZoom(1)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setCtx({ x: e.clientX, y: e.clientY, fileId: f.id })
                  }}
                >
                  <CatalogIcon slug={KIND_ICON[f.kind]} size={16} />
                  <span className="viewer-file-name">{f.name}</span>
                  <span className="viewer-file-size">{formatSize(f.size)}</span>
                </button>
              ))}
              {files.length === 0 && <p className="hint">No files yet.</p>}
            </div>
          </div>
        )}

        <div
          className="viewer-canvas"
          onContextMenu={(e) => {
            if (!current) return
            e.preventDefault()
            setCtx({ x: e.clientX, y: e.clientY, fileId: current.id })
          }}
        >
          {canvas}
        </div>

        {metaOpen && current && <MetadataPane file={current} />}
      </div>

      {addToBundleFileId !== null && (
        <AddToBundleModal fileId={addToBundleFileId} onClose={() => setAddToBundleFileId(null)} />
      )}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={contextItems(ctx.fileId)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}
