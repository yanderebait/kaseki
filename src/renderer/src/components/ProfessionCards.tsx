import { useCallback, useEffect, useRef, useState } from 'react'
import type { Space } from '../../../shared/types'
import { useOrb } from '../orbState'
import { ChevronRight, Plus } from '../icons'
import ProfessionSearch from './ProfessionSearch'

const DEFAULT_COMPACTION_THRESHOLD = 5

function ProfessionCard({
  space,
  compact,
  onOpen
}: {
  space: Space
  compact: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`profession-card${compact ? ' compact' : ''}`}
      style={{ '--card-accent': space.accentColor ?? 'var(--accent)' } as React.CSSProperties}
      onClick={onOpen}
    >
      <span className="profession-card-strip" />
      <span className="profession-card-body">
        <span className="profession-card-name">{space.name}</span>
        <span className="profession-card-count">{space.activeTaskCount} active</span>
      </span>
      <span className="profession-card-arrow">
        <ChevronRight size={18} />
      </span>
    </button>
  )
}

export default function ProfessionCards({
  onOpenSpace
}: {
  onOpenSpace: (spaceId: number) => void
}): React.JSX.Element {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [threshold, setThreshold] = useState(DEFAULT_COMPACTION_THRESHOLD)
  const [creating, setCreating] = useState(false)
  const { say } = useOrb()
  const saidEmpty = useRef(false)

  const refresh = useCallback(() => {
    window.kaseki.spaces.list().then((s) => {
      setSpaces(s)
      // Empty-state nudge from the Orb (Part 12), once until spaces exist again.
      // Deferred so the window has settled before the bubble anchors to the Orb.
      if (s.length === 0 && !saidEmpty.current) {
        saidEmpty.current = true
        setTimeout(() => say({ body: 'Nothing here yet — add a page to set up your first space.' }), 700)
      } else if (s.length > 0) {
        saidEmpty.current = false
      }
    })
  }, [say])

  useEffect(() => {
    refresh()
    window.kaseki.prefs.get().then((p) => {
      if (typeof p.cardCompactionThreshold === 'number') setThreshold(p.cardCompactionThreshold)
    })
  }, [refresh])

  const compact = spaces.length >= threshold

  return (
    <section className="region" aria-label="Profession spaces">
      <div className="profession-cards">
        {spaces.map((s) => (
          <ProfessionCard key={s.id} space={s} compact={compact} onOpen={() => onOpenSpace(s.id)} />
        ))}
        <button type="button" className="add-page" onClick={() => setCreating(true)}>
          <Plus size={18} />
          Add page
        </button>
      </div>
      {creating && (
        <ProfessionSearch
          onClose={() => setCreating(false)}
          onCreated={refresh}
          existingCount={spaces.length}
        />
      )}
    </section>
  )
}
