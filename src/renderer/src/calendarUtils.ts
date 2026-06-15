export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const pad = (n: number): string => String(n).padStart(2, '0')

// A local-date key (YYYY-MM-DD) for bucketing UTC-stored occurrences by the
// day they fall on in the user's timezone.
export function localKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function fmtDayLabel(key: string): string {
  const today = localKey(new Date())
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (key === today) return 'Today'
  if (key === localKey(tomorrow)) return 'Tomorrow'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
}
