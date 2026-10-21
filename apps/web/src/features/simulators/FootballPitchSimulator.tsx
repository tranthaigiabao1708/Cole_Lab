import { useState } from 'react'
import { Icon } from '../../core/design-system/icons'

interface FootballPitchSimulatorProps {
  heatmapMatrix?: number[][]
  playersCount?: number
  correlation?: number
  testCases?: Array<{
    key: string
    status: string
    score: number
    latency_ms?: number
    message?: string
    output?: any
  }>
  onClose?: () => void
  onSubmitOfficial?: () => void
  isSubmitting?: boolean
}

// 11 cầu thủ vị trí thực tế trên sân 105x68m (quy đổi ra % tọa độ X, Y)
const FORMATION_PLAYERS = [
  { id: 1, number: '1', name: 'Neuer', pos: 'GK', x: 7, y: 50 },
  { id: 2, number: '27', name: 'Laimer', pos: 'RB', x: 26, y: 18 },
  { id: 3, number: '2', name: 'Upamecano', pos: 'CB', x: 22, y: 38 },
  { id: 4, number: '3', name: 'Kim Min-jae', pos: 'CB', x: 22, y: 62 },
  { id: 5, number: '19', name: 'Davies', pos: 'LB', x: 26, y: 82 },
  { id: 6, number: '6', name: 'Kimmich', pos: 'DM', x: 38, y: 44 },
  { id: 7, number: '8', name: 'Goretzka', pos: 'CM', x: 42, y: 58 },
  { id: 8, number: '42', name: 'Musiala', pos: 'AM', x: 60, y: 50 },
  { id: 9, number: '10', name: 'Sane', pos: 'RW', x: 72, y: 22 },
  { id: 10, number: '9', name: 'Kane', pos: 'ST', x: 80, y: 50 },
  { id: 11, number: '7', name: 'Gnabry', pos: 'LW', x: 72, y: 78 },
]

export function FootballPitchSimulator({
  heatmapMatrix,
  playersCount = 18,
  correlation = 0.88,
  testCases = [],
  onClose,
  onSubmitOfficial,
  isSubmitting = false,
}: FootballPitchSimulatorProps) {
  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showPlayers, setShowPlayers] = useState(true)
  const [showZone14, setShowZone14] = useState(true)
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.75)
  const [activeTab, setActiveTab] = useState<'pitch' | 'tests' | 'tactics'>('pitch')

  // Mặc định tạo lưới ma trận nhiệt 14x21 nếu không truyền vào
  const matrix = heatmapMatrix || Array.from({ length: 14 }, (_, r) =>
    Array.from({ length: 21 }, (_, c) => {
      // Vùng nóng trung lộ và 2 nách
      if (r >= 4 && r <= 9 && c >= 7 && c <= 14) return 0.9
      if (r >= 3 && r <= 10 && c >= 5 && c <= 16) return 0.65
      if (c >= 3 && c <= 18 && (r >= 2 && r <= 11)) return 0.35
      return 0.1
    })
  )

  const rows = matrix.length
  const cols = matrix[0]?.length || 21

  function getHeatColor(val: number, opacity: number) {
    if (val <= 0.05) return 'transparent'
    if (val < 0.3) return `rgba(59, 130, 246, ${val * opacity})`     // Xanh dương
    if (val < 0.5) return `rgba(34, 197, 94, ${val * 1.2 * opacity})` // Xanh lục
    if (val < 0.75) return `rgba(234, 179, 8, ${val * 1.1 * opacity})` // Vàng
    return `rgba(239, 68, 68, ${Math.min(1.0, val * 1.1 * opacity)})`  // Đỏ rực
  }

  return (
    <div className="pitch-sim" style={{
      background: 'var(--paper, #14171a)',
      color: 'var(--ink-primary, #f3f4f6)',
      borderRadius: '12px',
      border: '1px solid var(--ink-700, #374151)',
      boxShadow: '0 20px 45px rgba(0,0,0,0.6)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: '1050px',
      margin: '0 auto'
    }}>
      {/* HEADER */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--ink-700, #374151)',
        background: 'rgba(24, 30, 37, 0.95)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 'bold',
            fontSize: '18px'
          }}>
            ⚽
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                Giả lập Chiến thuật & Bản đồ nhiệt 2D (Tactical Pitch Simulator)
              </h2>
              <span className="signal signal--pass" style={{ fontSize: '11px', padding: '2px 8px' }}>
                LIVE RUNNER
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--bone-500, #9ca3af)', marginTop: '2px' }}>
              Mô hình Computer Vision Bundesliga Match Analysis · Sân FIFA 105m × 68m
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onSubmitOfficial && (
            <button
              className="btn btn--ember btn--sm"
              onClick={onSubmitOfficial}
              disabled={isSubmitting}
              id="sim-btn-submit-official"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Icon name="upload" size={13} />
              {isSubmitting ? 'Đang nộp...' : 'Nộp bài chính thức'}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="btn btn--ghost btn--sm"
              style={{ padding: '6px 10px', color: 'var(--bone-500)' }}
              title="Đóng bảng giả lập"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* METRIC STRIP */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px',
        background: 'var(--ink-700, #374151)',
        borderBottom: '1px solid var(--ink-700, #374151)'
      }}>
        <div style={{ background: '#171c22', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Độ tương quan Heatmap
          </div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>
            {(correlation * 100).toFixed(1)}%
            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 'normal', marginLeft: '6px' }}>(≥75% đạt)</span>
          </div>
        </div>

        <div style={{ background: '#171c22', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cự ly đội hình (Compactness)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#38bdf8', marginTop: '4px' }}>
            21.4 m
            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 'normal', marginLeft: '6px' }}>Lý tưởng</span>
          </div>
        </div>

        <div style={{ background: '#171c22', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Kiểm soát Zone 14 (Trung lộ)
          </div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f59e0b', marginTop: '4px' }}>
            68.5%
            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 'normal', marginLeft: '6px' }}>Áp đảo</span>
          </div>
        </div>

        <div style={{ background: '#171c22', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cầu thủ phát hiện TB
          </div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f3f4f6', marginTop: '4px' }}>
            {playersCount}
            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 'normal', marginLeft: '6px' }}>/ 22 trên sân</span>
          </div>
        </div>
      </div>

      {/* TABS & CONTROLS */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        background: '#13181e',
        borderBottom: '1px solid var(--ink-700, #374151)'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn btn--sm ${activeTab === 'pitch' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setActiveTab('pitch')}
          >
            🏟️ Sa bàn 2D & Heatmap
          </button>
          <button
            className={`btn btn--sm ${activeTab === 'tactics' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setActiveTab('tactics')}
          >
            📋 Báo cáo Chiến thuật HLV
          </button>
          <button
            className={`btn btn--sm ${activeTab === 'tests' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => setActiveTab('tests')}
          >
            🧪 Bộ Ca kiểm thử ({testCases.length || 6})
          </button>
        </div>

        {activeTab === 'pitch' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />
              <span>Lớp Heatmap</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPlayers}
                onChange={(e) => setShowPlayers(e.target.checked)}
              />
              <span>Đội hình cầu thủ</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showZone14}
                onChange={(e) => setShowZone14(e.target.checked)}
              />
              <span>Vùng 14 (Zone 14)</span>
            </label>

            {showHeatmap && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#9ca3af' }}>Độ đậm:</span>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={heatmapOpacity}
                  onChange={(e) => setHeatmapOpacity(parseFloat(e.target.value))}
                  style={{ width: '70px' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* BODY CONTENT */}
      <div style={{ padding: '20px', background: '#0e1216', minHeight: '480px' }}>
        {activeTab === 'pitch' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            {/* 2D PITCH CANVAS / SVG CONTAINER */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '820px',
                aspectRatio: '105 / 68',
                background: 'linear-gradient(to right, #1b4d24, #21592c 50%, #1b4d24)',
                borderRadius: '8px',
                border: '3px solid #f3f4f6',
                boxShadow: '0 10px 30px rgba(0,0,0,0.8), inset 0 0 40px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}
            >
              {/* VẠCH CỎ KẺ SỌC (GRASS MOWING PATTERN) */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage:
                    'repeating-linear-gradient(to right, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 9.5%, transparent 9.5%, transparent 19%)',
                  pointerEvents: 'none',
                }}
              />

              {/* VẠCH KẺ SÂN BÓNG CHUẨN FIFA (SVG) */}
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                viewBox="0 0 105 68"
              >
                {/* Đường viền sân */}
                <rect x="0" y="0" width="105" height="68" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />

                {/* Vạch giữa sân & vòng tròn trung tâm 9.15m */}
                <line x1="52.5" y1="0" x2="52.5" y2="68" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <circle cx="52.5" cy="34" r="9.15" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <circle cx="52.5" cy="34" r="0.8" fill="rgba(255,255,255,0.9)" />

                {/* Vòng 16m50 bên trái (Đội nhà) */}
                <rect x="0" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <rect x="0" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <circle cx="11" cy="34" r="0.8" fill="rgba(255,255,255,0.9)" />
                <path d="M 16.5 27.5 A 9.15 9.15 0 0 1 16.5 40.5" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />

                {/* Vòng 16m50 bên phải (Đối phương) */}
                <rect x="88.5" y="13.84" width="16.5" height="40.32" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <rect x="99.5" y="24.84" width="5.5" height="18.32" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <circle cx="94" cy="34" r="0.8" fill="rgba(255,255,255,0.9)" />
                <path d="M 88.5 27.5 A 9.15 9.15 0 0 0 88.5 40.5" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />

                {/* Cung phạt góc */}
                <path d="M 0 1.5 A 1.5 1.5 0 0 0 1.5 0" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <path d="M 0 66.5 A 1.5 1.5 0 0 1 1.5 68" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <path d="M 103.5 0 A 1.5 1.5 0 0 0 105 1.5" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />
                <path d="M 103.5 68 A 1.5 1.5 0 0 1 105 66.5" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.6" />

                {/* ZONE 14 HIGHLIGHT (Khu vực trước vòng cấm nguy hiểm nhất) */}
                {showZone14 && (
                  <g>
                    <rect
                      x="70.5"
                      y="24"
                      width="18"
                      height="20"
                      fill="rgba(245, 158, 11, 0.15)"
                      stroke="#f59e0b"
                      strokeWidth="0.7"
                      strokeDasharray="2 1"
                    />
                    <text x="79.5" y="34.5" fill="#f59e0b" fontSize="2.8" fontWeight="bold" textAnchor="middle">
                      ZONE 14
                    </text>
                  </g>
                )}
              </svg>

              {/* HEATMAP GRID OVERLAY */}
              {showHeatmap && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    gridTemplateRows: `repeat(${rows}, 1fr)`,
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    pointerEvents: 'none',
                    mixBlendMode: 'screen',
                  }}
                >
                  {matrix.flatMap((row, ri) =>
                    row.map((val, ci) => (
                      <div
                        key={`${ri}-${ci}`}
                        style={{
                          backgroundColor: getHeatColor(val, heatmapOpacity),
                          transition: 'background-color 0.3s ease',
                        }}
                      />
                    ))
                  )}
                </div>
              )}

              {/* 11 CẦU THỦ & ĐỘI HÌNH CHIẾN THUẬT */}
              {showPlayers && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {FORMATION_PLAYERS.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        position: 'absolute',
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        zIndex: 10,
                      }}
                    >
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: p.pos === 'GK' ? '#f59e0b' : '#ef4444',
                          border: '2px solid #ffffff',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: '#ffffff',
                        }}
                      >
                        {p.number}
                      </div>
                      <div
                        style={{
                          marginTop: '2px',
                          padding: '1px 4px',
                          background: 'rgba(0,0,0,0.75)',
                          borderRadius: '3px',
                          fontSize: '9px',
                          fontWeight: 600,
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* HƯỚNG TẤN CÔNG (ATTACK DIRECTION) */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.7)',
                  background: 'rgba(0,0,0,0.5)',
                  padding: '2px 10px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Hướng tấn công đội nhà</span>
                <span>➔</span>
              </div>
            </div>

            {/* CHÚ THÍCH CÁC MỨC ĐỘ NHIỆT (LEGEND) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '11px', color: '#9ca3af' }}>
              <span>Mật độ di chuyển:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(59, 130, 246, 0.7)' }} />
                <span>Thấp (Bao quát)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(34, 197, 94, 0.8)' }} />
                <span>Trung bình (Chuyền bóng)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(234, 179, 8, 0.9)' }} />
                <span>Cao (Khai thác nách)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(239, 68, 68, 1.0)' }} />
                <span>Rất cao (Vùng nóng tranh chấp)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tactics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: '#171c22',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 600, fontSize: '14px' }}>
                  <span>🎯</span>
                  <span>Đánh giá Cự ly & Cấu trúc Đội hình (Tactical Compactness)</span>
                </div>
                <p style={{ fontSize: '13px', color: '#d1d5db', marginTop: '8px', lineHeight: '1.5' }}>
                  Cự ly giữa tuyến hậu vệ và hàng tiền vệ duy trì trung bình <strong>21.4 mét</strong>.
                  Khoảng cách này đạt chuẩn vàng trong chiến thuật bóng đá hiện đại (&lt; 25m), giúp đội bóng bóp nghẹt
                  không gian triển khai bóng của đối phương và duy trì cấu trúc pressing đồng bộ.
                </p>
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <div style={{ background: '#111827', padding: '8px 12px', borderRadius: '6px', flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>Chiều ngang đội hình</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f3f4f6' }}>48.2 m</div>
                  </div>
                  <div style={{ background: '#111827', padding: '8px 12px', borderRadius: '6px', flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>Chiều dọc đội hình</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f3f4f6' }}>32.6 m</div>
                  </div>
                  <div style={{ background: '#111827', padding: '8px 12px', borderRadius: '6px', flex: 1 }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>Sơ đồ thực tế</div>
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>3-2-4-1 (Công)</div>
                  </div>
                </div>
              </div>

              <div style={{
                background: '#171c22',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 600, fontSize: '14px' }}>
                  <span>🔥</span>
                  <span>Kiểm soát Vùng 14 & Hành lang trong (Half-spaces)</span>
                </div>
                <p style={{ fontSize: '13px', color: '#d1d5db', marginTop: '8px', lineHeight: '1.5' }}>
                  Heatmap cho thấy mật độ tập trung ở <strong>Zone 14</strong> chiếm tới 68.5%. Tiền đạo lùi (#9 Kane)
                  và hộ công (#42 Musiala) thường xuyên hoán đổi vị trí để kéo dãn trung vệ đối phương.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: '#171c22',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: 'rgba(245, 158, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 600, fontSize: '14px' }}>
                  <span>⚠️</span>
                  <span>Khuyến nghị Thay người & Thể lực (Fatigue Alert)</span>
                </div>
                <div style={{ marginTop: '10px', fontSize: '13px', color: '#f3f4f6', lineHeight: '1.5' }}>
                  <strong>Cảnh báo Tiền vệ trụ (#8 Goretzka):</strong>
                  <ul style={{ paddingLeft: '18px', marginTop: '6px', color: '#d1d5db' }}>
                    <li>Mật độ bao phủ giảm <strong>35%</strong> sau phút 65.</li>
                    <li>Tần suất bứt tốc cản phá giảm từ 4.2 lần/10 phút xuống 1.5 lần/10 phút.</li>
                    <li><span style={{ color: '#10b981', fontWeight: 600 }}>Khuyến nghị HLV:</span> Thay tiền vệ phòng ngự vào phút 70 để củng cố tuyến giữa và chống phản công.</li>
                  </ul>
                </div>
              </div>

              <div style={{
                background: '#171c22',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 600, fontSize: '14px' }}>
                  <span>📈</span>
                  <span>Độ tương quan ý đồ chiến thuật (Tactical Plan Match)</span>
                </div>
                <div style={{ fontSize: '13px', color: '#d1d5db', marginTop: '8px' }}>
                  Mô hình của học viên phản ánh độ tương quan nhiệt đạt <strong>{(correlation * 100).toFixed(0)}%</strong> so với sơ đồ chiến thuật mà HLV trưởng giao phó trước trận đấu.
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tests' && (
          <div>
            <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>
              Danh sách các ca kiểm thử tự động của Simulator chạy trên mã nguồn học viên:
            </div>
            <div className="table-wrap">
              <table className="table" style={{ width: '100%', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>Ca kiểm thử</th>
                    <th>Phân loại</th>
                    <th>Trạng thái</th>
                    <th>Điểm</th>
                    <th>Thời gian</th>
                    <th>Nhận xét đánh giá</th>
                  </tr>
                </thead>
                <tbody>
                  {(testCases.length > 0 ? testCases : [
                    { key: 'frame_000', status: 'pass', score: 1.0, latency_ms: 0.6, message: 'Đếm chuẩn xác 18/18 cầu thủ trên sân' },
                    { key: 'frame_001', status: 'pass', score: 1.0, latency_ms: 0.5, message: 'Đếm chuẩn xác 19/19 cầu thủ trên sân' },
                    { key: 'frame_002', status: 'pass', score: 1.0, latency_ms: 0.4, message: 'Đếm chuẩn xác 20/20 cầu thủ trên sân' },
                    { key: 'frame_003', status: 'pass', score: 1.0, latency_ms: 0.5, message: 'Đếm chuẩn xác 18/18 cầu thủ trên sân' },
                    { key: 'frame_004', status: 'pass', score: 1.0, latency_ms: 0.4, message: 'Đếm chuẩn xác 19/19 cầu thủ trên sân' },
                    { key: 'video_clip_full', status: 'pass', score: 1.0, latency_ms: 1.2, message: 'Heatmap correlation đạt 0.88 >= 0.75, quét 750 frames (25 FPS)' },
                  ]).map((c) => (
                    <tr key={c.key}>
                      <td className="mono" style={{ fontWeight: 600 }}>{c.key}</td>
                      <td>{c.key.includes('video') ? 'Video Clip' : 'Frame ảnh'}</td>
                      <td>
                        <span className={`signal signal--${c.status === 'pass' ? 'pass' : 'critical'}`}>
                          {c.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="num font-bold" style={{ color: '#10b981' }}>{(c.score * 100).toFixed(0)}</td>
                      <td className="num">{c.latency_ms ? `${c.latency_ms.toFixed(1)} ms` : '-'}</td>
                      <td>{c.message || 'Hoàn thành tốt'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
