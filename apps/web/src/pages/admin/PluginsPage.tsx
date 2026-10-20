import { useState } from 'react'
import { api, type PluginVersionOut, type SimulatorPluginOut } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, PageHead, Signal, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'

export function PluginsPage() {
  usePageMeta(vi.meta.pluginsTitle, vi.plugins.meta)
  const { data, error, loading, reload } = useAsync(() => api.get<SimulatorPluginOut[]>('/admin/plugins'), [])
  const [scanning, setScanning] = useState(false)
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<unknown>(null)
  const [openLogId, setOpenLogId] = useState<string | null>(null)

  async function handleScan() {
    setScanning(true)
    setActionErr(null)
    try {
      await api.post('/admin/plugins/scan')
      reload()
    } catch (e) {
      setActionErr(e)
    } finally {
      setScanning(false)
    }
  }

  async function handleBuild(pv: PluginVersionOut) {
    setBuildingId(pv.id)
    setActionErr(null)
    try {
      await api.post(`/admin/plugins/${pv.id}/build`)
      reload()
    } catch (e) {
      setActionErr(e)
    } finally {
      setBuildingId(null)
    }
  }

  async function handleToggle(pv: PluginVersionOut) {
    setTogglingId(pv.id)
    setActionErr(null)
    try {
      await api.post(`/admin/plugins/${pv.id}/toggle`, { enabled: !pv.enabled })
      reload()
    } catch (e) {
      setActionErr(e)
    } finally {
      setTogglingId(null)
    }
  }

  function renderStatusSignal(status: string) {
    const label = vi.plugins.statuses[status] ?? status
    switch (status) {
      case 'ready':
        return <Signal tone="pass">{label}</Signal>
      case 'building':
        return <Signal tone="run">{label}</Signal>
      case 'disabled':
        return <Signal tone="warn">{label}</Signal>
      case 'build_failed':
        return <Signal tone="critical">{label}</Signal>
      default:
        return <Signal tone="neutral">{label}</Signal>
    }
  }

  return (
    <div className="page">
      <PageHead code={vi.plugins.sheetCode} title={vi.plugins.heading}>
        <button
          className="btn"
          id="btn-scan-plugins"
          onClick={handleScan}
          disabled={scanning || loading}
        >
          <Icon name="refresh" />
          {scanning ? vi.plugins.scanning : vi.plugins.scan}
        </button>
      </PageHead>

      <p className="muted" style={{ marginBottom: 'var(--space-6)' }}>{vi.plugins.meta}</p>

      {actionErr ? <ErrorNote error={actionErr} id="plugin-action-error" /> : null}
      {loading && <Loading />}
      {error ? <ErrorNote error={error} onRetry={reload} id="plugins-error" /> : null}

      {data && data.length === 0 && (
        <p className="muted" id="plugins-empty">{vi.plugins.empty}</p>
      )}

      {data && data.map((plugin) => (
        <div key={plugin.id} className="panel" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="panel__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h2 className="panel__title" style={{ display: 'inline', marginRight: 'var(--space-3)' }}>{plugin.name}</h2>
              <code className="sheet-code">{plugin.slug}</code>
            </div>
            {plugin.author && <span className="annot">{plugin.author}</span>}
          </div>

          <div className="panel__body">
            {plugin.description && (
              <p style={{ marginTop: 0, marginBottom: 'var(--space-4)', color: 'var(--ink-muted)' }}>
                {plugin.description}
              </p>
            )}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{vi.plugins.version}</th>
                    <th>{vi.plugins.contract}</th>
                    <th>{vi.plugins.renderer}</th>
                    <th>{vi.plugins.image}</th>
                    <th>{vi.plugins.status}</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {plugin.versions.map((v) => {
                    const isBuilding = buildingId === v.id
                    const isToggling = togglingId === v.id
                    return (
                      <tr key={v.id}>
                        <td>
                          <strong>{v.version}</strong>
                          {v.enabled ? null : <span className="annot" style={{ marginLeft: 6, color: 'var(--ink-muted)' }}>({vi.plugins.statuses.disabled})</span>}
                        </td>
                        <td className="mono">{v.contract}</td>
                        <td className="mono">{v.renderer}</td>
                        <td className="mono" style={{ fontSize: '0.85em' }}>{v.image}</td>
                        <td>{renderStatusSignal(v.status)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                            <button
                              className="btn btn--sm btn--ghost"
                              id={`btn-build-${plugin.slug}-${v.version}`}
                              onClick={() => handleBuild(v)}
                              disabled={isBuilding || v.status === 'building'}
                            >
                              <Icon name="play" size={14} />
                              {isBuilding ? vi.plugins.building : vi.plugins.build}
                            </button>
                            <button
                              className="btn btn--sm btn--ghost"
                              id={`btn-toggle-${plugin.slug}-${v.version}`}
                              onClick={() => handleToggle(v)}
                              disabled={isToggling}
                            >
                              {v.enabled ? vi.plugins.disable : vi.plugins.enable}
                            </button>
                            {v.build_log && (
                              <button
                                className="btn btn--sm btn--ghost"
                                onClick={() => setOpenLogId(openLogId === v.id ? null : v.id)}
                              >
                                Log
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {plugin.versions.map((v) =>
              openLogId === v.id && v.build_log ? (
                <div key={`log-${v.id}`} style={{ marginTop: 'var(--space-4)' }}>
                  <div className="section-label">Build Log: {v.version}</div>
                  <pre
                    className="terminal"
                    style={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      padding: 'var(--space-3)',
                      fontSize: '0.8em',
                      backgroundColor: 'var(--paper-deep, #111)',
                    }}
                  >
                    {v.build_log}
                  </pre>
                </div>
              ) : null
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
