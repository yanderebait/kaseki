import OrbMark from '../OrbMark'

// Screen 5 — tour intro (Part 13). The configured dashboard is one step away;
// the Orb offers a guided tour. Both choices finish onboarding; the startTour
// choice is passed up to App, which starts the tour once the legal documents
// have been accepted (shared/firstRun.ts).
export default function OnboardTourIntro({
  spaceName,
  onChoice
}: {
  spaceName: string
  onChoice: (startTour: boolean) => void
}): React.JSX.Element {
  return (
    <div className="onboard-screen onboard-narrow onboard-centered">
      <OrbMark className="onboard-orb-large" state="welcome" />
      <h1 className="onboard-title">You’re all set</h1>
      <p className="onboard-sub">
        Here’s your {spaceName} dashboard. Want me to give you a quick tour?
      </p>
      <div className="onboard-actions onboard-actions-stack">
        <button type="button" className="primary" onClick={() => onChoice(true)}>
          Yes, show me around
        </button>
        <button type="button" onClick={() => onChoice(false)}>
          I’ll explore on my own
        </button>
      </div>
    </div>
  )
}
