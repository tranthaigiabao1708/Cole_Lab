import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, Metric, SheetCode, Signal, formatDateTime, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { Markdown } from '../../core/design-system/Markdown'
import { useAuth } from '../../core/auth'
import { useAsync } from '../../core/useAsync'
import { trackOf } from '../../tracks/config'

export interface ContractArtifact {
  required?: boolean
  kind: string
  accepted_formats?: string[]
  max_size_mb?: number
  label?: string
  signature?: string
  healthcheck?: string
}
export interface Contract {
  contract?: string
  plugin?: string
  artifacts?: Record<string, ContractArtifact>
  modes?: Record<string, { requires?: string[]; optional?: string[]; label?: string }>
}

interface AssignmentDetail {
  id: string
  slug: string
  title: string
  role: string
  course: { id: string; title: string; track: string }
  lesson: { id: string; title: string; session_numbers: number[]; module_code: string | null } | null
  version: { id: string; version: number; published_at: string | null }
  readme: string
  docs: { name: string; size: number }[]
  dataset: { files: number; bytes: number; license?: string; description?: string; mount: string } | null
  contract: Contract
  run_command: string
  simulator: { plugin_id: string; version_range: string }
  testset: { version: number; count: number } | null
  workspace_id: string | null
}

export interface SubmissionSummary {
  id: string
  seq: number
  sha256: string
  size: number
  file_count: number
  validation_status: string
  submitted_at: string
  runs: { id: string; status: string; mode: string; summary?: { headline?: Record<string, unknown> } | null }[]
}

type Tab = 'readme' | 'docs' | 'data' | 'contract' | 'history'

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function ContractTable({ contract }: { contract: Contract }) {
  const arts = Object.entries(contract.artifacts ?? {})
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{vi.assignment.colKey}</th>
              <th>{vi.assignment.colKind}</th>
              <th>{vi.assignment.colFormat}</th>
              <th>{vi.assignment.colRequired}</th>
              <th>{vi.assignment.colLimit}</th>
            </tr>
          </thead>
          <tbody>
            {arts.map(([k, a]) => (
              <tr key={k}>
                <td className="mono">
                  {k}
                  {a.label && <div className="annot">{a.label}</div>}
                </td>
                <td>{vi.assignment.kinds[a.kind] ?? a.kind}</td>
                <td className="mono">{a.accepted_formats?.join(', ') ?? a.signature ?? a.healthcheck ?? vi.common.none}</td>
                <td>{a.required ? vi.common.yes : vi.common.no}</td>
                <td className="mono">{a.max_size_mb ? `${a.max_size_mb} MB` : vi.common.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contract.modes && (
        <>
          <div className="section-label">{vi.assignment.modes}</div>
          <ul className="course-lines">
            {Object.entries(contract.modes).map(([m, spec]) => (
              <li key={m} className="lesson" style={{ gridTemplateColumns: '160px 1fr' }}>
                <span className="mono">{m}</span>
                <span>
                  {spec.label && <span>{spec.label} · </span>}
                  <span className="mono">{(spec.requires ?? []).join(' + ')}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

export function AssignmentPage() {
  const { assignmentId } = useParams()
  const nav = useNavigate()
  const [tab, setTab] = useState<Tab>('readme')
  const [opening, setOpening] = useState(false)
  const [openErr, setOpenErr] = useState<unknown>(null)
  const { data: a, error, loading, reload } = useAsync(
    () => api.get<AssignmentDetail>(`/assignments/${assignmentId}`),
    [assignmentId],
  )
  const subs = useAsync(
    () => api.get<SubmissionSummary[]>(`/submissions?assignment_id=${assignmentId}`),
    [assignmentId],
  )
  usePageMeta(a ? `${a.title} — COLE LAB` : vi.meta.assignmentTitle, a ? vi.assignment.metaDescription(a.title) : undefined)

  if (loading) return <div className="page"><Loading /></div>
  if (error || !a) return <div className="page"><ErrorNote error={error} onRetry={reload} id="assignment-error" /></div>

  const t = trackOf(a.course.track)
  const code = a.lesson
    ? `${t.code}-${a.lesson.module_code ?? ''}-B${a.lesson.session_numbers.join('+')}`
    : `${t.code}-${a.slug}`

  async function openWs() {
    setOpening(true)
    setOpenErr(null)
    try {
      const ws = await api.post<{ id: string }>(`/assignments/${a!.id}/workspace`)
      nav(`/workspace/${ws.id}`)
    } catch (e) {
      setOpenErr(e)
    } finally {
      setOpening(false)
    }
  }

  const { user } = useAuth()
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  const tabs: Tab[] = ['readme', 'docs', 'data', 'contract', 'history']

  return (
    <>
      <section className="course-hero surface-stage">
        <div className="course-hero__inner">
          <SheetCode tone="dark">
            {code} · {a.course.title}
          </SheetCode>
          <h1 className="course-hero__title reveal" style={{ maxWidth: '22ch' }}>
            {a.title}
          </h1>
          <div className="course-hero__row">
            <div className="course-hero__metrics reveal reveal-2">
              <Metric value={`v${a.version.version}`} label={vi.assignment.version} />
              {a.testset && <Metric value={a.testset.count} label={`${vi.assignment.testset} · ${vi.assignment.cases}`} />}
              <Metric value={<span style={{ fontSize: 'var(--fs-lg)' }}>{a.simulator.plugin_id}</span>} label={vi.assignment.simulator} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                {isTeacher && (
                  <Link
                    to={`/teach/assignments/${a.id}/monitor`}
                    className="btn btn--ghost"
                    id="btn-class-monitor"
                    title="Giám sát tiến độ học viên theo thời gian thực"
                  >
                    <Icon name="list" />
                    Giám sát lớp học
                  </Link>
                )}
                <button className="btn btn--ember" onClick={openWs} disabled={opening} id="btn-open-workspace">
                  <Icon name="terminal" />
                  {opening ? vi.assignment.opening : vi.assignment.openWorkspace}
                </button>
              </div>
              {openErr ? <ErrorNote error={openErr} id="open-ws-error" /> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="page" style={{ paddingTop: 'var(--space-5)' }}>
        <div className="steps" role="tablist" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((k, i) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              id={`asg-tab-${k}`}
              className={`step${tab === k ? ' is-active' : ''}`}
              onClick={() => setTab(k)}
            >
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              {vi.assignment.tabs[k]}
            </button>
          ))}
        </div>

        {tab === 'readme' && (
          <div className="split">
            <Markdown source={a.readme} id="asg-readme" />
            <aside className="panel">
              <div className="panel__head">{vi.assignment.runCommand}</div>
              <div className="panel__body">
                <code>{a.run_command || vi.common.none}</code>
              </div>
            </aside>
          </div>
        )}

        {tab === 'docs' &&
          (a.docs.length === 0 ? (
            <p className="muted">{vi.assignment.noDocs}</p>
          ) : (
            <ul className="course-lines">
              {a.docs.map((d) => (
                <li key={d.name} className="course-line" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span className="mono">{d.name}</span>
                  <span className="course-line__stats">{fmtBytes(d.size)}</span>
                  <a className="go" href={`/api/assignments/${a.id}/docs/${encodeURIComponent(d.name)}`} target="_blank" rel="noreferrer" id={`doc-${d.name}`}>
                    {vi.common.open} <Icon name="arrowRight" size={14} />
                  </a>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'data' &&
          (!a.dataset ? (
            <p className="muted">{vi.assignment.noData}</p>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 'var(--space-7)', marginBottom: 'var(--space-5)' }}>
                <Metric value={a.dataset.files} label={vi.assignment.dataFiles} />
                <Metric value={fmtBytes(a.dataset.bytes)} label={vi.assignment.dataSize} />
              </div>
              {a.dataset.description && <p>{a.dataset.description}</p>}
              <p>
                <span className="annot">{vi.assignment.dataMount}</span> <code>{a.dataset.mount}</code>
              </p>
              {a.dataset.license && (
                <p>
                  <span className="annot">{vi.assignment.license}</span> {a.dataset.license}
                </p>
              )}
            </div>
          ))}

        {tab === 'contract' && <ContractTable contract={a.contract} />}

        {tab === 'history' &&
          (subs.data && subs.data.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{vi.admin.at}</th>
                    <th>{vi.admin.status}</th>
                    <th>sha256</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {subs.data.map((s) => (
                    <tr key={s.id}>
                      <td className="num">{s.seq}</td>
                      <td className="num">{formatDateTime(s.submitted_at)}</td>
                      <td>
                        <Signal tone={s.validation_status === 'valid' ? 'pass' : 'critical'}>
                          {s.validation_status === 'valid' ? vi.manifest.valid : vi.manifest.invalid}
                        </Signal>
                      </td>
                      <td className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{s.sha256.slice(0, 12)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Link className="go" to={`/submissions/${s.id}`} id={`hist-sub-${s.seq}`}>
                          {vi.manifest.viewSubmission} <Icon name="arrowRight" size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{vi.assignment.noHistory}</p>
          ))}
      </div>
    </>
  )
}
