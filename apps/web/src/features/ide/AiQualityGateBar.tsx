import { useState } from 'react'
import { Icon } from '../../core/design-system/icons'
import type { TreeEntry } from './FileTree'

export interface MissionHint {
  level: number
  type: 'concept' | 'technical' | 'code_snippet'
  title: string
  content: string
}

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
  requiredKeywords?: string[]
  requiredFiles?: string[]
  isBlocking?: boolean
  hints?: MissionHint[]
}

interface AiQualityGateBarProps {
  tree: TreeEntry[]
  currentCode: string
  activeFilePath?: string | null
  rubric?: any[]
  pluginId?: string
  assignmentTitle?: string
  onOpenCopilot: (missionId?: string) => void
  onApplyFix: (missionId: string, targetFile?: string, code?: string) => Promise<void>
}

export function evaluateMissions(
  tree: TreeEntry[],
  currentCode: string,
  rubric?: any[],
  pluginId?: string,
): QualityMission[] {
  const filePaths = new Set(tree.map((t) => t.path))

  // 1. If teacher defined custom rubric steps, use them dynamically!
  if (rubric && Array.isArray(rubric) && rubric.length > 0) {
    // Collect all required files across rubric for Step 0 Project Scaffold
    const allRequiredFiles: string[] = []
    rubric.forEach((item) => {
      const rf = Array.isArray(item.required_files)
        ? item.required_files
        : typeof item.required_files === 'string'
        ? item.required_files.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
      rf.forEach((f: string) => {
        if (!allRequiredFiles.includes(f)) allRequiredFiles.push(f)
      })
    })

    const missions: QualityMission[] = []

    // Always prepend Step 0: Project Structure Setup & Scaffold if there are designated files or always as first gate
    const scaffoldFiles = allRequiredFiles.length > 0 ? allRequiredFiles : ['solution/predict.py']
    const hasAllScaffoldFiles = scaffoldFiles.every(
      (f) => filePaths.has(f) || tree.some((t) => t.path.endsWith(f) || t.path.includes(f)),
    )
    const hasSomeScaffoldFiles = scaffoldFiles.some(
      (f) => filePaths.has(f) || tree.some((t) => t.path.endsWith(f) || t.path.includes(f)),
    )

    missions.push({
      id: 'step_0_scaffold',
      stepNumber: 0,
      title: 'Bước 0: Thiết lập cấu trúc thư mục & tệp dự án',
      shortLabel: '📁 Cấu trúc',
      toolName: 'Project Scaffold',
      category: 'file',
      status: hasAllScaffoldFiles ? 'passed' : hasSomeScaffoldFiles ? 'warning' : 'missing',
      description: `Quy trình bắt đầu: Thiết lập cấu trúc thư mục và các tệp mã nguồn theo quy định của giáo viên (${scaffoldFiles.join(', ')}).`,
      industryContext: 'Trong dự án công nghiệp, việc tổ chức cấu trúc module hóa rõ ràng là bước tiên quyết trước khi lập trình.',
      instructorNote: 'Giáo viên yêu cầu: Chuẩn bị đầy đủ các thư mục và tệp mã nguồn theo quy định trước khi viết logic.',
      targetFile: scaffoldFiles[0],
      actionLabel: 'Tạo cấu trúc dự án',
      remedyCode: scaffoldFiles.map((f) => `# Tệp: ${f}`).join('\n'),
      requiredFiles: scaffoldFiles,
      requiredKeywords: [],
      isBlocking: true,
      hints: [
        {
          level: 1,
          type: 'concept',
          title: '💡 Gợi ý định hướng (Khái niệm)',
          content: `Tổ chức dự án bao gồm các tệp/thư mục: ${scaffoldFiles.join(', ')}. Hãy tách biệt giữa mã nguồn giải thuật, tệp cấu hình và dữ liệu kiểm thử.`,
        },
        {
          level: 2,
          type: 'technical',
          title: '🔍 Gợi ý kỹ thuật & Thư viện',
          content: 'Sử dụng thanh Explorer bên trái để bấm nút (+) tạo tệp hoặc thư mục. Hoặc bấm nút "Tạo nhanh cấu trúc mẫu" trong trợ giảng AI để tự động tạo khung.',
        },
        {
          level: 3,
          type: 'code_snippet',
          title: '⚡ Khung mã tham khảo (Boilerplate)',
          content: scaffoldFiles.map((f) => `touch "${f}"`).join('\n'),
        },
      ],
    })

    // Next: Step 1 (Việc 1), Step 2 (Việc 2)... from teacher's rubric
    rubric.forEach((item, idx) => {
      const stepNumber = idx + 1
      const id = item.id || `step_${stepNumber}`
      const title = item.title || `Việc ${stepNumber}`
      const toolName = item.tool || 'Quy chuẩn'
      
      const reqKeywords: string[] = Array.isArray(item.required_keywords)
        ? item.required_keywords
        : typeof item.required_keywords === 'string'
        ? item.required_keywords.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []

      const reqFiles: string[] = Array.isArray(item.required_files)
        ? item.required_files
        : typeof item.required_files === 'string'
        ? item.required_files.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []

      const isBlocking = item.is_blocking !== false

      // Check file existence
      const hasFiles =
        reqFiles.length === 0 ||
        reqFiles.every((f) => filePaths.has(f) || tree.some((t) => t.path.endsWith(f) || t.path.includes(f)))

      // Check keywords in current open code or filenames
      const hasKeywords =
        reqKeywords.length === 0 ||
        reqKeywords.every((kw) => currentCode.toLowerCase().includes(kw.toLowerCase()))

      let status: 'passed' | 'missing' | 'warning' = 'missing'
      if (hasFiles && hasKeywords) {
        status = 'passed'
      } else if (hasFiles || hasKeywords) {
        status = 'warning'
      }

      const hints: MissionHint[] = item.hints || [
        {
          level: 1,
          type: 'concept',
          title: '💡 Gợi ý định hướng (Khái niệm)',
          content: item.mentor_hint || `Tìm hiểu nguyên lý và yêu cầu nghiệp vụ của bước: ${title}.`,
        },
        {
          level: 2,
          type: 'technical',
          title: '🔍 Gợi ý kỹ thuật & Thư viện',
          content: `Sử dụng công cụ ${toolName}. Yêu cầu tệp: ${reqFiles.join(', ') || 'theo cấu trúc bài nộp'}. Từ khóa bắt buộc: ${reqKeywords.join(', ') || 'theo chuẩn hàm'}.`,
        },
        {
          level: 3,
          type: 'code_snippet',
          title: '⚡ Khung mã tham khảo (Boilerplate)',
          content:
            item.remedy_code ||
            (reqKeywords.length
              ? `# Khung mã hoàn thành ${title}\n` + reqKeywords.map((k) => `# Cần triển khai: ${k}`).join('\n')
              : `# Hoàn thiện mã nguồn theo yêu cầu của ${title}\n`),
        },
      ]

      missions.push({
        id,
        stepNumber,
        title: `Việc ${stepNumber}: ${title}`,
        shortLabel: item.short_label || `Việc ${stepNumber}`,
        toolName,
        category: reqFiles.length > 0 ? 'file' : 'code',
        status,
        description:
          item.description ||
          item.mentor_hint ||
          `Thực hành theo chỉ dẫn của giảng viên cho bước ${title}.`,
        industryContext:
          item.industry_context ||
          `Quy chuẩn kỹ thuật thực tế doanh nghiệp với công cụ ${toolName}.`,
        instructorNote: item.mentor_hint || 'Yêu cầu của giảng viên: Hoàn thành đầy đủ điều kiện kiểm tra.',
        targetFile: reqFiles[0] || (scaffoldFiles[0] || 'solution/predict.py'),
        actionLabel: `Thực hiện ${title}`,
        remedyCode: item.remedy_code || hints[2]?.content || '',
        requiredKeywords: reqKeywords,
        requiredFiles: reqFiles,
        isBlocking,
        hints,
      })
    })

    return missions
  }

  // 2. Fallbacks based on simulator plugin type if teacher did not provide a custom rubric
  if (pluginId === 'cole.rag-chatbot') {
    const hasChunking = currentCode.includes('split') || currentCode.includes('chunk') || filePaths.has('app/chunker.py')
    const hasIndex = filePaths.has('data/index.bin') || filePaths.has('app/vectorstore.py') || currentCode.includes('embedding')
    const hasEndpoint = currentCode.includes('/query') || currentCode.includes('QueryResponse')
    const hasCitation = currentCode.includes('citation') || currentCode.includes('source')

    return [
      {
        id: 'chunking',
        stepNumber: 1,
        title: 'Bước 1: Tiền xử lý & Phân đoạn Tài liệu (Document Chunking)',
        shortLabel: 'Chunking',
        toolName: 'LangChain / Unstructured',
        category: 'code',
        status: hasChunking ? 'passed' : 'missing',
        description: 'Tách tài liệu thành các đoạn văn bản (chunks) 500 ký tự với overlap 50 ký tự để giữ ngữ cảnh liền mạch.',
        industryContext: 'Hệ thống RAG doanh nghiệp cần chiến lược chunking tối ưu để tránh mất mát ngữ cảnh tài liệu pháp lý.',
        instructorNote: 'Giảng viên yêu cầu: Viết hàm phân đoạn văn bản có overlap.',
        targetFile: 'app/chunker.py',
        actionLabel: 'Tạo app/chunker.py',
        remedyCode: `def chunk_documents(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:\n    return [text[i:i+chunk_size] for i in range(0, len(text), chunk_size - overlap)]\n`,
      },
      {
        id: 'embedding',
        stepNumber: 2,
        title: 'Bước 2: Vector Embedding & Đánh chỉ mục (Indexing)',
        shortLabel: 'Embedding',
        toolName: 'FAISS / Chroma',
        category: 'file',
        status: hasIndex ? 'passed' : 'missing',
        description: 'Chuyển đổi text chunks thành vector 768 chiều và lưu trữ vào Vector Store để tìm kiếm tương đồng ngữ nghĩa.',
        industryContext: 'Vector Index giúp tìm kiếm thông tin liên quan trong hàng triệu văn bản với độ trễ < 50ms.',
        instructorNote: 'Giảng viên yêu cầu: Tạo index và cơ chế similarity search.',
        targetFile: 'app/vectorstore.py',
        actionLabel: 'Tạo app/vectorstore.py',
        remedyCode: `class VectorStore:\n    def search(self, query: str, top_k: int = 3):\n        return [{"text": "Ngữ cảnh trích xuất...", "score": 0.95}]\n`,
      },
      {
        id: 'endpoint',
        stepNumber: 3,
        title: 'Bước 3: Dịch vụ HTTP Endpoint POST /query',
        shortLabel: 'HTTP Service',
        toolName: 'FastAPI / Pydantic',
        category: 'code',
        status: hasEndpoint ? 'passed' : 'missing',
        description: 'Xây dựng API service tiếp nhận truy vấn người dùng, tổng hợp câu trả lời và trả về JSON theo contract.',
        industryContext: 'Dịch vụ RAG trong production luôn được đóng gói dưới dạng microservice RESTful API.',
        instructorNote: 'Giảng viên yêu cầu: Hoàn thiện endpoint POST /query trong app/main.py.',
        targetFile: 'app/main.py',
        actionLabel: 'Hoàn thiện app/main.py',
        remedyCode: `@app.post("/query")\ndef query_rag(req: QueryRequest):\n    return QueryResponse(answer="Câu trả lời từ tài liệu...", citations=["Tai_lieu.pdf:Trang 1"])\n`,
      },
      {
        id: 'evaluation',
        stepNumber: 4,
        title: 'Bước 4: Đánh giá RAG Triad & Trích dẫn Nguồn',
        shortLabel: 'RAG Triad Eval',
        toolName: 'Ragas / TruLens',
        category: 'code',
        status: hasCitation ? 'passed' : 'missing',
        description: 'Kiểm soát chất lượng: Context Relevance >= 0.8, Faithfulness >= 0.85, Answer Relevance >= 0.8.',
        industryContext: 'Ngăn chặn ảo giác (hallucination) trước khi cho phép trợ lý AI tương tác với khách hàng.',
        instructorNote: 'Giảng viên yêu cầu: Bắt buộc trả về danh sách trích dẫn citations.',
        targetFile: 'app/main.py',
        actionLabel: 'Bổ sung trích dẫn citations',
      },
    ]
  }

  // 3. Fallback for CV football heatmap
  const hasPreprocessing =
    currentCode.includes('preprocess') ||
    currentCode.includes('clahe') ||
    currentCode.includes('letterbox') ||
    currentCode.includes('normalize') ||
    filePaths.has('solution/preprocess.py')

  const hasAnnotations =
    filePaths.has('annotations/annotations.json') ||
    filePaths.has('solution/annotations.json') ||
    filePaths.has('data/annotations.json') ||
    tree.some((t) => t.path.includes('annotation'))

  const hasTrainingScript =
    filePaths.has('solution/train.py') ||
    filePaths.has('train.py') ||
    currentCode.includes('def train(') ||
    currentCode.includes('train_tactical_model') ||
    currentCode.includes('optimizer')

  const hasLossCurves =
    filePaths.has('runs/train/curves.png') ||
    filePaths.has('artifacts/loss_curves.png') ||
    filePaths.has('reports/train_curves.png') ||
    tree.some((t) => t.path.includes('curves') || t.path.includes('loss'))

  const hasTacticalDomain =
    currentCode.includes('analyze_video') ||
    currentCode.includes('heatmap_matrix') ||
    currentCode.includes('pitch_length') ||
    currentCode.includes('zone_14')

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
      description: 'Ảnh từ camera truyền hình bị chói sáng đèn cao áp. Kỹ sư phải dùng CLAHE cân bằng sáng trên kênh L và Letterbox 640x640 tránh méo tỷ lệ.',
      industryContext: 'Hệ thống Hawk-Eye, StatsPerform luôn chuẩn hóa ảnh trước khi nạp vào detector để đảm bảo ổn định dưới mọi thời tiết.',
      instructorNote: 'Giảng viên yêu cầu: Bắt buộc phải có hàm preprocess_frame hoặc preprocess_image.',
      targetFile: 'solution/predict.py',
      actionLabel: 'Thêm hàm Tiền xử lý ảnh chuẩn CLAHE',
      remedyCode: `    def preprocess_frame(self, frame_img):\n        """Tiền xử lý ảnh: CLAHE cân bằng ánh sáng sân & Letterbox 640x640"""\n        return {"status": "preprocessed", "input_size": (640, 640), "clahe": True}`,
    },
    {
      id: 'annotations',
      stepNumber: 2,
      title: 'Bước 2: Quản trị Dữ liệu & Đánh nhãn (Data Annotation)',
      shortLabel: 'Gán nhãn Annotation',
      toolName: 'CVAT / Roboflow',
      category: 'file',
      status: hasAnnotations ? 'passed' : 'missing',
      description: 'Quy trình AI bắt buộc phải có tập dữ liệu nhãn Ground Truth (tọa độ Bounding Box, category: player, goalkeeper, referee, ball) theo chuẩn COCO.',
      industryContext: 'Tại các công ty AI thể thao, dữ liệu video được dán nhãn qua CVAT hoặc Label Studio để kiểm định trước khi nạp vào train.',
      instructorNote: 'Giảng viên yêu cầu: Cần file nhãn Ground Truth annotations/annotations.json.',
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
      description: 'Huấn luyện mô hình phát hiện đối tượng với Loss CIoU + BCE, optimizer AdamW và theo dõi qua kịch bản độc lập.',
      industryContext: 'Kỹ sư AI luôn tách riêng code inference và code training để quản lý versioning mô hình.',
      instructorNote: 'Giảng viên yêu cầu: Bắt buộc phải có kịch bản huấn luyện solution/train.py hoàn chỉnh.',
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
      description: 'Theo dõi đường cong Train Loss vs Val Loss qua các Epochs để xác định điểm dừng tối ưu Early Stopping.',
      industryContext: 'Trong doanh nghiệp, một mô hình không có đồ thị kiểm chứng Val Loss sẽ bị từ chối đưa lên Production.',
      instructorNote: 'Giảng viên yêu cầu: Phải có biểu đồ trực quan curves.png trong thư mục runs/train/.',
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
      description: 'Chiếu phối cảnh từ camera 3D xuống mặt sân phẳng 2D chuẩn FIFA (105m x 68m) và ma trận nhiệt 14x21.',
      industryContext: 'Giá trị thương mại cho Ban huấn luyện nằm ở dữ liệu bản đồ nhiệt chiến thuật và cự ly đội hình.',
      instructorNote: 'Giảng viên yêu cầu: Lớp VideoAnalyzer phải hoàn thành hàm analyze_video.',
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
      description: 'Tách tham số ra file configs/tactical_config.yaml, chuyển đổi mô hình sang ONNX FP16 để đạt SLA <= 15ms/frame.',
      industryContext: 'Dịch vụ AI bàn giao cho DevOps bắt buộc phải có file config cấu hình và khả năng chạy độc lập.',
      instructorNote: 'Giảng viên yêu cầu: Cấu hình tham số kích thước sân và ngưỡng NMS trong configs/tactical_config.yaml.',
      targetFile: 'configs/tactical_config.yaml',
      actionLabel: 'Tạo configs/tactical_config.yaml',
    },
  ]
}

export function AiQualityGateBar({
  tree,
  currentCode,
  activeFilePath,
  rubric,
  pluginId,
  assignmentTitle,
  onOpenCopilot,
  onApplyFix,
}: AiQualityGateBarProps) {
  const missions = evaluateMissions(tree, currentCode, rubric, pluginId)
  const passedCount = missions.filter((m) => m.status === 'passed').length
  const totalCount = missions.length
  const pct = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100

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
            {assignmentTitle ? `${assignmentTitle.slice(0, 24)}...:` : 'Quy trình Thực hành:'}
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
            {passedCount}/{totalCount} Bước ({pct}%)
            {activeFilePath && (
              <span style={{ marginLeft: '4px', opacity: 0.7, fontWeight: 'normal' }}>
                · {activeFilePath.split('/').pop()}
              </span>
            )}
          </span>
        </div>

        {/* Các Bước do giảng viên thêm thủ công */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
          {missions.map((m) => {
            const isPassed = m.status === 'passed'
            const isWarning = m.status === 'warning'
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMission(m)}
                title={`${m.title} [Tool: ${m.toolName}] - ${isPassed ? 'Đã đạt chuẩn' : 'Bấm để xem hướng dẫn & gợi ý'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isPassed
                    ? '1px solid #10b981'
                    : isWarning
                    ? '1px solid #f59e0b'
                    : '1px solid #ef4444',
                  background: isPassed
                    ? 'rgba(16, 185, 129, 0.15)'
                    : isWarning
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                  color: isPassed ? '#34d399' : isWarning ? '#fbbf24' : '#f87171',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{isPassed ? '✓' : isWarning ? '⚡' : '○'}</span>
                <span>{m.shortLabel}</span>
              </button>
            )
          })}
        </div>

        {/* Nút Mở Cố vấn Mentor */}
        <button
          className="btn btn--sm"
          onClick={() => onOpenCopilot()}
          style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
          }}
        >
          <Icon name="terminal" size={13} />
          <span>Cố vấn & Gợi ý</span>
        </button>
      </div>

      {/* MODAL CHI TIẾT NHIỆM VỤ */}
      {selectedMission && (
        <QualityMissionDetailModal
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
          onOpenCopilot={() => {
            setSelectedMission(null)
            onOpenCopilot(selectedMission.id)
          }}
          onApplyFix={async () => {
            setApplying(true)
            try {
              await onApplyFix(selectedMission.id, selectedMission.targetFile, selectedMission.remedyCode)
              setSelectedMission(null)
            } finally {
              setApplying(false)
            }
          }}
          isApplying={applying}
        />
      )}
    </>
  )
}

function QualityMissionDetailModal({
  mission,
  onClose,
  onOpenCopilot,
  onApplyFix,
  isApplying,
}: {
  mission: QualityMission
  onClose: () => void
  onOpenCopilot: () => void
  onApplyFix: () => Promise<void>
  isApplying: boolean
}) {
  const isPassed = mission.status === 'passed'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '620px',
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '10px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header Modal */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #21262d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isPassed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: isPassed ? '#10b981' : '#f59e0b',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              {isPassed ? '✓' : '!'}
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f0f6fc' }}>
                {mission.title}
              </h3>
              <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                Công cụ: <strong style={{ color: '#58a6ff' }}>{mission.toolName}</strong> · Trạng thái:{' '}
                <strong style={{ color: isPassed ? '#34d399' : '#f59e0b' }}>
                  {isPassed ? 'ĐÃ ĐẠT TIÊU CHUẨN' : 'CHƯA ĐẠT / CẦN THỰC HIỆN'}
                </strong>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn--ghost btn--sm"
            style={{ color: '#8b949e', padding: '4px' }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Nội dung Modal */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
          <div>
            <div style={{ fontWeight: 600, color: '#c9d1d9', marginBottom: '4px' }}>
              🎯 Yêu cầu nhiệm vụ:
            </div>
            <p style={{ margin: 0, color: '#8b949e', lineHeight: '1.5' }}>{mission.description}</p>
          </div>

          <div
            style={{
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#58a6ff', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏢</span> Thực tế môi trường doanh nghiệp:
            </div>
            <div style={{ color: '#8b949e', fontSize: '12px', lineHeight: '1.5' }}>
              {mission.industryContext}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            <div style={{ fontWeight: 600, color: '#a5b4fc', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>👨‍🏫</span> Gợi ý & Hướng dẫn của Giảng viên:
            </div>
            <div style={{ color: '#e0e7ff', fontSize: '12px', lineHeight: '1.5' }}>
              {mission.instructorNote}
            </div>
          </div>

          {mission.targetFile && (
            <div style={{ fontSize: '12px', color: '#8b949e' }}>
              📁 Tệp liên quan: <code style={{ color: '#79c0ff' }}>{mission.targetFile}</code>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #21262d',
            background: '#0d1117',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            className="btn btn--ghost btn--sm"
            onClick={onOpenCopilot}
            style={{ color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Icon name="terminal" size={13} />
            Mở Cố vấn xem Gợi ý 3 Cấp độ
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn--ghost btn--sm" onClick={onClose}>
              Đóng
            </button>
            {!isPassed && mission.remedyCode && (
              <button
                className="btn btn--ember btn--sm"
                onClick={onApplyFix}
                disabled={isApplying}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>{isApplying ? 'Đang áp dụng...' : 'Áp dụng mã gợi ý'}</span>
                <Icon name="arrowRight" size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
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
              CHƯA ĐẠT TIÊU CHUẨN KIỂM SOÁT BÀI THỰC HÀNH (QUALITY GATE BLOCKED)
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#e5e7eb' }}>
              Quy định Giảng viên: Cần hoàn thành các bước bắt buộc trước khi kích hoạt bộ giả lập nghiệm thu bài nộp
            </p>
          </div>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: '#d1d5db' }}>
            Hệ thống phát hiện mã nguồn của bạn còn thiếu các bước thực hành cốt lõi theo kịch bản của giảng viên. Để đảm bảo chất lượng, bạn cần hoàn thành các bước sau:
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
                    !
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
                  Xem chi tiết
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
              Mở Cố vấn xem hướng dẫn chi tiết
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
