import type { Preferences } from '../../shared/types'

// The four appearance choices made during onboarding (Part 13, screen 3) and
// changeable later in Settings (Part 14: theme + font scale under General,
// accent + background under Customization). Each maps to one preferences key.
// "Upload my own" background is deferred; flat and frosted ship now.

export type ThemePref = 'dark' | 'light' | 'auto'
export type BackgroundPref = 'flat' | 'frosted'

export interface Appearance {
  theme: ThemePref
  /** Hex accent for app chrome / new-space default; null uses the neutral token. */
  accent: string | null
  background: BackgroundPref
  /** Base font-size multiplier; see --font-scale in tokens.css. */
  fontScale: number
}

export const FONT_SCALES = [
  { value: 0.9, label: 'Small' },
  { value: 1, label: 'Default' },
  { value: 1.1, label: 'Large' },
  { value: 1.2, label: 'Extra Large' }
] as const

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'dark',
  accent: null,
  background: 'flat',
  fontScale: 1
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

// Reads appearance out of the loose preferences blob, tolerating missing or
// malformed values by falling back to the defaults.
export function readAppearance(prefs: Preferences): Appearance {
  const theme = prefs.theme
  const background = prefs.background
  const accent = prefs.accent
  const fontScale = prefs.fontScale
  return {
    theme: theme === 'light' || theme === 'auto' ? theme : 'dark',
    accent: typeof accent === 'string' && HEX_RE.test(accent) ? accent : null,
    background: background === 'frosted' ? 'frosted' : 'flat',
    fontScale: FONT_SCALES.some((f) => f.value === fontScale) ? (fontScale as number) : 1
  }
}

// Resolves the 'auto' theme against the OS preference into a concrete theme.
export function resolveTheme(theme: ThemePref, prefersDark: boolean): 'dark' | 'light' {
  if (theme === 'auto') return prefersDark ? 'dark' : 'light'
  return theme
}

// Applies appearance to an element by setting the data-attributes and CSS
// variables the stylesheet keys on. Used for the document root in the running
// app and for the onboarding preview container, which scopes the same look to
// a subtree. `prefersDark` resolves 'auto'.
export function applyAppearance(
  el: HTMLElement,
  appearance: Appearance,
  prefersDark: boolean
): void {
  el.setAttribute('data-theme', resolveTheme(appearance.theme, prefersDark))
  el.setAttribute('data-bg', appearance.background)
  el.style.setProperty('--font-scale', String(appearance.fontScale))
  if (appearance.accent) {
    el.style.setProperty('--accent', appearance.accent)
    el.style.setProperty('--on-accent', onAccent(appearance.accent))
  } else {
    el.style.removeProperty('--accent')
    el.style.removeProperty('--on-accent')
  }
}

// AA-safe text colour for a filled-accent button: white only when the accent
// is dark enough that white text clears 4.5:1, otherwise near-black. Most of
// the palette (the bright accents) needs dark text — white on lime is 2:1.
function onAccent(hex: string): string {
  return relativeLuminance(hex) < 0.18 ? '#ffffff' : '#0d0d0e'
}

function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '')
  if (c.length < 6) return 1
  const ch = (i: number): number => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4)
}
