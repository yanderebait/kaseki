import { useState } from 'react'
import { Lock } from '../../icons'

// The locked state (Part 11): a passcode prompt, with a fallback path to
// reset the passcode using the 24-word recovery phrase.
export default function VaultUnlock({ onUnlocked }: { onUnlocked: () => void }): React.JSX.Element {
  const [mode, setMode] = useState<'unlock' | 'reset'>('unlock')
  const [passcode, setPasscode] = useState('')
  const [phrase, setPhrase] = useState('')
  const [newPass, setNewPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function unlock(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    try {
      if (await window.kaseki.vault.unlock(passcode)) onUnlocked()
      else setError('Wrong passcode.')
    } finally {
      setBusy(false)
    }
  }

  async function reset(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    try {
      if (await window.kaseki.vault.resetWithRecovery(phrase, newPass)) {
        await window.kaseki.vault.unlock(newPass)
        onUnlocked()
      } else {
        setError('That recovery phrase didn’t match.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'reset') {
    return (
      <form className="vault-pane" onSubmit={reset}>
        <Lock size={40} />
        <h2 className="vault-heading">Reset with your recovery phrase</h2>
        <p className="vault-note">
          Enter your 24-word recovery phrase and choose a new passcode. Your files are preserved.
        </p>
        <textarea
          className="vault-phrase"
          placeholder="word1 word2 word3 …"
          rows={3}
          autoFocus
          value={phrase}
          onChange={(e) => {
            setPhrase(e.target.value)
            setError('')
          }}
        />
        <input
          type="password"
          className="vault-input"
          placeholder="New passcode"
          value={newPass}
          onChange={(e) => {
            setNewPass(e.target.value)
            setError('')
          }}
        />
        {error && <p className="vault-error">{error}</p>}
        <div className="vault-actions">
          <button
            type="button"
            onClick={() => {
              setMode('unlock')
              setError('')
            }}
          >
            Back
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !phrase.trim() || newPass.length === 0}
          >
            Reset passcode
          </button>
        </div>
      </form>
    )
  }

  return (
    <form className="vault-pane" onSubmit={unlock}>
      <Lock size={40} />
      <h2 className="vault-heading">Sensitive folder</h2>
      <p className="vault-note">Enter your passcode to unlock.</p>
      <input
        type="password"
        className="vault-input"
        placeholder="Passcode"
        autoFocus
        value={passcode}
        onChange={(e) => {
          setPasscode(e.target.value)
          setError('')
        }}
      />
      {error && <p className="vault-error">{error}</p>}
      <button type="submit" className="primary" disabled={busy || passcode.length === 0}>
        Unlock
      </button>
      <button
        type="button"
        className="vault-link"
        onClick={() => {
          setMode('reset')
          setError('')
        }}
      >
        Forgot passcode? Reset with recovery phrase
      </button>
    </form>
  )
}
