import { useEffect, useMemo, useState } from 'react'
import type { LinkCandidates, LinkItemType, LinkRef } from '../../../../shared/types'
import { Book, Calendar, Note, Search } from '../../icons'
import Modal from '../Modal'

const TYPE_ICON = { knowledge: Book, event: Calendar, file: Note } as const

// The picker for adding a cross-link from the current page (Part 10). Offers
// the item types that exist today — pages, events, files — filtered by a
// search box, excluding the page itself and anything already linked.
export default function LinkPicker({
  pageId,
  existingKeys,
  onAdded,
  onClose
}: {
  pageId: number
  existingKeys: Set<string>
  onAdded: () => void
  onClose: () => void
}): React.JSX.Element {
  const [candidates, setCandidates] = useState<LinkCandidates | null>(null)
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.kaseki.links.candidates().then(setCandidates)
  }, [])

  const groups = useMemo<{ type: LinkItemType; label: string; items: LinkRef[] }[]>(() => {
    if (!candidates) return []
    const q = query.trim().toLowerCase()
    const filter = (arr: LinkRef[]): LinkRef[] =>
      arr.filter((r) => {
        const key = `${r.type}:${r.id}`
        if (existingKeys.has(key) || added.has(key)) return false
        if (r.type === 'knowledge' && r.id === pageId) return false
        return !q || r.label.toLowerCase().includes(q)
      })
    return [
      { type: 'knowledge', label: 'Pages', items: filter(candidates.knowledge) },
      { type: 'event', label: 'Events', items: filter(candidates.event) },
      { type: 'file', label: 'Files', items: filter(candidates.file) }
    ]
  }, [candidates, query, existingKeys, added, pageId])

  async function add(ref: LinkRef): Promise<void> {
    await window.kaseki.links.create('knowledge', pageId, ref.type, ref.id)
    setAdded((s) => new Set(s).add(`${ref.type}:${ref.id}`))
    onAdded()
  }

  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <Modal title="Link to…" onClose={onClose}>
      <div className="link-picker">
        <div className="link-picker-search">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Search pages, events, files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="link-picker-list">
          {total === 0 ? (
            <p className="hint">Nothing left to link.</p>
          ) : (
            groups
              .filter((g) => g.items.length > 0)
              .map((g) => {
                const Icon = TYPE_ICON[g.type]
                return (
                  <div key={g.type} className="link-picker-group">
                    <span className="link-picker-group-label">{g.label}</span>
                    {g.items.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="link-picker-item"
                        onClick={() => add(r)}
                      >
                        <Icon size={16} />
                        <span>{r.label}</span>
                      </button>
                    ))}
                  </div>
                )
              })
          )}
        </div>
      </div>
    </Modal>
  )
}
