// Pure ordering rules for what may cover the app shell once onboarding is over:
// the legal-acceptance modal, the guided tour, and the Orb's one-time settings
// tip. The legal modal always comes first and is dealt with alone; the tour and
// the tip wait until the current legal text has been accepted.
//
// The acceptance check is asynchronous, so there is a moment after onboarding
// when the answer is not known yet. That moment is 'checking', and it blocks
// the tour exactly like 'required' does — through 0.3.0 the gate defaulted to
// "not needed" while the check was in flight, so the tour opened at the same
// time as the legal modal on every fresh install.

export type LegalGate = 'checking' | 'required' | 'accepted'

/** Maps the result of `legal.status()` (or no result yet) to a gate state. */
export function legalGate(status: { accepted: boolean } | null | undefined): LegalGate {
  if (!status) return 'checking'
  return status.accepted ? 'accepted' : 'required'
}

export interface FirstRunInput {
  /** True while the onboarding flow is on screen. */
  onboarding: boolean
  legal: LegalGate
  /** The user asked for the tour at the end of onboarding. */
  tourRequested: boolean
  /** Onboarding finished in this session (the settings tip is for them). */
  justOnboarded: boolean
}

export interface FirstRunOverlays {
  legalModal: boolean
  startTour: boolean
  showTip: boolean
}

/** Decides which first-run overlays may be shown right now. */
export function firstRunOverlays(input: FirstRunInput): FirstRunOverlays {
  const settled = !input.onboarding && input.legal === 'accepted'
  return {
    legalModal: !input.onboarding && input.legal === 'required',
    startTour: settled && input.tourRequested,
    showTip: settled && input.justOnboarded
  }
}

/** The tour (however it was started) only renders once legal is settled. */
export function tourVisible(tourOpen: boolean, legal: LegalGate): boolean {
  return tourOpen && legal === 'accepted'
}
