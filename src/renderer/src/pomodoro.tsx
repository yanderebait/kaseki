import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useOrb } from './orbState'

// The pomodoro timer (Part 7): a 25-minute work session linked to a task. When
// the session ends — naturally or stopped early — the time is logged as a
// pomodoro time entry. The session lives here, above the views, so it survives
// navigating between spaces and closing the task slide-out; the Orb wears its
// working face while a session actively runs.
const DEFAULT_MINUTES = 25

export interface PomodoroSession {
  taskId: number
  taskTitle: string
  startedAt: string // ISO of the session start; the logged entry's startAt
  plannedSec: number // total planned seconds, grows with extend()
  accumulatedSec: number // seconds banked before the current running segment
  runningSince: number | null // epoch ms the current segment began; null = paused
}

interface PomodoroApi {
  session: PomodoroSession | null
  running: boolean
  remainingSec: number
  start: (taskId: number, taskTitle: string) => void
  pause: () => void
  resume: () => void
  extend: (minutes: number) => void
  stop: () => void
  // Bumped whenever a session logs a time entry, naming the task it logged to,
  // so an open Time tab can refresh itself.
  loggedAt: number
  lastLoggedTaskId: number | null
}

const PomodoroContext = createContext<PomodoroApi | null>(null)

// Seconds elapsed in the session so far, counting the live running segment.
function elapsedOf(s: PomodoroSession): number {
  return s.accumulatedSec + (s.runningSince !== null ? (Date.now() - s.runningSince) / 1000 : 0)
}

export function PomodoroProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [session, setSession] = useState<PomodoroSession | null>(null)
  const [tick, setTick] = useState(0)
  const [loggedAt, setLoggedAt] = useState(0)
  const [lastLoggedTaskId, setLastLoggedTaskId] = useState<number | null>(null)
  const { rest, flash } = useOrb()

  // Tick once a second while running, to drive the countdown and the
  // completion check below.
  useEffect(() => {
    if (!session || session.runningSince === null) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [session])

  // The Orb works while a session actively runs, and rests when it pauses or
  // ends.
  useEffect(() => {
    if (session && session.runningSince !== null) rest('working')
    else rest('idle')
  }, [session, rest])

  // Log a finished (or stopped) session as a pomodoro time entry. Sub-minute
  // sessions are dropped rather than logged as a 0-minute entry.
  const logSession = useCallback(
    (s: PomodoroSession, seconds: number): void => {
      const duration = Math.round(seconds / 60)
      if (duration < 1) return
      window.kaseki.tasks
        .addTime({
          taskId: s.taskId,
          startAt: s.startedAt,
          endAt: new Date().toISOString(),
          duration,
          isPomodoro: true
        })
        .then(() => {
          setLastLoggedTaskId(s.taskId)
          setLoggedAt((n) => n + 1)
        })
      flash('saved')
    },
    [flash]
  )

  // Auto-complete when the planned time is reached.
  useEffect(() => {
    if (!session || session.runningSince === null) return
    if (elapsedOf(session) >= session.plannedSec) {
      logSession(session, session.plannedSec)
      setSession(null)
    }
  }, [tick, session, logSession])

  const start = useCallback(
    (taskId: number, taskTitle: string): void => {
      if (session) return // one session at a time
      setSession({
        taskId,
        taskTitle,
        startedAt: new Date().toISOString(),
        plannedSec: DEFAULT_MINUTES * 60,
        accumulatedSec: 0,
        runningSince: Date.now()
      })
    },
    [session]
  )

  const pause = useCallback((): void => {
    if (session && session.runningSince !== null) {
      setSession({ ...session, accumulatedSec: elapsedOf(session), runningSince: null })
    }
  }, [session])

  const resume = useCallback((): void => {
    if (session && session.runningSince === null) {
      setSession({ ...session, runningSince: Date.now() })
    }
  }, [session])

  const extend = useCallback(
    (minutes: number): void => {
      if (session) setSession({ ...session, plannedSec: session.plannedSec + minutes * 60 })
    },
    [session]
  )

  const stop = useCallback((): void => {
    if (session) logSession(session, elapsedOf(session))
    setSession(null)
  }, [session, logSession])

  const running = session !== null && session.runningSince !== null
  const remainingSec = session ? Math.max(0, Math.round(session.plannedSec - elapsedOf(session))) : 0

  return (
    <PomodoroContext.Provider
      value={{ session, running, remainingSec, start, pause, resume, extend, stop, loggedAt, lastLoggedTaskId }}
    >
      {children}
    </PomodoroContext.Provider>
  )
}

export function usePomodoro(): PomodoroApi {
  const ctx = useContext(PomodoroContext)
  if (!ctx) throw new Error('usePomodoro must be used within a PomodoroProvider')
  return ctx
}
