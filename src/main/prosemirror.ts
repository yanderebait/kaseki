// Helpers for the ProseMirror/Tiptap JSON documents stored in
// knowledge_pages.content. pmText flattens a doc to plain text for search;
// the Markdown serializer (single-page export) is added alongside in this
// same module so both share one understanding of the node shapes.

export interface PmNode {
  type?: string
  text?: string
  content?: PmNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  attrs?: Record<string, unknown>
}

// Flattens a document to plain text, inserting newlines at block boundaries
// so search snippets read naturally. Inline text nodes already carry their
// own surrounding spaces (Tiptap splits on marks, not words), so adjacent
// text is concatenated directly. Unknown node shapes are walked too.
export function pmText(doc: unknown): string {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as PmNode
    if (typeof n.text === 'string') parts.push(n.text)
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child)
      parts.push('\n')
    }
  }
  walk(doc)
  return parts.join('').replace(/\n{2,}/g, '\n').trim()
}

// --- Markdown serialization (single-page export) ---
//
// Hand-rolled, covering the node set the knowledge editor produces (StarterKit
// + task lists). Pure and deterministic, so it can be self-tested like the ICS
// builder. Anything unrecognised falls through to its children.

interface Mark {
  type: string
  attrs?: Record<string, unknown>
}

// Escape the characters that would otherwise be read as Markdown syntax.
// Underscore is left alone so snake_case survives; `<` is left for the rare
// literal and because underline is emitted as <u> on purpose.
function escapeText(s: string): string {
  return s.replace(/([\\`*[\]])/g, '\\$1')
}

function applyMarks(text: string, marks: Mark[] | undefined): string {
  if (!marks || marks.length === 0) return escapeText(text)
  const types = new Set(marks.map((m) => m.type))
  // Inline code can't carry other inline markup — emit it verbatim.
  if (types.has('code')) return '`' + text + '`'
  let out = escapeText(text)
  if (types.has('bold')) out = `**${out}**`
  if (types.has('italic')) out = `*${out}*`
  if (types.has('strike')) out = `~~${out}~~`
  if (types.has('underline')) out = `<u>${out}</u>`
  const link = marks.find((m) => m.type === 'link')
  if (link) out = `[${out}](${String(link.attrs?.href ?? '')})`
  return out
}

function inline(nodes: PmNode[] | undefined): string {
  if (!nodes) return ''
  let out = ''
  for (const n of nodes) {
    if (n.type === 'hardBreak') out += '\\\n'
    else if (typeof n.text === 'string') out += applyMarks(n.text, n.marks as Mark[] | undefined)
  }
  return out
}

// Renders a list, indenting each item's continuation lines under its marker.
function listMarkdown(items: PmNode[], marker: (i: number) => string): string {
  return items
    .map((item, i) => {
      const m = marker(i)
      const pad = ' '.repeat(m.length + 1)
      const body = blocks(item.content)
      return body
        .split('\n')
        .map((line, idx) => (idx === 0 ? `${m} ${line}` : line ? pad + line : ''))
        .join('\n')
    })
    .join('\n')
}

function block(node: PmNode): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.content)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `${'#'.repeat(level)} ${inline(node.content)}`
    }
    case 'blockquote':
      return blocks(node.content)
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n')
    case 'codeBlock': {
      const lang = String(node.attrs?.language ?? '')
      const text = (node.content ?? []).map((c) => c.text ?? '').join('')
      return '```' + lang + '\n' + text + '\n```'
    }
    case 'horizontalRule':
      return '---'
    case 'bulletList':
      return listMarkdown(node.content ?? [], () => '-')
    case 'orderedList':
      return listMarkdown(node.content ?? [], (i) => `${i + 1}.`)
    case 'taskList':
      return (node.content ?? [])
        .map((item) => {
          const mark = `- [${item.attrs?.checked === true ? 'x' : ' '}]`
          const body = blocks(item.content)
          return body
            .split('\n')
            .map((line, idx) => (idx === 0 ? `${mark} ${line}` : line ? '  ' + line : ''))
            .join('\n')
        })
        .join('\n')
    default:
      return node.content ? blocks(node.content) : ''
  }
}

function blocks(content: PmNode[] | undefined): string {
  if (!content) return ''
  return content
    .map((n) => block(n))
    .filter((s) => s.length > 0)
    .join('\n\n')
}

// Serializes a page document to Markdown. The page title is added as the
// top-level heading so the file stands on its own.
export function pmToMarkdown(doc: unknown, title?: string): string {
  const d = doc && typeof doc === 'object' ? (doc as PmNode) : null
  const body = d ? blocks(d.content).trim() : ''
  const head = title ? `# ${title}\n` : ''
  return `${head}${head && body ? '\n' : ''}${body}\n`
}
