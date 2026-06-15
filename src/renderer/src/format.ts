// SQLite CURRENT_TIMESTAMP is UTC and formatted "YYYY-MM-DD HH:MM:SS"
// with no zone marker; normalise to UTC before parsing.
function parseDbTime(iso: string): number {
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`
  return new Date(normalized).getTime()
}

// A compact duration label from minutes, e.g. "2h 40m" / "45m" / "0m".
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// A money amount with the install's currency symbol, e.g. "£300" / "£12.50".
// Whole amounts drop the decimals; fractional ones show two places.
export function fmtMoney(amount: number, symbol = '£'): string {
  const rounded = Math.round(amount * 100) / 100
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
  return `${symbol}${str}`
}

// A short due-date label, e.g. "14 Jul" (or with the year if it's not this one).
export function fmtDueDate(iso: string): string {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === new Date().getFullYear()
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  return d.toLocaleDateString(undefined, opts)
}

export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - parseDbTime(iso)) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(parseDbTime(iso)).toLocaleDateString()
}
