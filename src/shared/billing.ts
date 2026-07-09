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

// The billable amount attributable to a date window [from, to) — the basis
// for the report's "billable this month" summary.
//
// Time-based work accrues with the entries, so the windowed minutes (already
// filtered by the report query) price as usual. Fixed-price and per-unit
// amounts are task-level, not window-level: the full amount counts exactly
// once, in the month the task was marked Done. v0.1.0 counted a fixed price
// again in *every* month that happened to contain a logged time entry — a
// £5,000 fixed-fee matter with time in June and July showed £5,000 in both
// months' summaries.
//
// With no window (from and to null — the all-time view) job/unit amounts
// count unconditionally, completed or not: a fixed-fee matter in progress is
// still work with a known price.
export function computeWindowAmount(
  mode: BillingMode,
  rate: number | null,
  units: number | null,
  minutes: number,
  completedAt: string | null,
  from: string | null,
  to: string | null
): number | null {
  if (mode === 'time' || mode === 'none') return computeAmount(mode, rate, units, minutes)
  if (from === null && to === null) return computeAmount(mode, rate, units, minutes)
  if (completedAt === null) return null
  if (from !== null && completedAt < from) return null
  if (to !== null && completedAt >= to) return null
  return computeAmount(mode, rate, units, minutes)
}
