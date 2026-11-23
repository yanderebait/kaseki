import { useState } from 'react'
import Modal from './Modal'
import { CatalogIcon } from '../iconCatalog'
import { Plus } from '../icons'
import type { LauncherItem } from '../../../shared/types'

// Manages a space's launcher items (Part 6): add an app (native file
// browse) or a URL, rename, change the icon (upload + resize), remove, and
// reorder with up/down. Drag-and-drop is deferred to the Phase 11 polish
// pass. Every action re-fetches via onChange so the dock and this list stay
// in sync.
//
// The list itself is `LauncherList`, so Settings → Application launcher
// (v0.3.0) can show the same editor inline for any space; the default export
// is that list inside the dashboard's modal.
export default function LauncherEditor({
  spaceId,
  items,
  onChange,
  onClose
}: {
  spaceId: number
  items: LauncherItem[]
  onChange: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <Modal title="Apps & links" onClose={onClose}>
      <LauncherList spaceId={spaceId} items={items} onChange={onChange} />
    </Modal>
  )
}

export function LauncherList({
  spaceId,
  items,
  onChange
}: {
  spaceId: number
  items: LauncherItem[]
  onChange: () => void
}): React.JSX.Element {
  const [addingUrl, setAddingUrl] = useState(false)
  const [urlName, setUrlName] = useState('')
  const [url, setUrl] = useState('')

  async function addApp(): Promise<void> {
    const item = await window.kaseki.launcher.addApp(spaceId)
    if (item) onChange()
  }

  async function addUrl(): Promise<void> {
    if (urlName.trim().length === 0 || url.trim().length === 0) return
    await window.kaseki.launcher.addUrl(spaceId, { name: urlName.trim(), url: url.trim() })
    setUrlName('')
    setUrl('')
    setAddingUrl(false)
    onChange()
  }

  return (
    <>
      <div className="launcher-list">
        {items.map((item, i) => (
          <div key={item.id} className="launcher-row">
            <button
              type="button"
              className="launcher-row-icon"
              title="Change icon"
              onClick={() => window.kaseki.launcher.setIcon(item.id).then((r) => r && onChange())}
            >
              {item.iconDataUrl ? (
                <img src={item.iconDataUrl} alt="" />
              ) : (
                <CatalogIcon slug={item.kind === 'url' ? 'world' : 'briefcase'} size={18} />
              )}
            </button>
            <input
              className="launcher-row-name"
              defaultValue={item.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v.length > 0 && v !== item.name) {
                  window.kaseki.launcher.rename(item.id, v).then(onChange)
                }
              }}
            />
            <button
              type="button"
              className="row-move"
              aria-label="Move left"
              disabled={i === 0}
              onClick={() => window.kaseki.launcher.move(item.id, -1).then(onChange)}
            >
              ↑
            </button>
            <button
              type="button"
              className="row-move"
              aria-label="Move right"
              disabled={i === items.length - 1}
              onClick={() => window.kaseki.launcher.move(item.id, 1).then(onChange)}
            >
              ↓
            </button>
            <button
              type="button"
              className="row-remove"
              aria-label="Remove"
              onClick={() => window.kaseki.launcher.remove(item.id).then(onChange)}
            >
              ×
            </button>
          </div>
        ))}
        {items.length === 0 && <p className="hint">No apps or links yet.</p>}
      </div>

      {addingUrl ? (
        <div className="launcher-add-url">
          <input
            type="text"
            placeholder="Name"
            value={urlName}
            onChange={(e) => setUrlName(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addUrl()
            }}
          />
          <button
            type="button"
            className="primary"
            disabled={urlName.trim().length === 0 || url.trim().length === 0}
            onClick={addUrl}
          >
            Add
          </button>
        </div>
      ) : (
        <div className="launcher-add-actions">
          <button type="button" className="row-add" onClick={addApp}>
            <Plus size={16} />
            Add app…
          </button>
          <button type="button" className="row-add" onClick={() => setAddingUrl(true)}>
            <Plus size={16} />
            Add link
          </button>
        </div>
      )}
    </>
  )
}
