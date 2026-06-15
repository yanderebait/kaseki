import type { TaskFieldValue } from '../../../../shared/types'

// One custom field on a task, rendered with a type-appropriate control (Part 8
// Details tab). Saves on change for pickers/toggles and on blur for free text,
// passing null to clear. The slide-out reloads after each save.
export default function TaskFieldInput({
  field,
  onSave
}: {
  field: TaskFieldValue
  onSave: (value: string | null) => void
}): React.JSX.Element {
  const value = field.value ?? ''
  const key = `${field.fieldId}:${value}`
  const blur = (v: string): void => onSave(v.trim() === '' ? null : v.trim())

  switch (field.type) {
    case 'multiline':
      return (
        <textarea
          key={key}
          className="task-field-input task-field-multiline"
          defaultValue={value}
          onBlur={(e) => blur(e.target.value)}
        />
      )
    case 'number':
      return (
        <input
          key={key}
          type="number"
          className="task-field-input"
          defaultValue={value}
          onBlur={(e) => blur(e.target.value)}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          className="task-field-input"
          value={value}
          onChange={(e) => onSave(e.target.value || null)}
        />
      )
    case 'datetime':
      return (
        <input
          type="datetime-local"
          className="task-field-input"
          value={value}
          onChange={(e) => onSave(e.target.value || null)}
        />
      )
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onSave(e.target.checked ? 'true' : null)}
        />
      )
    case 'select':
      return (
        <select
          className="task-field-input"
          value={value}
          onChange={(e) => onSave(e.target.value || null)}
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'multiselect': {
      const selected = new Set(value ? value.split(',') : [])
      return (
        <div className="task-field-multiselect">
          {field.options?.map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                checked={selected.has(o)}
                onChange={(e) => {
                  if (e.target.checked) selected.add(o)
                  else selected.delete(o)
                  onSave(selected.size ? [...selected].join(',') : null)
                }}
              />
              {o}
            </label>
          ))}
        </div>
      )
    }
    default:
      // text, url, file
      return (
        <input
          key={key}
          type="text"
          className="task-field-input"
          defaultValue={value}
          onBlur={(e) => blur(e.target.value)}
        />
      )
  }
}
