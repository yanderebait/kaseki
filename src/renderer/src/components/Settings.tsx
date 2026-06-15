import { useEffect, useState } from 'react'
import type { BillingMode, Preferences, SpaceBilling, SpaceDetail, VaultStatus } from '../../../shared/types'
import { BILLING_LABELS, BILLING_MODES, RATE_LABELS } from '../../../shared/billing'
import { useTheme } from '../theme'
import { useOrb, type OrbIntensity } from '../orbState'
import { FONT_SCALES } from '../appearance'
import { ACCENTS } from '../accents'
import { useFocusTrap } from '../hooks/useFocusTrap'
import LegalModal from './legal/LegalModal'
import { ShortcutsList } from './ShortcutsHelp'

// The settings categories (Part 14). Phase 1 ships the panel shell: the
// category sidebar plus content. General (theme) and About (version) have
// real content; the rest are placeholders their owning phases fill in.
const CATEGORIES = [
  'General',
  'Profession spaces',
  'Customization',
  'Application launcher',
  'Orb',
  'Sensitive folder',
  'Backup and export',
  'Keyboard shortcuts',
  'Notifications',
  'Search',
  'Updates',
  'Crash reporting',
  'Weather widget',
  'About'
]

export default function Settings({
  initial = 'General',
  onClose
}: {
  initial?: string
  onClose: () => void
}): React.JSX.Element {
  const [selected, setSelected] = useState(initial)
  const trapRef = useFocusTrap<HTMLDivElement>()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={trapRef}
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="settings-nav">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={selected === c ? 'active' : ''}
              onClick={() => setSelected(c)}
            >
              {c}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <CategoryPane category={selected} />
        </div>
      </div>
    </div>
  )
}

function CategoryPane({ category }: { category: string }): React.JSX.Element {
  if (category === 'General') return <GeneralPane />
  if (category === 'Profession spaces') return <SpacesPane />
  if (category === 'Customization') return <CustomizationPane />
  if (category === 'Orb') return <OrbPane />
  if (category === 'Sensitive folder') return <SensitivePane />
  if (category === 'Keyboard shortcuts') return <ShortcutsPane />
  if (category === 'Crash reporting') return <CrashReportingPane />
  if (category === 'About') return <AboutPane />
  return <p className="hint">Settings for {category.toLowerCase()} arrive in a later phase.</p>
}

// Crash reporting (Part 14 #12): off by default, opt-in, sends only sanitised
// reports to the user's own Sentry instance. "Review what would be sent" shows
// the exact payload (real version/OS values, no user content).
function CrashReportingPane(): React.JSX.Element {
  const [enabled, setEnabled] = useState(false)
  const [dsn, setDsn] = useState('')
  const [sample, setSample] = useState('')
  const [showSample, setShowSample] = useState(false)

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      const c = p.crashReporting as { enabled?: boolean; dsn?: string } | undefined
      setEnabled(c?.enabled === true)
      setDsn(typeof c?.dsn === 'string' ? c.dsn : '')
    })
  }, [])

  function persist(next: { enabled: boolean; dsn: string }): void {
    window.kaseki.prefs.set({ crashReporting: next })
  }

  async function review(): Promise<void> {
    if (!showSample && !sample) {
      setSample(JSON.stringify(await window.kaseki.crash.sample(), null, 2))
    }
    setShowSample((s) => !s)
  }

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Crash reporting</h2>
      <p className="hint">
        Off by default. When on, Kaseki sends anonymised crash reports to your own Sentry instance —
        the app and OS versions and the error itself, never your tasks, notes, files, or name.
      </p>
      <label className="setting-row">
        <span>Send crash reports</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked)
            persist({ enabled: e.target.checked, dsn })
          }}
        />
      </label>
      <div className="setting-row">
        <span>Sentry DSN</span>
        <input
          className="settings-input crash-dsn"
          type="text"
          placeholder="https://…@….ingest.sentry.io/…"
          value={dsn}
          onChange={(e) => {
            setDsn(e.target.value)
            persist({ enabled, dsn: e.target.value })
          }}
        />
      </div>
      <button type="button" className="crash-review" onClick={review}>
        {showSample ? 'Hide' : 'Review what would be sent'}
      </button>
      {showSample && <pre className="crash-sample">{sample}</pre>}
    </div>
  )
}

// Keyboard shortcuts (Part 14 #8): the same reference the Cmd+/ overlay shows.
function ShortcutsPane(): React.JSX.Element {
  return (
    <div className="settings-section">
      <h2 className="settings-heading">Keyboard shortcuts</h2>
      <ShortcutsList />
    </div>
  )
}

// Profession spaces (Part 14 #2): for now, just each space's default billing
// pattern (Part 7) — the mode and its rate. Full space management (rename,
// archive, reorder) lands in a later pass. A task can override the default.
function SpacesPane(): React.JSX.Element {
  const [spaces, setSpaces] = useState<SpaceDetail[]>([])
  const [currency, setCurrency] = useState('£')

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      if (typeof p.currency === 'string' && p.currency) setCurrency(p.currency)
    })
    window.kaseki.spaces.list().then(async (list) => {
      const details = await Promise.all(list.map((s) => window.kaseki.spaces.get(s.id)))
      setSpaces(details)
    })
  }, [])

  function update(spaceId: number, billing: SpaceBilling): void {
    setSpaces((ss) => ss.map((s) => (s.id === spaceId ? { ...s, billing } : s)))
    window.kaseki.spaces.setBilling(spaceId, billing)
  }

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Profession spaces</h2>
      <p className="hint">
        Each space’s default billing pattern. A task can override it; full space management arrives later.
      </p>
      <div className="space-billing-list">
        {spaces.map((s) => (
          <div key={s.id} className="space-billing-row">
            <span className="space-billing-name">
              <span
                className="space-billing-dot"
                style={{ background: s.accentColor ?? 'var(--accent)' }}
              />
              {s.name}
            </span>
            <select
              className="settings-select"
              value={s.billing.mode}
              onChange={(e) => update(s.id, { mode: e.target.value as BillingMode, rate: s.billing.rate })}
            >
              {BILLING_MODES.map((m) => (
                <option key={m} value={m}>
                  {BILLING_LABELS[m]}
                </option>
              ))}
            </select>
            {s.billing.mode !== 'none' && (
              <span className="space-billing-rate" title={RATE_LABELS[s.billing.mode]}>
                <span className="rate-symbol">{currency}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={s.billing.rate ?? ''}
                  onChange={(e) =>
                    update(s.id, {
                      mode: s.billing.mode,
                      rate: e.target.value === '' ? null : Number(e.target.value)
                    })
                  }
                />
              </span>
            )}
          </div>
        ))}
        {spaces.length === 0 && <p className="hint">No spaces yet.</p>}
      </div>
    </div>
  )
}

// General (Part 14 #1): theme, font scale, and the task detail panel width
// (Part 8). Theme offers OS-auto; font scale is the accessibility multiplier.
function GeneralPane(): React.JSX.Element {
  const { theme, setTheme, fontScale, setFontScale } = useTheme()
  const [slideoutWidth, setSlideoutWidth] = useState(60)
  const [currency, setCurrency] = useState('£')
  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      const w = Number(p.taskSlideoutWidth)
      if (w >= 30 && w <= 80) setSlideoutWidth(w)
      if (typeof p.currency === 'string' && p.currency) setCurrency(p.currency)
    })
  }, [])
  function changeWidth(w: number): void {
    setSlideoutWidth(w)
    window.kaseki.prefs.set({ taskSlideoutWidth: w })
  }
  // The single billing currency for the whole install (Part 7). A free-text
  // symbol; blank falls back to '£' so amounts never render symbol-less.
  function changeCurrency(value: string): void {
    setCurrency(value)
    window.kaseki.prefs.set({ currency: value.trim() || '£' })
  }
  const themes: { value: 'dark' | 'light' | 'auto'; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'auto', label: 'Auto' }
  ]
  return (
    <div className="settings-section">
      <h2 className="settings-heading">General</h2>
      <div className="setting-row">
        <span>Theme</span>
        <div className="view-toggle" role="group" aria-label="Theme">
          {themes.map((t) => (
            <button
              key={t.value}
              type="button"
              className={theme === t.value ? 'active' : ''}
              aria-pressed={theme === t.value}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <span>Font size</span>
        <select
          className="settings-select"
          value={fontScale}
          onChange={(e) => setFontScale(Number(e.target.value))}
        >
          {FONT_SCALES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label} ({Math.round(f.value * 100)}%)
            </option>
          ))}
        </select>
      </div>
      <div className="setting-row">
        <span>Task panel width</span>
        <div className="setting-slider">
          <input
            type="range"
            min={30}
            max={80}
            value={slideoutWidth}
            onChange={(e) => changeWidth(Number(e.target.value))}
          />
          <span className="hint">{slideoutWidth}%</span>
        </div>
      </div>
      <div className="setting-row">
        <span>Currency symbol</span>
        <input
          className="settings-input settings-currency"
          type="text"
          maxLength={4}
          value={currency}
          onChange={(e) => changeCurrency(e.target.value)}
          aria-label="Currency symbol"
        />
      </div>
    </div>
  )
}

// Customization (Part 14 #3): accent color and background style. The accent
// here colors app chrome and seeds new spaces; each space can still pick its
// own (Part 3). "Upload my own" background is deferred — flat and frosted ship.
function CustomizationPane(): React.JSX.Element {
  const { accent, setAccent, background, setBackground } = useTheme()
  const [hex, setHex] = useState(accent ?? '')
  useEffect(() => setHex(accent ?? ''), [accent])

  function onHex(value: string): void {
    setHex(value)
    const v = value.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setAccent(v)
    else if (v === '') setAccent(null)
  }

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Customization</h2>
      <div className="setting-block">
        <span className="setting-block-label">Accent color</span>
        <p className="hint">
          Colors app highlights and the default for new spaces. Each space can still set its own.
        </p>
        <div className="swatch-grid" role="group" aria-label="Accent color">
          <button
            type="button"
            className={`swatch swatch-default${accent === null ? ' selected' : ''}`}
            title="Default"
            aria-label="Default accent"
            aria-pressed={accent === null}
            onClick={() => setAccent(null)}
          />
          {ACCENTS.map((a) => (
            <button
              key={a.hex}
              type="button"
              className={`swatch${accent?.toLowerCase() === a.hex.toLowerCase() ? ' selected' : ''}`}
              style={{ background: a.hex }}
              title={a.name}
              aria-label={a.name}
              aria-pressed={accent?.toLowerCase() === a.hex.toLowerCase()}
              onClick={() => setAccent(a.hex)}
            />
          ))}
        </div>
        <label className="setting-hex">
          <span>Custom hex</span>
          <input
            type="text"
            className="vault-input"
            placeholder="#7F77DD"
            value={hex}
            onChange={(e) => onHex(e.target.value)}
          />
        </label>
      </div>
      <div className="setting-row">
        <span>Background</span>
        <div className="view-toggle" role="group" aria-label="Background">
          <button
            type="button"
            className={background === 'flat' ? 'active' : ''}
            aria-pressed={background === 'flat'}
            onClick={() => setBackground('flat')}
          >
            Flat
          </button>
          <button
            type="button"
            className={background === 'frosted' ? 'active' : ''}
            aria-pressed={background === 'frosted'}
            onClick={() => setBackground('frosted')}
          >
            Frosted glass
          </button>
        </div>
      </div>
    </div>
  )
}

// Orb (Part 14 #5): show/hide, default position, and animation intensity.
// These share OrbProvider state, so changes here take effect on the live Orb
// immediately.
function OrbPane(): React.JSX.Element {
  const { hidden, setHidden, intensity, setIntensity, commitPos } = useOrb()
  const intensities: OrbIntensity[] = ['subtle', 'normal', 'lively']
  return (
    <div className="settings-section">
      <h2 className="settings-heading">Orb</h2>
      <div className="setting-row">
        <span>Show Orb</span>
        <input type="checkbox" checked={!hidden} onChange={(e) => setHidden(!e.target.checked)} />
      </div>
      <div className="setting-row">
        <span>Position</span>
        <button type="button" onClick={() => commitPos(null)}>
          Reset to default
        </button>
      </div>
      <div className="setting-row">
        <span>Animation intensity</span>
        <div className="view-toggle" role="group" aria-label="Animation intensity">
          {intensities.map((i) => (
            <button
              key={i}
              type="button"
              className={intensity === i ? 'active' : ''}
              aria-pressed={intensity === i}
              onClick={() => setIntensity(i)}
            >
              {i[0].toUpperCase() + i.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Part 11 / Part 14: auto-lock timing, clipboard auto-clear, and passcode
// change. Setup and recovery live in the folder overlay itself; this pane
// only appears useful once a folder exists.
function SensitivePane(): React.JSX.Element {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [prefs, setPrefs] = useState<Preferences>({})
  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    window.kaseki.vault.status().then(setStatus)
    window.kaseki.prefs.get().then(setPrefs)
  }, [])

  function update(patch: Preferences): void {
    window.kaseki.prefs.set(patch).then(setPrefs)
  }

  async function changePass(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (newPass.length === 0) {
      setMsg({ text: 'Choose a new passcode.', ok: false })
      return
    }
    if (newPass !== confirm) {
      setMsg({ text: 'The new passcodes don’t match.', ok: false })
      return
    }
    const ok = await window.kaseki.vault.changePasscode(oldPass, newPass)
    setMsg(
      ok
        ? { text: 'Passcode changed.', ok: true }
        : { text: 'Current passcode is wrong.', ok: false }
    )
    if (ok) {
      setOldPass('')
      setNewPass('')
      setConfirm('')
    }
  }

  const autoLock = Number(prefs.vaultAutoLock) || 0
  const clipboardOn = prefs.vaultClipboardClear !== false

  return (
    <div className="settings-section">
      <h2 className="settings-heading">Sensitive folder</h2>
      {status === 'absent' ? (
        <p className="hint">
          No sensitive folder yet. Open it from the Orb menu to set one up, then these options
          appear.
        </p>
      ) : (
        <>
          <div className="setting-row">
            <span>Auto-lock</span>
            <select
              className="settings-select"
              value={autoLock}
              onChange={(e) => update({ vaultAutoLock: Number(e.target.value) })}
            >
              <option value={0}>Stay unlocked until app closes</option>
              <option value={5}>After 5 minutes idle</option>
              <option value={15}>After 15 minutes idle</option>
              <option value={30}>After 30 minutes idle</option>
            </select>
          </div>
          <div className="setting-row">
            <span>Clear clipboard 30s after copying</span>
            <input
              type="checkbox"
              checked={clipboardOn}
              onChange={(e) => update({ vaultClipboardClear: e.target.checked })}
            />
          </div>
          <form className="settings-subsection" onSubmit={changePass}>
            <h3 className="settings-subheading">Change passcode</h3>
            <input
              type="password"
              className="vault-input"
              placeholder="Current passcode"
              value={oldPass}
              onChange={(e) => {
                setOldPass(e.target.value)
                setMsg(null)
              }}
            />
            <input
              type="password"
              className="vault-input"
              placeholder="New passcode"
              value={newPass}
              onChange={(e) => {
                setNewPass(e.target.value)
                setMsg(null)
              }}
            />
            <input
              type="password"
              className="vault-input"
              placeholder="Confirm new passcode"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setMsg(null)
              }}
            />
            {msg && <p className={msg.ok ? 'settings-ok' : 'vault-error'}>{msg.text}</p>}
            <button type="submit" className="primary">
              Change passcode
            </button>
          </form>
        </>
      )}
    </div>
  )
}

function AboutPane(): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [showLegal, setShowLegal] = useState(false)
  useEffect(() => {
    window.kaseki.ping().then((i) => setVersion(i.version))
  }, [])
  return (
    <div className="settings-section">
      <h2 className="settings-heading">About</h2>
      <p>Kaseki — a self-hosted, single-user personal life dashboard.</p>
      <p className="hint">Version {version}</p>
      <p className="hint">AGPL-3.0 · your data lives only on this machine.</p>
      <button type="button" className="about-legal-link" onClick={() => setShowLegal(true)}>
        Legal documents
      </button>
      {showLegal && <LegalModal mode="view" onClose={() => setShowLegal(false)} />}
    </div>
  )
}
