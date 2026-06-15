import { useCallback, useEffect, useState } from 'react'
import type { LinkEdge } from '../../../../shared/types'
import { Book, Calendar, Note, Plus, X } from '../../icons'
import LinkPicker from './LinkPicker'

const TYPE_ICON = { knowledge: Book, event: Calendar, file: Note } as const

// The links panel for a page (Part 10): "Linked items" are the links this
// page makes (add/remove here); "Linked from" are the backlinks, read from
// the opposite direction. Only page links navigate today — events and files
// live behind other overlays, so they're shown but not yet clickable.
export default function LinksPanel({
  pageId,
  onNavigate
}: {
  pageId: number
  onNavigate: (pageId: number) => void
}): React.JSX.Element {
  const [outgoing, setOutgoing] = useState<LinkEdge[]>([])
  const [backlinks, setBacklinks] = useState<LinkEdge[]>([])
  const [picking, setPicking] = useState(false)

  const refresh = useCallback(() => {
    window.kaseki.links.outgoing('knowledge', pageId).then(setOutgoing)
    window.kaseki.links.backlinks('knowledge', pageId).then(setBacklinks)
  }, [pageId])

  useEffect(refresh, [refresh])

  const existingKeys = new Set(outgoing.map((e) => `${e.ref.type}:${e.ref.id}`))

  function remove(linkId: number): void {
    window.kaseki.links.delete(linkId).then(refresh)
  }

  const renderEdge = (e: LinkEdge, removable: boolean): React.JSX.Element => {
    const Icon = TYPE_ICON[e.ref.type]
    const clickable = e.ref.type === 'knowledge'
    return (
      <li key={e.linkId} className="links-row">
        <button
          type="button"
          className="links-ref"
          disabled={!clickable}
          onClick={() => clickable && onNavigate(e.ref.id)}
        >
          <Icon size={15} />
          <span>{e.ref.label}</span>
        </button>
        {removable && (
          <button
            type="button"
            className="links-remove"
            aria-label="Remove link"
            onClick={() => remove(e.linkId)}
          >
            <X size={14} />
          </button>
        )}
      </li>
    )
  }

  return (
    <aside className="links-panel">
      <div className="links-section">
        <div className="links-head">
          <span className="links-title">Linked items</span>
          <button
            type="button"
            className="links-add"
            aria-label="Add link"
            onClick={() => setPicking(true)}
          >
            <Plus size={15} />
          </button>
        </div>
        {outgoing.length === 0 ? (
          <p className="hint">No links yet.</p>
        ) : (
          <ul className="links-list">{outgoing.map((e) => renderEdge(e, true))}</ul>
        )}
      </div>

      <div className="links-section">
        <span className="links-title">Linked from</span>
        {backlinks.length === 0 ? (
          <p className="hint">Nothing links here yet.</p>
        ) : (
          <ul className="links-list">{backlinks.map((e) => renderEdge(e, false))}</ul>
        )}
      </div>

      {picking && (
        <LinkPicker
          pageId={pageId}
          existingKeys={existingKeys}
          onAdded={refresh}
          onClose={() => setPicking(false)}
        />
      )}
    </aside>
  )
}
