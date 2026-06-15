import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  readAppearance,
  resolveTheme,
  type Appearance,
  type BackgroundPref,
  type ThemePref
} from './appearance'

interface AppearanceApi {
  theme: ThemePref
  /** The concrete theme in effect (resolves 'auto' against the OS). */
  resolvedTheme: 'dark' | 'light'
  accent: string | null
  background: BackgroundPref
  fontScale: number
  setTheme: (t: ThemePref) => void
  setAccent: (hex: string | null) => void
  setBackground: (b: BackgroundPref) => void
  setFontScale: (n: number) => void
  /** Quick dark/light flip (the Orb menu's "Switch theme"). */
  toggle: () => void
}

const noop = (): void => {}
const AppearanceContext = createContext<AppearanceApi>({
  ...DEFAULT_APPEARANCE,
  resolvedTheme: 'dark',
  setTheme: noop,
  setAccent: noop,
  setBackground: noop,
  setFontScale: noop,
  toggle: noop
})

// Applies and persists the full appearance set — theme (incl. OS-auto), accent,
// background style, and font scale (Part 13 / Part 14). Mounted inside the
// unlocked area so the initial prefs read succeeds (prefs need an open
// database). Every change writes one preferences key and re-applies the
// data-attributes / CSS variables on the document root that the stylesheet
// keys on.
export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [prefersDark, setPrefersDark] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setPrefersDark(mq.matches)
    const onChange = (e: MediaQueryListEvent): void => setPrefersDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    window.kaseki.prefs
      .get()
      .then((p) => setAppearance(readAppearance(p)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    applyAppearance(document.documentElement, appearance, prefersDark)
  }, [appearance, prefersDark])

  const api = useMemo<AppearanceApi>(() => {
    const persist = (patch: Partial<Appearance>): void => {
      setAppearance((prev) => ({ ...prev, ...patch }))
      window.kaseki.prefs.set(patch)
    }
    return {
      ...appearance,
      resolvedTheme: resolveTheme(appearance.theme, prefersDark),
      setTheme: (theme) => persist({ theme }),
      setAccent: (accent) => persist({ accent }),
      setBackground: (background) => persist({ background }),
      setFontScale: (fontScale) => persist({ fontScale }),
      toggle: () =>
        persist({ theme: resolveTheme(appearance.theme, prefersDark) === 'dark' ? 'light' : 'dark' })
    }
  }, [appearance, prefersDark])

  return <AppearanceContext.Provider value={api}>{children}</AppearanceContext.Provider>
}

export const useTheme = (): AppearanceApi => useContext(AppearanceContext)
