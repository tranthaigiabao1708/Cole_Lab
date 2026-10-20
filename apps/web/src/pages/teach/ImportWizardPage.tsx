import { useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../core/api'
import { vi } from '../../core/copy/vi'
import {
  ErrorNote,
  Loading,
  Metric,
  PageHead,
  Signal,
  formatDateTime,
  pad2,
  usePageMeta,
} from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'
import { TRACKS, TRACK_ORDER, trackBySlug } from '../../tracks/config'

const ROW_TYPES = ['TITLE', 'HEADER', 'GROUP_L1', 'GROUP_L2', 'SESSION', 'PROJECT', 'NOTE', 'IGNORE']

interface Row {
  row: number
  type: string
  label: string
  title: string
  content: string
  objectives: string
  practice: string
  session_numbers: number[]
  warnings: string[]
}
interface TreeLesson {
  label: string
  session_numbers: number[]
  title: string
  kind: string
  row: number
}
interface TreeModule {
  code: string
  title: string
  group_path: string | null
  implicit: boolean
  lessons: TreeLesson[]
}
interface ImportStats {
  modules: number
  groups: number
  lessons: number
  distinct_session_numbers: number
}
interface ImportOut {
  id: string
  filename: string
  sheet: string
  preset: string
  status: 'draft' | 'published'
  course_id: string | null
  created_at: string
  stats: ImportStats | null
  course_title: string | null
  rows?: Row[]
  modules?: TreeModule[]
  warnings?: { row: number; code: string; text: string }[]
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function Steps({ step, max, onGo }: { step: number; max: number; onGo: (n: number) => void }) {
  return (
    <div className="steps" role="list">
      {vi.importer.steps.map((s, i) => (
        <button
          key={s}
          role="listitem"
          id={`import-step-${i + 1}`}
          className={`step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
          disabled={i > max}
          onClick={() => onGo(i)}
          aria-current={i === step ? 'step' : undefined}
        >
          <span className="num">{pad2(i + 1)}</span>
          {s}
        </button>
      ))}
    </div>
  )
}

function UploadStep() {
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preset, setPreset] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const presets = useAsync(() => api.get<Record<string, { label: string }>>('/teach/imports/presets'), [])
  const history = useAsync(() => api.get<ImportOut[]>('/teach/imports'), [])

  async function submit() {
    if (!file) return
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    if (preset) fd.append('preset', preset)
    try {
      const out = await api.post<ImportOut>('/teach/imports', fd)
      nav(`/teach/import/${out.id}`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  return (
    <>
      <div className="split">
        <div>
          <label
            className={`dropzone${over ? ' is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            htmlFor="import-file"
          >
            <Icon name="upload" size={22} />
            <span className="field__label">{vi.importer.uploadLabel}</span>
            <span className="mono">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : vi.common.none}</span>
            <input
              ref={fileRef}
              id="import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="visually-hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="form-grid" style={{ marginTop: 'var(--space-5)' }}>
            <label className="field">
              <span className="field__label">{vi.importer.presetLabel}</span>
              <select className="select" id="import-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="">{vi.importer.presetAuto}</option>
                {presets.data &&
                  Object.entries(presets.data).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <button className="btn btn--ember" id="import-upload" disabled={!file || busy} onClick={submit}>
                <Icon name="upload" />
                {busy ? vi.importer.uploading : vi.importer.upload}
              </button>
            </div>
          </div>
          {error ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <ErrorNote error={error} id="import-upload-error" />
            </div>
          ) : null}
        </div>
        <div className="panel">
          <div className="panel__head">{vi.importer.history}</div>
          {history.loading && <div className="panel__body"><Loading /></div>}
          <ul className="warn-list" style={{ maxHeight: 420 }}>
            {history.data?.map((h) => (
              <li key={h.id}>
                <button onClick={() => nav(`/teach/import/${h.id}`)} id={`import-history-${h.id}`}>
                  <span className="num">{h.preset?.toUpperCase()}</span>
                  <span>
                    <span style={{ display: 'block' }}>{h.filename}</span>
                    <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      {formatDateTime(h.created_at)} ·{' '}
                      {h.status === 'published' ? vi.importer.published : vi.importer.draft}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function WarningsPanel({ imp, onJump }: { imp: ImportOut; onJump: (row: number) => void }) {
  const w = imp.warnings ?? []
  return (
    <div className="panel">
      <div className="panel__head">
        <span>{vi.importer.warnings}</span>
        <span className="mono">{w.length}</span>
      </div>
      {w.length === 0 ? (
        <div className="panel__body muted">{vi.importer.noWarnings}</div>
      ) : (
        <ul className="warn-list">
          {w.map((x, i) => (
            <li key={`${x.row}-${x.code}-${i}`}>
              <button onClick={() => onJump(x.row)} id={`import-warn-${i}`}>
                <span className="num">#{x.row}</span>
                <span>
                  <span className="code">{vi.importer.warningCodes[x.code] ?? x.code}</span>
                  {x.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TreeView({ modules }: { modules: TreeModule[] }) {
  let lastGroup: string | null = null
  return (
    <ul className="tree">
      {modules.map((m, mi) => {
        const showGroup = m.group_path && m.group_path !== lastGroup
        lastGroup = m.group_path
        return (
          <li key={`${m.code}-${mi}`}>
            {showGroup && <div className="tree__group">{m.group_path}</div>}
            <div className="tree__mod">
              <span>
                <span className="mono muted">{m.code}</span> {m.title}
                {m.implicit && <span className="annot"> · {vi.importer.implicitModule}</span>}
              </span>
              <span className="mono muted">{m.lessons.length}</span>
            </div>
            {m.lessons.map((l) => (
              <div className="tree__lesson" key={l.row}>
                <span className="num">{l.session_numbers.length ? `B${l.session_numbers.join('+')}` : l.kind}</span>
                <span>{l.title}</span>
              </div>
            ))}
          </li>
        )
      })}
    </ul>
  )
}

function ImportEditor({ id }: { id: string }) {
  const nav = useNavigate()
  const { data: imp, error, loading, reload, setData } = useAsync(() => api.get<ImportOut>(`/teach/imports/${id}`), [id])
  const [step, setStep] = useState(1)
  const [onlyWarn, setOnlyWarn] = useState(false)
  const [flash, setFlash] = useState<number | null>(null)
  const [saveErr, setSaveErr] = useState<unknown>(null)
  const [track, setTrack] = useState<string>('')
  const [title, setTitle] = useState<string>('')
  const [slug, setSlug] = useState<string>('')
  const [publishing, setPublishing] = useState(false)

  usePageMeta(vi.meta.importTitle)

  if (loading && !imp) return <Loading />
  if (error || !imp) return <ErrorNote error={error} onRetry={reload} id="import-load-error" />

  const published = imp.status === 'published'
  const effTrack = track || TRACKS[(trackBySlug(imp.preset)?.id ?? 'AI_ENGINEER')].id
  const effTitle = title || imp.course_title || ''
  const effSlug = slug || slugify(effTitle)

  async function changeType(row: number, type: string) {
    setSaveErr(null)
    try {
      setData(await api.patch<ImportOut>(`/teach/imports/${id}/rows`, { changes: [{ row, type }] }))
    } catch (e) {
      setSaveErr(e)
    }
  }

  function jump(row: number) {
    setStep(1)
    setOnlyWarn(false)
    setFlash(row)
    setTimeout(() => document.getElementById(`import-row-${row}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30)
    setTimeout(() => setFlash(null), 1500)
  }

  async function publish() {
    setPublishing(true)
    setSaveErr(null)
    try {
      const out = await api.post<{ course_id: string }>(`/teach/imports/${id}/publish`, {
        track: effTrack,
        title: effTitle,
        slug: effSlug,
      })
      const t = TRACKS[effTrack as keyof typeof TRACKS]
      nav(`/courses/${t.slug}/${out.course_id}`)
    } catch (e) {
      setSaveErr(e)
    } finally {
      setPublishing(false)
    }
  }

  const rows = (imp.rows ?? []).filter((r) => !onlyWarn || r.warnings.length > 0)

  return (
    <>
      <Steps step={step} max={published ? 3 : 3} onGo={(n) => (n === 0 ? nav('/teach/import') : setStep(n))} />
      <div className="toolbar">
        <span className="mono">{imp.filename}</span>
        <span className="muted">· {imp.sheet} · {imp.preset?.toUpperCase()}</span>
        {published ? <Signal tone="pass">{vi.importer.published}</Signal> : <Signal tone="neutral">{vi.importer.draft}</Signal>}
        <span className="toolbar__spacer" />
        {imp.stats && (
          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            <Metric value={imp.stats.modules} label={vi.stats.modules} />
            <Metric value={imp.stats.lessons} label={vi.stats.lessons} />
            <Metric value={imp.stats.distinct_session_numbers} label={vi.stats.sessions} />
          </div>
        )}
      </div>
      {saveErr ? <ErrorNote error={saveErr} id="import-save-error" /> : null}

      {step === 1 && (
        <div className="split">
          <div>
            <div className="toolbar">
              <select
                className="select select--sm"
                id="import-row-filter"
                value={onlyWarn ? 'warn' : 'all'}
                onChange={(e) => setOnlyWarn(e.target.value === 'warn')}
              >
                <option value="all">{vi.importer.filterAll}</option>
                <option value="warn">{vi.importer.filterWarn}</option>
              </select>
              <span className="toolbar__spacer" />
              <button className="btn btn--sm" id="import-next-tree" onClick={() => setStep(2)}>
                {vi.importer.next} <Icon name="arrowRight" size={14} />
              </button>
            </div>
            <div className="table-wrap" style={{ maxHeight: '64vh' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{vi.importer.colRow}</th>
                    <th>{vi.importer.colType}</th>
                    <th>{vi.importer.colLabel}</th>
                    <th>{vi.importer.colTitle}</th>
                    <th>{vi.importer.colWarnings}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row} id={`import-row-${r.row}`} className={flash === r.row ? 'is-flash' : ''}>
                      <td className="num">{r.row}</td>
                      <td>
                        <select
                          className="select select--sm row-type"
                          data-type={r.type}
                          id={`import-row-type-${r.row}`}
                          value={r.type}
                          disabled={published}
                          onChange={(e) => changeType(r.row, e.target.value)}
                          aria-label={`${vi.importer.colType} ${r.row}`}
                        >
                          {ROW_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {vi.importer.rowTypes[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="mono" style={{ fontSize: 'var(--fs-xs)', maxWidth: 160 }}>
                        {r.label.split('\n')[0]}
                      </td>
                      <td style={{ maxWidth: 420 }}>{r.title}</td>
                      <td>
                        {r.warnings.map((w) => (
                          <Signal key={w} tone="warn">
                            {vi.importer.warningCodes[w] ?? w}
                          </Signal>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <WarningsPanel imp={imp} onJump={jump} />
        </div>
      )}

      {step === 2 && (
        <div className="split">
          <div className="panel">
            <div className="panel__head">
              <span>{vi.importer.tree}</span>
              <button className="btn btn--sm" id="import-next-publish" onClick={() => setStep(3)}>
                {vi.importer.next} <Icon name="arrowRight" size={14} />
              </button>
            </div>
            <TreeView modules={imp.modules ?? []} />
          </div>
          <WarningsPanel imp={imp} onJump={jump} />
        </div>
      )}

      {step === 3 && (
        <div className="panel" style={{ maxWidth: 820 }}>
          <div className="panel__head">{vi.importer.steps[3]}</div>
          <div className="panel__body">
            {published ? (
              <Link className="go" to={`/courses`} id="import-view-course">
                {vi.importer.viewCourse} <Icon name="arrowRight" size={14} />
              </Link>
            ) : (
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">{vi.importer.track}</span>
                  <select className="select" id="import-track" value={effTrack} onChange={(e) => setTrack(e.target.value)}>
                    {TRACK_ORDER.map((t) => (
                      <option key={t} value={t}>
                        {TRACKS[t].code} · {TRACKS[t].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">{vi.importer.title}</span>
                  <input className="input" id="import-title" value={effTitle} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field__label">{vi.importer.slug}</span>
                  <input className="input mono" id="import-slug" value={effSlug} onChange={(e) => setSlug(e.target.value)} />
                </label>
                <div>
                  <button className="btn btn--ember" id="import-publish" disabled={publishing || !effSlug} onClick={publish}>
                    {publishing ? vi.importer.publishing : vi.importer.publish}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export function ImportWizardPage() {
  usePageMeta(vi.meta.importTitle, 'Nhập đề cương khóa học từ tệp Excel.')
  const { importId } = useParams()
  return (
    <div className="page">
      <PageHead code={vi.importer.sheetCode} title={vi.importer.heading} />
      {importId ? (
        <ImportEditor id={importId} />
      ) : (
        <>
          <Steps step={0} max={0} onGo={() => undefined} />
          <UploadStep />
        </>
      )}
    </div>
  )
}
