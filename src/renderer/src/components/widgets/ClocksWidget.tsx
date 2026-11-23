import { useEffect, useMemo, useState } from 'react'
import {
  CLOCKS_MAX,
  isValidTimeZone,
  normalizeClocks,
  zoneLabel,
  zoneOffsetLabel
} from '../../../../shared/widgets'
import { Plus, X } from '../../icons'

// World Clocks: a few time zones at a glance, each with how far it is from
// here. Uses the IANA zone database built into the runtime — no lookup, no
// network. Times re-render every 20 seconds, which is as precise as an HH:MM
// display can be.
export default function ClocksWidget({ editing }: { editing: boolean }): React.JSX.Element {
  const [zones, setZones] = useState<string[] | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const localZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const allZones = useMemo<string[]>(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => setZones(normalizeClocks(p.widgetClocks)))
    const id = window.setInterval(() => setNow(new Date()), 20000)
    return () => window.clearInterval(id)
  }, [])

  function save(next: string[]): void {
    setZones(next)
    window.kaseki.prefs.set({ widgetClocks: next })
  }

  function add(): void {
    if (!zones) return
    const typed = draft.trim()
    // Accept the exact zone id, or a city name that matches exactly one zone's
    // last segment ("Tokyo" → "Asia/Tokyo").
    const wanted = typed.toLowerCase().replace(/\s+/g, '_')
    const byCity = allZones.filter((z) => (z.split('/').pop() ?? '').toLowerCase() === wanted)
    const zone = isValidTimeZone(typed) && typed.includes('/') ? typed : byCity.length === 1 ? byCity[0] : null
    if (!zone) {
      setError('Pick a time zone from the list, e.g. Asia/Tokyo.')
      return
    }
    if (zones.includes(zone)) {
      setError('That clock is already shown.')
      return
    }
    save([...zones, zone])
    setDraft('')
    setError(null)
  }

  if (zones === null) return <p className="widget-empty">&nbsp;</p>

  return (
    <div className="widget-clocks">
      {zones.length === 0 && !editing && (
        <p className="widget-empty">No clocks. Press Edit to add one.</p>
      )}
      <ul className="widget-clock-list">
        {zones.map((zone) => (
          <li key={zone} className="widget-clock">
            <span className="widget-clock-city">{zoneLabel(zone)}</span>
            <span className="widget-clock-offset">{zoneOffsetLabel(zone, localZone, now)}</span>
            <span className="widget-clock-time">
              {now.toLocaleTimeString(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit' })}
            </span>
            {editing && (
              <button
                type="button"
                className="widget-row-remove"
                aria-label={`Remove ${zoneLabel(zone)}`}
                onClick={() => save(zones.filter((z) => z !== zone))}
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && zones.length < CLOCKS_MAX && (
        <form
          className="widget-inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            className="settings-input"
            list="kaseki-timezones"
            placeholder="Add a time zone, e.g. Asia/Tokyo"
            aria-label="Time zone"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
          />
          <datalist id="kaseki-timezones">
            {allZones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <button type="submit" className="widget-inline-add" aria-label="Add clock">
            <Plus size={16} />
          </button>
        </form>
      )}
      {editing && error && <p className="form-error">{error}</p>}
    </div>
  )
}
