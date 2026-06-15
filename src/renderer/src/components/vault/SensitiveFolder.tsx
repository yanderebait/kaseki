import { useCallback, useEffect, useState } from 'react'
import type { VaultFile, VaultStatus } from '../../../../shared/types'
import { useOrb } from '../../orbState'
import { Lock, X } from '../../icons'
import VaultSetup from './VaultSetup'
import VaultUnlock from './VaultUnlock'
import VaultBrowser from './VaultBrowser'
import VaultViewer from './VaultViewer'

// The sensitive folder overlay (Part 11): a full-screen surface that shows
// setup (no vault yet), the passcode prompt (locked), or the file browser
// (unlocked), driven by the vault's status. Cmd+L locks immediately.
export default function SensitiveFolder({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [viewing, setViewing] = useState<VaultFile | null>(null)
  const { flash } = useOrb()

  const refresh = useCallback(() => window.kaseki.vault.status().then(setStatus), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const onUnlocked = useCallback(() => {
    flash('unlocked')
    refresh()
  }, [flash, refresh])

  const lock = useCallback(() => {
    setViewing(null)
    flash('locked')
    window.kaseki.vault.lock().then(refresh)
  }, [flash, refresh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        lock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lock])

  return (
    <div className="vault">
      <div className="vault-topbar">
        <Lock size={18} />
        <span className="vault-title">Sensitive folder</span>
        <span className="vault-spacer" />
        {status === 'unlocked' && (
          <button
            type="button"
            className="icon-button"
            aria-label="Lock now"
            title="Lock now (Cmd+L)"
            onClick={lock}
          >
            <Lock size={18} />
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="Close sensitive folder"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="vault-body">
        {status === 'absent' && <VaultSetup onReady={onUnlocked} />}
        {status === 'locked' && <VaultUnlock onUnlocked={onUnlocked} />}
        {status === 'unlocked' && <VaultBrowser onView={setViewing} />}
      </div>

      {viewing && status === 'unlocked' && (
        <VaultViewer file={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
