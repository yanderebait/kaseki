import { getDb } from './connection'
import type { ActivityEntry } from '../../shared/types'

// Reads the activity_log (Appendix C), resolving each entry's context at read
// time — the task's title, space, and accent — so the home feed can say what
// happened to what and route a click to it. v0.1.0 returned bare actions
// ("created · 2m ago") with nothing to identify the item. Entries whose task
// has since been deleted no longer occur for new deletions (deleteTask clears
// its log rows); any pre-0.2.0 orphans surface with a null title and the feed
// labels them deleted.
export function listActivity(limit = 12): ActivityEntry[] {
  return getDb()
    .prepare(
      `SELECT
         a.id,
         a.item_type AS itemType,
         a.item_id AS itemId,
         a.action,
         a.created_at AS createdAt,
         t.title AS title,
         t.space_id AS spaceId,
         s.name AS spaceName,
         s.accent_color AS accent
       FROM activity_log a
       LEFT JOIN tasks t ON a.item_type = 'task' AND t.id = a.item_id
       LEFT JOIN spaces s ON s.id = t.space_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?`
    )
    .all(limit) as ActivityEntry[]
}
