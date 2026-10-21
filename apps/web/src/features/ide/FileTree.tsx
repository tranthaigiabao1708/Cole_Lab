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
  onSelectMissingMission,
}: {
  entries: TreeEntry[]
  selected: string | null
  dirty: Set<string>
  onOpen: (path: string) => void
  onSelect: (path: string, type: 'file' | 'dir') => void
  onSelectMissingMission?: (missionId: string) => void
}) {
  const nodes = useMemo(() => build(entries), [entries])
  const [closed, setClosed] = useState<Set<string>>(() => new Set(['data/train', 'data/test']))

  // Tính toán các file/thư mục bắt buộc còn thiếu
  const paths = useMemo(() => new Set(entries.map((e) => e.path)), [entries])
  const missingItems = useMemo(() => {
    const list: { id: string; label: string; file: string; tooltip: string }[] = []
    if (!paths.has('annotations/annotations.json') && !paths.has('data/annotations.json') && !paths.has('data/train_labels.json')) {
      list.push({
        id: 'annotations',
        label: 'annotations/annotations.json',
        file: 'Thiếu nhãn Ground Truth',
        tooltip: 'Nhiệm vụ (?): Thiếu file nhãn Bounding Box. Bấm để xem hướng dẫn của Cố vấn Chuyên môn!',
      })
    }
    if (!paths.has('solution/train.py')) {
      list.push({
        id: 'training',
        label: 'solution/train.py',
        file: 'Thiếu script Huấn luyện',
        tooltip: 'Nhiệm vụ (?): Thiếu kịch bản train mô hình & tinh chỉnh siêu tham số!',
      })
    }
    if (!paths.has('runs/train/curves.png') && !entries.some((e) => e.path.includes('curves'))) {
      list.push({
        id: 'loss_curves',
        label: 'runs/train/curves.png',
        file: 'Thiếu Biểu đồ Train/Val Loss',
        tooltip: 'Nhiệm vụ (?): Thiếu file biểu đồ chẩn đoán Overfitting & Loss!',
      })
    }
    return list
  }, [paths, entries])

  function toggle(p: string) {
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(p)) n.delete(p)
      else n.add(p)
      return n
    })
  }

function getFileIconClass(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'py') return 'file-icon--py'
  if (ext === 'json') return 'file-icon--json'
  if (ext === 'yaml' || ext === 'yml') return 'file-icon--yaml'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext ?? '')) return 'file-icon--img'
  if (['mp4', 'webm', 'ogg'].includes(ext ?? '')) return 'file-icon--video'
  if (ext === 'md') return 'file-icon--md'
  return ''
}

  function render(list: Node[], depth: number) {
    return list.map((n) => {
      const isOpen = !closed.has(n.path)
      const id = `tree-${n.path.replace(/[^a-zA-Z0-9]/g, '-')}`
      const iconCls = n.type === 'file' ? getFileIconClass(n.name) : ''
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
            <span className={iconCls} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Icon name={n.type === 'dir' ? (isOpen ? 'folderOpen' : 'folder') : 'file'} size={14} />
            </span>
            <span className="ftree__name">{n.name}</span>
            {dirty.has(n.path) && <span className="ftree__dot" aria-label={vi.workspace.unsaved} />}
            {n.readonly && depth === 0 && <span className="ftree__ro">{vi.workspace.readonly}</span>}
          </button>
          {n.type === 'dir' && isOpen && n.children.length > 0 && <ul>{render(n.children, depth + 1)}</ul>}
        </li>
      )
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* KHU VỰC DẤU ? NHIỆM VỤ BẮT BUỘC TRONG FILE TREE */}
      {missingItems.length > 0 && (
        <div
          style={{
            margin: '8px',
            padding: '8px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px dashed rgba(239, 68, 68, 0.35)',
            borderRadius: '6px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
              textTransform: 'uppercase',
            }}
          >
            <span>⚠️ Yêu cầu còn thiếu ({missingItems.length})</span>
            <span
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#ef4444',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 'bold',
              }}
            >
              ?
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {missingItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectMissingMission?.(item.id)}
                title={item.tooltip}
                style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: '#fca5a5',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '13px',
                    height: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  ?
                </span>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 600, color: '#fecaca' }}>{item.label}</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>{item.file}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="ftree" style={{ flex: 1, overflowY: 'auto' }}>
        {render(nodes, 0)}
      </ul>
    </div>
  )
}
