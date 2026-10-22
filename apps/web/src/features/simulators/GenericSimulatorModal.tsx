import { Icon } from '../../core/design-system/icons'

interface GenericSimulatorModalProps {
  pluginId?: string
  assignmentTitle?: string
  testCases?: Array<{
    key: string
    status: 'pass' | 'fail'
    score?: number
    latency_ms?: number
    message?: string
  }>
  onClose: () => void
  onSubmitOfficial: () => Promise<void>
  isSubmitting?: boolean
}

export function GenericSimulatorModal({
  pluginId = 'custom',
  assignmentTitle = 'Đồ án Thực hành',
  testCases = [
    { key: 'case_001_smoke_test', status: 'pass', score: 1.0, latency_ms: 12 },
    { key: 'case_002_boundary_condition', status: 'pass', score: 1.0, latency_ms: 15 },
    { key: 'case_003_stress_benchmark', status: 'pass', score: 1.0, latency_ms: 22 },
    { key: 'case_004_hidden_evaluation', status: 'pass', score: 1.0, latency_ms: 18 },
  ],
  onClose,
  onSubmitOfficial,
  isSubmitting = false,
}: GenericSimulatorModalProps) {
  const passedCount = testCases.filter((c) => c.status === 'pass').length
  const totalCount = testCases.length
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '85vh',
          background: '#11161d',
          border: '1px solid #303e4d',
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #283340',
            background: 'linear-gradient(90deg, #182230 0%, #11161d 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '16px',
              }}
            >
              ⚡
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#f3f4f6', fontWeight: 600 }}>
                Giả lập Kiểm định Tự động: {assignmentTitle}
              </h2>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                Simulator Plugin ID: <code>{pluginId}</code> · Môi trường cô lập Docker Container
              </div>
            </div>
          </div>

          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: '#9ca3af' }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* METRICS HEADER */}
        <div
          style={{
            padding: '12px 20px',
            background: '#0d1117',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', gap: '20px' }}>
            <span>
              Tỷ lệ vượt qua: <strong style={{ color: '#34d399' }}>{passedCount}/{totalCount} ({passRate}%)</strong>
            </span>
            <span>
              Điểm tổng kết: <strong style={{ color: '#60a5fa' }}>{passRate}/100</strong>
            </span>
          </div>

          <button
            className="btn btn--ember btn--sm"
            onClick={onSubmitOfficial}
            disabled={isSubmitting}
            style={{ fontWeight: 600 }}
          >
            {isSubmitting ? 'Đang nộp bài...' : 'Nộp bài chính thức'}
          </button>
        </div>

        {/* TEST CASES TABLE */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>
            Kết quả chi tiết từng Test Case
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {testCases.map((c) => {
              const isP = c.status === 'pass'
              return (
                <div
                  key={c.key}
                  style={{
                    background: '#161f2c',
                    border: '1px solid #253342',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: isP ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: isP ? '#34d399' : '#f87171',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    >
                      {isP ? '✓' : '✕'}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#e5e7eb' }}>{c.key}</div>
                      {c.message && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{c.message}</div>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
                    {c.latency_ms !== undefined && (
                      <span style={{ color: '#9ca3af' }}>{c.latency_ms} ms</span>
                    )}
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        background: isP ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isP ? '#34d399' : '#f87171',
                      }}
                    >
                      {isP ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
