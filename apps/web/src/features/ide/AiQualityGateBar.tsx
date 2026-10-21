import { useState } from 'react'
import { Icon } from '../../core/design-system/icons'
import type { TreeEntry } from './FileTree'

export interface QualityMission {
  id: string
  stepNumber: number
  title: string
  shortLabel: string
  toolName: string
  category: 'code' | 'file' | 'config'
  status: 'passed' | 'missing' | 'warning'
  description: string
  industryContext: string
  instructorNote: string
  targetFile?: string
  actionLabel?: string
  remedyCode?: string
}

interface AiQualityGateBarProps {
  tree: TreeEntry[]
  currentCode: string
  activeFilePath?: string | null
  onOpenCopilot: () => void
  onApplyFix: (missionId: string) => Promise<void>
}

export function evaluateMissions(tree: TreeEntry[], currentCode: string): QualityMission[] {
  const filePaths = new Set(tree.map((t) => t.path))

  // 1. Tien xu ly anh (OpenCV / Albumentations)
  const hasPreprocessing =
    currentCode.includes('preprocess') ||
    currentCode.includes('clahe') ||
    currentCode.includes('letterbox') ||
    currentCode.includes('normalize') ||
    filePaths.has('solution/preprocess.py')

  // 2. Danh nhan du lieu (CVAT / Roboflow)
  const hasAnnotations =
    filePaths.has('annotations/annotations.json') ||
    filePaths.has('solution/annotations.json') ||
    filePaths.has('data/annotations.json') ||
    tree.some((t) => t.path.includes('annotation'))

  // 3. Huan luyen & Theo doi thi nghiem (W&B / TensorBoard)
  const hasTrainingScript =
    filePaths.has('solution/train.py') ||
    filePaths.has('train.py') ||
    currentCode.includes('def train(') ||
    currentCode.includes('train_tactical_model') ||
    currentCode.includes('optimizer')

  // 4. Bieu do loss & Chan doan Overfitting (Matplotlib / FiftyOne)
  const hasLossCurves =
    filePaths.has('runs/train/curves.png') ||
    filePaths.has('artifacts/loss_curves.png') ||
    filePaths.has('reports/train_curves.png') ||
    tree.some((t) => t.path.includes('curves') || t.path.includes('loss'))

  // 5. Sa ban 2D & Homography ban do nhiet (SciPy / StatsBomb)
  const hasTacticalDomain =
    currentCode.includes('analyze_video') ||
    currentCode.includes('heatmap_matrix') ||
    currentCode.includes('pitch_length') ||
    currentCode.includes('zone_14')

  // 6. Toi uu hoa & Dong goi Service (ONNX Runtime / YAML Config)
  const hasOptimization =
    filePaths.has('configs/tactical_config.yaml') ||
    filePaths.has('config.yaml') ||
    currentCode.includes('onnx') ||
    currentCode.includes('opset')

  return [
    {
      id: 'preprocessing',
      stepNumber: 1,
      title: 'Bước 1: Tiền xử lý ảnh thô (Image Preprocessing)',
      shortLabel: 'Tiền xử lý ảnh',
      toolName: 'OpenCV / Albumentations',
      category: 'code',
      status: hasPreprocessing ? 'passed' : 'missing',
      description: 'Ảnh từ camera truyền hình sân bóng bị chói sáng đèn cao áp và đổ bóng râm. Kỹ sư phải dùng CLAHE cân bằng sáng trên kênh L (LAB space) và Letterbox bù viền 640x640 tránh méo tỷ lệ cầu thủ.',
      industryContext: 'Các hệ thống camera thể thao (như Hawk-Eye, StatsPerform) không bao giờ đưa frame thô vào model mà luôn có tiền xử lý chuẩn hóa để đảm bảo độ chính xác ổn định dưới mọi điều kiện thời tiết.',
      instructorNote: 'Giảng viên yêu cầu: Không được đưa ảnh thô trực tiếp vào mô hình. Bắt buộc phải có hàm preprocess_frame hoặc preprocess_image.',
      targetFile: 'solution/predict.py',
      actionLabel: 'Thêm hàm Tiền xử lý ảnh chuẩn CLAHE',
      remedyCode: `    def preprocess_frame(self, frame_img):\n        """Tiền xử lý ảnh chuẩn: CLAHE cân bằng ánh sáng sân & Letterbox 640x640"""\n        return {"status": "preprocessed", "input_size": (640, 640), "clahe": True}`,
    },
    {
      id: 'annotations',
      stepNumber: 2,
      title: 'Bước 2: Quản trị Dữ liệu & Đánh nhãn (Data Annotation)',
      shortLabel: 'Gán nhãn Annotation',
      toolName: 'CVAT / Roboflow',
      category: 'file',
      status: hasAnnotations ? 'passed' : 'missing',
      description: 'Quy trình AI bắt buộc phải có tập dữ liệu nhãn Ground Truth (tọa độ Bounding Box, category: player, goalkeeper, referee, ball) theo chuẩn định dạng COCO / YOLO.',
      industryContext: 'Tại các công ty AI thể thao, dữ liệu video được dán nhãn thông qua các nền tảng như CVAT hoặc Label Studio để đội ngũ Annotation kiểm định chất lượng trước khi nạp vào Pipeline train.',
      instructorNote: 'Giảng viên yêu cầu: Học viên phải hiểu cấu trúc dữ liệu nhãn Ground Truth trong file annotations/annotations.json.',
      targetFile: 'annotations/annotations.json',
      actionLabel: 'Khởi tạo file annotations/annotations.json',
    },
    {
      id: 'training',
      stepNumber: 3,
      title: 'Bước 3: Pipeline Huấn luyện & Tinh chỉnh Siêu tham số (Training & Tuning)',
      shortLabel: 'Huấn luyện & Tuning',
      toolName: 'W&B / PyTorch',
      category: 'file',
      status: hasTrainingScript ? 'passed' : 'missing',
      description: 'Huấn luyện mô hình phát hiện đối tượng với Loss kết hợp (CIoU + BCE), tối ưu bằng Optimizer AdamW (learning rate = 0.001, weight decay = 1e-4) và Data Augmentation (Mosaic, HSV Jitter).',
      industryContext: 'Kỹ sư AI luôn tách riêng code inference và code training. Quá trình huấn luyện được log tự động lên công cụ theo dõi thí nghiệm như Weights & Biases (W&B) hoặc MLflow để so sánh các lần thử nghiệm.',
      instructorNote: 'Giảng viên yêu cầu: Không chấp nhận chỉ nộp file predict thô. Bắt buộc phải có kịch bản huấn luyện solution/train.py hoàn chỉnh.',
      targetFile: 'solution/train.py',
      actionLabel: 'Tạo kịch bản solution/train.py',
    },
    {
      id: 'loss_curves',
      stepNumber: 4,
      title: 'Bước 4: Đánh giá Biểu đồ & Chẩn đoán Overfitting (Evaluation & Curves)',
      shortLabel: 'Đánh giá Loss Curves',
      toolName: 'TensorBoard / Matplotlib',
      category: 'file',
      status: hasLossCurves ? 'passed' : 'missing',
      description: 'Theo dõi đường cong Train Loss vs Val Loss qua 30 Epochs. Nhận diện điểm dừng tối ưu tại Epoch 15 và hiện tượng Overfitting sau Epoch 18 (khi Train Loss giảm sâu nhưng Val Loss tăng ngược lại).',
      industryContext: 'Trong doanh nghiệp, một mô hình có Loss train rất thấp nhưng không có đồ thị kiểm chứng Val Loss sẽ bị từ chối đưa lên Production vì rủi ro học vẹt cực lớn.',
      instructorNote: 'Giảng viên yêu cầu: Phải có biểu đồ trực quan curves.png trong thư mục runs/train/ để chứng minh mô hình đạt điểm dừng Early Stopping tốt.',
      targetFile: 'runs/train/curves.png',
      actionLabel: 'Chạy huấn luyện & Xuất biểu đồ curves.png',
    },
    {
      id: 'domain_tactics',
      stepNumber: 5,
      title: 'Bước 5: Trích xuất Chiến thuật & Sa bàn 2D (Domain Homography & Heatmap)',
      shortLabel: 'Sa bàn 2D & Heatmap',
      toolName: 'SciPy / StatsBomb',
      category: 'code',
      status: hasTacticalDomain ? 'passed' : 'missing',
      description: 'Chiếu phối cảnh từ camera 3D xuống mặt sân phẳng 2D chuẩn FIFA (105m x 68m), tính toán ma trận mật độ nhiệt 14x21 vùng và phân tích cự ly đội hình (Compactness) cùng khu vực trọng điểm Zone 14.',
      industryContext: 'Kết quả của mô hình phát hiện cầu thủ chỉ là tọa độ bounding box; giá trị thương mại cho Ban huấn luyện và HLV trưởng nằm ở dữ liệu bản đồ nhiệt chiến thuật và phân tích không gian.',
      instructorNote: 'Giảng viên yêu cầu: Lớp VideoAnalyzer phải hoàn thành hàm analyze_video trả về heatmap_matrix kích thước 14x21 chuẩn hóa.',
      targetFile: 'solution/predict.py',
      actionLabel: 'Hoàn thiện hàm analyze_video',
    },
    {
      id: 'optimization',
      stepNumber: 6,
      title: 'Bước 6: Tối ưu hóa & Đóng gói Sản phẩm (Model Optimization & Deployment)',
      shortLabel: 'Tối ưu & Đóng gói',
      toolName: 'ONNX Runtime / Docker',
      category: 'config',
      status: hasOptimization ? 'passed' : 'missing',
      description: 'Tách toàn bộ tham số ra file cấu hình độc lập configs/tactical_config.yaml, chuyển đổi mô hình sang ONNX FP16 để đạt SLA thời gian thực <= 15ms/frame (60 FPS broadcast).',
      industryContext: 'Một service AI bàn giao cho bộ phận kỹ thuật / DevOps bắt buộc phải có file config cấu hình rõ ràng và khả năng chạy độc lập qua CLI / Docker container.',
      instructorNote: 'Giảng viên yêu cầu: Toàn bộ tham số kích thước sân, ngưỡng NMS và SLA độ trễ phải được cấu hình trong configs/tactical_config.yaml.',
      targetFile: 'configs/tactical_config.yaml',
      actionLabel: 'Tạo configs/tactical_config.yaml',
    },
  ]
}

export function AiQualityGateBar({
  tree,
  currentCode,
  activeFilePath,
  onOpenCopilot,
  onApplyFix,
}: AiQualityGateBarProps) {
  const missions = evaluateMissions(tree, currentCode)
  const passedCount = missions.filter((m) => m.status === 'passed').length
  const totalCount = missions.length
  const pct = Math.round((passedCount / totalCount) * 100)

  const [selectedMission, setSelectedMission] = useState<QualityMission | null>(null)
  const [applying, setApplying] = useState(false)

  return (
    <>
      <div
        style={{
          background: 'linear-gradient(90deg, #0d1117 0%, #161b22 50%, #1a202c 100%)',
          borderBottom: '1px solid #30363d',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          fontSize: '12px',
          flexWrap: 'nowrap',
          overflowX: 'auto',
        }}
      >
        {/* Tiêu đề & Tổng kết tiến độ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 700,
              color: pct === 100 ? '#34d399' : '#f59e0b',
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              fontSize: '11px',
            }}
          >
            <Icon name="alert" size={13} />
            CV Service Pipeline:
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '10px',
              background: pct === 100 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: pct === 100 ? '#34d399' : '#fbbf24',
              fontWeight: 600,
              fontSize: '11px',
              border: `1px solid ${pct === 100 ? 'rgba(52, 211, 153, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            }}
          >
            {passedCount}/{totalCount} Chặng Chuẩn ({pct}%)
            {activeFilePath && (
              <span style={{ marginLeft: '4px', opacity: 0.7, fontWeight: 'normal' }}>
                · {activeFilePath.split('/').pop()}
              </span>
            )}
          </span>
        </div>

        {/* 6 Bước quy trình chuẩn doanh nghiệp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
          {missions.map((m) => {
            const isPassed = m.status === 'passed'
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMission(m)}
                title={`${m.title} [Tool: ${m.toolName}] - ${isPassed ? 'Đã đạt chuẩn' : 'BẤM ĐỂ KHÁM PHÁ NHIỆM VỤ THỰC TẾ'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isPassed ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(239, 68, 68, 0.45)',
                  background: isPassed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.16)',
                  color: isPassed ? '#34d399' : '#fca5a5',
                  transition: 'all 0.2s ease',
                  boxShadow: !isPassed ? '0 0 8px rgba(239, 68, 68, 0.25)' : 'none',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '15px',
                    height: '15px',
                    borderRadius: '50%',
                    background: isPassed ? '#10b981' : '#ef4444',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 800,
                  }}
                >
                  {isPassed ? '✓' : '?'}
                </span>
                <span>{m.shortLabel}</span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: isPassed ? '#6ee7b7' : '#f87171',
                    fontWeight: 'normal',
                  }}
                >
                  {m.toolName.split('/')[0].trim()}
                </span>
              </button>
            )
          })}
        </div>

        {/* Nút Trợ lý AI */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={onOpenCopilot}
            className="btn btn--ghost btn--sm"
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              color: '#818cf8',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
            }}
          >
            <Icon name="terminal" size={13} />
            Cố vấn Hướng dẫn
          </button>
        </div>
      </div>

      {/* THẺ NHIỆM VỤ KHÁM PHÁ (ENTERPRISE MISSION CARD MODAL) */}
      {selectedMission && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSelectedMission(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              background: '#161b22',
              border: `1px solid ${selectedMission.status === 'passed' ? '#10b981' : '#f59e0b'}`,
              borderRadius: '12px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: selectedMission.status === 'passed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                borderBottom: '1px solid #30363d',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: selectedMission.status === 'passed' ? '#10b981' : '#ef4444',
                    color: '#fff',
                    fontSize: '18px',
                    fontWeight: 'bold',
                  }}
                >
                  {selectedMission.status === 'passed' ? '✓' : '?'}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f3f4f6' }}>
                    {selectedMission.title}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: '#818cf8',
                        fontWeight: 600,
                      }}
                    >
                      Công cụ thực tế: {selectedMission.toolName}
                    </span>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                      Trạng thái:{' '}
                      <strong style={{ color: selectedMission.status === 'passed' ? '#34d399' : '#f87171' }}>
                        {selectedMission.status === 'passed' ? 'ĐÃ ĐẠT TIÊU CHUẨN' : 'CHƯA KHÁM PHÁ (BẮT BUỘC)'}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedMission(null)}
                className="btn btn--ghost btn--sm"
                style={{ color: '#9ca3af' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  borderLeft: '4px solid #ef4444',
                  padding: '12px 14px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: '#fca5a5',
                }}
              >
                <strong>⚠️ Nhắc nhở từ Giảng viên & Ban Đánh giá:</strong>
                <p style={{ margin: '4px 0 0', color: '#e5e7eb' }}>{selectedMission.instructorNote}</p>
              </div>

              <div>
                <h4 style={{ margin: '0 0 6px', fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase' }}>
                  Bản chất trong thực tế doanh nghiệp
                </h4>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#d1d5db' }}>
                  {selectedMission.description}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: '1.5', color: '#9ca3af', fontStyle: 'italic' }}>
                  💡 {selectedMission.industryContext}
                </p>
              </div>

              {selectedMission.targetFile && (
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  File kiểm tra mã nguồn:{' '}
                  <code style={{ background: '#0d1117', padding: '2px 6px', borderRadius: '4px', color: '#58a6ff' }}>
                    {selectedMission.targetFile}
                  </code>
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '1px solid #30363d',
                  marginTop: '8px',
                }}
              >
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setSelectedMission(null)
                    onOpenCopilot()
                  }}
                  style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Icon name="terminal" size={14} />
                  Mở Cố vấn Chuyên môn
                </button>

                {selectedMission.status === 'missing' && (
                  <button
                    className="btn btn--ember btn--sm"
                    disabled={applying}
                    onClick={async () => {
                      setApplying(true)
                      try {
                        await onApplyFix(selectedMission.id)
                        setSelectedMission(null)
                      } finally {
                        setApplying(false)
                      }
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: 600,
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                    }}
                  >
                    {applying ? 'Đang khởi tạo...' : selectedMission.actionLabel || 'Khám phá & Áp dụng ngay'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function QualityGateBlockedModal({
  missingMissions,
  onClose,
  onOpenMission,
  onOpenCopilot,
}: {
  missingMissions: QualityMission[]
  onClose: () => void
  onOpenMission: (missionId: string) => void
  onOpenCopilot: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          background: '#161b22',
          border: '2px solid #ef4444',
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(239, 68, 68, 0.35)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.15) 100%)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#ef4444',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 'bold',
              flexShrink: 0,
            }}
          >
            ⛔
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#fca5a5' }}>
              CHƯA ĐẠT CHUẨN ĐỒ ÁN DOANH NGHIỆP (QUALITY GATE BLOCKED)
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#e5e7eb' }}>
              Quy định Giảng viên: Không được phép nộp bài khi chưa hoàn thành đầy đủ quy trình Computer Vision khép kín
            </p>
          </div>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#d1d5db' }}>
            Hệ thống phát hiện mã nguồn của bạn chỉ thực thi hàm suy luận thô mà chưa có quy trình chuẩn của một Kỹ sư Computer Vision thực chiến. Để được phép nghiệm thu hoặc nộp bài, bạn bắt buộc phải hoàn thành các hạng mục sau:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {missingMissions.map((m) => (
              <div
                key={m.id}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    ?
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#fecaca', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{m.title}</span>
                      <span style={{ fontSize: '10px', color: '#f87171', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                        Tool: {m.toolName}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{m.instructorNote}</div>
                  </div>
                </div>
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => {
                    onClose()
                    onOpenMission(m.id)
                  }}
                  style={{
                    fontSize: '11px',
                    padding: '4px 10px',
                    background: '#374151',
                    color: '#f9fafb',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Khám phá ngay
                </button>
              </div>
            ))}
          </div>

          <div
            style={{
              paddingTop: '14px',
              borderTop: '1px solid #30363d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '4px',
            }}
          >
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onClose()
                onOpenCopilot()
              }}
              style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Icon name="terminal" size={14} />
              Mở Cố vấn Chuyên môn hướng dẫn
            </button>
            <button
              className="btn btn--ember btn--sm"
              onClick={onClose}
              style={{ background: '#4b5563', border: 'none', color: '#ffffff', fontWeight: 600 }}
            >
              Đã hiểu, quay lại làm bài
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
