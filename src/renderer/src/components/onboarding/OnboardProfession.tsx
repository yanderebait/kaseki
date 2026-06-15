import { useState } from 'react'
import SpaceBuilder from '../SpaceBuilder'
import { CatalogIcon } from '../../iconCatalog'
import { ChevronRight } from '../../icons'
import { presetToSpace, searchPresets, type Preset } from '../../../../shared/presets'

// Screen 2 — profession search (Part 13). Same matching and space creation as
// the home screen's "Add page" (ProfessionSearch), presented as a full screen.
// Picking a preset or building a custom space creates the first profession and
// hands its id forward so the launcher and dashboard steps can use it.
export default function OnboardProfession({
  onDone
}: {
  onDone: (spaceId: number, spaceName: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [building, setBuilding] = useState(false)

  const results = searchPresets(query)

  async function pick(preset: Preset): Promise<void> {
    setBusy(true)
    const space = await window.kaseki.spaces.create(presetToSpace(preset))
    onDone(space.id, space.name)
  }

  // The custom builder doesn't return the new space, so read it back as the
  // most recently positioned space after it reports creation.
  async function afterBuild(): Promise<void> {
    const spaces = await window.kaseki.spaces.list()
    const newest = spaces[spaces.length - 1]
    if (newest) onDone(newest.id, newest.name)
  }

  if (building) {
    return (
      <SpaceBuilder
        defaultName={query}
        onClose={() => setBuilding(false)}
        onCreated={afterBuild}
      />
    )
  }

  return (
    <div className="onboard-screen onboard-wide">
      <h1 className="onboard-title">What do you do?</h1>
      <p className="onboard-sub">Pick the closest match — you can fine-tune it later.</p>
      <input
        type="text"
        className="onboard-search"
        placeholder="Lawyer, vet, developer, photographer…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0 && !busy) pick(results[0])
        }}
        autoFocus
      />
      <div className="preset-results onboard-results">
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
    </div>
  )
}
