import type { KnowledgePageNode } from '../../../../shared/types'
import { ChevronDown, ChevronUp, Plus, Trash } from '../../icons'

// The sidebar tree (Part 10). Renders one sibling group and recurses for
// each node's children, indenting by depth. Reorder moves a page within its
// sibling group; deletion is confirmed by the parent before it happens.
export default function PageTree({
  nodes,
  parentId,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onReorder,
  onDelete
}: {
  nodes: KnowledgePageNode[]
  parentId: number | null
  depth: number
  selectedId: number | null
  onSelect: (id: number) => void
  onAddChild: (parentId: number) => void
  onReorder: (id: number, dir: -1 | 1) => void
  onDelete: (id: number) => void
}): React.JSX.Element {
  const children = nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.position - b.position)

  return (
    <>
      {children.map((node, i) => (
        <div key={node.id}>
          <div
            className={`kn-tree-row${node.id === selectedId ? ' active' : ''}`}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            <button type="button" className="kn-tree-title" onClick={() => onSelect(node.id)}>
              {node.title || 'Untitled'}
            </button>
            <span className="kn-tree-actions">
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => onReorder(node.id, -1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === children.length - 1}
                onClick={() => onReorder(node.id, 1)}
              >
                <ChevronDown size={14} />
              </button>
              <button type="button" aria-label="Add child page" onClick={() => onAddChild(node.id)}>
                <Plus size={14} />
              </button>
              <button type="button" aria-label="Delete page" onClick={() => onDelete(node.id)}>
                <Trash size={14} />
              </button>
            </span>
          </div>
          <PageTree
            nodes={nodes}
            parentId={node.id}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onReorder={onReorder}
            onDelete={onDelete}
          />
        </div>
      ))}
    </>
  )
}
