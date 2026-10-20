import { Link, useParams } from 'react-router-dom'
import { api } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, Metric, PageHead, Signal, formatDateTime, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'

interface ReportItem {
  code: string
  artifact_key: string | null
  message_vi: string
  hint_vi: string
}
export interface SubmissionRun {
  id: string
  status: string
  mode: string
  created_at?: string
  summary?: { headline?: Record<string, unknown> } | null
}
export interface Submission {
  id: string
  seq: number
  assignment: { id: string; slug: string; title: string } | null
  sha256: string
  size: number
  file_count: number
  manifest: { artifacts?: Record<string, { path?: string; entry?: string; command?: string }>; mode?: string | null }
  validation_status: string
  validation_report: { errors?: ReportItem[]; warnings?: ReportItem[] } | null
  submitted_at: string
  runs: SubmissionRun[]
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function ValidSignal({ status }: { status: string }) {
  return (
    <Signal tone={status === 'valid' ? 'pass' : 'critical'}>
      {status === 'valid' ? vi.manifest.valid : vi.manifest.invalid}
    </Signal>
  )
}

export function SubmissionsPage() {
  usePageMeta(`${vi.submissions.heading} — COLE LAB`)
  const { data, error, loading, reload } = useAsync(() => api.get<Submission[]>('/submissions'), [])
  return (
    <div className="page">
      <PageHead code={vi.submissions.code} title={vi.submissions.heading} />
      {loading && <Loading />}
      {error ? <ErrorNote error={error} onRetry={reload} id="subs-error" /> : null}
      {data && data.length === 0 && <p className="muted">{vi.submissions.empty}</p>}
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{vi.submissions.assignment}</th>
                <th>{vi.submissions.seq}</th>
                <th>{vi.submissions.at}</th>
                <th>{vi.submissions.validation}</th>
                <th>{vi.submissions.runs}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.assignment?.title ?? vi.common.none}
                    <div className="annot mono">{s.assignment?.slug}</div>
                  </td>
                  <td className="num">{s.seq}</td>
                  <td className="num">{formatDateTime(s.submitted_at)}</td>
                  <td><ValidSignal status={s.validation_status} /></td>
                  <td className="num">{s.runs.length}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="go" to={`/submissions/${s.id}`} id={`sub-open-${s.id}`}>
                      {vi.submissions.open} <Icon name="arrowRight" size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function SubmissionDetailPage() {
  const { submissionId = '' } = useParams()
  const { data: s, error, loading, reload } = useAsync(() => api.get<Submission>(`/submissions/${submissionId}`), [submissionId])
  usePageMeta(s ? `${vi.submissions.heading} #${s.seq} — ${s.assignment?.title ?? ''}` : `${vi.submissions.heading} — COLE LAB`)
  if (loading) return <div className="page"><Loading /></div>
  if (error || !s) return <div className="page"><ErrorNote error={error} onRetry={reload} id="sub-error" /></div>
  const errs = s.validation_report?.errors ?? []
  return (
    <div className="page">
      <PageHead
        code={`${vi.submissions.detailCode} · ${s.assignment?.slug ?? ''}`}
        title={
          <>
            {s.assignment ? <Link to={`/assignments/${s.assignment.id}`} id="sub-assignment-link">{s.assignment.title}</Link> : null}{' '}
            <span className="muted">#{s.seq}</span>
          </>
        }
      />
      <div style={{ display: 'flex', gap: 'var(--space-7)', margin: 'var(--space-5) 0', flexWrap: 'wrap' }}>
        <Metric value={s.file_count} label={vi.submissions.files} />
        <Metric value={bytes(s.size)} label={vi.submissions.size} />
        <Metric value={<span style={{ fontSize: 'var(--fs-lg)' }}>{formatDateTime(s.submitted_at)}</span>} label={vi.submissions.at} />
        <Metric value={<ValidSignal status={s.validation_status} />} label={vi.submissions.validation} />
      </div>
      <p className="annot mono">sha256 {s.sha256}</p>

      <div className="section-label">{vi.submissions.artifacts}</div>
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {Object.entries(s.manifest.artifacts ?? {}).map(([k, v]) => (
              <tr key={k}>
                <td className="mono">{k}</td>
                <td className="mono">{v.path ?? v.entry ?? v.command ?? vi.common.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errs.length > 0 && (
        <>
          <div className="section-label">{vi.submissions.errorsTitle}</div>
          {errs.map((e, i) => (
            <div key={i} className="mart__err mart__err--paper" role="alert">
              <strong>{e.message_vi}</strong>
              <span>{e.hint_vi}</span>
              <code>{e.code}</code>
            </div>
          ))}
        </>
      )}

      <div className="section-label">{vi.submissions.runs}</div>
      {s.runs.length === 0 ? (
        <p className="muted">{vi.submissions.noRuns}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {s.runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.mode}</td>
                  <td>{vi.runStatus[r.status] ?? r.status}</td>
                  <td className="num">{r.created_at ? formatDateTime(r.created_at) : ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link className="go" to={`/runs/${r.id}`} id={`sub-run-${r.id}`}>
                      {vi.submissions.open} <Icon name="arrowRight" size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
