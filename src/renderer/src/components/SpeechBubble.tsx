import OrbMark from './OrbMark'
import type { OrbState } from '../orbState'

// The Orb's speech bubble (Part 12). A small panel with the Orb's face and a
// short message, optionally a header meta slot (e.g. a tour step counter) and
// an actions row. Positioned by the caller via `style` — anchored to a tour
// target, or adjacent to the live Orb for ambient bubbles. Extracted from the
// Phase 8 tour so the tour and the ambient empty-state/tip bubbles share one
// primitive.
export default function SpeechBubble({
  style,
  meta,
  title,
  body,
  actions,
  orbState = 'idle',
  onClick
}: {
  style?: React.CSSProperties
  meta?: React.ReactNode
  title?: string
  body: React.ReactNode
  actions?: React.ReactNode
  orbState?: OrbState
  onClick?: () => void
}): React.JSX.Element {
  return (
    <div className={`speech-bubble${onClick ? ' speech-bubble-tappable' : ''}`} style={style} onClick={onClick}>
      <div className="speech-bubble-head">
        <OrbMark className="speech-bubble-orb" state={orbState} />
        {meta != null && <span className="speech-bubble-meta">{meta}</span>}
      </div>
      {title && <h3 className="speech-bubble-title">{title}</h3>}
      <p className="speech-bubble-body">{body}</p>
      {actions && <div className="speech-bubble-actions">{actions}</div>}
    </div>
  )
}
