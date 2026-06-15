import type { KnowledgeContent } from '../../../../shared/types'
import KnowledgeEditor from '../knowledge/KnowledgeEditor'

// The Notes tab (Part 8): the task's long-form note in the shared Tiptap editor
// (same one the knowledge area uses). Saving is automatic on a debounce, which
// also gives the Orb its "saved" check.
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
        pageId={taskId}
        initialContent={note}
        onSave={(content) => window.kaseki.tasks.saveNote(taskId, content)}
      />
    </div>
  )
}
