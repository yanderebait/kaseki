import { useCallback, useEffect, useState } from 'react'
import type { LauncherItem } from '../../../shared/types'
import { useOrb } from '../orbState'
import { CatalogIcon } from '../iconCatalog'
import { Plus } from '../icons'
import LauncherEditor from './LauncherEditor'

// The per-profession launcher dock in the dashboard header (Part 6). Each
// item launches by id; unavailable items (path missing or set on another
// OS) are disabled with a tooltip. URLs without a custom icon fall back to
// a globe; apps to a generic glyph.
export default function LauncherDock({ spaceId }: { spaceId: number }): React.JSX.Element {
  const { flash, say } = useOrb()
  const [items, setItems] = useState<LauncherItem[]>([])

  const [editing, setEditing] = useState(false)

  const refresh = useCallback(() => {
    window.kaseki.launcher.list(spaceId).then(setItems)
  }, [spaceId])

  useEffect(refresh, [refresh])

  return (
    <div className="launcher-dock" data-tour="launcher">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="launcher-item"
          disabled={!item.available}
          title={item.available ? item.name : `${item.name} — not available on this machine`}
          onClick={async () => {
            // Surface launch failures — the result was previously discarded,
            // so a broken item (missing binary, non-executable file) clicked
            // to total silence.
            const result = await window.kaseki.launcher.launch(item.id)
            if (!result.ok) {
              flash('error')
              say({ body: result.error ?? 'Could not launch this item.' })
            }
          }}
        >
          {item.iconDataUrl ? (
            <img src={item.iconDataUrl} alt="" className="launcher-icon-img" />
          ) : (
            <CatalogIcon slug={item.kind === 'url' ? 'world' : 'briefcase'} size={18} />
          )}
        </button>
      ))}
      <button
        type="button"
        className="launcher-item launcher-add"
        title="Manage apps & links"
        onClick={() => setEditing(true)}
      >
        <Plus size={18} />
      </button>
      {editing && (
        <LauncherEditor
          spaceId={spaceId}
          items={items}
          onChange={refresh}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}
