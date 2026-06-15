import { useCallback, useEffect, useState } from 'react'
import type { LauncherItem } from '../../../../shared/types'
import { CatalogIcon } from '../../iconCatalog'
import { Plus } from '../../icons'

// Screen 4 — application launcher setup (Part 13) for the first profession.
// Reuses the launcher IPC: add a native app, add a URL, reorder, remove. The
// step is prominently skippable; launcher items can be managed any time from
// the dashboard.
export default function OnboardLauncher({
  spaceId,
  spaceName,
  onNext
}: {
  spaceId: number
  spaceName: string
  onNext: () => void
}): React.JSX.Element {
  const [items, setItems] = useState<LauncherItem[]>([])
  const [addingUrl, setAddingUrl] = useState(false)
  const [urlName, setUrlName] = useState('')
  const [url, setUrl] = useState('')

  const refresh = useCallback(() => {
    window.kaseki.launcher.list(spaceId).then(setItems)
  }, [spaceId])

  useEffect(refresh, [refresh])

  async function addApp(): Promise<void> {
    const item = await window.kaseki.launcher.addApp(spaceId)
    if (item) refresh()
  }

  async function addUrl(): Promise<void> {
    if (urlName.trim().length === 0 || url.trim().length === 0) return
    await window.kaseki.launcher.addUrl(spaceId, { name: urlName.trim(), url: url.trim() })
    setUrlName('')
    setUrl('')
    setAddingUrl(false)
    refresh()
  }

  return (
    <div className="onboard-screen onboard-wide">
      <h1 className="onboard-title">Add your apps</h1>
      <p className="onboard-sub">
        Apps and websites you use often. They’ll appear in the launcher on your {spaceName}{' '}
        dashboard.
      </p>

      <div className="onboard-launcher">
        <div className="launcher-list">
          {items.map((item, i) => (
            <div key={item.id} className="launcher-row">
              <span className="launcher-row-icon">
                {item.iconDataUrl ? (
                  <img src={item.iconDataUrl} alt="" />
                ) : (
                  <CatalogIcon slug={item.kind === 'url' ? 'world' : 'briefcase'} size={18} />
                )}
              </span>
              <span className="launcher-row-name">{item.name}</span>
              <button
                type="button"
                className="row-move"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => window.kaseki.launcher.move(item.id, -1).then(refresh)}
              >
                ↑
              </button>
              <button
                type="button"
                className="row-move"
                aria-label="Move down"
                disabled={i === items.length - 1}
                onClick={() => window.kaseki.launcher.move(item.id, 1).then(refresh)}
              >
                ↓
              </button>
              <button
                type="button"
                className="row-remove"
                aria-label="Remove"
                onClick={() => window.kaseki.launcher.remove(item.id).then(refresh)}
              >
                ×
              </button>
            </div>
          ))}
          {items.length === 0 && <p className="hint">Nothing added yet.</p>}
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
      </div>

      <p className="hint onboard-hint">You can skip this for now and add items anytime later.</p>

      <div className="onboard-actions">
        <button type="button" onClick={onNext}>
          Skip for now
        </button>
        <button type="button" className="primary" onClick={onNext}>
          Continue
        </button>
      </div>
    </div>
  )
}
