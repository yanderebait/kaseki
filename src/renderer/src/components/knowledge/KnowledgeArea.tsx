import { useCallback, useEffect, useState } from 'react'
import type {
  KnowledgeContent,
  KnowledgePage,
  KnowledgePageNode,
  KnowledgeSearchHit
} from '../../../../shared/types'
import { Book, Download, LinkIcon, Plus, Search, X } from '../../icons'
import Modal from '../Modal'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'
import PageTree from './PageTree'
import KnowledgeEditor from './KnowledgeEditor'
import LinksPanel from './LinksPanel'

// The full-screen knowledge area (Part 10): a page tree on the left, the
// Tiptap editor on the right. Opened from the Orb menu and the home screen —
// the persistent, global entry points. Pages and their content autosave.
export default function KnowledgeArea({
  onClose,
  initialPageId
}: {
  onClose: () => void
  initialPageId?: number
}): React.JSX.Element {
  const [tree, setTree] = useState<KnowledgePageNode[]>([])
  // Deep-link from global search opens straight onto a page; the tree-load
  // effect keeps it (cur ?? first) rather than overriding.
  const [selectedId, setSelectedId] = useState<number | null>(initialPageId ?? null)
  const [page, setPage] = useState<KnowledgePage | null>(null)
  const [title, setTitle] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [linksOpen, setLinksOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KnowledgeSearchHit[]>([])

  const refreshTree = useCallback(async (): Promise<KnowledgePageNode[]> => {
    const t = await window.kaseki.knowledge.tree()
    setTree(t)
    return t
  }, [])

  useEffect(() => {
    refreshTree().then((t) => {
      if (t.length > 0) setSelectedId((cur) => cur ?? t[0].id)
    })
  }, [refreshTree])

  useEffect(() => {
    if (selectedId == null) {
      setPage(null)
      setTitle('')
      return
    }
    window.kaseki.knowledge.get(selectedId).then((p) => {
      setPage(p)
      setTitle(p?.title ?? '')
    })
  }, [selectedId])

  // Debounced full-text search. An empty query restores the tree view.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      window.kaseki.knowledge.search(q).then(setResults)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  // The delete-confirm modal and any picker above this surface are their own
  // escape layers; this layer only ever receives Escape when it is topmost.
  useEscapeLayer(true, onClose)

  async function createTop(): Promise<void> {
    const p = await window.kaseki.knowledge.create({ title: 'Untitled' })
    await refreshTree()
    setSelectedId(p.id)
  }

  async function addChild(parentId: number): Promise<void> {
    const p = await window.kaseki.knowledge.create({ title: 'Untitled', parentId })
    await refreshTree()
    setSelectedId(p.id)
  }

  function reorder(id: number, dir: -1 | 1): void {
    window.kaseki.knowledge.reorder(id, dir).then(refreshTree)
  }

  async function confirmDelete(): Promise<void> {
    if (deleteId == null) return
    await window.kaseki.knowledge.delete(deleteId)
    const t = await refreshTree()
    if (!t.some((n) => n.id === selectedId)) {
      setSelectedId(t.length > 0 ? t[0].id : null)
    }
    setDeleteId(null)
  }

  // The save carries the editor's own page id — never the currently selected
  // id, which changes the instant a switch begins while the outgoing page's
  // debounce may still be pending (the v0.1.0 cross-page overwrite).
  const saveContent = useCallback((pageId: number, content: KnowledgeContent) => {
    window.kaseki.knowledge.update(pageId, { content })
  }, [])

  function saveTitle(): void {
    if (selectedId == null) return
    window.kaseki.knowledge.update(selectedId, { title: title.trim() || 'Untitled' }).then(refreshTree)
  }

  const deleteTarget = tree.find((n) => n.id === deleteId)

  return (
    <div className="knowledge">
      <div className="knowledge-topbar">
        <Book size={18} />
        <span className="knowledge-title">Knowledge</span>
        <span className="knowledge-spacer" />
        <button
          type="button"
          className="icon-button"
          aria-label="Export page as Markdown"
          title="Export page as Markdown"
          disabled={!page}
          onClick={() => page && window.kaseki.knowledge.exportMarkdown(page.id)}
        >
          <Download size={18} />
        </button>
        <button
          type="button"
          className={`icon-button${linksOpen ? ' active' : ''}`}
          aria-label="Toggle links panel"
          aria-pressed={linksOpen}
          title="Linked items and backlinks"
          onClick={() => setLinksOpen((o) => !o)}
        >
          <LinkIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Close knowledge area"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="knowledge-body">
        <div className="knowledge-sidebar">
          <div className="knowledge-search">
            <Search size={15} />
            <input
              placeholder="Search pages…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search knowledge pages"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <button type="button" className="row-add knowledge-new" onClick={createTop}>
            <Plus size={16} />
            New page
          </button>
          <div className="knowledge-tree">
            {query.trim() ? (
              results.length === 0 ? (
                <p className="hint">No matches.</p>
              ) : (
                results.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`kn-search-hit${h.id === selectedId ? ' active' : ''}`}
                    onClick={() => setSelectedId(h.id)}
                  >
                    <span className="kn-search-hit-title">{h.title || 'Untitled'}</span>
                    {h.snippet && <span className="kn-search-hit-snippet">{h.snippet}</span>}
                  </button>
                ))
              )
            ) : tree.length === 0 ? (
              <p className="hint">No pages yet.</p>
            ) : (
              <PageTree
                nodes={tree}
                parentId={null}
                depth={0}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAddChild={addChild}
                onReorder={reorder}
                onDelete={setDeleteId}
              />
            )}
          </div>
        </div>

        <div className="knowledge-main">
          {page ? (
            <>
              <input
                className="knowledge-page-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                placeholder="Untitled"
                aria-label="Page title"
              />
              <KnowledgeEditor
                key={page.id}
                pageId={page.id}
                initialContent={page.content}
                onSave={saveContent}
              />
            </>
          ) : (
            <div className="knowledge-empty">
              <Book size={40} />
              <p>Select a page, or create one to start your wiki.</p>
            </div>
          )}
        </div>

        {linksOpen && page && (
          <LinksPanel key={page.id} pageId={page.id} onNavigate={setSelectedId} />
        )}
      </div>

      {deleteId != null && (
        <Modal title="Delete page" onClose={() => setDeleteId(null)}>
          <p className="kn-modal-text">
            Delete “{deleteTarget?.title || 'Untitled'}” and all of its child pages? This can&rsquo;t
            be undone.
          </p>
          <div className="kn-modal-actions">
            <button type="button" onClick={() => setDeleteId(null)}>
              Cancel
            </button>
            <button type="button" className="kn-danger" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
