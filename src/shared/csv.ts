// One CSV parser for the whole app (v0.2.0). The document viewer had a
// correct RFC-4180 parser while the print pipeline split on raw commas and
// mangled any quoted field containing one — two parsers, one wrong. This is
// the viewer's implementation, shared: handles quoted fields, escaped quotes
// ("") inside them, and embedded newlines; tolerates \r\n; ignores a trailing
// newline.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// The inverse (v0.3.0): one RFC-4180 serializer for main-process exports. A
// field is quoted when it contains a comma, a quote, or a line break; quotes
// inside it are doubled. Rows end with \r\n, as the RFC specifies.
export function csvField(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n'
}
