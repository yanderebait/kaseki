import OrbFace from './OrbFace'
import type { OrbState } from '../orbState'

// A non-interactive Orb in flow (rather than fixed to the corner) and without
// the menu — used in onboarding and inside the tour/speech bubble. The face is
// OrbFace, shared with the live Orb; `state` drives its expression via the same
// data-orb-state attribute the live Orb uses.
export default function OrbMark({
  className = '',
  state = 'idle'
}: {
  className?: string
  state?: OrbState
}): React.JSX.Element {
  return (
    <div className={`orb-mark ${className}`.trim()} data-orb-state={state} aria-hidden="true">
      <OrbFace />
    </div>
  )
}
