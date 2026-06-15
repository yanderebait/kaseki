import { useEffect, useState } from 'react'
import { useOrb, type OrbState } from '../orbState'

// Discrete Orb events worth announcing to a screen reader. Continuous/ambient
// states (idle, working, searching, tap, drag…) are intentionally silent.
const STATE_LABELS: Partial<Record<OrbState, string>> = {
  locked: 'Sensitive folder locked',
  unlocked: 'Sensitive folder unlocked',
  error: 'Something went wrong',
  'task-done': 'Task completed'
}

// A single persistent live region for the Orb's feedback (Part 12 / 11b). The
// Orb's speech bubble can mount and auto-dismiss before a screen reader reads
// it, so the spoken text and the discrete state events are mirrored here, in a
// region that's always in the DOM, so changes are announced reliably.
export default function OrbAnnouncer(): React.JSX.Element {
  const { state, speech } = useOrb()
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (speech?.body) setMessage(speech.body)
  }, [speech])

  useEffect(() => {
    const label = STATE_LABELS[state]
    if (label) setMessage(label)
  }, [state])

  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  )
}
