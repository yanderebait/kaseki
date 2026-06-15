import type { BillingMode, SpaceBilling, TaskDetail, TaskPatch } from '../../../../shared/types'
import { BILLING_LABELS, RATE_LABELS, computeAmount, resolveBilling } from '../../../../shared/billing'
import { fmtDuration, fmtMoney } from '../../format'

// The per-task billing section (Part 7) inside the Details tab. A task inherits
// its space's default pattern unless it overrides the mode; the rate falls back
// to the space rate until the task sets its own. The billable amount is derived
// from the effective billing and the tracked time.
export default function TaskBillingFields({
  detail,
  spaceBilling,
  currency,
  onPatch
}: {
  detail: TaskDetail
  spaceBilling: SpaceBilling
  currency: string
  onPatch: (p: TaskPatch) => void
}): React.JSX.Element {
  const resolved = resolveBilling(detail.billingMode, detail.billingRate, spaceBilling.mode, spaceBilling.rate)
  const amount = computeAmount(resolved.mode, resolved.rate, detail.billingUnits, detail.timeTracked)

  function changeMode(value: string): void {
    if (value === '') {
      // Back to full inherit: drop the task's mode, rate, and units.
      onPatch({ billingMode: null, billingRate: null, billingUnits: null })
    } else if (value === 'none') {
      onPatch({ billingMode: 'none', billingRate: null, billingUnits: null })
    } else {
      onPatch({ billingMode: value as BillingMode })
    }
  }

  return (
    <div className="task-billing">
      <span className="task-details-label">Billing</span>
      <div className="task-billing-controls">
        <select value={detail.billingMode ?? ''} onChange={(e) => changeMode(e.target.value)}>
          <option value="">Inherit — {BILLING_LABELS[spaceBilling.mode]}</option>
          {(['none', 'time', 'job', 'unit'] as BillingMode[]).map((m) => (
            <option key={m} value={m}>
              {BILLING_LABELS[m]}
            </option>
          ))}
        </select>

        {resolved.mode !== 'none' && (
          <label className="task-billing-field">
            <span>{RATE_LABELS[resolved.mode]}</span>
            <span className="task-billing-rate">
              <span className="rate-symbol">{currency}</span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder={spaceBilling.rate !== null ? String(spaceBilling.rate) : '0'}
                value={detail.billingRate ?? ''}
                onChange={(e) =>
                  onPatch({ billingRate: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </span>
          </label>
        )}

        {resolved.mode === 'unit' && (
          <label className="task-billing-field">
            <span>Units</span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={detail.billingUnits ?? ''}
              onChange={(e) =>
                onPatch({ billingUnits: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
        )}
      </div>

      {amount !== null && (
        <span className="task-billing-amount">
          Billable: {fmtMoney(amount, currency)}
          {resolved.mode === 'time' && ` · ${fmtDuration(detail.timeTracked)} tracked`}
        </span>
      )}
    </div>
  )
}
