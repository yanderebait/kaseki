import { useEffect, useState } from 'react'
import { UPDATE_RELEASES_URL, type UpdateStatus } from '../../../shared/updates'

// The update status, kept live: read once on mount, then refreshed by every
// `updates:changed` event (a finished check, the toggle, download progress).
export function useUpdateStatus(): [UpdateStatus | null, (s: UpdateStatus) => void] {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    let live = true
    window.kaseki.updates.status().then((s) => {
      if (live) setStatus(s)
    })
    const off = window.kaseki.updates.onChanged(setStatus)
    return () => {
      live = false
      off()
    }
  }, [])
  return [status, setStatus]
}

function openReleasePage(status: UpdateStatus): void {
  // Opens in the OS browser via the main process's window-open handler.
  window.open(status.releaseUrl ?? UPDATE_RELEASES_URL, '_blank', 'noopener')
}

// The one Update action, shared by the prompt and Settings → Updates:
// "Update now" → progress → "Restart to update" on a build that can install
// itself; otherwise a button that opens the release page.
export function UpdateAction({
  status,
  className
}: {
  status: UpdateStatus
  className: string
}): React.JSX.Element {
  if (status.installMode === 'browser') {
    return (
      <button type="button" className={className} onClick={() => openReleasePage(status)}>
        Open the release page
      </button>
    )
  }
  const { download } = status
  if (download.state === 'downloading') {
    return (
      <span className="update-progress" role="status">
        <progress max={100} value={download.percent} aria-label="Downloading the update" />
        <span>{Math.round(download.percent)}%</span>
      </span>
    )
  }
  if (download.state === 'ready') {
    return (
      <button type="button" className={className} onClick={() => window.kaseki.updates.install()}>
        Restart to update
      </button>
    )
  }
  return (
    <button type="button" className={className} onClick={() => window.kaseki.updates.download()}>
      {download.state === 'error' ? 'Try again' : 'Update now'}
    </button>
  )
}

// "Later" lasts until the next launch: the renderer lives exactly as long as
// the launch, so a module-level flag survives the shell remounting.
let dismissedThisLaunch = false

export function wasUpdatePromptDismissed(): boolean {
  return dismissedThisLaunch
}

// The small, non-blocking "Kaseki x.y.z is available" prompt (v0.3.2). The
// shell decides when it may show (shared/firstRun.ts, updatePromptVisible).
export default function UpdatePrompt({
  status,
  onDismiss
}: {
  status: UpdateStatus
  onDismiss: () => void
}): React.JSX.Element {
  const { download } = status
  let detail: string | null = null
  if (download.state === 'downloading') detail = 'Downloading…'
  else if (download.state === 'ready') detail = 'Downloaded and verified.'
  else if (download.state === 'error') detail = download.error
  return (
    <div className="update-prompt" role="region" aria-label="Update available" aria-live="polite">
      <div className="update-prompt-text">
        <strong>Kaseki {status.latestVersion} is available</strong>
        {detail && <span className="update-prompt-detail">{detail}</span>}
      </div>
      <div className="update-prompt-actions">
        <UpdateAction status={status} className="update-prompt-primary" />
        <button
          type="button"
          className="update-prompt-later"
          onClick={() => {
            dismissedThisLaunch = true
            onDismiss()
          }}
        >
          Later
        </button>
      </div>
    </div>
  )
}
