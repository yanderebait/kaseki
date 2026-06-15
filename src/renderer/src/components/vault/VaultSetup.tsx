import { useState } from 'react'
import { Shield } from '../../icons'

// First-run setup for the sensitive folder (Part 11): choose a passcode (no
// complexity rules), then write down the one-time 24-word recovery phrase
// before the folder opens.
export default function VaultSetup({ onReady }: { onReady: () => void }): React.JSX.Element {
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [written, setWritten] = useState(false)

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (passcode.length === 0) {
      setError('Choose a passcode.')
      return
    }
    if (passcode !== confirm) {
      setError('The passcodes don’t match.')
      return
    }
    setBusy(true)
    try {
      const result = await window.kaseki.vault.create(passcode)
      setMnemonic(result.mnemonic)
    } catch {
      setError('Could not create the folder.')
    } finally {
      setBusy(false)
    }
  }

  if (mnemonic) {
    const words = mnemonic.split(' ')
    return (
      <div className="vault-pane">
        <Shield size={40} />
        <h2 className="vault-heading">Write down your recovery phrase</h2>
        <p className="vault-note">
          These 24 words are the <strong>only</strong> way back in if you forget your passcode.
          Kaseki never stores them and cannot recover them for you. Write them on paper and keep
          them somewhere safe.
        </p>
        <ol className="vault-mnemonic">
          {words.map((w, i) => (
            <li key={i}>
              <span className="vault-mnemonic-n">{i + 1}</span>
              {w}
            </li>
          ))}
        </ol>
        <label className="vault-checkbox">
          <input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} />
          I’ve written down my recovery phrase.
        </label>
        <button type="button" className="primary" disabled={!written} onClick={onReady}>
          Open the folder
        </button>
      </div>
    )
  }

  return (
    <form className="vault-pane" onSubmit={create}>
      <Shield size={40} />
      <h2 className="vault-heading">Set up your sensitive folder</h2>
      <p className="vault-note">
        Files here are encrypted with a passcode that’s separate from your login. Pick anything you
        like — there are no rules — but if you forget it, only your recovery phrase can get you back
        in.
      </p>
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
      <input
        type="password"
        className="vault-input"
        placeholder="Confirm passcode"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value)
          setError('')
        }}
      />
      {error && <p className="vault-error">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>
        Create folder
      </button>
    </form>
  )
}
