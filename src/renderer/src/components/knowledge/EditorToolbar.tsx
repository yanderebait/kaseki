import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconLinkOff,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconSeparator,
  IconStrikethrough,
  IconUnderline
} from '@tabler/icons-react'

// The formatting toolbar for the knowledge editor. Buttons use onMouseDown
// preventDefault so clicking them keeps the editor's selection. The editor
// re-renders on every transaction (it owns the useEditor hook), so the
// active states below stay in sync as the cursor moves.
export default function EditorToolbar({ editor }: { editor: Editor }): React.JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const sz = 16

  const btn = (
    key: string,
    label: string,
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    disabled = false
  ): React.JSX.Element => (
    <button
      key={key}
      type="button"
      className={`ke-tool${active ? ' active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  )

  function applyLink(): void {
    const href = linkUrl.trim()
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setLinkOpen(false)
    setLinkUrl('')
  }

  return (
    <div className="ke-toolbar">
      {btn('bold', 'Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <IconBold size={sz} />)}
      {btn('italic', 'Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <IconItalic size={sz} />)}
      {btn('underline', 'Underline', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <IconUnderline size={sz} />)}
      {btn('strike', 'Strikethrough', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <IconStrikethrough size={sz} />)}
      <span className="ke-tool-sep" />
      {btn('h1', 'Heading 1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <IconH1 size={sz} />)}
      {btn('h2', 'Heading 2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <IconH2 size={sz} />)}
      {btn('h3', 'Heading 3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <IconH3 size={sz} />)}
      <span className="ke-tool-sep" />
      {btn('ul', 'Bullet list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <IconList size={sz} />)}
      {btn('ol', 'Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <IconListNumbers size={sz} />)}
      {btn('task', 'Checklist', editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run(), <IconListCheck size={sz} />)}
      <span className="ke-tool-sep" />
      {btn('code', 'Code block', editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), <IconCode size={sz} />)}
      {btn('quote', 'Blockquote', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <IconBlockquote size={sz} />)}
      {btn('hr', 'Horizontal rule', false, () => editor.chain().focus().setHorizontalRule().run(), <IconSeparator size={sz} />)}
      <span className="ke-tool-sep" />
      {editor.isActive('link')
        ? btn('unlink', 'Remove link', true, () => editor.chain().focus().unsetLink().run(), <IconLinkOff size={sz} />)
        : btn('link', 'Add link', linkOpen, () => {
            setLinkUrl('')
            setLinkOpen((o) => !o)
          }, <IconLink size={sz} />)}
      <span className="ke-tool-spacer" />
      {btn('undo', 'Undo', false, () => editor.chain().focus().undo().run(), <IconArrowBackUp size={sz} />, !editor.can().undo())}
      {btn('redo', 'Redo', false, () => editor.chain().focus().redo().run(), <IconArrowForwardUp size={sz} />, !editor.can().redo())}
      {linkOpen && (
        <form
          className="ke-link-row"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input
            autoFocus
            type="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <button type="submit" className="primary">
            Add
          </button>
        </form>
      )}
    </div>
  )
}
