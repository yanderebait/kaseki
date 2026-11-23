import { useCallback, useEffect, useState } from 'react'
import type { LauncherItem, SearchHitType, Space } from '../../../../shared/types'
import {
  KEEP_OPTIONS,
  type BackupConfig,
  type BackupResult,
  type BackupSchedule
} from '../../../../shared/backup'
import {
  LEAD_OPTIONS,
  normalizeNotificationConfig,
  type NotificationConfig
} from '../../../../shared/notifications'
import {
  MAX_PER_TYPE_OPTIONS,
  SEARCH_TYPES,
  SEARCH_TYPE_LABELS,
  normalizeSearchOptions,
  type SearchOptions
} from '../../../../shared/searchOptions'
import { UPDATE_RELEASES_URL, type UpdateStatus } from '../../../../shared/updates'
import {
  normalizeWeatherConfig,
  type WeatherConfig,
  type WeatherPlace,
  type WeatherUnits
} from '../../../../shared/widgets'
import { LauncherList } from '../LauncherEditor'

// The six settings pages that Phase 1 left as "arrive in a later phase"
// placeholders, finished in v0.3.0: Application launcher, Backup and export,
// Notifications, Search, Updates, and Weather widget.

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'never'
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Application launcher (Part 14 #4): the same apps-and-links editor the
// dashboard dock opens, for any space, without leaving Settings.
export function LauncherPane(): React.JSX.Element {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [items, setItems] = useState<LauncherItem[]>([])

  useEffect(() => {
    window.kaseki.spaces.list().then((list) => {
      setSpaces(list)
      setSpaceId((current) => current ?? list[0]?.id ?? null)
    })
  }, [])

  const reload = useCallback(() => {
    if (spaceId == null) return
    window.kaseki.launcher.list(spaceId).then(setItems)
  }, [spaceId])

  useEffect(reload, [reload])

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Application launcher</h2>
      <p className="hint">
        The apps and links in each space’s dock. Click an icon to change it, edit a name in place,
        and reorder with the arrows.
      </p>
      {spaces.length === 0 ? (
        <p className="hint">No spaces yet.</p>
      ) : (
        <>
          <label className="setting-row">
            <span>Space</span>
            <select
              className="settings-select"
              value={spaceId ?? ''}
              onChange={(e) => setSpaceId(Number(e.target.value))}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {spaceId != null && (
            // Keyed by space so the uncontrolled name inputs reset on switch.
            <div key={spaceId} className="settings-launcher">
              <LauncherList spaceId={spaceId} items={items} onChange={reload} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Backup and export (Part 14 #7). A backup is an encrypted copy of the data
// folder that only Kaseki (and the login password) can read; an export is a
// plain file anything can read.
export function BackupPane(): React.JSX.Element {
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)

  useEffect(() => {
    window.kaseki.backup.config().then(setConfig)
  }, [])

  function report(result: BackupResult, success: string): void {
    if (result.cancelled) return
    setMessage(
      result.ok
        ? { text: success, failed: false }
        : { text: result.error ?? 'That did not work.', failed: true }
    )
  }

  async function backupNow(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.kaseki.backup.now()
      report(
        result,
        `Backed up ${result.files ?? 0} files (${size(result.bytes ?? 0)}) to ${result.path ?? ''}`
      )
      setConfig(await window.kaseki.backup.config())
    } finally {
      setBusy(false)
    }
  }

  async function restore(): Promise<void> {
    setMessage(null)
    // On success the app restarts, so there is nothing to report back.
    report(await window.kaseki.backup.restore(), 'Restoring…')
  }

  async function exportTasks(): Promise<void> {
    const result = await window.kaseki.dataExport.tasksCsv()
    if (result.ok) setMessage({ text: 'Tasks exported.', failed: false })
    else if (result.error) setMessage({ text: result.error, failed: true })
  }

  async function exportCalendar(): Promise<void> {
    const result = await window.kaseki.events.exportIcs(null)
    if (result.ok) setMessage({ text: 'Calendar exported.', failed: false })
  }

  if (!config) return <div className="settings-section" />

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Backup and export</h2>
      <p className="hint">
        A backup copies your database, files, and sensitive folder exactly as they sit on disk —
        still encrypted, so it is useless to anyone without your login password, and to you if you
        forget it. Keep it somewhere other than this computer.
      </p>

      <div className="setting-row">
        <span>Backup folder</span>
        <span className="settings-path" title={config.folder}>
          {config.folder || 'Not chosen'}
        </span>
        <button
          type="button"
          className="settings-inline-btn"
          onClick={() => window.kaseki.backup.chooseFolder().then(setConfig)}
        >
          Choose…
        </button>
      </div>
      <label className="setting-row">
        <span>Back up automatically</span>
        <select
          className="settings-select"
          value={config.schedule}
          onChange={(e) =>
            window.kaseki.backup
              .update({ schedule: e.target.value as BackupSchedule })
              .then(setConfig)
          }
        >
          <option value="off">Off</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
      {config.schedule !== 'off' && !config.folder && (
        <p className="form-error">Choose a backup folder — nothing is backed up until you do.</p>
      )}
      <label className="setting-row">
        <span>Backups to keep</span>
        <select
          className="settings-select"
          value={config.keep}
          onChange={(e) =>
            window.kaseki.backup.update({ keep: Number(e.target.value) }).then(setConfig)
          }
        >
          {KEEP_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        Last backup: {when(config.lastAt)}
        {config.lastError ? ` · last attempt failed: ${config.lastError}` : ''}
      </p>
      <div className="settings-actions">
        <button type="button" className="settings-btn" disabled={busy} onClick={backupNow}>
          {busy ? 'Backing up…' : 'Back up now'}
        </button>
        <button type="button" className="settings-btn" disabled={busy} onClick={restore}>
          Restore from a backup…
        </button>
      </div>
      {message && <p className={message.failed ? 'form-error' : 'hint'}>{message.text}</p>}

      <div className="setting-block">
        <span className="setting-block-title">Export</span>
        <p className="hint">
          Plain files any other program can open. Nothing here is encrypted — treat the exported
          files accordingly.
        </p>
        <div className="settings-actions">
          <button type="button" className="settings-btn" onClick={exportTasks}>
            All tasks (.csv)
          </button>
          <button type="button" className="settings-btn" onClick={exportCalendar}>
            Calendar (.ics)
          </button>
        </div>
      </div>
    </div>
  )
}

// Notifications (Part 14 #9): local OS notifications. Off by default.
export function NotificationsPane(): React.JSX.Element {
  const [config, setConfig] = useState<NotificationConfig | null>(null)
  const [test, setTest] = useState<string | null>(null)

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => setConfig(normalizeNotificationConfig(p.notifications)))
  }, [])

  function update(patch: Partial<NotificationConfig>): void {
    if (!config) return
    const next = { ...config, ...patch }
    setConfig(next)
    window.kaseki.prefs.set({ notifications: next })
  }

  async function sendTest(): Promise<void> {
    const result = await window.kaseki.notifications.test()
    setTest(result.ok ? 'Sent — check your notifications.' : (result.error ?? 'Could not send.'))
  }

  if (!config) return <div className="settings-section" />

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Notifications</h2>
      <p className="hint">
        Off by default. When on, Kaseki shows a desktop notification before an event starts and,
        if you like, one summary a day of what is due. They are raised by your own computer while
        Kaseki is open and unlocked; nothing is sent anywhere.
      </p>
      <label className="setting-row">
        <span>Show notifications</span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
      </label>
      <label className="setting-row">
        <span>Remind me before an event</span>
        <select
          className="settings-select"
          disabled={!config.enabled}
          value={config.eventLeadMinutes}
          onChange={(e) => update({ eventLeadMinutes: Number(e.target.value) })}
        >
          {LEAD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>
      <label className="setting-row">
        <span>Daily summary of due and overdue tasks</span>
        <input
          type="checkbox"
          disabled={!config.enabled}
          checked={config.dailyDigest}
          onChange={(e) => update({ dailyDigest: e.target.checked })}
        />
      </label>
      <label className="setting-row">
        <span>Send the summary from</span>
        <select
          className="settings-select"
          disabled={!config.enabled || !config.dailyDigest}
          value={config.digestHour}
          onChange={(e) => update({ digestHour: Number(e.target.value) })}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </label>
      <div className="settings-actions">
        <button type="button" className="settings-btn" onClick={sendTest}>
          Send a test notification
        </button>
      </div>
      {test && <p className="hint">{test}</p>}
    </div>
  )
}

// Search (Part 14 #10): what Cmd/Ctrl+K looks through.
export function SearchPane(): React.JSX.Element {
  const [options, setOptions] = useState<SearchOptions | null>(null)

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => setOptions(normalizeSearchOptions(p.search)))
  }, [])

  function save(next: SearchOptions): void {
    setOptions(next)
    window.kaseki.prefs.set({ search: next })
  }

  function toggle(type: SearchHitType, on: boolean): void {
    if (!options) return
    save({ ...options, types: { ...options.types, [type]: on } })
  }

  if (!options) return <div className="settings-section" />

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Search</h2>
      <p className="hint">
        What Cmd/Ctrl+K searches. Switch off anything you never want in the results.
      </p>
      {SEARCH_TYPES.map((type) => (
        <label key={type} className="setting-row">
          <span>{SEARCH_TYPE_LABELS[type]}</span>
          <input
            type="checkbox"
            checked={options.types[type]}
            onChange={(e) => toggle(type, e.target.checked)}
          />
        </label>
      ))}
      <label className="setting-row">
        <span>Results shown per kind</span>
        <select
          className="settings-select"
          value={options.maxPerType}
          onChange={(e) => save({ ...options, maxPerType: Number(e.target.value) })}
        >
          {MAX_PER_TYPE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

// Updates (Part 14 #11): an optional daily check against GitHub. Kaseki never
// downloads or installs an update itself.
export function UpdatesPane(): React.JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.kaseki.updates.status().then(setStatus)
  }, [])

  async function check(): Promise<void> {
    setBusy(true)
    try {
      setStatus(await window.kaseki.updates.check())
    } finally {
      setBusy(false)
    }
  }

  if (!status) return <div className="settings-section" />

  let verdict = 'Not checked yet.'
  if (status.error) verdict = status.error
  else if (status.updateAvailable) verdict = `Version ${status.latestVersion} is available.`
  else if (status.latestVersion) verdict = 'You have the latest version.'

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Updates</h2>
      <p className="hint">
        Off by default. When on, Kaseki asks GitHub once a day whether a newer version exists. The
        request carries your Kaseki version number and nothing else. Kaseki never downloads or
        installs anything itself — it tells you, and you decide.
      </p>
      <div className="setting-row">
        <span>Installed version</span>
        <span>{status.currentVersion}</span>
      </div>
      <label className="setting-row">
        <span>Check for updates daily</span>
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => window.kaseki.updates.setEnabled(e.target.checked).then(setStatus)}
        />
      </label>
      <p className="hint">
        {verdict} Last checked: {when(status.checkedAt)}.
      </p>
      <div className="settings-actions">
        <button
          type="button"
          className="settings-btn"
          disabled={!status.enabled || busy}
          onClick={check}
        >
          {busy ? 'Checking…' : 'Check now'}
        </button>
        <button
          type="button"
          className="settings-btn"
          // Opens in the OS browser via the main process's window-open handler.
          onClick={() =>
            window.open(status.releaseUrl ?? UPDATE_RELEASES_URL, '_blank', 'noopener')
          }
        >
          {status.updateAvailable ? 'Open the release page' : 'All releases'}
        </button>
      </div>
    </div>
  )
}

// Weather widget (Part 14 #13): the switch and the location. Off by default;
// no request is made until it is on and a place is chosen.
export function WeatherPane(): React.JSX.Element {
  const [config, setConfig] = useState<WeatherConfig | null>(null)
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<WeatherPlace[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => setConfig(normalizeWeatherConfig(p.weather)))
  }, [])

  function save(next: WeatherConfig): void {
    setConfig(next)
    window.kaseki.prefs.set({ weather: next })
  }

  async function search(): Promise<void> {
    if (!config?.enabled || query.trim().length < 2) return
    setSearching(true)
    try {
      setPlaces(await window.kaseki.weather.search(query))
    } finally {
      setSearching(false)
    }
  }

  if (!config) return <div className="settings-section" />

  const located = config.latitude !== null && config.longitude !== null

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Weather widget</h2>
      <p className="hint">
        Off by default. When on, Kaseki asks Open-Meteo (a weather service) for the forecast at the
        place you choose. The request contains that place’s coordinates and your units; searching
        for a place sends the name you type. Nothing from your tasks, notes, or files is involved.
      </p>
      <label className="setting-row">
        <span>Use the weather widget</span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => {
            save({ ...config, enabled: e.target.checked })
            if (!e.target.checked) setPlaces(null)
          }}
        />
      </label>
      <label className="setting-row">
        <span>Units</span>
        <select
          className="settings-select"
          value={config.units}
          onChange={(e) => save({ ...config, units: e.target.value as WeatherUnits })}
        >
          <option value="celsius">Celsius</option>
          <option value="fahrenheit">Fahrenheit</option>
        </select>
      </label>
      <div className="setting-row">
        <span>Location</span>
        <span className="settings-path">{located ? config.name || 'Custom coordinates' : 'Not set'}</span>
        {located && (
          <button
            type="button"
            className="settings-inline-btn"
            onClick={() => save({ ...config, name: '', latitude: null, longitude: null })}
          >
            Clear
          </button>
        )}
      </div>
      <form
        className="settings-search-row"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <input
          className="settings-input"
          type="text"
          placeholder={config.enabled ? 'Search for a town or city' : 'Turn the widget on to search'}
          aria-label="Search for a place"
          disabled={!config.enabled}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="settings-btn"
          disabled={!config.enabled || searching || query.trim().length < 2}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {places !== null && places.length === 0 && (
        <p className="hint">No places found. Check the spelling, or your connection.</p>
      )}
      {places !== null && places.length > 0 && (
        <ul className="settings-place-list">
          {places.map((place) => (
            <li key={`${place.latitude},${place.longitude}`}>
              <button
                type="button"
                className="settings-place"
                onClick={() => {
                  save({
                    ...config,
                    name: place.name,
                    latitude: place.latitude,
                    longitude: place.longitude
                  })
                  setPlaces(null)
                  setQuery('')
                }}
              >
                <span>{place.name}</span>
                <span className="hint">{place.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Add the widget itself from the home screen: Widgets → Add widget → Weather.
      </p>
    </div>
  )
}
