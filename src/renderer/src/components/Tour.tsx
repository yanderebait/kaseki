import { useLayoutEffect, useState } from 'react'
import SpeechBubble from './SpeechBubble'

interface TourStep {
  selector: string
  title: string
  body: string
}

// The guided dashboard tour (Part 13). Each step points the Orb's narration at
// a real dashboard element via a data-tour anchor (the Orb itself is targeted
// by its class). Triggered after onboarding when the user opts in, and
// re-triggerable from the Orb menu.
const STEPS: TourStep[] = [
  {
    selector: '[data-tour="tasks"]',
    title: 'Your tasks',
    body: 'Everything you’re working on in this space lives here — the full task list arrives in a later update.'
  },
  {
    selector: '[data-tour="launcher"]',
    title: 'Apps and links',
    body: 'Launch the apps and websites you set up, right from the dashboard header.'
  },
  {
    selector: '[data-tour="calendar"]',
    title: 'Calendar',
    body: 'Deadlines and events for this space show up here, and on the home screen’s week strip.'
  },
  {
    selector: '[data-tour="cheatsheet"]',
    title: 'Cheatsheet',
    body: 'Quick reference notes for your profession — section numbers, drug interactions, git commands, whatever you need close at hand.'
  },
  {
    selector: '.orb',
    title: 'The Orb',
    body: 'Tap the Orb anytime for settings, help, and this tour again. Press Cmd+K to search across Kaseki.'
  }
]

const BUBBLE_W = 320
const PAD = 8

export default function Tour({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]

  useLayoutEffect(() => {
    // The target may not be mounted yet (the dashboard loads its data async and
    // the tour can start the moment onboarding finishes), so retry briefly until
    // the anchor appears; fall back to a centered bubble if it never does.
    let timer = 0
    let attempts = 0
    const measure = (): void => {
      const el = document.querySelector(step.selector)
      if (el) setRect(el.getBoundingClientRect())
      else if (attempts++ < 30) timer = window.setTimeout(measure, 100)
      else setRect(null)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      clearTimeout(timer)
    }
  }, [step.selector])

  const last = i === STEPS.length - 1
  const next = (): void => (last ? onClose() : setI(i + 1))

  let bubbleStyle: React.CSSProperties
  let spotStyle: React.CSSProperties | null = null
  if (rect) {
    spotStyle = {
      left: rect.left - PAD,
      top: rect.top - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2
    }
    const left = Math.min(
      Math.max(16, rect.left + rect.width / 2 - BUBBLE_W / 2),
      window.innerWidth - BUBBLE_W - 16
    )
    bubbleStyle =
      rect.top > window.innerHeight / 2
        ? { left, bottom: window.innerHeight - rect.top + 12, width: BUBBLE_W }
        : { left, top: rect.bottom + 12, width: BUBBLE_W }
  } else {
    bubbleStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: BUBBLE_W }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tour">
      {spotStyle ? <div className="tour-spot" style={spotStyle} /> : <div className="tour-dim" />}
      <SpeechBubble
        style={bubbleStyle}
        orbState="tour"
        meta={`${i + 1} / ${STEPS.length}`}
        title={step.title}
        body={step.body}
        actions={
          <>
            <button type="button" className="speech-bubble-skip" onClick={onClose}>
              Skip tour
            </button>
            <button type="button" className="primary" onClick={next}>
              {last ? 'Done' : 'Next'}
            </button>
          </>
        }
      />
    </div>
  )
}
