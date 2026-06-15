import { usePomodoro } from '../pomodoro'
import { Clock, Pause, Play, Square } from '../icons'

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// The running-session pill (Part 7): shows the linked task and the countdown
// with pause/resume, +5 minutes, and end-session controls. Renders nothing
// when no session is active.
export default function PomodoroPill(): React.JSX.Element | null {
  const { session, running, remainingSec, pause, resume, extend, stop } = usePomodoro()
  if (!session) return null
  return (
    <div className={`pomodoro-pill${running ? ' running' : ' paused'}`}>
      <button
        type="button"
        className="pomodoro-toggle"
        aria-label={running ? 'Pause session' : 'Resume session'}
        onClick={running ? pause : resume}
      >
        {running ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <span className="pomodoro-time">
        <Clock size={13} />
        {mmss(remainingSec)}
      </span>
      <span className="pomodoro-task" title={session.taskTitle}>
        {session.taskTitle}
      </span>
      <button type="button" className="pomodoro-ext" aria-label="Add 5 minutes" onClick={() => extend(5)}>
        +5
      </button>
      <button type="button" className="pomodoro-stop" aria-label="End session" onClick={stop}>
        <Square size={14} />
      </button>
    </div>
  )
}
