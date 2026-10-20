import Editor from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, SheetCode, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'
import type { Contract } from '../../pages/assignments/AssignmentPage'
import { FileTree, type TreeEntry } from './FileTree'
import { ManifestPanel, type Manifest } from './ManifestPanel'
import { languageOf } from './monacoSetup'
import { TerminalPane, type TerminalHandle } from './TerminalPane'
import './ide.css'

interface WsInfo {
  id: string
  assignment: { id: string; slug: string; title: string }
  version: number
  run_command: string
  contract: Contract
  manifest: Manifest
  owner: boolean
}
interface OpenFile {
  path: string
  content: string
  saved: string
  binary?: boolean
  tooLarge?: boolean
  readonly: boolean
  rev: number
}
interface Status {
  status: string
  cpu_percent?: number
  mem_used?: number
  mem_limit?: number
}
interface StartRes {
  isolation?: { level: string; warnings: string[] }
}

export function WorkspacePage() {
  const { workspaceId = '' } = useParams()
  usePageMeta(vi.meta.workspaceTitle)
  const info = useAsync(() => api.get<WsInfo>(`/workspaces/${workspaceId}`), [workspaceId])
  const [tree, setTree] = useState<TreeEntry[]>([])
  const [files, setFiles] = useState<OpenFile[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ path: string; type: 'file' | 'dir' } | null>(null)
  const [started, setStarted] = useState<StartRes | null>(null)
  const [startErr, setStartErr] = useState<unknown>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [opErr, setOpErr] = useState<unknown>(null)
  const termRef = useRef<TerminalHandle>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const owner = info.data?.owner ?? false

  const loadTree = useCallback(async () => {
    try {
      setTree(await api.get<TreeEntry[]>(`/workspaces/${workspaceId}/files/tree`))
    } catch (e) {
      setOpErr(e)
    }
  }, [workspaceId])

  useEffect(() => {
    loadTree()
  }, [loadTree])

  useEffect(() => {
    if (!info.data?.owner) return
    api.post<StartRes>(`/workspaces/${workspaceId}/start`).then(setStarted).catch(setStartErr)
  }, [info.data?.owner, workspaceId])

  const filesRef = useRef<OpenFile[]>([])
  filesRef.current = files

  /** Re-read clean text tabs from disk so edits made in the terminal appear and stale buffers never win. */
  const syncClean = useCallback(async () => {
    const clean = filesRef.current.filter((f) => f.content === f.saved && !f.binary && !f.tooLarge)
    for (const f of clean) {
      try {
        const r = await api.get<{ content?: string; binary: boolean }>(
          `/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(f.path)}`,
        )
        const disk = r.content ?? ''
        setFiles((fs) =>
          fs.map((x) => (x.path === f.path && x.content === x.saved && x.saved !== disk ? { ...x, content: disk, saved: disk, rev: x.rev + 1 } : x)),
        )
      } catch {
        /* file may have been removed; tree refresh will show it */
      }
    }
  }, [workspaceId])

  useEffect(() => {
    if (!started) return
    const tick = () => api.get<Status>(`/workspaces/${workspaceId}/status`).then(setStatus).catch(() => undefined)
    tick()
    const t = setInterval(tick, 5000)
    const tr = setInterval(() => {
      loadTree()
      syncClean()
    }, 6000)
    const onFocus = () => syncClean()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      clearInterval(tr)
      window.removeEventListener('focus', onFocus)
    }
  }, [started, workspaceId, loadTree, syncClean])

  async function openFile(path: string) {
    setActive(path)
    if (files.some((f) => f.path === path)) return
    const ro = tree.find((t) => t.path === path)?.readonly ?? false
    try {
      const r = await api.get<{ content?: string; binary: boolean; too_large?: boolean }>(
        `/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`,
      )
      setFiles((fs) => [
        ...fs,
        { path, content: r.content ?? '', saved: r.content ?? '', binary: r.binary, tooLarge: r.too_large, readonly: ro || !owner, rev: 0 },
      ])
    } catch (e) {
      setOpErr(e)
    }
  }

  const save = useCallback(
    async (path?: string) => {
      const targets = files.filter((f) => (path ? f.path === path : true) && f.content !== f.saved && !f.readonly)
      for (const f of targets) {
        await api.put(`/workspaces/${workspaceId}/files/content`, { path: f.path, content: f.content })
      }
      if (targets.length) {
        setFiles((fs) => fs.map((f) => (targets.some((t) => t.path === f.path) ? { ...f, saved: f.content } : f)))
      }
    },
    [files, workspaceId],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (active) save(active).catch(setOpErr)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, save])

  function closeTab(path: string) {
    setFiles((fs) => fs.filter((f) => f.path !== path))
    if (active === path) setActive(files.find((f) => f.path !== path)?.path ?? null)
  }

  function baseDir() {
    if (!selected) return ''
    if (selected.type === 'dir') return selected.path + '/'
    const i = selected.path.lastIndexOf('/')
    return i >= 0 ? selected.path.slice(0, i + 1) : ''
  }

  async function op(fn: () => Promise<unknown>) {
    setOpErr(null)
    try {
      await fn()
      await loadTree()
    } catch (e) {
      setOpErr(e)
    }
  }

  async function run() {
    await save().catch(setOpErr)
    if (info.data?.run_command) termRef.current?.send(info.data.run_command + '\r')
  }


  if (info.loading) return <div className="ide ide--loading"><Loading /></div>
  if (info.error || !info.data) return <div className="page"><ErrorNote error={info.error} onRetry={info.reload} id="ws-error" /></div>
  const w = info.data
  const cur = files.find((f) => f.path === active) ?? null
  const dirty = new Set(files.filter((f) => f.content !== f.saved).map((f) => f.path))
  const memPct = status?.mem_limit ? Math.round(((status.mem_used ?? 0) / status.mem_limit) * 100) : null

  return (
    <div className="ide">
      <header className="ide__bar">
        <Link to={`/assignments/${w.assignment.id}`} className="ide__back" id="ide-back">
          <Icon name="chevronLeft" size={14} /> {vi.workspace.back}
        </Link>
        <SheetCode tone="dark">{w.assignment.slug} · v{w.version}</SheetCode>
        <span className="ide__title">{w.assignment.title}</span>
        <span className="toolbar__spacer" />
        {started?.isolation?.warnings?.includes('ISOLATION_DEGRADED') && (
          <span className="ide__iso" title={vi.workspace.isolationDegraded}>{vi.workspace.isolationDegraded}</span>
        )}
        {owner && (
          <button className="btn btn--ember btn--sm" id="btn-run" onClick={run} disabled={!started || !w.run_command}>
            <Icon name="play" size={12} filled />
            {vi.workspace.run}
            {w.run_command && <code className="ide__cmd">{w.run_command}</code>}
          </button>
        )}
      </header>

      <aside className="ide__explorer">
        <div className="ide__phead">
          <span>{vi.workspace.explorer}</span>
          {owner && (
            <span className="ide__tools">
              <button title={vi.workspace.newFile} aria-label={vi.workspace.newFile} id="btn-new-file"
                onClick={() => {
                  const n = prompt(vi.workspace.promptName, baseDir())
                  if (n) op(() => api.put(`/workspaces/${workspaceId}/files/content`, { path: n, content: '' })).then(() => openFile(n))
                }}>
                <Icon name="plus" size={14} />
              </button>
              <button title={vi.workspace.newFolder} aria-label={vi.workspace.newFolder} id="btn-new-folder"
                onClick={() => {
                  const n = prompt(vi.workspace.promptName, baseDir())
                  if (n) op(() => api.post(`/workspaces/${workspaceId}/files/mkdir`, { path: n }))
                }}>
                <Icon name="folder" size={14} />
              </button>
              <button title={vi.workspace.upload} aria-label={vi.workspace.upload} id="btn-upload" onClick={() => uploadRef.current?.click()}>
                <Icon name="upload" size={14} />
              </button>
              <button title={vi.workspace.rename} aria-label={vi.workspace.rename} id="btn-rename" disabled={!selected}
                onClick={() => {
                  if (!selected) return
                  const n = prompt(vi.workspace.promptName, selected.path)
                  if (n && n !== selected.path)
                    op(() => api.post(`/workspaces/${workspaceId}/files/rename`, { src: selected.path, dst: n })).then(() => closeTab(selected.path))
                }}>
                <Icon name="list" size={14} />
              </button>
              <button title={vi.workspace.delete} aria-label={vi.workspace.delete} id="btn-delete" disabled={!selected}
                onClick={() => {
                  if (selected && confirm(vi.workspace.confirmDelete(selected.path)))
                    op(() => api.del(`/workspaces/${workspaceId}/files?path=${encodeURIComponent(selected.path)}`)).then(() => closeTab(selected.path))
                }}>
                <Icon name="trash" size={14} />
              </button>
              <button title={vi.workspace.refresh} aria-label={vi.workspace.refresh} id="btn-refresh" onClick={loadTree}>
                <Icon name="refresh" size={14} />
              </button>
            </span>
          )}
        </div>
        <input ref={uploadRef} type="file" className="visually-hidden" id="upload-input"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const fd = new FormData()
            fd.append('path', baseDir() + f.name)
            fd.append('file', f)
            op(() => api.post(`/workspaces/${workspaceId}/files/upload`, fd))
            e.target.value = ''
          }} />
        <FileTree entries={tree} selected={selected?.path ?? null} dirty={dirty} onOpen={openFile}
          onSelect={(path, type) => setSelected({ path, type })} />
        {opErr ? <div style={{ padding: 8 }}><ErrorNote error={opErr} id="ide-op-error" /></div> : null}
      </aside>

      <section className="ide__editor">
        <div className="ide__tabs" role="tablist">
          {files.map((f) => (
            <div key={f.path} className={`ide__tab${f.path === active ? ' is-active' : ''}`} role="tab" aria-selected={f.path === active}>
              <button className="ide__tabname" onClick={() => setActive(f.path)} id={`tab-${f.path.replace(/[^a-zA-Z0-9]/g, '-')}`}>
                {f.path.split('/').pop()}
                {dirty.has(f.path) && <span className="ftree__dot" />}
              </button>
              <button className="ide__tabx" aria-label={vi.common.close} onClick={() => closeTab(f.path)}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
          <span className="toolbar__spacer" />
          {cur && !cur.readonly && (
            <button className="ide__save" id="btn-save" disabled={!dirty.has(cur.path)} onClick={() => save(cur.path).catch(setOpErr)}>
              <Icon name="save" size={14} /> {dirty.has(cur.path) ? vi.workspace.save : vi.workspace.saved}
            </button>
          )}
        </div>
        <div className="ide__monaco">
          {!cur && <div className="ide__empty">{vi.workspace.empty}</div>}
          {cur && (cur.binary || cur.tooLarge) && (
            <div className="ide__empty">
              {cur.tooLarge ? vi.workspace.tooLarge : vi.workspace.binary}{' '}
              <a className="go" href={`/api/workspaces/${workspaceId}/files/download?path=${encodeURIComponent(cur.path)}`} id="btn-download">
                <Icon name="download" size={14} /> {vi.workspace.download}
              </a>
            </div>
          )}
          {cur && !cur.binary && !cur.tooLarge && (
            <Editor
              key={`${cur.path}#${cur.rev}`}
              theme="cole-ink"
              path={cur.path}
              language={languageOf(cur.path)}
              defaultValue={cur.content}
              options={{
                readOnly: cur.readonly,
                fontFamily: "'JetBrains Mono', Consolas, monospace",
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                renderLineHighlight: 'line',
                padding: { top: 10 },
                tabSize: 4,
              }}
              onChange={(v) => setFiles((fs) => fs.map((f) => (f.path === cur.path ? { ...f, content: v ?? '' } : f)))}
            />
          )}
        </div>
      </section>

      <aside className="ide__side">
        <ManifestPanel workspaceId={workspaceId} contract={w.contract} initial={w.manifest} files={tree}
          readOnly={!owner} beforeSubmit={() => save()} />
      </aside>

      <section className="ide__term">
        <div className="ide__phead">
          <span>
            <Icon name="terminal" size={14} /> {vi.workspace.terminal}
          </span>
          {status && status.status === 'running' && (
            <span className="ide__res mono">
              {vi.workspace.cpu} {status.cpu_percent ?? 0}% · {vi.workspace.ram}{' '}
              {((status.mem_used ?? 0) / 1048576).toFixed(0)}/{((status.mem_limit ?? 0) / 1048576).toFixed(0)} MB
              {memPct !== null && memPct > 85 && <span className="signal signal--warn" style={{ marginLeft: 8 }}>{memPct}%</span>}
            </span>
          )}
        </div>
        {startErr ? (
          <div style={{ padding: 12 }}><ErrorNote error={startErr} id="ws-start-error" /></div>
        ) : owner ? (
          <TerminalPane ref={termRef} workspaceId={workspaceId} enabled={!!started} />
        ) : null}
      </section>
    </div>
  )
}
