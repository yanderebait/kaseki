import type { FieldType } from '../../shared/types'

// Human labels for the custom field types, shared by the builder (where
// they are chosen) and the dashboard (where they are displayed).
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  multiline: 'Multi-line text',
  number: 'Number',
  date: 'Date',
  datetime: 'Date & time',
  select: 'Single select',
  multiselect: 'Multi select',
  checkbox: 'Checkbox',
  file: 'File attachment',
  url: 'URL'
}
