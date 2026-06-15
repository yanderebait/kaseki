import { useEffect, useState } from 'react'
import OnboardWelcome from './OnboardWelcome'
import OnboardProfession from './OnboardProfession'
import OnboardCustomize from './OnboardCustomize'
import OnboardLauncher from './OnboardLauncher'
import OnboardTourIntro from './OnboardTourIntro'

type Step = 'welcome' | 'profession' | 'customize' | 'launcher' | 'tour'

// The five-screen first-run flow (Part 13). Account creation is folded into
// screen 1, so a fresh install (needsAccount) starts there; a user who created
// an account but quit before finishing resumes at the profession step. The
// created space is threaded through customization (preview), launcher setup,
// and the tour intro, then onboarding is marked complete and the app opens on
// that space's dashboard.
export default function Onboarding({
  needsAccount,
  onComplete
}: {
  needsAccount: boolean
  onComplete: (spaceId: number | null, startTour: boolean) => void
}): React.JSX.Element {
  const [step, setStep] = useState<Step>(needsAccount ? 'welcome' : 'profession')
  const [name, setName] = useState('')
  const [space, setSpace] = useState<{ id: number; name: string; accent: string | null } | null>(
    null
  )

  // Resuming users already have a name; load it so later screens can greet them.
  useEffect(() => {
    if (!needsAccount) window.kaseki.user.get().then((u) => setName(u.name))
  }, [needsAccount])

  async function finish(startTour: boolean): Promise<void> {
    await window.kaseki.onboarding.complete()
    onComplete(space?.id ?? null, startTour)
  }

  async function pickedSpace(id: number, spaceName: string): Promise<void> {
    const spaces = await window.kaseki.spaces.list()
    const created = spaces.find((s) => s.id === id)
    setSpace({ id, name: spaceName, accent: created?.accentColor ?? null })
    setStep('customize')
  }

  return (
    <div className="onboard">
      {step === 'welcome' && (
        <OnboardWelcome
          onDone={(nm) => {
            setName(nm)
            setStep('profession')
          }}
        />
      )}
      {step === 'profession' && <OnboardProfession onDone={pickedSpace} />}
      {step === 'customize' && space && (
        <OnboardCustomize
          name={name}
          spaceName={space.name}
          spaceAccent={space.accent}
          onBack={() => setStep('profession')}
          onNext={() => setStep('launcher')}
        />
      )}
      {step === 'launcher' && space && (
        <OnboardLauncher
          spaceId={space.id}
          spaceName={space.name}
          onNext={() => setStep('tour')}
        />
      )}
      {step === 'tour' && space && <OnboardTourIntro spaceName={space.name} onChoice={finish} />}
    </div>
  )
}
