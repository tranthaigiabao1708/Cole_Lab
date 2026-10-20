import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type RunDetailOut } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, Metric, PageHead, Signal, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'

export function RunPage() {
  const { runId } = useParams<{ runId: string }>()
  usePageMeta(vi.meta.runTitle, 'Kết quả chạy và đánh giá bài thực hành.')
  const [data, setData] = useState<RunDetailOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [cancelling, setCancelling] = useState(false)
  const [activeTab, setActiveTab] = useState<'results' | 'metrics' | 'logs'>('results')
  const [expandedCase, setExpandedCase] = useState<string | null>(null)

  async function fetchRun() {
    if (!runId) return
    try {
      const res = await api.get<RunDetailOut>(`/runs/${runId}`)
      setData(res)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRun()
  }, [runId])

  // Polling while active
  useEffect(() => {
    if (!data) return
    const isActive = ['queued', 'preparing', 'running', 'evaluating'].includes(data.status)
    if (!isActive) return
    const timer = setInterval(() => {
      fetchRun()
    }, 2000)
    return () => clearInterval(timer)
  }, [data?.status])

  async function handleCancel() {
    if (!runId) return
    setCancelling(true)
    try {
      await api.post(`/runs/${runId}/cancel`)
      fetchRun()
    } catch (e) {
      setError(e)
    } finally {
      setCancelling(false)
    }
  }

  function renderStatusSignal(status: string) {
    const label = vi.runStatus[status] ?? status
    switch (status) {
      case 'succeeded':
        return <Signal tone="pass">{label}</Signal>
      case 'running':
      case 'preparing':
      case 'evaluating':
        return <Signal tone="run">{label}</Signal>
      case 'queued':
        return <Signal tone="neutral">{label}</Signal>
      case 'cancelled':
        return <Signal tone="warn">{label}</Signal>
      case 'failed':
      case 'error':
      case 'timeout':
      default:
        return <Signal tone="critical">{label}</Signal>
    }
  }

  const isActive = data && ['queued', 'preparing', 'running', 'evaluating'].includes(data.status)
  const cases = data?.cases ?? []
  const passedCount = data?.summary?.passed_cases ?? cases.filter((c) => c.status === 'passed').length
  const totalCount = data?.summary?.total_cases ?? cases.length
  const metrics = data?.summary?.metrics ?? {}

  return (
    <div className="page">
      <PageHead code={vi.run.sheetCode} title={vi.run.heading}>
        {isActive && (
          <button
            className="btn btn--ghost"
            onClick={handleCancel}
            disabled={cancelling}
            id="btn-cancel-run"
          >
            <Icon name="close" />
            {cancelling ? vi.run.cancelling : vi.run.cancel}
          </button>
        )}
      </PageHead>

      {error ? <ErrorNote error={error} onRetry={fetchRun} id="run-error" /> : null}
      {loading && !data && <Loading />}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
            <span className="mono sheet-code">{data.id}</span>
            <Link className="go" to={`/submissions/${data.submission_id}`}>
              {vi.run.submission} ({data.submission_id.slice(-8)})
            </Link>
            {data.assignment && (
              <Link className="go" to={`/assignments/${data.assignment.id}`}>
                {data.assignment.title}
              </Link>
            )}
            <span className="annot">Chế độ: {data.mode}</span>
          </div>

          {isActive && (
            <div
              className="status-block"
              style={{ marginBottom: 'var(--space-6)', borderColor: 'var(--amber-stage, #f59e0b)' }}
            >
              <div className="status-block__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="loading__bar" style={{ width: 14, height: 14 }} />
                {vi.runStatus[data.status] ?? data.status}
              </div>
              <div className="status-block__body">{vi.run.runningNotice}</div>
            </div>
          )}

          <div className="stats-row" style={{ marginBottom: 'var(--space-6)' }}>
            <Metric
              id="metric-run-status"
              value={renderStatusSignal(data.status)}
              label={vi.run.status}
            />
            <Metric
              id="metric-run-score"
              value={data.score !== null ? `${Math.round(data.score * 100)}%` : vi.common.none}
              label={vi.run.score}
            />
            <Metric
              id="metric-run-cases"
              value={`${passedCount} / ${totalCount}`}
              label={vi.run.passedCases}
            />
          </div>

          <div className="sub-tabs" style={{ marginBottom: 'var(--space-6)' }}>
            <button
              className={`sub-tab ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
              id="tab-results"
            >
              {vi.run.tabResults} ({cases.length})
            </button>
            <button
              className={`sub-tab ${activeTab === 'metrics' ? 'active' : ''}`}
              onClick={() => setActiveTab('metrics')}
              id="tab-metrics"
            >
              {vi.run.tabMetrics}
            </button>
            <button
              className={`sub-tab ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
              id="tab-logs"
            >
              {vi.run.tabLogs}
            </button>
          </div>

          {activeTab === 'results' && (
            <div className="panel">
              <div className="panel__body">
                {cases.length === 0 ? (
                  <p className="muted">Chưa có kết quả trường hợp kiểm thử nào.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{vi.run.colCase}</th>
                          <th>{vi.run.colStatus}</th>
                          <th>{vi.run.colDuration}</th>
                          <th>{vi.run.colScore}</th>
                          <th>{vi.run.colMessage}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cases.map((t) => {
                          const isExpanded = expandedCase === t.id
                          return (
                            <Fragment key={t.id}>
                              <tr
                                style={{ cursor: 'pointer' }}
                                onClick={() => setExpandedCase(isExpanded ? null : t.id)}
                              >
                                <td className="mono">
                                  <strong>{t.case_key}</strong>
                                </td>
                                <td>
                                  <Signal tone={t.status === 'passed' ? 'pass' : t.status === 'failed' ? 'critical' : 'warn'}>
                                    {t.status === 'passed' ? 'ĐẠT' : t.status === 'failed' ? 'KHÔNG ĐẠT' : t.status}
                                  </Signal>
                                </td>
                                <td className="num">{t.latency_ms !== null ? `${Math.round(t.latency_ms)} ms` : vi.common.none}</td>
                                <td className="num">{t.score !== null ? `${t.score}` : vi.common.none}</td>
                                <td>{t.message ?? vi.common.none}</td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={5} style={{ background: 'var(--paper-deep, #1a1a1a)', padding: 'var(--space-4)' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
                                      {t.input !== undefined && t.input !== null && (
                                        <div>
                                          <div className="section-label">{vi.run.colInput}</div>
                                          <pre className="mono" style={{ fontSize: '0.85em', background: '#000', padding: 8, borderRadius: 4, overflowX: 'auto' }}>
                                            {typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                      {t.output !== undefined && t.output !== null && (
                                        <div>
                                          <div className="section-label">{vi.run.colActual}</div>
                                          <pre className="mono" style={{ fontSize: '0.85em', background: '#000', padding: 8, borderRadius: 4, overflowX: 'auto' }}>
                                            {typeof t.output === 'string' ? t.output : JSON.stringify(t.output, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                      {t.expected !== undefined && t.expected !== null && (
                                        <div>
                                          <div className="section-label">{vi.run.colExpected}</div>
                                          <pre className="mono" style={{ fontSize: '0.85em', background: '#000', padding: 8, borderRadius: 4, overflowX: 'auto' }}>
                                            {typeof t.expected === 'string' ? t.expected : JSON.stringify(t.expected, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="panel">
              <div className="panel__body">
                {Object.keys(metrics).length === 0 ? (
                  <p className="muted">Không có chỉ số đo lường bổ sung.</p>
                ) : (
                  <div className="stats-row">
                    {Object.entries(metrics).map(([k, v]) => (
                      <Metric
                        key={k}
                        value={typeof v === 'number' ? v.toFixed(4) : String(v)}
                        label={k}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <div className="panel">
                <div className="panel__header">
                  <h3 className="panel__title">{vi.run.evaluatorLog}</h3>
                </div>
                <div className="panel__body">
                  <pre
                    className="terminal"
                    style={{
                      maxHeight: 280,
                      overflowY: 'auto',
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--paper-deep, #111)',
                      fontSize: '0.85em',
                    }}
                  >
                    {data.logs?.evaluator || vi.run.noLogs}
                  </pre>
                </div>
              </div>

              <div className="panel">
                <div className="panel__header">
                  <h3 className="panel__title">{vi.run.subjectLog}</h3>
                </div>
                <div className="panel__body">
                  <pre
                    className="terminal"
                    style={{
                      maxHeight: 280,
                      overflowY: 'auto',
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--paper-deep, #111)',
                      fontSize: '0.85em',
                    }}
                  >
                    {data.logs?.subject || vi.run.noLogs}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
