import { useState } from 'react'
import Modal from './Modal'
import SpaceBuilder from './SpaceBuilder'
import { CatalogIcon } from '../iconCatalog'
import { ChevronRight } from '../icons'
import { presetToSpace, searchPresets, type Preset } from '../../../shared/presets'

// The profession search (Part 4 / onboarding screen 2). Opened from Add
// page: matches name + aliases, picking a preset creates the space with
// its defaults, and "Build my own" hands off to the custom builder. When the
// user already has three or more spaces, a soft, non-enforcing warning (Part
// 13) is shown first; `existingCount` lets any caller drive that gate.
export default function ProfessionSearch({
  onClose,
  onCreated,
  existingCount = 0
}: {
  onClose: () => void
  onCreated: () => void
  existingCount?: number
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [building, setBuilding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const results = searchPresets(query)

  async function pick(preset: Preset): Promise<void> {
    setBusy(true)
    await window.kaseki.spaces.create(presetToSpace(preset))
    onCreated()
    onClose()
  }

  if (existingCount >= 3 && !acknowledged) {
    return (
      <Modal title="Add another space?" onClose={onClose}>
        <p className="hint">
          If you’re a first-time user, we recommend starting with a maximum of 3 pages. You can add
          more later as you find you need them. Continue anyway?
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Not now
          </button>
          <button type="button" className="primary" onClick={() => setAcknowledged(true)}>
            Continue anyway
          </button>
        </div>
      </Modal>
    )
  }

  if (building) {
    return <SpaceBuilder defaultName={query} onClose={onClose} onCreated={onCreated} />
  }

  return (
    <Modal title="Add a space" onClose={onClose}>
      <input
        type="text"
        placeholder="What do you do? (lawyer, vet, developer…)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0) pick(results[0])
        }}
        autoFocus
      />

      <div className="preset-results">
        {results.map((p) => (
          <button
            key={p.id}
            type="button"
            className="preset-result"
            disabled={busy}
            onClick={() => pick(p)}
          >
            <span className="preset-result-icon" style={{ color: p.accent }}>
              <CatalogIcon slug={p.icon} size={22} />
            </span>
            <span className="preset-result-text">
              <span className="preset-result-name">{p.name}</span>
              <span className="preset-result-desc">{p.description}</span>
            </span>
            <span className="preset-result-arrow">
              <ChevronRight size={18} />
            </span>
          </button>
        ))}
        {results.length === 0 && (
          <p className="hint">No matches — try another word, or build your own.</p>
        )}
      </div>

      <button type="button" className="link-button" onClick={() => setBuilding(true)}>
        Build my own →
      </button>
    </Modal>
  )
}
