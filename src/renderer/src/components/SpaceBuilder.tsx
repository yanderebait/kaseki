import { useState } from 'react'
import { useEscapeLayer } from '../hooks/useEscapeLayer'
import { ACCENTS } from '../accents'
import { CatalogIcon, ICON_GROUPS } from '../iconCatalog'
import { UNIVERSAL_STATUSES } from '../../../shared/presets'
import { FIELD_TYPES, type FieldDef, type FieldType } from '../../../shared/types'
import { FIELD_TYPE_LABELS } from '../fieldTypes'
import { Plus, ChevronRight } from '../icons'

function hasOptions(type: FieldType): boolean {
  return type === 'select' || type === 'multiselect'
}

// The guided builder (Part 4). Single scrollable panel: name, accent, icon,
// custom fields, statuses. The cheatsheet starts empty (a note says so);
// no suggested apps. Also the editor a preset space will reuse later.
export default function SpaceBuilder({
  defaultName = '',
  onClose,
  onCreated
}: {
  defaultName?: string
  onClose: () => void
  onCreated: () => void
}): React.JSX.Element {
  const [name, setName] = useState(defaultName)
  const [accent, setAccent] = useState(ACCENTS[5].hex)
  const [icon, setIcon] = useState('briefcase')
  const [fields, setFields] = useState<FieldDef[]>([])
  const [statuses, setStatuses] = useState<string[]>(UNIVERSAL_STATUSES)
  const [busy, setBusy] = useState(false)

  useEscapeLayer(true, onClose)

  function updateField(i: number, patch: Partial<FieldDef>): void {
    setFields((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  function moveStatus(i: number, dir: -1 | 1): void {
    setStatuses((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const copy = [...s]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })
  }

  async function create(): Promise<void> {
    if (name.trim().length === 0) return
    setBusy(true)
    const cleanFields: FieldDef[] = fields
      .filter((f) => f.name.trim().length > 0)
      .map((f) => ({
        name: f.name.trim(),
        type: f.type,
        options: hasOptions(f.type) ? (f.options ?? []).filter((o) => o.trim().length > 0) : undefined
      }))
    const cleanStatuses = statuses.map((s) => s.trim()).filter((s) => s.length > 0)
    await window.kaseki.spaces.create({
      name: name.trim(),
      accentColor: accent,
      icon,
      fields: cleanFields,
      statusSet: cleanStatuses.length > 0 ? cleanStatuses : undefined,
      cheatsheet: ''
    })
    onCreated()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="builder"
        role="dialog"
        aria-modal="true"
        aria-label="Build your own space"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="builder-header">Build your own space</header>

        <div className="builder-body">
          <section className="builder-section">
            <span className="builder-section-title">Name</span>
            <input
              type="text"
              placeholder="Space name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </section>

          <section className="builder-section">
            <span className="builder-section-title">Accent</span>
            <div className="swatch-grid" role="group" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button
                  key={a.hex}
                  type="button"
                  className={`swatch${accent === a.hex ? ' selected' : ''}`}
                  style={{ background: a.hex }}
                  title={a.name}
                  aria-label={a.name}
                  aria-pressed={accent === a.hex}
                  onClick={() => setAccent(a.hex)}
                />
              ))}
            </div>
          </section>

          <section className="builder-section">
            <span className="builder-section-title">Icon</span>
            <div className="icon-picker">
              {ICON_GROUPS.map((g) => (
                <div key={g.name} className="icon-group">
                  <span className="icon-group-label">{g.name}</span>
                  <div className="icon-grid">
                    {g.slugs.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`icon-option${icon === s ? ' selected' : ''}`}
                        style={icon === s ? { borderColor: accent } : undefined}
                        aria-label={s}
                        aria-pressed={icon === s}
                        onClick={() => setIcon(s)}
                      >
                        <CatalogIcon slug={s} size={20} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="builder-section">
            <span className="builder-section-title">Custom fields</span>
            <div className="field-rows">
              {fields.map((f, i) => (
                <div key={i} className="field-row">
                  <input
                    type="text"
                    placeholder="Field name"
                    value={f.name}
                    onChange={(e) => updateField(i, { name: e.target.value })}
                  />
                  <select
                    value={f.type}
                    onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  {hasOptions(f.type) && (
                    <input
                      type="text"
                      placeholder="Options, comma separated"
                      value={(f.options ?? []).join(', ')}
                      onChange={(e) =>
                        updateField(i, { options: e.target.value.split(',').map((o) => o.trim()) })
                      }
                    />
                  )}
                  <button
                    type="button"
                    className="row-remove"
                    aria-label="Remove field"
                    onClick={() => setFields((arr) => arr.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="row-add"
              onClick={() => setFields((f) => [...f, { name: '', type: 'text' }])}
            >
              <Plus size={16} />
              Add field
            </button>
          </section>

          <section className="builder-section">
            <span className="builder-section-title">Statuses</span>
            <p className="hint">
              ‘Done’ is fixed — completing a task, active counts, and dependency
              blocking all key on it.
            </p>
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
                    className="row-move"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => moveStatus(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="row-move"
                    aria-label="Move down"
                    disabled={i === statuses.length - 1}
                    onClick={() => moveStatus(i, 1)}
                  >
                    ↓
                  </button>
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
            <button
              type="button"
              className="row-add"
              onClick={() => setStatuses((s) => [...s, 'New status'])}
            >
              <Plus size={16} />
              Add status
            </button>
          </section>

          <p className="hint">The cheatsheet starts empty — you can fill it in from the dashboard.</p>
        </div>

        <footer className="builder-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || name.trim().length === 0}
            onClick={create}
          >
            {busy ? 'Creating…' : 'Create space'}
            <ChevronRight size={16} />
          </button>
        </footer>
      </div>
    </div>
  )
}
