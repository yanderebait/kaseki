import { useEffect, useState } from 'react'

// The renderer fetches document bytes over the privileged scheme (the main
// process resolves the id to a blob in uploads/, or — for vault files — to
// the in-memory decrypted bytes).
export function fileUrl(id: number, vault = false): string {
  // A fixed host avoids Chromium normalising a numeric host to an IP; the id
  // lives in the path.
  return `kaseki-file://${vault ? 'vault' : 'doc'}/${id}`
}

export function useFileText(id: number, vault = false): string | null {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setText(null)
    fetch(fileUrl(id, vault))
      .then((r) => r.text())
      .then((t) => {
        if (active) setText(t)
      })
      .catch(() => {
        if (active) setText('')
      })
    return () => {
      active = false
    }
  }, [id, vault])
  return text
}

// Translucent fill for highlight overlays from a stored hex colour.
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(255, 214, 0, ${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDbDate(iso: string): string {
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`
  return new Date(normalized).toLocaleString()
}
