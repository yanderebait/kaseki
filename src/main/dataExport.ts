import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import { getDb } from './db/connection'
import { toCsv } from '../shared/csv'
import { log } from './logger'

// "Export all tasks" (Settings → Backup and export, v0.3.0). A backup is an
// encrypted copy only Kaseki can read; this is the opposite — a plain CSV of
// every task in every space, readable by anything, so the data is never
// trapped in the app. Archived tasks and archived spaces are included and
// marked, because an export that silently drops things isn't one.

interface ExportRow {
  space: string
  spaceArchived: number
  title: string
  description: string | null
  status: string | null
  priority: string | null
  dueDate: string | null
  pinned: number
  archived: number
  estimated: number | null
  tracked: number
  tags: string | null
  createdAt: string
  completedAt: string | null
}

export const TASK_EXPORT_HEADER = [
  'Space',
  'Title',
  'Description',
  'Status',
  'Priority',
  'Due date',
  'Tags',
  'Pinned',
  'Archived',
  'Space archived',
  'Estimated (min)',
  'Tracked (min)',
  'Created',
  'Completed'
]

export function buildTasksCsv(): string {
  const rows = getDb()
    .prepare(
      `SELECT s.name AS space, s.archived AS spaceArchived, t.title, t.description, t.status,
        t.priority, t.due_date AS dueDate, t.pinned, t.archived,
        t.estimated_time AS estimated,
        (SELECT coalesce(sum(e.duration), 0) FROM time_entries e WHERE e.task_id = t.id) AS tracked,
        (SELECT group_concat(g.name, '; ') FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
          WHERE tt.task_id = t.id) AS tags,
        t.created_at AS createdAt, t.completed_at AS completedAt
       FROM tasks t JOIN spaces s ON s.id = t.space_id
       ORDER BY s.position, s.id, t.archived, t.id`
    )
    .all() as ExportRow[]
  const yesNo = (n: number): string => (n ? 'yes' : 'no')
  return toCsv([
    TASK_EXPORT_HEADER,
    ...rows.map((r) => [
      r.space,
      r.title,
      r.description,
      r.status,
      r.priority,
      r.dueDate,
      r.tags,
      yesNo(r.pinned),
      yesNo(r.archived),
      yesNo(r.spaceArchived),
      r.estimated,
      r.tracked,
      r.createdAt,
      r.completedAt
    ])
  ])
}

export async function exportTasksCsv(): Promise<{ ok: boolean; error?: string }> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.SaveDialogOptions = {
    defaultPath: 'kaseki-tasks.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { ok: false }
  try {
    writeFileSync(result.filePath, buildTasksCsv())
  } catch (error) {
    log.error('Task export write failed', error)
    return { ok: false, error: 'The file could not be written.' }
  }
  return { ok: true }
}
