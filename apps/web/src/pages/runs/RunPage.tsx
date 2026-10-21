import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type RunCost, type RunDetailOut } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, Metric, PageHead, RatingControl, Signal, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { FootballPitchSimulator } from '../../features/simulators/FootballPitchSimulator'

export function RunPage() {
  const { runId } = useParams<{ runId: string }>()
  usePageMeta(vi.meta.runTitle, 'Kết quả chạy và đánh giá bài thực hành.')
  const [data, setData] = useState<RunDetailOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [cancelling, setCancelling] = useState(false)
  const [activeTab, setActiveTab] = useState<'results' | 'metrics' | 'logs'>('results')
  const [expandedCase, setExpandedCase] = useState<string | null>(null)
  const [filterClass, setFilterClass] = useState<'ALL' | 'TP' | 'FN' | 'FP' | 'TN'>('ALL')

  const fetchRun = useCallback(async () => {
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
  }, [runId])

  useEffect(() => {
    fetchRun()
  }, [fetchRun])

  // Polling while active
  const status = data?.status
  useEffect(() => {
    if (!status || !['queued', 'preparing', 'running', 'evaluating'].includes(status)) return
    const timer = setInterval(() => {
      fetchRun()
    }, 2000)
    return () => clearInterval(timer)
  }, [status, fetchRun])

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
  const metrics = (data?.summary?.metrics ?? {}) as Record<string, unknown>

  const isCv = data?.plugin?.renderer === 'cv-grid@1' || metrics.business_cost_vnd !== undefined
  const isRag = data?.plugin?.renderer === 'rag-chat@1' || (data?.assignment as { assignment_type?: string } | undefined)?.assignment_type === 'ai.rag-chatbot' || cases.some((c) => Boolean((c.detail as Record<string, unknown> | undefined)?.question) || Boolean((c.input as Record<string, unknown> | undefined)?.question))
  const isFootballHeatmap = data?.plugin?.id?.includes('football-heatmap') || (data?.assignment?.slug?.includes('football-heatmap') ?? false) || metrics.heatmap_correlation !== undefined

  const [evalMap, setEvalMap] = useState<Record<string, { rating: number; feedback: string }>>({})
  const [evalSummary, setEvalSummary] = useState<{ evaluated_count: number; average_rating: number } | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const loadEvaluations = useCallback(async () => {
    if (!runId) return
    try {
      const res = await api.get<{ items: Array<{ case_key: string; rating: number; feedback: string }>; summary: { evaluated_count: number; average_rating: number } }>(`/runs/${runId}/evaluations`)
      const map: Record<string, { rating: number; feedback: string }> = {}
      for (const it of res.items) {
        map[it.case_key] = { rating: it.rating, feedback: it.feedback || '' }
      }
      setEvalMap(map)
      setEvalSummary(res.summary)
    } catch (e) {
      setError(e)
    }
  }, [runId])

  useEffect(() => {
    if (runId && isRag) {
      loadEvaluations()
    }
  }, [runId, isRag, loadEvaluations])

  async function handleSaveEvaluation(caseKey: string) {
    if (!runId) return
    const cur = evalMap[caseKey]
    if (!cur || !cur.rating) return
    setSavingKey(caseKey)
    try {
      await api.post(`/runs/${runId}/evaluations`, {
        case_key: caseKey,
        rating: cur.rating,
        feedback: cur.feedback,
      })
      await loadEvaluations()
    } catch (e) {
      setError(e)
    } finally {
      setSavingKey(null)
    }
  }

  const businessCost = typeof metrics.business_cost_vnd === 'number' ? metrics.business_cost_vnd : null
  const tp = Number(metrics.true_positives ?? 0)
  const fn = Number(metrics.false_negatives ?? 0)
  const fp = Number(metrics.false_positives ?? 0)
  const tn = Number(metrics.true_negatives ?? 0)

  const displayedCases = cases.filter((c) => {
    if (filterClass === 'ALL') return true
    const cls = (c.output as { classification?: string })?.classification ??
      (c.detail as { classification?: string })?.classification
    return cls === filterClass
  })

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
            {data.submission_id && (
              <Link className="go" to={`/submissions/${data.submission_id}`}>
                {vi.run.submission} ({data.submission_id.slice(-8)})
              </Link>
            )}
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

          {/* Business Cost Banner for CV OK/NG */}
          {isCv && businessCost !== null && (
            <div
              className="panel"
              style={{
                marginBottom: 'var(--space-6)',
                borderColor: fn > 0 ? 'var(--signal-critical, #ef4444)' : 'var(--signal-pass, #22c55e)',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
              }}
            >
              <div className="panel__body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                <div>
                  <span className="sheet-code" style={{ color: 'var(--signal-critical)' }}>RỦI RO TÀI CHÍNH DOANH NGHIỆP</span>
                  <h2 style={{ margin: '4px 0', fontSize: 'var(--fs-2xl)', color: fn > 0 ? 'var(--signal-critical)' : 'inherit' }}>
                    {vi.cv.businessCostSub(businessCost.toLocaleString('vi-VN'))}
                  </h2>
                  <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-2)', fontSize: '0.9em', color: 'var(--ink-muted)' }}>
                    <span>{vi.cv.fnCostDesc(fn, (fn * 500000).toLocaleString('vi-VN'))}</span>
                    <span>{vi.cv.fpCostDesc(fp, (fp * 40000).toLocaleString('vi-VN'))}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="annot">Định mức tổn thất</span>
                  <div className="mono" style={{ fontSize: '0.85em' }}>Lọt lỗi: 500.000 đ · Loại nhầm: 40.000 đ</div>
                </div>
              </div>
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
              value={data.score !== null ? `${Math.round(data.score * 100)}%` : (metrics.accuracy !== undefined ? `${Math.round(Number(metrics.accuracy) * 100)}%` : vi.common.none)}
              label={vi.run.score}
            />
            <Metric
              id="metric-run-cases"
              value={`${passedCount} / ${totalCount}`}
              label={vi.run.passedCases}
            />
            {isCv && metrics.recall !== undefined && (
              <Metric
                id="metric-run-recall"
                value={`${Math.round(Number(metrics.recall) * 100)}%`}
                label="Recall (NG)"
              />
            )}
            {isCv && metrics.precision !== undefined && (
              <Metric
                id="metric-run-precision"
                value={`${Math.round(Number(metrics.precision) * 100)}%`}
                label="Precision (NG)"
              />
            )}
          </div>

          {/* Interactive Confusion Matrix for CV OK/NG */}
          {isCv && (
            <div className="panel" style={{ marginBottom: 'var(--space-6)' }}>
              <div className="panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="panel__title">{vi.cv.matrixTitle}</h3>
                {filterClass !== 'ALL' && (
                  <button className="btn btn--sm btn--ghost" onClick={() => setFilterClass('ALL')}>
                    {vi.cv.filterAll}
                  </button>
                )}
              </div>
              <div className="panel__body">
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 'var(--space-3)', alignItems: 'center', textAlign: 'center' }}>
                  <div />
                  <div className="annot mono">{vi.cv.predOk}</div>
                  <div className="annot mono">{vi.cv.predNg}</div>

                  <div className="annot mono" style={{ textAlign: 'right' }}>{vi.cv.actualOk}</div>
                  <div
                    onClick={() => setFilterClass(filterClass === 'TN' ? 'ALL' : 'TN')}
                    style={{
                      padding: 'var(--space-4)',
                      cursor: 'pointer',
                      border: `1px solid ${filterClass === 'TN' ? 'var(--signal-pass)' : 'var(--border-subtle)'}`,
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'bold' }}>{tn}</div>
                    <span className="annot">{vi.cv.tnLabel}</span>
                  </div>
                  <div
                    onClick={() => setFilterClass(filterClass === 'FP' ? 'ALL' : 'FP')}
                    style={{
                      padding: 'var(--space-4)',
                      cursor: 'pointer',
                      border: `1px solid ${filterClass === 'FP' ? 'var(--signal-warn)' : 'var(--border-subtle)'}`,
                      backgroundColor: 'rgba(234, 179, 8, 0.08)',
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'bold', color: 'var(--signal-warn, #eab308)' }}>{fp}</div>
                    <span className="annot">{vi.cv.fpLabel}</span>
                  </div>

                  <div className="annot mono" style={{ textAlign: 'right' }}>{vi.cv.actualNg}</div>
                  <div
                    onClick={() => setFilterClass(filterClass === 'FN' ? 'ALL' : 'FN')}
                    style={{
                      padding: 'var(--space-4)',
                      cursor: 'pointer',
                      border: `2px solid ${filterClass === 'FN' ? 'var(--signal-critical)' : 'rgba(239, 68, 68, 0.5)'}`,
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'bold', color: 'var(--signal-critical, #ef4444)' }}>{fn}</div>
                    <span className="annot" style={{ color: 'var(--signal-critical, #ef4444)' }}>{vi.cv.fnLabel}</span>
                  </div>
                  <div
                    onClick={() => setFilterClass(filterClass === 'TP' ? 'ALL' : 'TP')}
                    style={{
                      padding: 'var(--space-4)',
                      cursor: 'pointer',
                      border: `1px solid ${filterClass === 'TP' ? 'var(--signal-pass)' : 'var(--border-subtle)'}`,
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'bold' }}>{tp}</div>
                    <span className="annot">{vi.cv.tpLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RAG Summary Banner */}
          {isRag && (
            <div
              className="panel"
              style={{
                marginBottom: 'var(--space-6)',
                borderColor: 'var(--amber-stage, #f59e0b)',
                backgroundColor: 'rgba(245, 158, 11, 0.04)',
              }}
            >
              <div className="panel__body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                <div>
                  <span className="sheet-code" style={{ color: 'var(--amber-stage, #f59e0b)' }}>TỔNG HỢP ĐÁNH GIÁ RAG</span>
                  <h2 style={{ margin: '4px 0', fontSize: 'var(--fs-2xl)' }}>
                    {evalSummary?.average_rating ? `${evalSummary.average_rating} ★ / 5.0` : 'Chưa có lượt đánh giá'}
                  </h2>
                  <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-2)', fontSize: '0.9em', color: 'var(--ink-muted)' }}>
                    <span>{vi.rag.evaluatedCount(evalSummary?.evaluated_count || 0, cases.length)}</span>
                    <span>{vi.rag.p50Latency}: {String(metrics.p50_latency_ms ?? 0)} ms</span>
                    <span>{vi.rag.p95Latency}: {String(metrics.p95_latency_ms ?? 0)} ms</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="annot">{vi.rag.budgetStatus}</span>
                  <div className="mono" style={{ fontSize: '0.85em', color: 'var(--signal-pass)' }}>{vi.rag.budgetOk} ($0.50)</div>
                </div>
              </div>
            </div>
          )}

          {/* Football Heatmap 2D Tactical Pitch Simulator */}
          {isFootballHeatmap && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <FootballPitchSimulator
                correlation={Number(metrics.heatmap_correlation ?? 0.88)}
                playersCount={Number(metrics.score ? 19 : 18)}
                testCases={cases.map((c) => ({
                  key: c.case_key,
                  status: c.status === 'passed' ? 'pass' : 'fail',
                  score: c.score ?? 1.0,
                  latency_ms: c.latency_ms ?? 0.5,
                  message: (c.detail as any)?.message ?? (c.message as any) ?? undefined,
                  output: c.output,
                }))}
              />
            </div>
          )}

          <div className="sub-tabs" style={{ marginBottom: 'var(--space-6)' }}>
            <button
              className={`sub-tab ${activeTab === 'results' ? 'active' : ''}`}
              onClick={() => setActiveTab('results')}
              id="tab-results"
            >
              {vi.run.tabResults} ({displayedCases.length})
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
                {displayedCases.length === 0 ? (
                  <p className="muted">Không có kết quả nào phù hợp với bộ lọc.</p>
                ) : isRag ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                    {displayedCases.map((c) => {
                      const q = (c.detail as any)?.question ?? (c.input as any)?.question ?? {}
                      const ans = (c.detail as any)?.answer ?? (c.output as any)?.answer ?? ''
                      const sources = (c.detail as any)?.sources ?? []
                      const notes = (c.detail as any)?.notes ?? (c.input as any)?.notes ?? []
                      const isSaving = savingKey === c.case_key
                      const currentEval = evalMap[c.case_key] || { rating: 0, feedback: '' }

                      return (
                        <div
                          key={c.id}
                          className="panel"
                          style={{
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            overflow: 'hidden',
                          }}
                        >
                          <div className="panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper-recessed)', padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span className="mono font-bold">{c.case_key}</span>
                              <Signal tone={String(c.status) === 'needs_review' ? 'run' : c.status === 'passed' ? 'pass' : 'critical'}>
                                {String(c.status) === 'needs_review' ? 'CHỜ ĐÁNH GIÁ' : c.status}
                              </Signal>
                            </div>
                            <div className="mono text-sm" style={{ color: 'var(--ink-muted)' }}>
                              {c.latency_ms !== null ? `${Math.round(c.latency_ms)} ms` : ''}
                            </div>
                          </div>
                          <div className="panel__body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Question bubble */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                              <span className="badge" style={{ background: 'var(--paper-deep)', color: 'var(--ink-primary)' }}>{vi.rag.userQuestion}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '1.05em', fontWeight: 500 }}>{q.text || ''}</div>
                                {q.images && q.images.length > 0 && (
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    {q.images.map((img: any, idx: number) => (
                                      <div key={idx} style={{ border: '1px solid var(--border-subtle)', padding: 4, borderRadius: 4, background: '#fff' }}>
                                        <img src={`data:${img.mime || 'image/png'};base64,${img.data_base64}`} alt={img.caption || 'Image'} style={{ maxWidth: 120, maxHeight: 120, objectFit: 'contain', display: 'block' }} />
                                        {img.caption && <span className="annot" style={{ display: 'block', fontSize: '0.75em', marginTop: 2 }}>{img.caption}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Critical and info notes */}
                            {notes.map((n: any, idx: number) => (
                              n.severity === 'critical' ? (
                                <div key={idx} style={{ background: 'rgba(239, 68, 68, 0.08)', borderLeft: '4px solid var(--signal-critical, #ef4444)', padding: '8px 12px', borderRadius: 4 }}>
                                  <span style={{ color: 'var(--signal-critical, #ef4444)', fontWeight: 600 }}>⚠️ {vi.rag.criticalRuleTitle}:</span> {n.text}
                                </div>
                              ) : (
                                <div key={idx} style={{ fontStyle: 'italic', fontSize: '0.85em', color: 'var(--ink-muted)' }}>
                                  ℹ️ {n.text}
                                </div>
                              )
                            ))}

                            {/* Answer bubble */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '6px' }}>
                              <span className="badge" style={{ background: 'var(--amber-stage, #f59e0b)', color: '#000' }}>{vi.rag.botAnswer}</span>
                              <div style={{ flex: 1 }}>
                                {ans ? (
                                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, padding: '12px 14px', background: 'var(--paper-recessed)', borderRadius: '6px' }}>
                                    {ans}
                                  </div>
                                ) : (
                                  <div className="annot" style={{ color: 'var(--signal-critical)' }}>{c.message || vi.rag.emptyAnswer}</div>
                                )}

                                {/* Sources */}
                                {sources.length > 0 && (
                                  <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 4, fontSize: '0.85em' }}>
                                    <div className="font-semibold" style={{ marginBottom: 4 }}>{vi.rag.sourcesHeading}:</div>
                                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                                      {sources.map((s: any, sIdx: number) => (
                                        <li key={sIdx}>
                                          <strong>{s.title} ({s.locator})</strong>: <em>{s.snippet}</em>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Self-evaluation rating control */}
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <span className="annot font-semibold">{vi.rag.ratingLabel}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                <RatingControl
                                  id={`rating-${c.case_key}`}
                                  value={currentEval.rating}
                                  onChange={(star) => setEvalMap((prev) => ({ ...prev, [c.case_key]: { rating: star, feedback: prev[c.case_key]?.feedback || '' } }))}
                                />
                                <input
                                  type="text"
                                  className="input"
                                  style={{ flex: 1, minWidth: 220 }}
                                  placeholder={vi.rag.feedbackPlaceholder}
                                  value={currentEval.feedback}
                                  onChange={(e) => setEvalMap((prev) => ({ ...prev, [c.case_key]: { rating: prev[c.case_key]?.rating || 0, feedback: e.target.value } }))}
                                />
                                <button
                                  type="button"
                                  className="btn btn--sm btn--primary"
                                  id={`btn-save-${c.case_key}`}
                                  disabled={isSaving || currentEval.rating === 0}
                                  onClick={() => handleSaveEvaluation(c.case_key)}
                                >
                                  {isSaving ? vi.rag.savingRating : vi.rag.saveRating}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
                        {displayedCases.map((t) => {
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <div className="panel">
                <div className="panel__body">
                  {Object.keys(metrics).length === 0 ? (
                    <p className="muted">{vi.run.noMetrics}</p>
                  ) : (
                    <div className="stats-row">
                      {Object.entries(metrics).map(([k, v]) => (
                        <Metric
                          key={k}
                          value={typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : String(v)}
                          label={k}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <RunCostPanel cost={data.cost ?? null} />
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

          {isCv && (
            <div className="status-block" style={{ marginTop: 'var(--space-6)' }}>
              <div className="status-block__body">{vi.cv.environmentNotice}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const usd = (v: number) => `$${v.toFixed(v >= 0.01 ? 4 : 6)}`

function RunCostPanel({ cost }: { cost: RunCost | null }) {
  const na = vi.run.costNotMeasured
  const num = (v: number | null | undefined, fmt: (n: number) => string) => (v === null || v === undefined ? na : fmt(v))
  return (
    <div className="panel" id="run-cost">
      <div className="panel__header">
        <h3 className="panel__title">{vi.run.costHeading}</h3>
      </div>
      <div className="panel__body">
        {!cost ? (
          <p className="muted">{vi.run.costPending}</p>
        ) : (
          <>
            <div className="stats-row">
              <Metric id="run-cost-total" value={usd(cost.total_cost_usd)} label={vi.run.costTotal} />
              <Metric value={usd(cost.llm_cost_usd)} label={vi.run.costLlm} />
              <Metric value={num(cost.compute_cost_usd, usd)} label={vi.run.costCompute} />
              <Metric value={num(cost.duration_ms, (n) => `${(n / 1000).toFixed(1)} s`)} label={vi.run.costDuration} />
            </div>
            <div className="stats-row" style={{ marginTop: 'var(--space-4)' }}>
              <Metric value={num(cost.cpu_seconds, (n) => n.toFixed(2))} label={vi.run.costCpu} />
              <Metric value={num(cost.reserved_vcpu_seconds, (n) => n.toFixed(1))} label={vi.run.costReserved} />
              <Metric value={num(cost.peak_mem_mb, (n) => `${n.toFixed(0)} MB`)} label={vi.run.costPeakMem} />
              <Metric value={cost.llm_requests} label={vi.run.costLlmRequests} />
              <Metric value={`${cost.llm_tokens_in} / ${cost.llm_tokens_out}`} label={vi.run.costLlmTokens} />
              <Metric value={`${(cost.output_bytes / 1024).toFixed(1)} KB`} label={vi.run.costOutput} />
            </div>
            {!cost.pricing_configured && (
              <p className="muted" style={{ marginTop: 'var(--space-4)' }}>{vi.run.costPricingMissing}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
