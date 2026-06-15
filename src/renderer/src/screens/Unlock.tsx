import { useState } from 'react'

export default function UnlockScreen({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await window.kaseki.auth.unlock(password)
    if (result.ok) {
      onDone()
    } else {
      setError(result.error ?? 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <main className="centered">
      <form className="auth-card" onSubmit={submit}>
        <h1>Kaseki</h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </main>
  )
}
