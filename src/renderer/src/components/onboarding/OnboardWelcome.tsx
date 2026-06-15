import { useState } from 'react'
import OrbMark from '../OrbMark'

// Screen 1 — welcome + name (Part 13). The master password is folded in here:
// it is the SQLCipher database key, so it must exist before anything can be
// stored. This is the same account-creation call as the old setup screen
// (auth.setup → createDatabase), only restyled as the first onboarding step —
// the login/encryption semantics are unchanged.
export default function OnboardWelcome({
  onDone
}: {
  onDone: (name: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (password !== confirm) {
      setError('Those passwords don’t match.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await window.kaseki.auth.setup(name.trim(), password)
    if (result.ok) {
      onDone(name.trim())
    } else {
      setError(result.error ?? 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <div className="onboard-screen onboard-narrow">
      <OrbMark className="onboard-orb-corner" state="welcome" />
      <div className="onboard-logo">Kaseki</div>
      <form className="onboard-card" onSubmit={submit}>
        <h1 className="onboard-title">What should I call you?</h1>
        <input
          type="text"
          placeholder="Your name or nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <p className="hint onboard-hint">
          Now choose a password. It encrypts everything Kaseki stores on this machine — if you lose
          it, your data can’t be recovered.
        </p>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button
          type="submit"
          className="primary"
          disabled={busy || name.trim().length === 0 || password.length === 0}
        >
          {busy ? 'Setting up…' : 'Next'}
        </button>
      </form>
    </div>
  )
}
