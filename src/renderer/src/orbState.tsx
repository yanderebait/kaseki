import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// The Orb's animation states (Part 12). Resting states persist until changed;
// flash states show briefly then revert to the current resting state.
export type OrbState =
  | 'idle'
  | 'welcome'
  | 'working'
  | 'task-done'
  | 'file-uploaded'
  | 'saved'
  | 'error'
  | 'confused'
  | 'locked'
  | 'unlocked'
  | 'searching'
  | 'tour'
  | 'loading'
  | 'sleeping'
  | 'tap'
  | 'drag'

export type OrbIntensity = 'subtle' | 'normal' | 'lively'
export interface Pos {
  x: number
  y: number
}

// A short, pre-written line the Orb says in a bubble next to itself (Part 12) —
// empty-state hints and onboarding tips. Non-blocking; auto-dismisses.
export interface OrbSpeech {
  title?: string
  body: string
}
const SPEECH_MS = 6500

export const ORB = 48
export const PAD = 14

// Animation-speed multiplier per intensity (larger = slower); applied as
// --orb-speed on the document root and consumed by orb.css.
const SPEED: Record<OrbIntensity, number> = { subtle: 1.6, normal: 1, lively: 0.62 }

// How long each flash state lingers before reverting to the resting state.
const FLASH_MS: Partial<Record<OrbState, number>> = {
  welcome: 2600,
  'task-done': 1300,
  'file-uploaded': 850,
  saved: 950,
  error: 1600,
  confused: 1300,
  unlocked: 950,
  tap: 380,
  loading: 1200
}
const DEFAULT_FLASH = 1000
const SLEEP_MS = 30 * 60 * 1000

export const clampPos = (p: Pos): Pos => ({
  x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - ORB)),
  y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - ORB))
})

const isPos = (v: unknown): v is Pos =>
  typeof v === 'object' && v !== null && typeof (v as Pos).x === 'number' && typeof (v as Pos).y === 'number'

interface OrbApi {
  state: OrbState
  /** Show a brief expression, then revert to the resting state. */
  flash: (s: OrbState) => void
  /** Set the resting state (idle, locked, sleeping, tour, …). */
  rest: (s: OrbState) => void
  /** Saved position, or null to sit at the default corner. */
  pos: Pos | null
  /** Update the position without persisting (live drag). */
  setPos: (p: Pos | null) => void
  /** Update the position and persist it across sessions. */
  commitPos: (p: Pos | null) => void
  hidden: boolean
  setHidden: (h: boolean) => void
  intensity: OrbIntensity
  setIntensity: (i: OrbIntensity) => void
  /** The current speech bubble, or null. */
  speech: OrbSpeech | null
  /** Show a speech bubble (auto-dismisses), or pass null to clear it. */
  say: (s: OrbSpeech | null) => void
}

const OrbContext = createContext<OrbApi>({
  state: 'idle',
  flash: () => {},
  rest: () => {},
  pos: null,
  setPos: () => {},
  commitPos: () => {},
  hidden: false,
  setHidden: () => {},
  intensity: 'normal',
  setIntensity: () => {},
  speech: null,
  say: () => {}
})

// Owns all of the Orb's state: the current expression and ambient behaviour (a
// welcome on open, idle by default, sleeping after long inactivity that any
// activity wakes, paused animations when the window is unfocused), plus the
// persisted position, hidden flag, and animation intensity — so the Orb and the
// Settings → Orb pane share one source of truth. Expression triggers arrive
// through flash()/rest() from wherever the event happens; states whose features
// don't exist yet are simply never signalled, but the API is ready for them.
export function OrbProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [resting, setResting] = useState<OrbState>('idle')
  const [flashState, setFlashState] = useState<OrbState | null>(null)
  const [pos, setPosState] = useState<Pos | null>(null)
  const [hidden, setHiddenState] = useState(false)
  const [intensity, setIntensityState] = useState<OrbIntensity>('normal')
  const [speech, setSpeech] = useState<OrbSpeech | null>(null)
  const flashTimer = useRef(0)
  const sleepTimer = useRef(0)
  const speechTimer = useRef(0)

  const say = useCallback((s: OrbSpeech | null) => {
    clearTimeout(speechTimer.current)
    setSpeech(s)
    if (s) speechTimer.current = window.setTimeout(() => setSpeech(null), SPEECH_MS)
  }, [])

  const flash = useCallback((s: OrbState) => {
    setFlashState(s)
    clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashState(null), FLASH_MS[s] ?? DEFAULT_FLASH)
  }, [])

  const rest = useCallback((s: OrbState) => setResting(s), [])
  const setPos = useCallback((p: Pos | null) => setPosState(p), [])
  const commitPos = useCallback((p: Pos | null) => {
    setPosState(p)
    window.kaseki.prefs.set({ orbPosition: p })
  }, [])
  const setHidden = useCallback((h: boolean) => {
    setHiddenState(h)
    window.kaseki.prefs.set({ orbHidden: h })
  }, [])
  const setIntensity = useCallback((i: OrbIntensity) => {
    setIntensityState(i)
    window.kaseki.prefs.set({ orbIntensity: i })
  }, [])

  // Load persisted orb preferences once.
  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      if (isPos(p.orbPosition)) setPosState(p.orbPosition)
      if (p.orbHidden === true) setHiddenState(true)
      if (p.orbIntensity === 'subtle' || p.orbIntensity === 'lively') {
        setIntensityState(p.orbIntensity)
      }
      // Before login the database is locked and this read rejects; defaults
      // apply until unlock (same pattern as the theme provider).
    }).catch(() => {})
  }, [])

  // Reflect intensity as the animation-speed multiplier on the document root.
  useEffect(() => {
    document.documentElement.style.setProperty('--orb-speed', String(SPEED[intensity]))
  }, [intensity])

  // Keep a saved position inside the window as it resizes.
  useEffect(() => {
    const onResize = (): void => setPosState((p) => (p ? clampPos(p) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    flash('welcome')
    return () => clearTimeout(flashTimer.current)
  }, [flash])

  useEffect(() => {
    const arm = (): void => {
      clearTimeout(sleepTimer.current)
      sleepTimer.current = window.setTimeout(
        () => setResting((r) => (r === 'idle' ? 'sleeping' : r)),
        SLEEP_MS
      )
    }
    const wake = (): void => {
      setResting((r) => (r === 'sleeping' ? 'idle' : r))
      arm()
    }
    arm()
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    window.addEventListener('mousedown', wake)
    return () => {
      clearTimeout(sleepTimer.current)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('mousedown', wake)
    }
  }, [])

  useEffect(() => {
    const onBlur = (): void => document.documentElement.classList.add('orb-paused')
    const onFocus = (): void => document.documentElement.classList.remove('orb-paused')
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const state = flashState ?? resting
  return (
    <OrbContext.Provider
      value={{
        state,
        flash,
        rest,
        pos,
        setPos,
        commitPos,
        hidden,
        setHidden,
        intensity,
        setIntensity,
        speech,
        say
      }}
    >
      {children}
    </OrbContext.Provider>
  )
}

export const useOrb = (): OrbApi => useContext(OrbContext)
