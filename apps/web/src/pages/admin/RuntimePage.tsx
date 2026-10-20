import { useState } from 'react'
import { api, type RuntimeStatusOut } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, Metric, PageHead, Signal, formatDateTime, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'

export function RuntimePage() {
  usePageMeta(vi.meta.runtimeTitle, vi.runtime.meta)
  const { data, error, loading, reload } = useAsync(() => api.get<RuntimeStatusOut>('/admin/runtime/status'), [])
  const [reaping, setReaping] = useState(false)
  const [reapMessage, setReapMessage] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<unknown>(null)

  async function handleReap() {
    setReaping(true)
    setActionErr(null)
    setReapMessage(null)
    try {
      const res = await api.post<{ removed: number; stopped: number }>('/admin/runtime/reap')
      setReapMessage(`Đã dọn dẹp: ${res.removed} container đã xóa, ${res.stopped} workspace nhàn rỗi đã dừng.`)
      reload()
    } catch (e) {
      setActionErr(e)
    } finally {
      setReaping(false)
    }
  }

  const h = data?.health
  const containers = data?.containers ?? []

  return (
    <div className="page">
      <PageHead code={vi.runtime.sheetCode} title={vi.runtime.heading}>
        <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
          <button className="btn btn--ghost" onClick={() => reload()} disabled={loading} id="btn-runtime-refresh">
            <Icon name="refresh" />
            {vi.runtime.refresh}
          </button>
          <button className="btn" onClick={handleReap} disabled={reaping || loading} id="btn-runtime-reap">
            <Icon name="trash" />
            {reaping ? vi.runtime.reaping : vi.runtime.reap}
          </button>
        </div>
      </PageHead>

      <p className="muted" style={{ marginBottom: 'var(--space-6)' }}>{vi.runtime.meta}</p>

      {reapMessage && (
        <div className="mart__err" style={{ borderColor: 'var(--signal-pass)', color: 'var(--signal-pass)', marginBottom: 'var(--space-4)' }}>
          {reapMessage}
        </div>
      )}
      {actionErr ? <ErrorNote error={actionErr} id="runtime-action-error" /> : null}
      {loading && <Loading />}
      {error ? <ErrorNote error={error} onRetry={reload} id="runtime-error" /> : null}

      {h && (
        <div className="stats-row" style={{ marginBottom: 'var(--space-6)' }}>
          <Metric
            id="metric-runner-status"
            value={<Signal tone={h.ok ? 'pass' : 'critical'}>{h.ok ? 'Đang chạy' : 'Mất kết nối'}</Signal>}
            label={vi.runtime.health}
          />
          <Metric
            id="metric-runner-engine"
            value={h.engine ?? vi.common.none}
            label={vi.runtime.engine}
          />
          <Metric
            id="metric-runner-isolation"
            value={h.isolation?.runtime ?? 'runc'}
            label={vi.runtime.isolation}
          />
          <Metric
            id="metric-container-count"
            value={containers.length}
            label="Container quản lý"
          />
        </div>
      )}

      <div className="panel">
        <div className="panel__header">
          <h2 className="panel__title">{vi.runtime.containersHeading}</h2>
        </div>
        <div className="panel__body">
          {containers.length === 0 ? (
            <p className="muted" id="containers-empty">{vi.runtime.emptyContainers}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{vi.runtime.colId}</th>
                    <th>{vi.runtime.colName}</th>
                    <th>{vi.runtime.colImage}</th>
                    <th>{vi.runtime.colStatus}</th>
                    <th>{vi.runtime.colCreated}</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.id}</td>
                      <td><strong>{c.name}</strong></td>
                      <td className="mono" style={{ fontSize: '0.85em' }}>{c.image}</td>
                      <td>
                        <Signal tone={c.status === 'running' ? 'pass' : 'neutral'}>
                          {c.status}
                        </Signal>
                      </td>
                      <td className="num">{c.created ? formatDateTime(c.created) : vi.common.none}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
