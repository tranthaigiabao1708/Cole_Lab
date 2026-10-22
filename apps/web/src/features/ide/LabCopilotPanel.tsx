import { useEffect, useState } from 'react'
import { api } from '../../core/api'
import { Icon } from '../../core/design-system/icons'
import type { QualityMission } from './AiQualityGateBar'

interface LabCopilotPanelProps {
  onClose: () => void
  workspaceId: string
  missions: QualityMission[]
  initialMissionId?: string | null
  currentAccuracy?: number
  currentLatencyMs?: number
  pluginId?: string
  tree?: Array<{ path: string; type: string }>
  activeFilePath?: string | null
  currentCode?: string
  onOpenFile?: (path: string) => void
  onReloadTree?: () => Promise<void> | void
  onApplyFix?: (missionId: string, targetFile?: string, code?: string) => Promise<void>
}

// Dữ liệu mô phỏng quá trình huấn luyện 30 Epochs
const TRAINING_HISTORY = [
  { epoch: 1, trainLoss: 2.85, valLoss: 2.92, map50: 0.22 },
  { epoch: 3, trainLoss: 2.1, valLoss: 2.25, map50: 0.38 },
  { epoch: 5, trainLoss: 1.62, valLoss: 1.78, map50: 0.52 },
  { epoch: 8, trainLoss: 1.15, valLoss: 1.35, map50: 0.65 },
  { epoch: 10, trainLoss: 0.88, valLoss: 1.12, map50: 0.72 },
  { epoch: 13, trainLoss: 0.65, valLoss: 0.98, map50: 0.79 },
  { epoch: 15, trainLoss: 0.52, valLoss: 0.95, map50: 0.83 }, // Optimal point
  { epoch: 18, trainLoss: 0.41, valLoss: 0.99, map50: 0.85 },
  { epoch: 20, trainLoss: 0.32, valLoss: 1.15, map50: 0.86 }, // Overfitting starts
  { epoch: 23, trainLoss: 0.25, valLoss: 1.38, map50: 0.86 },
  { epoch: 26, trainLoss: 0.18, valLoss: 1.65, map50: 0.85 },
  { epoch: 30, trainLoss: 0.12, valLoss: 1.95, map50: 0.84 },
]

export function LabCopilotPanel({
  onClose,
  workspaceId,
  missions = [],
  initialMissionId = null,
  currentAccuracy = 1.0,
  currentLatencyMs = 0.5,
  pluginId,
  tree = [],
  activeFilePath,
  currentCode = '',
  onOpenFile,
  onReloadTree,
  onApplyFix,
}: LabCopilotPanelProps) {
  const [activeTab, setActiveTab] = useState<'steps' | 'playbook' | 'curves' | 'preprocessing'>('steps')
  const [selectedMissionId, setSelectedMissionId] = useState<string>(
    initialMissionId || (missions[0]?.id ?? ''),
  )
  const [unlockedLevels, setUnlockedLevels] = useState<Record<string, number>>({})
  const [applying, setApplying] = useState(false)
  const [scaffolding, setScaffolding] = useState(false)
  const [scaffoldMsg, setScaffoldMsg] = useState<string | null>(null)

  // AI Tutor chat states
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'ai' | 'user'; content: string; time: string }>>([
    {
      role: 'ai',
      content: '👋 **Chào bạn!** Tôi là Trợ giảng AI đồng hành. Tôi sẽ theo sát các bước và mã nguồn của bạn theo đúng quy trình giáo viên đã đề ra. Bạn cần hỗ trợ gì ở bước này?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState<
    'none' | 'grayscale' | 'bg_removal' | 'gradient' | 'clahe' | 'letterbox'
  >('clahe')
  const [hoveredEpoch, setHoveredEpoch] = useState<number | null>(15)

  const handleScaffold = async (files: string[]) => {
    setScaffolding(true)
    setScaffoldMsg(null)
    try {
      const res = await api.post<{ created: string[] }>(`/workspaces/${workspaceId}/scaffold`, { files })
      await onReloadTree?.()
      setScaffoldMsg(`Đã tạo thành công ${res.created.length} tệp/thư mục!`)
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: `✅ **Đã hoàn thành Bước 0!** Cấu trúc thư mục đã được khởi tạo (${res.created.join(', ')}). Bây giờ bạn hãy mở danh sách bước và chuyển sang **Việc 1** để bắt đầu viết logic nhé!`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } catch (err: any) {
      setScaffoldMsg('Lỗi khởi tạo: ' + (err?.message || 'Không thể tạo tệp'))
    } finally {
      setScaffolding(false)
    }
  }

  const handleSendChat = async (questionText?: string) => {
    const q = (questionText || chatInput).trim()
    if (!q || chatLoading) return
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const userMsg = { role: 'user' as const, content: q, time: now }
    setChatMessages((prev) => [...prev, userMsg])
    if (!questionText) setChatInput('')
    setChatLoading(true)

    try {
      const treeList = tree.map((t) => t.path)
      const res = await api.post<{ reply: string }>(`/workspaces/${workspaceId}/ai-tutor`, {
        step_id: selectedMission?.id || 'step_0_scaffold',
        question: q,
        active_file: activeFilePath,
        current_code: currentCode,
        tree_files: treeList,
      })
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: res.reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: '⚠️ Không thể kết nối với dịch vụ Trợ giảng AI. Bạn hãy tiếp tục theo dõi các gợi ý Level 1/2/3 bên trên nhé.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  // Load backend unlocked hint levels
  useEffect(() => {
    if (!workspaceId) return
    api
      .get<Array<{ step_id: string; hints_unlocked_level: number }>>(`/workspaces/${workspaceId}/steps`)
      .then((res) => {
        if (Array.isArray(res)) {
          const map: Record<string, number> = {}
          res.forEach((r) => {
            map[r.step_id] = r.hints_unlocked_level
          })
          setUnlockedLevels((prev) => ({ ...prev, ...map }))
        }
      })
      .catch(() => undefined)
  }, [workspaceId])

  useEffect(() => {
    if (initialMissionId) {
      setSelectedMissionId(initialMissionId)
      setActiveTab('steps')
    }
  }, [initialMissionId])

  const selectedMission =
    missions.find((m) => m.id === selectedMissionId) || missions[0] || null

  const handleUnlockHint = async (stepId: string, level: number) => {
    setUnlockedLevels((prev) => ({
      ...prev,
      [stepId]: Math.max(prev[stepId] || 1, level),
    }))
    try {
      await api.post(`/workspaces/${workspaceId}/steps/${stepId}/unlock-hint`, { level })
    } catch {
      // Non-blocking
    }
  }

  // SVG Chart Dimensions
  const chartW = 540
  const chartH = 220
  const padX = 40
  const padY = 30

  function xCoord(epoch: number) {
    return padX + ((epoch - 1) / 29) * (chartW - 2 * padX)
  }

  function yLoss(loss: number) {
    return chartH - padY - (loss / 3.2) * (chartH - 2 * padY)
  }

  function yMap(map: number) {
    return chartH - padY - map * (chartH - 2 * padY)
  }

  const trainLossPath = TRAINING_HISTORY.map(
    (d, i) => `${i === 0 ? 'M' : 'L'} ${xCoord(d.epoch)} ${yLoss(d.trainLoss)}`,
  ).join(' ')
  const valLossPath = TRAINING_HISTORY.map(
    (d, i) => `${i === 0 ? 'M' : 'L'} ${xCoord(d.epoch)} ${yLoss(d.valLoss)}`,
  ).join(' ')
  const mapPath = TRAINING_HISTORY.map(
    (d, i) => `${i === 0 ? 'M' : 'L'} ${xCoord(d.epoch)} ${yMap(d.map50)}`,
  ).join(' ')

  const selectedData =
    TRAINING_HISTORY.find((d) => d.epoch === hoveredEpoch) || TRAINING_HISTORY[6]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1120px',
          background: '#13181e',
          border: '1px solid #374151',
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid #2d3748',
            background: 'linear-gradient(to right, #1a222c, #13181e)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)',
              }}
            >
              <Icon name="terminal" size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f3f4f6' }}>
                  Cố vấn Thực hành & Gợi ý Thông minh (Lab Step Mentor)
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    fontWeight: 600,
                  }}
                >
                  TEACHER HINTS · 3 LEVELS
                </span>
                {pluginId && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#93c5fd',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      fontWeight: 600,
                    }}
                  >
                    {pluginId}
                  </span>
                )}
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontWeight: 600,
                  }}
                >
                  Score: {Math.round(currentAccuracy * 100)}% · Latency: {currentLatencyMs}ms
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                Theo dõi tiến độ thực hành theo từng bước do giảng viên thiết lập và nhận gợi ý lũy tiến
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn--ghost btn--sm"
            style={{ color: '#9ca3af', padding: '6px 10px' }}
            title="Đóng trợ lý"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            background: '#0f141a',
            borderBottom: '1px solid #2d3748',
          }}
        >
          <button
            className={`btn btn--sm ${activeTab === 'steps' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setActiveTab('steps')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🎯</span>
            <span>Hướng dẫn & Gợi ý từng bước (Step Mentor)</span>
          </button>
          <button
            className={`btn btn--sm ${activeTab === 'playbook' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setActiveTab('playbook')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🩺</span>
            <span>Playbook Chẩn đoán Tình huống Thực tế</span>
          </button>
          <button
            className={`btn btn--sm ${activeTab === 'curves' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setActiveTab('curves')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>📈</span>
            <span>Biểu đồ Train / Loss & Overfitting</span>
          </button>
          <button
            className={`btn btn--sm ${activeTab === 'preprocessing' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setActiveTab('preprocessing')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🖼️</span>
            <span>Studio Tiền xử lý Trực quan</span>
          </button>
        </div>

        {/* BODY CONTENT */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, background: '#11161d' }}>
          {/* TAB 1: STEP-BY-STEP MENTOR */}
          {activeTab === 'steps' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
              {/* CỘT TRÁI: DANH SÁCH BƯỚC */}
              <div
                style={{
                  background: '#161d26',
                  borderRadius: '10px',
                  border: '1px solid #303e4d',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Lộ trình bài thực hành
                </div>

                {missions.map((m) => {
                  const isSelected = m.id === selectedMission?.id
                  const isPassed = m.status === 'passed'
                  const isWarning = m.status === 'warning'
                  const currentLevel = unlockedLevels[m.id] || 1

                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMissionId(m.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: isSelected
                          ? '1.5px solid #6366f1'
                          : isPassed
                          ? '1px solid rgba(16, 185, 129, 0.4)'
                          : '1px solid #283340',
                        background: isSelected
                          ? 'rgba(99, 102, 241, 0.15)'
                          : isPassed
                          ? 'rgba(16, 185, 129, 0.05)'
                          : '#121820',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: isPassed ? '#34d399' : isWarning ? '#fbbf24' : '#f87171',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>{isPassed ? '✓' : isWarning ? '⚡' : '○'}</span>
                          <span>Bước {m.stepNumber}</span>
                        </span>

                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#232f3e',
                            color: '#93c5fd',
                          }}
                        >
                          {m.toolName}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f3f4f6' }}>
                        {m.shortLabel || m.title}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                        <span>
                          {isPassed ? 'Đã đạt tiêu chuẩn' : isWarning ? 'Đang hoàn thiện' : 'Chưa hoàn thành'}
                        </span>
                        <span>Gợi ý: L{currentLevel}/3</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* CỘT PHẢI: CHI TIẾT BƯỚC ĐƯỢC CHỌN & TRỢ GIẢNG AI */}
              {selectedMission ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* NẾU LÀ BƯỚC 0: THIẾT LẬP CẤU TRÚC THƯ MỤC DỰ ÁN */}
                  {selectedMission.id === 'step_0_scaffold' ? (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, #1a2230 0%, #121822 100%)',
                        border: '1px solid #3b82f6',
                        borderRadius: '10px',
                        padding: '18px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: selectedMission.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                            color: selectedMission.status === 'passed' ? '#34d399' : '#facc15',
                            border: `1px solid ${selectedMission.status === 'passed' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                          }}
                        >
                          {selectedMission.status === 'passed' ? '✓ CẤU TRÚC ĐẦY ĐỦ' : '○ CHƯA HOÀN THÀNH CẤU TRÚC'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#93c5fd' }}>
                          Khởi đầu theo quy chuẩn giáo viên
                        </span>
                      </div>

                      <h3 style={{ margin: 0, fontSize: '17px', color: '#f3f4f6', fontWeight: 600 }}>
                        {selectedMission.title}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                        {selectedMission.description}
                      </p>

                      {/* DANH SÁCH TỆP & TRẠNG THÁI THỜI GIAN THỰC */}
                      <div style={{ background: '#0d1218', borderRadius: '8px', padding: '12px', border: '1px solid #232d3b' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                          Checklist các tệp/thư mục cần chuẩn bị:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {(selectedMission.requiredFiles || []).map((file) => {
                            const exists = tree.some((t) => t.path === file || t.path.endsWith(file))
                            return (
                              <div
                                key={file}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '6px 10px',
                                  background: exists ? 'rgba(16, 185, 129, 0.08)' : 'rgba(234, 179, 8, 0.08)',
                                  borderRadius: '6px',
                                  border: `1px solid ${exists ? 'rgba(16, 185, 129, 0.25)' : 'rgba(234, 179, 8, 0.25)'}`,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ color: exists ? '#34d399' : '#facc15', fontWeight: 700 }}>
                                    {exists ? '✓' : '○'}
                                  </span>
                                  <code style={{ fontSize: '12px', color: exists ? '#a7f3d0' : '#fef08a' }}>{file}</code>
                                </div>
                                {exists && onOpenFile && (
                                  <button
                                    className="btn btn--ghost btn--sm"
                                    onClick={() => onOpenFile(file)}
                                    style={{ fontSize: '11px', padding: '2px 8px', color: '#60a5fa' }}
                                  >
                                    Mở tệp
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* NÚT THAO TÁC NHANH */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn--ember btn--sm"
                          onClick={() => handleScaffold(selectedMission.requiredFiles || [])}
                          disabled={scaffolding || selectedMission.status === 'passed'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                            fontWeight: 600,
                          }}
                        >
                          <Icon name="plus" size={12} />
                          <span>{scaffolding ? 'Đang khởi tạo...' : '⚡ Tạo nhanh cấu trúc mẫu (1-Click)'}</span>
                        </button>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                          hoặc dùng nút (+) trên Explorer bên trái để tự tạo thủ công.
                        </span>
                      </div>

                      {scaffoldMsg && (
                        <div style={{ fontSize: '12px', color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 10px', borderRadius: '4px' }}>
                          {scaffoldMsg}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* BANNER BƯỚC THỰC HIỆN LOGIC (VIỆC 1, VIỆC 2...) */
                    <div
                      style={{
                        background: 'linear-gradient(135deg, #1e2634 0%, #161c26 100%)',
                        border: '1px solid #374151',
                        borderRadius: '10px',
                        padding: '18px 20px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: selectedMission.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: selectedMission.status === 'passed' ? '#34d399' : '#f87171',
                              border: `1px solid ${selectedMission.status === 'passed' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                            }}
                          >
                            {selectedMission.status === 'passed' ? '✓ ĐÃ ĐẠT CHUẨN' : '○ CHƯA HOÀN THÀNH'}
                          </span>
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                            Công cụ: <strong style={{ color: '#60a5fa' }}>{selectedMission.toolName}</strong>
                          </span>
                        </div>

                        {selectedMission.targetFile && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                              Tệp mục tiêu: <code style={{ color: '#a5b4fc' }}>{selectedMission.targetFile}</code>
                            </span>
                            {onOpenFile && activeFilePath !== selectedMission.targetFile && (
                              <button
                                className="btn btn--ghost btn--sm"
                                onClick={() => onOpenFile(selectedMission.targetFile!)}
                                style={{ fontSize: '11px', padding: '2px 8px', color: '#38bdf8' }}
                              >
                                Mở tệp này
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <h3 style={{ margin: '0 0 8px', fontSize: '17px', color: '#f3f4f6', fontWeight: 600 }}>
                        {selectedMission.title}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#d1d5db', lineHeight: '1.6' }}>
                        {selectedMission.description}
                      </p>

                      {/* THEO DÕI TIÊU CHUẨN CODE THỜI GIAN THỰC */}
                      {selectedMission.requiredKeywords?.length ? (
                        <div
                          style={{
                            marginTop: '12px',
                            padding: '10px 14px',
                            background: 'rgba(0, 0, 0, 0.35)',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ color: '#9ca3af', marginBottom: '6px', fontWeight: 600 }}>
                            Hàm / Từ khóa quy định bởi giáo viên (Live Code Check):
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {selectedMission.requiredKeywords.map((kw) => {
                              const passed = currentCode.toLowerCase().includes(kw.toLowerCase())
                              return (
                                <span
                                  key={kw}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                                    color: passed ? '#34d399' : '#facc15',
                                    border: `1px solid ${passed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                >
                                  <span>{passed ? '✓' : '○'}</span>
                                  <code>{kw}</code>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* HỆ THỐNG GỢI Ý 3 CẤP ĐỘ (PROGRESSIVE HINTING) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>💡</span>
                      <span>Hệ thống Gợi ý Lũy tiến (Progressive Hints Engine)</span>
                    </div>

                    {/* CẤP ĐỘ 1: GỢI Ý ĐỊNH HƯỚNG / KHÁI NIỆM */}
                    <div
                      style={{
                        background: '#161f2c',
                        border: '1px solid #2d3b4f',
                        borderRadius: '8px',
                        padding: '14px 18px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>💡</span>
                          <span>Cấp độ 1: Gợi ý định hướng (Conceptual Hint)</span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>Luôn mở sẵn</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#d1d5db', lineHeight: '1.5' }}>
                        {selectedMission.hints?.[0]?.content || selectedMission.instructorNote || 'Nắm vững yêu cầu bài toán trước khi bắt tay vào triển khai.'}
                      </div>
                    </div>

                    {/* CẤP ĐỘ 2: GỢI Ý KỸ THUẬT & THƯ VIỆN */}
                    {(() => {
                      const level2Unlocked = (unlockedLevels[selectedMission.id] || 0) >= 2
                      return (
                        <div
                          style={{
                            background: level2Unlocked ? '#18241e' : '#141a22',
                            border: level2Unlocked ? '1px solid #059669' : '1px dashed #374151',
                            borderRadius: '8px',
                            padding: '14px 18px',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: level2Unlocked ? '#34d399' : '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🔍</span>
                              <span>Cấp độ 2: Gợi ý kỹ thuật & Thư viện (Technical Guide)</span>
                            </div>
                            {!level2Unlocked ? (
                              <button
                                className="btn btn--sm btn--ghost"
                                onClick={() => handleUnlockHint(selectedMission.id, 2)}
                                style={{ fontSize: '11px', color: '#60a5fa' }}
                              >
                                🔓 Mở khóa Gợi ý Kỹ thuật
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>Đã mở khóa</span>
                            )}
                          </div>

                          {level2Unlocked ? (
                            <div style={{ fontSize: '13px', color: '#e5e7eb', lineHeight: '1.5' }}>
                              {selectedMission.hints?.[1]?.content ||
                                `Sử dụng thư viện ${selectedMission.toolName}. Đảm bảo các hàm và tệp tin đúng chuẩn nghiệp vụ.`}
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                              Bấm nút mở khóa phía trên nếu bạn đang gặp khúc mắc về cách sử dụng thư viện hoặc tham số kỹ thuật.
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* CẤP ĐỘ 3: KHUNG MÃ THAM KHẢO & ÁP DỤNG */}
                    {(() => {
                      const level3Unlocked = (unlockedLevels[selectedMission.id] || 0) >= 3
                      const codeSnippet = selectedMission.hints?.[2]?.content || selectedMission.remedyCode || ''

                      return (
                        <div
                          style={{
                            background: level3Unlocked ? '#1a1c29' : '#141a22',
                            border: level3Unlocked ? '1px solid #6366f1' : '1px dashed #374151',
                            borderRadius: '8px',
                            padding: '14px 18px',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: level3Unlocked ? '#a5b4fc' : '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>⚡</span>
                              <span>Cấp độ 3: Khung mã tham khảo (Code Boilerplate)</span>
                            </div>
                            {!level3Unlocked ? (
                              <button
                                className="btn btn--sm btn--ghost"
                                onClick={() => handleUnlockHint(selectedMission.id, 3)}
                                style={{ fontSize: '11px', color: '#fbbf24' }}
                              >
                                🔓 Mở khóa Khung mã mẫu
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 600 }}>Đã mở khóa</span>
                            )}
                          </div>

                          {level3Unlocked ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <pre
                                style={{
                                  background: '#0d1117',
                                  padding: '12px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  color: '#7ee787',
                                  overflowX: 'auto',
                                  margin: 0,
                                  maxHeight: '180px',
                                  border: '1px solid #30363d',
                                }}
                              >
                                <code>{codeSnippet || '# Chưa có mã mẫu bổ sung cho bước này'}</code>
                              </pre>

                              {onApplyFix && codeSnippet ? (
                                <button
                                  className="btn btn--ember btn--sm"
                                  onClick={async () => {
                                    setApplying(true)
                                    try {
                                      await onApplyFix(selectedMission.id, selectedMission.targetFile, codeSnippet)
                                    } finally {
                                      setApplying(false)
                                    }
                                  }}
                                  disabled={applying}
                                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <span>{applying ? 'Đang áp dụng...' : 'Áp dụng mã này vào Editor'}</span>
                                  <Icon name="arrowRight" size={12} />
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
                              Khuyên dùng: Hãy tự tư duy và triển khai trước khi mở khung mã tham khảo để nắm vững bản chất kỹ thuật.
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* KHUNG TRỢ GIẢNG AI ĐỒNG HÀNH (FOLLOW-ALONG AI TUTOR CHAT) */}
                  <div
                    style={{
                      background: '#151b23',
                      border: '1px solid #30363d',
                      borderRadius: '10px',
                      padding: '16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      marginTop: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '14px', color: '#e2e8f0' }}>
                        <span>🤖</span>
                        <span>Trợ giảng AI Đồng hành (Live Follow-Along Tutor)</span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        Bám sát định hướng của giáo viên
                      </span>
                    </div>

                    {/* VÙNG TIN NHẮN CHAT */}
                    <div
                      style={{
                        background: '#0d1117',
                        borderRadius: '8px',
                        padding: '12px',
                        border: '1px solid #21262d',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      {chatMessages.map((msg, i) => (
                        <div
                          key={i}
                          style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            background: msg.role === 'user' ? '#312e81' : '#1e293b',
                            color: '#f8fafc',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            whiteSpace: 'pre-line',
                            border: `1px solid ${msg.role === 'user' ? '#4338ca' : '#334155'}`,
                          }}
                        >
                          <div style={{ fontSize: '10px', color: msg.role === 'user' ? '#c7d2fe' : '#94a3b8', marginBottom: '2px' }}>
                            {msg.role === 'user' ? 'Bạn' : '🤖 Trợ giảng AI'} · {msg.time}
                          </div>
                          {msg.content}
                        </div>
                      ))}
                      {chatLoading && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                          Trợ giảng AI đang phân tích bài làm của bạn...
                        </div>
                      )}
                    </div>

                    {/* CÂU HỎI NHANH (PROMPT CHIPS) */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleSendChat('Cấu trúc thư mục của tôi đã chuẩn theo yêu cầu chưa?')}
                        disabled={chatLoading}
                        style={{ fontSize: '11px', padding: '3px 8px', color: '#93c5fd' }}
                      >
                        📁 Cấu trúc thư mục
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleSendChat('Việc này cần làm cụ thể những gì?')}
                        disabled={chatLoading}
                        style={{ fontSize: '11px', padding: '3px 8px', color: '#a7f3d0' }}
                      >
                        🎯 Việc này cần làm gì?
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleSendChat('Kiểm tra code tôi vừa viết đã đạt yêu cầu chưa?')}
                        disabled={chatLoading}
                        style={{ fontSize: '11px', padding: '3px 8px', color: '#fde047' }}
                      >
                        🔍 Kiểm tra code hiện tại
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleSendChat('Gợi ý tư duy và giải thuật cho bước này')}
                        disabled={chatLoading}
                        style={{ fontSize: '11px', padding: '3px 8px', color: '#f472b6' }}
                      >
                        💡 Gợi ý tư duy
                      </button>
                    </div>

                    {/* Ô NHẬP TIN NHẮN */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                        placeholder="Hỏi trợ giảng AI về bước này hoặc cách viết code..."
                        style={{
                          flex: 1,
                          background: '#0d1117',
                          border: '1px solid #30363d',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '8px 12px',
                          fontSize: '12px',
                        }}
                      />
                      <button
                        className="btn btn--ember btn--sm"
                        onClick={() => handleSendChat()}
                        disabled={chatLoading || !chatInput.trim()}
                        style={{ padding: '0 16px', fontWeight: 600 }}
                      >
                        Gửi
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#9ca3af' }}>Chọn một bước để xem chi tiết hướng dẫn.</div>
              )}
            </div>
          )}

          {/* TAB 2: PLAYBOOK CHẨN ĐOÁN */}
          {activeTab === 'playbook' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🩺</span>
                  <span>Chẩn đoán & Xử lý Tình huống Thực tế (Diagnostic Playbook)</span>
                </div>

                <div style={{ background: '#171e27', border: '1px solid #374151', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#f59e0b' }}>
                      1. Khi Train mà Loss không giảm (Underfitting / Stalled Training)
                    </div>
                    <span style={{ fontSize: '11px', background: '#374151', padding: '1px 6px', borderRadius: '4px', color: '#9ca3af' }}>
                      Learning Rate / Optimizer
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#d1d5db', marginTop: '8px', lineHeight: '1.5' }}>
                    <strong>Dấu hiệu:</strong> Sau 5-10 Epochs, Train Loss dao động quanh giá trị cao, mAP không tăng.
                    <br />
                    <strong>Nguyên nhân:</strong> Learning rate quá lớn làm gradient phát nổ hoặc dữ liệu chưa chuẩn hóa (chưa rescale về [0, 1]).
                    <br />
                    <strong>Giải pháp:</strong> Giảm Learning Rate xuống <code>0.001</code> với AdamW, bổ sung Warmup 3 epochs.
                  </div>
                </div>

                <div style={{ background: '#171e27', border: '1px solid #374151', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#ef4444' }}>
                      2. Hiện tượng Overfitting (Train Loss giảm nhưng Val Loss tăng)
                    </div>
                    <span style={{ fontSize: '11px', background: '#374151', padding: '1px 6px', borderRadius: '4px', color: '#9ca3af' }}>
                      Regularization / Early Stopping
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#d1d5db', marginTop: '8px', lineHeight: '1.5' }}>
                    <strong>Dấu hiệu:</strong> Train Loss giảm sâu về 0.12 nhưng Val Loss tăng vọt sau Epoch 18 (từ 0.95 lên 1.95).
                    <br />
                    <strong>Hậu quả:</strong> Mô hình học vẹt dữ liệu train, thất bại hoàn toàn trên tập test thực tế ngoài đời.
                    <br />
                    <strong>Giải pháp:</strong> Kích hoạt <strong>Early Stopping</strong> tại Epoch 15 (điểm cực tiểu của Val Loss).
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI: CHECKLIST CHUYÊN MÔN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span>
                  <span>Checklist Tiêu chuẩn Nghiệp vụ</span>
                </div>

                <div style={{ background: '#171e27', border: '1px solid #374151', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                    <div style={{ fontSize: '12.5px', color: '#d1d5db' }}>
                      <strong>Dữ liệu & Cấu hình:</strong> Tách biệt siêu tham số khỏi mã nguồn, lưu trữ trong file config chuẩn hóa.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                    <div style={{ fontSize: '12.5px', color: '#d1d5db' }}>
                      <strong>Độ trễ thời gian thực (SLA):</strong> Tối ưu hóa suy luận để đạt tốc độ xử lý &lt; 20ms/request.
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                    <div style={{ fontSize: '12.5px', color: '#d1d5db' }}>
                      <strong>Độ tin cậy & Fallback:</strong> Luôn có xử lý ngoại lệ cho các trường hợp dữ liệu rỗng hoặc sai kích thước.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LOSS CURVES */}
          {activeTab === 'curves' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#f3f4f6' }}>
                    Biểu đồ Huấn luyện & Chẩn đoán Điểm dừng Tối ưu (Early Stopping)
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9ca3af' }}>
                    Rê chuột qua các điểm trên biểu đồ để xem chi tiết giá trị Loss và mAP50 theo từng Epoch
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
                    <span style={{ width: '12px', height: '3px', background: '#10b981' }} /> Train Loss
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171' }}>
                    <span style={{ width: '12px', height: '3px', background: '#ef4444' }} /> Val Loss
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a78bfa' }}>
                    <span style={{ width: '12px', height: '3px', background: '#8b5cf6' }} /> mAP@50
                  </span>
                </div>
              </div>

              <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', padding: '16px' }}>
                <svg width="100%" height="240" viewBox={`0 0 ${chartW} ${chartH}`} style={{ overflow: 'visible' }}>
                  <path d={trainLossPath} fill="none" stroke="#10b981" strokeWidth="2.5" />
                  <path d={valLossPath} fill="none" stroke="#ef4444" strokeWidth="2.5" />
                  <path d={mapPath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 4" />

                  {/* Early stopping line at Epoch 15 */}
                  <line
                    x1={xCoord(15)}
                    y1={padY}
                    x2={xCoord(15)}
                    y2={chartH - padY}
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <text x={xCoord(15) + 6} y={padY + 15} fill="#f59e0b" fontSize="10" fontWeight="bold">
                    Optimal Checkpoint (Epoch 15)
                  </text>

                  {/* Overfitting zone */}
                  <rect
                    x={xCoord(18)}
                    y={padY}
                    width={xCoord(30) - xCoord(18)}
                    height={chartH - 2 * padY}
                    fill="rgba(239, 68, 68, 0.08)"
                  />

                  {TRAINING_HISTORY.map((d) => (
                    <circle
                      key={d.epoch}
                      cx={xCoord(d.epoch)}
                      cy={yLoss(d.valLoss)}
                      r={hoveredEpoch === d.epoch ? 5 : 3}
                      fill={hoveredEpoch === d.epoch ? '#fbbf24' : '#ef4444'}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredEpoch(d.epoch)}
                    />
                  ))}
                </svg>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', padding: '10px 14px', background: '#161c24', borderRadius: '6px', fontSize: '12px' }}>
                  <span>Epoch: <strong>{selectedData.epoch}</strong></span>
                  <span style={{ color: '#34d399' }}>Train Loss: <strong>{selectedData.trainLoss}</strong></span>
                  <span style={{ color: '#f87171' }}>Val Loss: <strong>{selectedData.valLoss}</strong></span>
                  <span style={{ color: '#a78bfa' }}>mAP@50: <strong>{selectedData.map50}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PREPROCESSING STUDIO */}
          {activeTab === 'preprocessing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#f3f4f6' }}>
                  Studio Thử nghiệm Tiền xử lý Ảnh Thực chiến
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9ca3af' }}>
                  Thử nghiệm tương tác các kỹ thuật cân bằng sáng CLAHE, Letterbox và trích xuất đặc trưng
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {(['clahe', 'letterbox', 'grayscale', 'bg_removal'] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`btn btn--sm ${selectedFilter === filter ? 'btn--ember' : 'btn--ghost'}`}
                    onClick={() => setSelectedFilter(filter)}
                  >
                    {filter.toUpperCase()}
                  </button>
                ))}
              </div>

              <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                <div style={{ marginBottom: '8px', fontSize: '24px' }}>🔬</div>
                <div>Đang xem hiệu ứng xử lý: <strong style={{ color: '#60a5fa' }}>{selectedFilter.toUpperCase()}</strong></div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Ảnh kích thước chuẩn: 640x640 · Cân bằng biểu đồ sáng LAB space
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
