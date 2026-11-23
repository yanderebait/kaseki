import { useCallback, useEffect, useState } from 'react'
import UnlockScreen from './screens/Unlock'
import AppShell from './AppShell'
import Onboarding from './components/onboarding/Onboarding'
import LegalModal from './components/legal/LegalModal'
import { ThemeProvider } from './theme'
import { OrbProvider } from './orbState'
import { firstRunOverlays, legalGate, type LegalGate } from '../../shared/firstRun'

type Phase = 'loading' | 'locked' | 'onboarding' | 'ready'

// First-run state machine (Part 13 / Phase 8). A brand-new install has no
// database yet (auth 'setup'): onboarding runs and creates the account in its
// first screen. A returning user unlocks first, then onboarding runs only if it
// was never completed (the onboardedAt flag, backfilled for pre-onboarding
// databases by migration 005). Once past onboarding the app shell takes over,
// opening on the just-created space's dashboard when onboarding produced one.
export default function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [needsAccount, setNeedsAccount] = useState(false)
  const [initialSpaceId, setInitialSpaceId] = useState<number | null>(null)
  const [pendingTour, setPendingTour] = useState(false)
  const [justOnboarded, setJustOnboarded] = useState(false)
  // 'checking' until legal.status() answers; it blocks the tour and the tip just
  // like 'required' does, so nothing can open on top of the legal modal.
  const [legal, setLegal] = useState<LegalGate>('checking')

  const resolveOnboarding = useCallback(async () => {
    const { needed } = await window.kaseki.onboarding.status()
    setNeedsAccount(false)
    setPhase(needed ? 'onboarding' : 'ready')
  }, [])

  useEffect(() => {
    window.kaseki.auth.status().then((status) => {
      if (status === 'setup') {
        setNeedsAccount(true)
        setPhase('onboarding')
      } else if (status === 'locked') {
        setPhase('locked')
      } else {
        resolveOnboarding()
      }
    })
  }, [resolveOnboarding])

  // Forward uncaught renderer errors to the main process, which reports them
  // only if the user has opted into crash reporting (Part 14 #12). Always
  // forwarding keeps the gate (and the DSN) in one place, the main process.
  useEffect(() => {
    const onError = (e: ErrorEvent): void => {
      window.kaseki.crash.report({ name: e.error?.name, message: e.message, stack: e.error?.stack })
    }
    const onRejection = (e: PromiseRejectionEvent): void => {
      const r = e.reason as { name?: string; message?: string; stack?: string } | undefined
      window.kaseki.crash.report({ name: r?.name, message: String(r?.message ?? r), stack: r?.stack })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  // Once past onboarding, gate on legal acceptance: the documents must be
  // accepted before the dashboard is usable (Part 13), for both fresh
  // completers and any returning user who has not accepted the current version.
  // The tour and the settings tip wait for acceptance (shared/firstRun.ts).
  useEffect(() => {
    if (phase === 'ready') {
      window.kaseki.legal.status().then((s) => setLegal(legalGate(s)))
    }
  }, [phase])

  const overlays = firstRunOverlays({
    onboarding: phase !== 'ready',
    legal,
    tourRequested: pendingTour,
    justOnboarded
  })

  if (phase === 'loading') return <main className="centered" />
  if (phase === 'locked') return <UnlockScreen onDone={resolveOnboarding} />

  return (
    <ThemeProvider>
      <OrbProvider>
        {phase === 'onboarding' ? (
          <Onboarding
            needsAccount={needsAccount}
            onComplete={(spaceId, startTour) => {
              setInitialSpaceId(spaceId)
              setPendingTour(startTour)
              setJustOnboarded(true)
              setPhase('ready')
            }}
          />
        ) : (
          <>
            <a href="#main" className="skip-link">
              Skip to main content
            </a>
            <AppShell
              initialView={
                initialSpaceId !== null
                  ? { name: 'dashboard', spaceId: initialSpaceId }
                  : { name: 'home' }
              }
              legal={legal}
              startTour={overlays.startTour}
              showTip={overlays.showTip}
            />
            {overlays.legalModal && (
              <LegalModal
                mode="accept"
                onAccept={async () => {
                  await window.kaseki.legal.accept()
                  setLegal('accepted')
                }}
              />
            )}
          </>
        )}
      </OrbProvider>
    </ThemeProvider>
  )
}
