import type { BillingMode } from './types'

// The three billing patterns plus 'none' (Part 7). Order is the order they
// appear in the per-task / per-space selectors.
export const BILLING_MODES: BillingMode[] = ['none', 'time', 'job', 'unit']

export const BILLING_LABELS: Record<BillingMode, string> = {
  none: 'Not billed',
  time: 'Time-based (per hour)',
  job: 'Job-based (fixed price)',
  unit: 'Unit-based (per unit)'
}

// What the rate column means in each mode, for field labels in the UI.
export const RATE_LABELS: Record<BillingMode, string> = {
  none: '',
  time: 'Hourly rate',
  job: 'Fixed price',
  unit: 'Per-unit value'
}

// Resolve a task's effective billing: its own override (a non-null mode) wins,
// otherwise the space default applies, including the rate. A task that sets a
// mode but no rate still falls back to the space's rate.
export function resolveBilling(
  taskMode: BillingMode | null,
  taskRate: number | null,
  spaceMode: BillingMode,
  spaceRate: number | null
): { mode: BillingMode; rate: number | null } {
  if (taskMode === null) return { mode: spaceMode, rate: taskRate ?? spaceRate }
  return { mode: taskMode, rate: taskRate ?? spaceRate }
}

// The billable amount for a task given its effective billing and tracked time.
// Returns null when the task isn't billed or there isn't enough information
// (no rate, or no units for unit-based) — the caller shows a dash, not £0.
export function computeAmount(
  mode: BillingMode,
  rate: number | null,
  units: number | null,
  minutes: number
): number | null {
  if (mode === 'none' || rate === null) return null
  if (mode === 'time') return (rate * minutes) / 60
  if (mode === 'job') return rate
  if (mode === 'unit') return units === null ? null : rate * units
  return null
}
