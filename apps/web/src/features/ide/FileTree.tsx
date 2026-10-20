import { useMemo, useState } from 'react'
import { vi } from '../../core/copy/vi'
import { Icon } from '../../core/design-system/icons'

export interface TreeEntry {
  path: string
  type: 'file' | 'dir'
  size?: number
  readonly: boolean
}

interface Node {
  name: string
  path: string
  type: 'file' | 'dir'
  readonly: boolean
  children: Node[]
}

function build(entries: TreeEntry[]): Node[] {
  const root: Node = { name: '', path: '', type: 'dir', readonly: false, children: [] }
  const index = new Map<string, Node>([['', root]])
  for (const e of entries) {
    const parts = e.path.split('/')
    const name = parts.pop()!
    const parentPath = parts.join('/')
    let parent = index.get(parentPath)
    if (!parent) {
      parent = { name: parts[parts.length - 1] ?? '', path: parentPath, type: 'dir', readonly: e.readonly, children: [] }
      index.set(parentPath, parent)
      root.children.push(parent)
    }
    const n: Node = { name, path: e.path, type: e.type, readonly: e.readonly, children: [] }
    parent.children.push(n)
    if (e.type === 'dir') index.set(e.path, n)
  }
  return root.children
}

export function FileTree({
  entries,
  selected,
  dirty,
  onOpen,
  onSelect,
}: {
  entries: TreeEntry[]
  selected: string | null
  dirty: Set<string>
  onOpen: (path: string) => void
  onSelect: (path: string, type: 'file' | 'dir') => void
}) {
  const nodes = useMemo(() => build(entries), [entries])
  const [closed, setClosed] = useState<Set<string>>(() => new Set(['data']))

  function toggle(p: string) {
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(p)) n.delete(p)
      else n.add(p)
      return n
    })
  }

  function render(list: Node[], depth: number) {
    return list.map((n) => {
      const isOpen = !closed.has(n.path)
      const id = `tree-${n.path.replace(/[^a-zA-Z0-9]/g, '-')}`
      return (
        <li key={n.path}>
          <button
            id={id}
            className={`ftree__row${selected === n.path ? ' is-selected' : ''}${n.readonly ? ' is-ro' : ''}`}
            style={{ paddingLeft: 10 + depth * 14 }}
            onClick={() => {
              onSelect(n.path, n.type)
              if (n.type === 'dir') toggle(n.path)
              else onOpen(n.path)
            }}
            title={n.path}
          >
            {n.type === 'dir' ? (
              <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />
            ) : (
              <span style={{ width: 12, display: 'inline-block' }} />
            )}
            <Icon name={n.type === 'dir' ? (isOpen ? 'folderOpen' : 'folder') : 'file'} size={14} />
            <span className="ftree__name">{n.name}</span>
            {dirty.has(n.path) && <span className="ftree__dot" aria-label={vi.workspace.unsaved} />}
            {n.readonly && depth === 0 && <span className="ftree__ro">{vi.workspace.readonly}</span>}
          </button>
          {n.type === 'dir' && isOpen && n.children.length > 0 && <ul>{render(n.children, depth + 1)}</ul>}
        </li>
      )
    })
  }

  return <ul className="ftree">{render(nodes, 0)}</ul>
}
