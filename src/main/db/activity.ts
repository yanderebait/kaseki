import { getDb } from './connection'
import type { ActivityEntry } from '../../shared/types'

// Reads the activity_log (Appendix C). Nothing writes to it yet — that
// arrives with the task/note/file phases — so this returns [] in Phase 1
// and the home-screen feed shows its empty state. Once writes land, the
// feed populates with no renderer change.
export function listActivity(limit = 10): ActivityEntry[] {
  return getDb()
    .prepare(
      `SELECT id, item_type AS itemType, item_id AS itemId, action, created_at AS createdAt
       FROM activity_log
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(limit) as ActivityEntry[]
}
