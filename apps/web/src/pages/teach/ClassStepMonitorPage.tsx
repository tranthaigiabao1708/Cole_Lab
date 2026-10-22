import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../core/api'
import { ErrorNote, Loading, PageHead, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'

interface StepDetail {
  step_id: string
  title: string
  status: 'passed' | 'in_progress' | 'not_started'
  hints_unlocked_level: number
  time_spent_seconds: number
}

interface LearnerProgress {
  workspace_id: string
  user_id: string
  user_name: string
  email: string
  last_active_at: string | null
  steps: StepDetail[]
  passed_count: number
  total_count: number
}

interface ClassProgressData {
  assignment_id: string
  title: string
  rubric_steps: any[]
  learners: LearnerProgress[]
  total_learners: number
}

export function ClassStepMonitorPage() {
  const { assignmentId = '' } = useParams()
  usePageMeta('Theo dõi Thực hành Lớp học', 'Bảng điều khiển giám sát tiến độ thực hành theo từng bước của học viên')

  const [data, setData] = useState<ClassProgressData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [filterStuckOnly, setFilterStuckOnly] = useState(false)
  const [selectedLearner, setSelectedLearner] = useState<LearnerProgress | null>(null)

  const loadData = () => {
    setLoading(true)
    setError(null)
    api
      .get<ClassProgressData>(`/teach/assignments/${assignmentId}/class-progress`)
      .then((res) => {
        setData(res)
        setSelectedLearner(res.learners[0] || null)
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
    const timer = setInterval(() => {
      api
        .get<ClassProgressData>(`/teach/assignments/${assignmentId}/class-progress`)
        .then((res) => setData(res))
        .catch(() => undefined)
    }, 10000)
    return () => clearInterval(timer)
  }, [assignmentId])

  if (loading && !data) {
    return (
      <div className="page" style={{ maxWidth: 1180, margin: '0 auto' }}>
        <Loading />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="page" style={{ maxWidth: 1180, margin: '0 auto' }}>
        <ErrorNote error={error} onRetry={loadData} />
      </div>
    )
  }

  const learners = data?.learners || []
  const rubricSteps = data?.rubric_steps || []

  // Check if learner is stuck: in_progress on a step with level 3 hint unlocked or spent > 600s
  const isLearnerStuck = (l: LearnerProgress) =>
    l.steps.some((s) => s.status !== 'passed' && (s.hints_unlocked_level >= 2 || s.time_spent_seconds > 600))

  const displayedLearners = filterStuckOnly ? learners.filter(isLearnerStuck) : learners

  // Calculate step statistics
  const stepStats = rubricSteps.map((_, idx) => {
    const passedCount = learners.filter((l) => l.steps[idx]?.status === 'passed').length
    const inProgressCount = learners.filter((l) => l.steps[idx]?.status === 'in_progress').length
    const pct = learners.length > 0 ? Math.round((passedCount / learners.length) * 100) : 0
    return { passedCount, inProgressCount, pct }
  })

  return (
    <div className="page" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <PageHead code="TEACH · LIVE MONITOR" title={`Giám sát Tiến độ: ${data?.title || 'Bài Lab'}`}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn--sm btn--ghost" onClick={loadData}>
            <Icon name="refresh" size={14} /> Làm mới
          </button>
          <Link to={`/assignments/${assignmentId}`} className="btn btn--sm btn--ghost">
            Xem đề bài <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      </PageHead>

      {/* SUMMARY STATS TILES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--paper-100)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--paper-300)' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink-500)', textTransform: 'uppercase', fontWeight: 600 }}>
            Tổng số học viên tham gia
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: 'var(--ink-900)' }}>
            {learners.length} học viên
          </div>
        </div>

        <div style={{ background: 'var(--paper-100)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--paper-300)' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink-500)', textTransform: 'uppercase', fontWeight: 600 }}>
            Học viên hoàn thành 100%
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#10b981' }}>
            {learners.filter((l) => l.passed_count === l.total_count && l.total_count > 0).length} / {learners.length}
          </div>
        </div>

        <div style={{ background: 'var(--paper-100)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--paper-300)' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink-500)', textTransform: 'uppercase', fontWeight: 600 }}>
            Học viên cần trợ giúp / Đang kẹt
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#ef4444' }}>
            {learners.filter(isLearnerStuck).length} học viên
          </div>
        </div>

        <div style={{ background: 'var(--paper-100)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--paper-300)' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink-500)', textTransform: 'uppercase', fontWeight: 600 }}>
            Số bước trong kịch bản
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#6366f1' }}>
            {rubricSteps.length} bước tiêu chuẩn
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className={`btn btn--sm ${!filterStuckOnly ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setFilterStuckOnly(false)}
          >
            Tất cả học viên ({learners.length})
          </button>
          <button
            className={`btn btn--sm ${filterStuckOnly ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setFilterStuckOnly(true)}
            style={{ color: filterStuckOnly ? undefined : '#ef4444' }}
          >
            ⚠️ Đang kẹt cần can thiệp ({learners.filter(isLearnerStuck).length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--ink-500)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} /> Đã đạt
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} /> Đang làm
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#9ca3af' }} /> Chưa bắt đầu
          </span>
        </div>
      </div>

      {/* HEATMAP PROGRESS MATRIX */}
      <div className="panel" style={{ overflowX: 'auto', marginBottom: '24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--paper-200)', borderBottom: '2px solid var(--paper-300)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', minWidth: '180px' }}>Học viên</th>
              <th style={{ padding: '12px 10px', textAlign: 'center', width: '90px' }}>Tiến độ</th>
              {rubricSteps.map((s, idx) => (
                <th key={idx} style={{ padding: '12px 10px', textAlign: 'center', minWidth: '110px' }}>
                  <div style={{ fontWeight: 600, fontSize: '12px' }}>B{idx + 1}</div>
                  <div style={{ fontSize: '10px', color: 'var(--ink-500)', fontWeight: 'normal' }}>
                    {s.title?.slice(0, 16)}...
                  </div>
                  <div style={{ fontSize: '10px', color: '#10b981', marginTop: '2px' }}>
                    {stepStats[idx]?.pct}% đạt
                  </div>
                </th>
              ))}
              <th style={{ padding: '12px 16px', textAlign: 'right', width: '110px' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {displayedLearners.length === 0 ? (
              <tr>
                <td colSpan={rubricSteps.length + 3} style={{ textAlign: 'center', padding: '32px', color: 'var(--ink-400)' }}>
                  Không có học viên nào trong danh sách lọc.
                </td>
              </tr>
            ) : (
              displayedLearners.map((l) => {
                const isSelected = selectedLearner?.workspace_id === l.workspace_id
                const pct = l.total_count > 0 ? Math.round((l.passed_count / l.total_count) * 100) : 0
                const isStuck = isLearnerStuck(l)

                return (
                  <tr
                    key={l.workspace_id}
                    onClick={() => setSelectedLearner(l)}
                    style={{
                      borderBottom: '1px solid var(--paper-200)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{l.user_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-500)' }}>{l.email}</div>
                    </td>

                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '12px',
                          color: pct === 100 ? '#10b981' : isStuck ? '#ef4444' : '#6366f1',
                        }}
                      >
                        {pct}%
                      </span>
                    </td>

                    {rubricSteps.map((_, idx) => {
                      const step = l.steps[idx]
                      const isPassed = step?.status === 'passed'
                      const isInProgress = step?.status === 'in_progress'
                      const hintsLevel = step?.hints_unlocked_level || 0

                      return (
                        <td key={idx} style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '42px',
                              height: '42px',
                              borderRadius: '8px',
                              background: isPassed
                                ? 'rgba(16, 185, 129, 0.15)'
                                : isInProgress
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(156, 163, 175, 0.1)',
                              border: isPassed
                                ? '1.5px solid #10b981'
                                : isInProgress
                                ? '1.5px solid #f59e0b'
                                : '1px solid #d1d5db',
                              color: isPassed ? '#10b981' : isInProgress ? '#d97706' : '#9ca3af',
                              fontWeight: 700,
                              fontSize: '13px',
                            }}
                            title={`Bước ${idx + 1}: ${step?.title} - ${step?.status || 'not_started'} · Mở gợi ý: L${hintsLevel}/3`}
                          >
                            <span>{isPassed ? '✓' : isInProgress ? '⚡' : '○'}</span>
                            {hintsLevel > 0 && (
                              <span style={{ fontSize: '9px', fontWeight: 600, opacity: 0.85 }}>
                                L{hintsLevel}
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}

                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Link
                        to={`/workspace/${l.workspace_id}`}
                        className="btn btn--sm btn--ghost"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        title="Mở workspace học viên để xem code và trợ giúp"
                      >
                        Vào Workspace
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* SELECTED LEARNER DETAIL PANEL */}
      {selectedLearner && (
        <div className="panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                Chi tiết tiến độ: {selectedLearner.user_name} ({selectedLearner.email})
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--ink-500)', marginTop: '2px' }}>
                Hoàn thành: {selectedLearner.passed_count}/{selectedLearner.total_count} bước · Hoạt động lần cuối:{' '}
                {selectedLearner.last_active_at ? new Date(selectedLearner.last_active_at).toLocaleTimeString() : 'N/A'}
              </div>
            </div>

            <Link to={`/workspace/${selectedLearner.workspace_id}`} className="btn btn--ember btn--sm">
              Mở Workspace hỗ trợ ngay <Icon name="arrowRight" size={13} />
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {selectedLearner.steps.map((st, i) => (
              <div
                key={st.step_id}
                style={{
                  background: 'var(--paper-100)',
                  border: st.status === 'passed' ? '1px solid #10b981' : '1px solid var(--paper-300)',
                  borderRadius: '6px',
                  padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '13px' }}>B{i + 1}: {st.title}</strong>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: st.status === 'passed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: st.status === 'passed' ? '#10b981' : '#d97706',
                    }}
                  >
                    {st.status === 'passed' ? 'Đã đạt' : st.status === 'in_progress' ? 'Đang làm' : 'Chưa bắt đầu'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--ink-600)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Mức gợi ý đã mở: <strong>Level {st.hints_unlocked_level}/3</strong></span>
                  {st.time_spent_seconds > 0 && <span>Thời gian: {Math.round(st.time_spent_seconds / 60)} phút</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
