import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, type Content } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import type { KnowledgeContent } from '../../../../shared/types'
import { useOrb } from '../../orbState'
import EditorToolbar from './EditorToolbar'

const EMPTY_DOC: Content = { type: 'doc', content: [{ type: 'paragraph' }] }

// The Tiptap rich-text editor for a single page (Part 10). StarterKit covers
// the core marks/blocks (headings, bold/italic/underline/strike, lists, code
// blocks, blockquote, hr, links); TaskList adds checklists. The parent keys
// this component by page id, so each page gets a fresh editor seeded with its
// own content — no imperative setContent juggling. Edits autosave on a short
// debounce, and a pending save is flushed when the page changes or unmounts.
export default function KnowledgeEditor({
  initialContent,
  onSave
}: {
  pageId: number
  initialContent: KnowledgeContent | null
  onSave: (content: KnowledgeContent) => void
}): React.JSX.Element {
  const { flash } = useOrb()
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true })
    ],
    content: (initialContent as Content) ?? EMPTY_DOC,
    onUpdate: ({ editor }) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        saveRef.current(editor.getJSON() as KnowledgeContent)
        flash('saved')
      }, 600)
    }
  })

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        if (editor && !editor.isDestroyed) saveRef.current(editor.getJSON() as KnowledgeContent)
      }
    }
  }, [editor])

  if (!editor) return <div className="knowledge-editor" />

  return (
    <div className="knowledge-editor">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} className="knowledge-editor-content" />
    </div>
  )
}
