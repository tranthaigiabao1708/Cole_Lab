import { useState } from 'react'
import { Icon } from '../../core/design-system/icons'

interface CvInspectionSimulatorProps {
  onClose: () => void
  onSubmitOfficial: () => Promise<void>
  isSubmitting?: boolean
}

export function CvInspectionSimulator({
  onClose,
  onSubmitOfficial,
  isSubmitting = false,
}: CvInspectionSimulatorProps) {
  const [threshold, setThreshold] = useState<number>(0.65)
  const [selectedSample, setSelectedSample] = useState<number>(1)

  // 6 mẫu kiểm thử linh kiện
  const SAMPLES = [
    { id: 1, name: 'Linh kiện #001', gt: 'OK', pred: 'OK', conf: 0.94, defect: 'Bề mặt hoàn hảo, không có vết nứt' },
    { id: 2, name: 'Linh kiện #002', gt: 'NG', pred: 'NG', conf: 0.88, defect: 'Vết xước kim loại 4.2mm tại mép phải' },
    { id: 3, name: 'Linh kiện #003', gt: 'OK', pred: 'OK', conf: 0.91, defect: 'Đạt chuẩn kích thước và bóng sáng' },
    { id: 4, name: 'Linh kiện #004', gt: 'NG', pred: 'NG', conf: 0.79, defect: 'Lỗ rỗng bọt khí đúc đường kính 1.5mm' },
    { id: 5, name: 'Linh kiện #005', gt: 'NG', pred: 'NG', conf: 0.96, defect: 'Biến dạng ren ốc cơ khí' },
    { id: 6, name: 'Linh kiện #006', gt: 'OK', pred: 'OK', conf: 0.89, defect: 'Đạt tiêu chuẩn ngoại quan xuất xưởng' },
  ]

  const curSample = SAMPLES.find((s) => s.id === selectedSample) || SAMPLES[0]
  const isPass = curSample.pred === curSample.gt

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
          maxWidth: '1040px',
          height: '84vh',
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
            padding: '14px 20px',
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
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '16px',
              }}
            >
              🔍
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#f3f4f6', fontWeight: 600 }}>
                Giả lập Kiểm định Ngoại quan Linh kiện Công nghiệp (CV OK/NG Inspection)
              </h2>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                Phát hiện khuyết tật bề mặt kim loại · Tinh chỉnh ngưỡng phán đoán & Đánh giá F1 Score
              </div>
            </div>
          </div>

          <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ color: '#9ca3af' }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* METRICS BAR */}
        <div
          style={{
            padding: '10px 20px',
            background: '#0d1117',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '18px' }}>
            <span>F1 Score: <strong style={{ color: '#34d399' }}>95.4%</strong></span>
            <span>Precision: <strong style={{ color: '#60a5fa' }}>96.0%</strong></span>
            <span>Recall: <strong style={{ color: '#fbbf24' }}>94.8%</strong></span>
            <span>Độ trễ trung bình: <strong style={{ color: '#a78bfa' }}>14.2ms</strong></span>
          </div>

          <button
            className="btn btn--ember btn--sm"
            onClick={onSubmitOfficial}
            disabled={isSubmitting}
            style={{ fontWeight: 600 }}
          >
            {isSubmitting ? 'Đang nộp bài...' : 'Nộp bài chính thức (100đ)'}
          </button>
        </div>

        {/* BODY */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', flex: 1, overflow: 'hidden' }}>
          {/* SAMPLES LIST */}
          <div style={{ background: '#0e131a', borderRight: '1px solid #283340', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>
              Danh sách mẫu kiểm tra
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSample(s.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: s.id === selectedSample ? 'rgba(99, 102, 241, 0.2)' : '#161f2c',
                    border: s.id === selectedSample ? '1px solid #6366f1' : '1px solid #253342',
                    color: '#e2e8f0',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <span>{s.name}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: s.gt === 'OK' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: s.gt === 'OK' ? '#34d399' : '#f87171',
                    }}
                  >
                    GT: {s.gt}
                  </span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 'auto', padding: '12px', background: '#141c26', borderRadius: '6px', border: '1px solid #243040' }}>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '6px' }}>
                Ngưỡng quyết định (Threshold): <strong>{threshold.toFixed(2)}</strong>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                <span>0.10 (Nhạy lỗi)</span>
                <span>0.90 (Chặt chẽ)</span>
              </div>
            </div>
          </div>

          {/* INSPECTION VIEW */}
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#f3f4f6' }}>
                Chi tiết kết quả: {curSample.name}
              </h3>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '6px',
                  background: isPass ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: isPass ? '#34d399' : '#f87171',
                  border: `1px solid ${isPass ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                }}
              >
                {isPass ? '✓ PHÁN ĐOÁN CHÍNH XÁC' : '✕ PHÁN ĐOÁN SAI'}
              </span>
            </div>

            {/* Khung mô phỏng ảnh camera */}
            <div
              style={{
                height: '240px',
                background: '#090d13',
                border: '1px solid #303e4d',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '140px',
                  height: '140px',
                  borderRadius: '8px',
                  border: curSample.gt === 'OK' ? '2px solid #10b981' : '2px dashed #ef4444',
                  background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  boxShadow: '0 0 20px rgba(0,0,0,0.5)',
                }}
              >
                {curSample.gt === 'OK' ? '⚙️' : '⚠️'}
              </div>

              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  fontSize: '11px',
                  color: '#9ca3af',
                  background: 'rgba(0,0,0,0.6)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                }}
              >
                Độ phân giải: 1920x1080 · Chiếu sáng chấn tiêu chuẩn công nghiệp
              </div>
            </div>

            {/* Chi tiết khuyết tật & Nhãn dự đoán */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ background: '#161f2c', padding: '14px', borderRadius: '8px', border: '1px solid #283647' }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Nhãn dự đoán của Model
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: curSample.pred === 'OK' ? '#34d399' : '#f87171' }}>
                  {curSample.pred}
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>
                  Độ tự tin (Confidence): <strong>{Math.round(curSample.conf * 100)}%</strong>
                </div>
              </div>

              <div style={{ background: '#161f2c', padding: '14px', borderRadius: '8px', border: '1px solid #283647' }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Mô tả thực tế từ KCS
                </div>
                <div style={{ fontSize: '13px', color: '#e2e8f0', marginTop: '2px', lineHeight: '1.5' }}>
                  {curSample.defect}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
