import { useEffect, useRef, useState } from 'react'
import { NOTES_MAX_LENGTH, normalizeNotes } from '../../../../shared/widgets'

// Quick Notes: one plain-text scratchpad, saved as you type. It is a
// preference (`widgetNotes`), not a task note or a knowledge page — the point
// is somewhere to drop a phone number mid-call without choosing where it
// belongs. Saves are debounced, and flushed when focus leaves the box or the
// widget unmounts, so nothing typed is lost to a quick navigation away.
const SAVE_DELAY_MS = 500

export default function NotesWidget(): React.JSX.Element {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const latest = useRef('')
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)

  function flush(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    if (!dirty.current) return
    dirty.current = false
    window.kaseki.prefs.set({ widgetNotes: latest.current })
  }

  useEffect(() => {
    window.kaseki.prefs.get().then((p) => {
      const stored = normalizeNotes(p.widgetNotes)
      latest.current = stored
      setText(stored)
      setLoaded(true)
    })
    return flush
    // flush only reads refs, so it is safe to capture once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onChange(value: string): void {
    setText(value)
    latest.current = value
    dirty.current = true
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }

  return (
    <textarea
      className="widget-notes"
      aria-label="Quick notes"
      placeholder="Jot something down…"
      value={text}
      maxLength={NOTES_MAX_LENGTH}
      disabled={!loaded}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onBlur={flush}
    />
  )
}
