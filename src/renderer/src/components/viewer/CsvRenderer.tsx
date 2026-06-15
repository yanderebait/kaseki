import { useState } from 'react'
import { useFileText } from './viewerUtils'

// Minimal RFC-4180-ish parser: handles quoted fields, escaped quotes, and
// commas/newlines inside quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export default function CsvRenderer({
  id,
  vault = false
}: {
  id: number
  vault?: boolean
}): React.JSX.Element {
  const text = useFileText(id, vault)
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)

  if (text === null) return <div className="viewer-loading">Loading…</div>

  const rows = parseCsv(text).filter((r) => r.length > 1 || (r[0] ?? '').length > 0)
  if (rows.length === 0) return <div className="viewer-loading">Empty file.</div>

  const header = rows[0]
  let body = rows.slice(1)
  if (sort) {
    body = [...body].sort(
      (a, b) =>
        (a[sort.col] ?? '').localeCompare(b[sort.col] ?? '', undefined, { numeric: true }) * sort.dir
    )
  }

  function toggleSort(col: number): void {
    setSort((s) => (s && s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: 1 }))
  }

  return (
    <div className="viewer-csv-wrap">
      <table className="viewer-csv">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} onClick={() => toggleSort(i)}>
                {h}
                {sort?.col === i ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>
              {header.map((_, ci) => (
                <td key={ci}>{r[ci] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
