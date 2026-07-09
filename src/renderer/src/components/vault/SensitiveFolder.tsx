import { useCallback, useEffect, useState } from 'react'
import type { VaultFile, VaultStatus } from '../../../../shared/types'
import { useOrb } from '../../orbState'
import { Lock, X } from '../../icons'
import VaultSetup from './VaultSetup'
import VaultUnlock from './VaultUnlock'
import VaultBrowser from './VaultBrowser'
import VaultViewer from './VaultViewer'
import { useEscapeLayer } from '../../hooks/useEscapeLayer'

// The sensitive folder overlay (Part 11): a full-screen surface that shows
// setup (no vault yet), the passcode prompt (locked), or the file browser
// (unlocked), driven by the vault's status. Cmd+L locks immediately.
export default function SensitiveFolder({
  onClose,
  initialFileId
}: {
  onClose: () => void
  // A vault search hit deep-links straight to its file once unlocked —
  // 0.1.0 opened the folder and left the user to find the file themselves.
  initialFileId?: number
}): React.JSX.Element {
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [viewing, setViewing] = useState<VaultFile | null>(null)
  const [pendingFileId, setPendingFileId] = useState<number | null>(initialFileId ?? null)
  const { flash } = useOrb()

  useEffect(() => {
    if (status !== 'unlocked' || pendingFileId == null) return
    window.kaseki.vault.get(pendingFileId).then((f) => {
      if (f) setViewing(f)
    })
    setPendingFileId(null)
  }, [status, pendingFileId])

  const refresh = useCallback(() => window.kaseki.vault.status().then(setStatus), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  // Track lock-state changes pushed from the main process — most importantly
  // the inactivity auto-lock, which this surface previously had no way to
  // see: it kept showing the unlocked browser (and any open decrypted
  // document) over a vault that had already locked.
  useEffect(() => {
    return window.kaseki.vault.onChanged((next) => {
      setStatus(next)
      if (next !== 'unlocked') setViewing(null)
    })
  }, [])

  const onUnlocked = useCallback(() => {
    flash('unlocked')
    refresh()
  }, [flash, refresh])

  const lock = useCallback(() => {
    setViewing(null)
    flash('locked')
    window.kaseki.vault.lock().then(refresh)
  }, [flash, refresh])

  useEscapeLayer(true, onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        lock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lock])

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
