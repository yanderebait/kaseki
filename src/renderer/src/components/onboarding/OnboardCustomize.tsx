import { useEffect, useRef } from 'react'
import { useTheme } from '../../theme'
import { FONT_SCALES } from '../../appearance'
import { ACCENTS } from '../../accents'

// Screen 3 — customization (Part 13). Theme, accent, background, and font
// scale, each applied live through the appearance provider (Commit B). The
// preview on the right scopes the same data-attributes/variables to its own
// subtree, so it shows a self-contained mock of the home screen — frosted
// translucency and font scale included — regardless of the surrounding chrome.
export default function OnboardCustomize({
  name,
  spaceName,
  spaceAccent,
  onNext,
  onBack
}: {
  name: string
  spaceName: string
  spaceAccent: string | null
  onNext: () => void
  onBack: () => void
}): React.JSX.Element {
  const { theme, setTheme, resolvedTheme, accent, setAccent, background, setBackground, fontScale, setFontScale } =
    useTheme()
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    el.setAttribute('data-theme', resolvedTheme)
    el.setAttribute('data-bg', background)
    el.style.setProperty('--font-scale', String(fontScale))
    if (accent) el.style.setProperty('--accent', accent)
    else el.style.removeProperty('--accent')
  }, [resolvedTheme, background, fontScale, accent])

  const themes: { value: 'dark' | 'light' | 'auto'; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'auto', label: 'Auto' }
  ]

  return (
    <div className="onboard-screen onboard-wide">
      <h1 className="onboard-title">Make it yours</h1>
      <p className="onboard-sub">Set the look — you can change any of this later in Settings.</p>

      <div className="onboard-customize">
        <div className="onboard-controls">
          <div className="onboard-control">
            <span className="onboard-control-label">Theme</span>
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

          <div className="onboard-control">
            <span className="onboard-control-label">Accent</span>
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
          </div>

          <div className="onboard-control">
            <span className="onboard-control-label">Background</span>
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

          <div className="onboard-control">
            <span className="onboard-control-label">Font size</span>
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
        </div>

        <div className="onboard-preview" ref={previewRef}>
          <span className="onboard-preview-greeting">Hi, {name || 'there'}</span>
          <div
            className="onboard-preview-card"
            style={{ '--card-accent': spaceAccent ?? 'var(--accent)' } as React.CSSProperties}
          >
            <span className="onboard-preview-strip" />
            <span className="onboard-preview-card-body">
              <span className="onboard-preview-card-name">{spaceName || 'Your space'}</span>
              <span className="onboard-preview-card-sub">0 active</span>
            </span>
          </div>
          <div className="onboard-preview-widget">
            <span className="onboard-preview-widget-title">Quick Notes</span>
            <span className="onboard-preview-widget-sub">Scratchpad for ideas and lists</span>
          </div>
        </div>
      </div>

      <div className="onboard-actions">
        <button type="button" onClick={onBack}>
          Back
        </button>
        <button type="button" className="primary" onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  )
}
