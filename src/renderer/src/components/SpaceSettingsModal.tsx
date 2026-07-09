import { useState } from 'react'
import Modal from './Modal'
import { ACCENTS } from './../accents'
import { CatalogIcon, ICON_GROUPS } from '../iconCatalog'
import type { SpaceDetail } from '../../../shared/types'

// Space settings (v0.2.0). Spaces were immutable after creation in 0.1.0 — a
// typo in the name was permanent, the cheatsheet had no editor despite the
// dashboard promising one, and there was no archive or delete at all. Rename,
// accent, icon, cheatsheet, and status edits save together; archive hides the
// space (reversible from Settings → Spaces); delete is the nuclear option and
// is gated on typing the space's name.
export default function SpaceSettingsModal({
  space,
  onClose,
  onSaved,
  onGone
}: {
  space: SpaceDetail
  onClose: () => void
  onSaved: () => void
  // Called after archive or delete — the space no longer has a dashboard.
  onGone: () => void
}): React.JSX.Element {
  const [name, setName] = useState(space.name)
  const [accent, setAccent] = useState<string | null>(space.accentColor)
  const [icon, setIcon] = useState<string | null>(space.icon)
  const [cheatsheet, setCheatsheet] = useState(space.cheatsheet)
  const [statuses, setStatuses] = useState<string[]>(space.statusSet)
  const [confirmDelete, setConfirmDelete] = useState('')
  const [busy, setBusy] = useState(false)

  const iconChoices = ICON_GROUPS.flatMap((g) => g.slugs).slice(0, 24)

  async function save(): Promise<void> {
    if (busy || name.trim().length === 0) return
    setBusy(true)
    try {
      await window.kaseki.spaces.update(space.id, {
        name: name.trim(),
        accentColor: accent,
        icon,
        cheatsheet,
        statusSet: statuses.map((s) => s.trim()).filter(Boolean)
      })
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function archive(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      await window.kaseki.spaces.archive(space.id, true)
      onGone()
    } finally {
      setBusy(false)
    }
  }

  async function destroy(): Promise<void> {
    if (busy || confirmDelete !== space.name) return
    setBusy(true)
    try {
      await window.kaseki.spaces.delete(space.id)
      onGone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Space settings" onClose={onClose}>
      <div className="form-stack space-settings">
        <label className="space-settings-field">
          <span className="space-settings-label">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="space-settings-field">
          <span className="space-settings-label">Accent</span>
          <div className="accent-row">
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                className={`accent-swatch${accent === a.hex ? ' active' : ''}`}
                style={{ background: a.hex }}
                aria-label={a.name}
                title={a.name}
                onClick={() => setAccent(a.hex)}
              />
            ))}
          </div>
        </div>

        <div className="space-settings-field">
          <span className="space-settings-label">Icon</span>
          <div className="icon-row">
            {iconChoices.map((slug) => (
              <button
                key={slug}
                type="button"
                className={`icon-choice${icon === slug ? ' active' : ''}`}
                aria-label={slug}
                onClick={() => setIcon(slug)}
              >
                <CatalogIcon slug={slug} size={18} />
              </button>
            ))}
          </div>
        </div>

        <label className="space-settings-field">
          <span className="space-settings-label">Cheatsheet</span>
          <textarea
            className="space-settings-cheatsheet"
            placeholder="Notes to future you — shows on this dashboard."
            value={cheatsheet}
            onChange={(e) => setCheatsheet(e.target.value)}
          />
        </label>

        <div className="space-settings-field">
          <span className="space-settings-label">Statuses</span>
          <p className="hint">‘Done’ is fixed — completion logic keys on it.</p>
          <div className="status-rows">
            {statuses.map((s, i) => (
              <div key={i} className="status-row">
                <input
                  type="text"
                  value={s}
                  disabled={s === 'Done'}
                  onChange={(e) => setStatuses((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <button
                  type="button"
                  className="row-remove"
                  aria-label="Remove status"
                  disabled={s === 'Done'}
                  onClick={() => setStatuses((arr) => arr.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="row-add" onClick={() => setStatuses((s) => [...s, 'New status'])}>
            Add status
          </button>
        </div>

        <div className="space-settings-danger">
          <button type="button" onClick={archive} disabled={busy}>
            Archive space
          </button>
          <div className="space-settings-delete">
            <input
              type="text"
              placeholder={`Type “${space.name}” to enable delete`}
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
            />
            <button
              type="button"
              className="event-delete"
              disabled={busy || confirmDelete !== space.name}
              onClick={destroy}
            >
              Delete space and everything in it
            </button>
          </div>
        </div>

        <div className="event-actions">
          <span className="event-actions-spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={busy || name.trim().length === 0} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}
