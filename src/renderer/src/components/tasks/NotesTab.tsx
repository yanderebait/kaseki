import type { KnowledgeContent } from '../../../../shared/types'
import KnowledgeEditor from '../knowledge/KnowledgeEditor'

// The Notes tab (Part 8): the task's long-form note in the shared Tiptap editor
// (same one the knowledge area uses). Saving is automatic on a debounce, which
// also gives the Orb its "saved" check.
//
// Two guards against note bleed (the v0.1.0 corruption bug):
//   - key={taskId}: the slideout survives task switches (opening a blocker
//     from the Dependencies tab swaps taskId in place), and Tiptap only reads
//     its content option at initialisation — an unkeyed editor kept showing
//     the previous task's note and autosaving it into the new task.
//   - the save callback writes to the id the *save* carries, not the id this
//     render closed over, so a pending debounce from the old task can never
//     land on the new one.
export default function NotesTab({
  taskId,
  note
}: {
  taskId: number
  note: KnowledgeContent | null
}): React.JSX.Element {
  return (
    <div className="notes-tab">
      <KnowledgeEditor
        key={taskId}
        pageId={taskId}
        initialContent={note}
        onSave={(id, content) => window.kaseki.tasks.saveNote(id, content)}
      />
    </div>
  )
}
