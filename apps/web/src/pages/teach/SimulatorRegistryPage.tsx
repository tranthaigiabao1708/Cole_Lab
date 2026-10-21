import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type TeachSimulator } from '../../core/api'
import { vi } from '../../core/copy/vi'
import {
  ErrorNote,
  Loading,
  PageHead,
  Signal,
  usePageMeta,
} from '../../core/design-system/components'
import { Markdown } from '../../core/design-system/Markdown'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'

interface CategoryConfig {
  id: string
  label: string
  tone: 'pass' | 'warn' | 'critical' | 'neutral' | 'run'
}

interface TrackConfig {
  id: string
  name: string
  shortName: string
  categories: CategoryConfig[]
}

const TRACKS: TrackConfig[] = [
  {
    id: 'AI_ENGINEER',
    name: 'Khóa học Kỹ sư AI (AI Engineer)',
    shortName: 'AI Engineer',
    categories: [
      { id: 'cv', label: 'Thị giác máy tính (Computer Vision)', tone: 'run' },
      { id: 'rag', label: 'Trợ lý Chatbot RAG (Enterprise RAG)', tone: 'pass' },
      { id: 'nlp', label: 'Xử lý ngôn ngữ tự nhiên (NLP)', tone: 'neutral' },
      { id: 'tabular', label: 'Học máy dữ liệu bảng (Tabular ML)', tone: 'warn' },
      { id: 'timeseries', label: 'Chuỗi thời gian (Time-Series Forecasting)', tone: 'critical' },
      { id: 'audio', label: 'Xử lý âm thanh & Giọng nói (Audio/ASR)', tone: 'neutral' },
      { id: 'recsys', label: 'Hệ thống gợi ý (Recommendation)', tone: 'neutral' },
      { id: 'custom', label: 'Đặc thù AI tự định nghĩa (Custom AI)', tone: 'neutral' },
    ],
  },
  {
    id: 'DATA_ENGINEER',
    name: 'Khóa học Kỹ sư Dữ liệu (Data Engineer)',
    shortName: 'Data Engineer',
    categories: [
      { id: 'etl', label: 'Xây dựng luồng dữ liệu (Data Pipeline / Batch ETL)', tone: 'run' },
      { id: 'streaming', label: 'Xử lý dữ liệu thời gian thực (Kafka / Spark Streaming)', tone: 'critical' },
      { id: 'lakehouse', label: 'Data Lake & Lakehouse (Delta Lake / PySpark)', tone: 'pass' },
      { id: 'dbt', label: 'Mô hình hóa & Chuyển đổi dữ liệu (dbt / BigQuery)', tone: 'warn' },
      { id: 'custom_de', label: 'Đặc thù DE tự định nghĩa (Custom DE)', tone: 'neutral' },
    ],
  },
  {
    id: 'BUSINESS_ANALYST',
    name: 'Khóa học Phân tích Dữ liệu (Business Analyst)',
    shortName: 'Business Analyst',
    categories: [
      { id: 'sql', label: 'Truy vấn & Phân tích kinh doanh (SQL Analytics)', tone: 'pass' },
      { id: 'bi', label: 'Thiết kế Dashboard & Báo cáo số (BI Visuals)', tone: 'warn' },
      { id: 'abtest', label: 'Phân tích Thử nghiệm A/B (A/B Testing & Funnel)', tone: 'run' },
      { id: 'custom_ba', label: 'Đặc thù BA tự định nghĩa (Custom BA)', tone: 'neutral' },
    ],
  },
]

const ALL_CATEGORIES_MAP: Record<string, { label: string; tone: 'pass' | 'warn' | 'critical' | 'neutral' | 'run'; trackName: string }> = {}
for (const track of TRACKS) {
  for (const cat of track.categories) {
    ALL_CATEGORIES_MAP[cat.id] = { label: cat.label, tone: cat.tone, trackName: track.shortName }
  }
}

const DOCKER_IMAGES = [
  { value: 'cole/python-cpu:0.1', label: 'cole/python-cpu:0.1 (Python 3.12 chuẩn & Kho thư viện cơ bản)' },
  { value: 'cole/sim-base:1', label: 'cole/sim-base:1 (SDK Simulator Runner đa nền tảng)' },
  { value: 'cole/sim-cv-ok-ng:1.0.0', label: 'cole/sim-cv-ok-ng:1.0.0 (Thị giác máy tính OpenCV / PyTorch / Pillow)' },
  { value: 'cole/sim-rag-chatbot:1.0.0', label: 'cole/sim-rag-chatbot:1.0.0 (Chatbot RAG FastAPI / LLM / VectorDB)' },
  { value: 'cole/sim-echo-sample:1.0.0', label: 'cole/sim-echo-sample:1.0.0 (Pipeline chuẩn hóa dữ liệu)' },
]

export function SimulatorRegistryPage() {
  usePageMeta(vi.meta.simulatorsTitle, vi.teachSimulators.subheading)
  const { data: simulators, loading, error, reload } = useAsync(() => api.get<TeachSimulator[]>('/teach/simulators'), [])

  const [trackFilter, setTrackFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [previewSim, setPreviewSim] = useState<TeachSimulator | null>(null)

  // Create form states
  const [simName, setSimName] = useState('')
  const [simId, setSimId] = useState('')
  const [simTrack, setSimTrack] = useState('AI_ENGINEER')
  const [simCategory, setSimCategory] = useState('cv')
  const [simEntryPath, setSimEntryPath] = useState('solution/predict.py')
  const [trainImagesDir, setTrainImagesDir] = useState('data/train/')
  const [testImagesDir, setTestImagesDir] = useState('data/test/')
  const [testVideosDir, setTestVideosDir] = useState('data/test_videos/')
  const [structureViewTab, setStructureViewTab] = useState<'tree' | 'docs'>('tree')

  const [simMode, setSimMode] = useState<'python_impl' | 'http_service'>('python_impl')
  const [simImage, setSimImage] = useState(DOCKER_IMAGES[2].value)
  const [simRunCmd, setSimRunCmd] = useState('python -m solution.predict')
  const [simDesc, setSimDesc] = useState('')
  const [simCode, setSimCode] = useState(
    'class VideoAnalyzer:\n' +
    '    """\n' +
    '    Khuôn mẫu giải thuật Computer Vision & Phân tích Video của học viên.\n' +
    '    Hệ thống chấm tự động (Autograder) sẽ gọi trực tiếp các phương thức này.\n' +
    '    """\n' +
    '    def __init__(self):\n' +
    '        # Khởi tạo mô hình hoặc nạp trọng số tại đây\n' +
    '        pass\n\n' +
    '    def process_frame(self, frame) -> dict:\n' +
    '        """\n' +
    '        Nhận 1 frame ảnh (numpy ndarray BGR từ OpenCV).\n' +
    '        Trả về dict: {\'label\': \'OK\', \'confidence\': 0.98, \'boxes\': []}\n' +
    '        """\n' +
    '        return {"label": "OK", "confidence": 0.99, "boxes": []}\n\n' +
    '    def analyze_video(self, video_path: str) -> dict:\n' +
    '        """\n' +
    '        Phân tích luồng video (ví dụ: phát hiện lỗi, vẽ heatmap sân bóng).\n' +
    '        Trả về dict kết quả: {\'fps\': 30, \'total_events\': 0, \'status\': \'completed\'}\n' +
    '        """\n' +
    '        return {"fps": 30, "total_events": 0, "status": "completed"}\n\n' +
    'def predict(input_data: dict) -> dict:\n' +
    '    """Hàm wrapper hỗ trợ kiểm thử tương thích ngược"""\n' +
    '    analyzer = VideoAnalyzer()\n' +
    '    return analyzer.process_frame(input_data.get("frame"))\n',
  )
  const [simReadme, setSimReadme] = useState(
    '# Đề bài: Thị giác máy tính & Phân tích Video\n\n' +
    '## 1. Dữ liệu thực hành\n' +
    '- Thư mục ảnh huấn luyện & dán nhãn: `data/train/`\n' +
    '- Thư mục ảnh kiểm thử ẩn: `data/test/`\n' +
    '- Thư mục video kiểm thử thực tế: `data/test_videos/`\n\n' +
    '## 2. Tiêu chuẩn bài nộp (Contract Interface)\n' +
    'Học viên hoàn thiện lớp `VideoAnalyzer` trong file `solution/predict.py`. Hệ thống chấm điểm tự động sẽ gọi các phương thức `process_frame()` và `analyze_video()` trên tập test ẩn.\n',
  )
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<unknown>(null)

  // Danh sách categories khả dụng theo track đang chọn trong form tạo
  const availableCategoriesForForm = useMemo(() => {
    const t = TRACKS.find((trk) => trk.id === simTrack)
    return t ? t.categories : []
  }, [simTrack])

  const filteredSimulators = useMemo(() => {
    if (!simulators) return []
    return simulators.filter((s) => {
      const matchTrack = trackFilter === 'all' || s.track === trackFilter || (!s.track && trackFilter === 'AI_ENGINEER')
      const matchCategory = categoryFilter === 'all' || s.category === categoryFilter
      return matchTrack && matchCategory
    })
  }, [simulators, trackFilter, categoryFilter])

  // Xử lý khi chọn khóa học trong form tạo -> tự động đổi category tương ứng
  const handleTrackChange = (newTrack: string) => {
    setSimTrack(newTrack)
    const targetTrack = TRACKS.find((t) => t.id === newTrack)
    if (targetTrack && targetTrack.categories.length > 0) {
      const firstCat = targetTrack.categories[0].id
      handleCategoryChange(firstCat)
    }
  }

  // Xử lý khi đổi loại bài toán -> tự gợi ý môi trường, cấu trúc thư mục, lệnh chạy và mã khởi tạo
  const handleCategoryChange = (cat: string) => {
    setSimCategory(cat)

    if (cat === 'rag') {
      setSimMode('http_service')
      setSimEntryPath('app/main.py')
      setSimRunCmd('python -m uvicorn app.main:app --host 0.0.0.0 --port 8000')
      setSimImage('cole/sim-rag-chatbot:1.0.0')
      setSimCode(
        'from fastapi import FastAPI\n\napp = FastAPI(title="Enterprise RAG Assistant")\n\n@app.post("/query")\ndef query(payload: dict):\n    user_query = payload.get("query", "")\n    return {\n        "answer": f"Câu trả lời cho: {user_query}",\n        "citations": ["tai_lieu_noi_bo.pdf:Trang 2"]\n    }\n',
      )
      setSimReadme('# Đề bài: Trợ lý Chatbot RAG Doanh nghiệp\n\nTriển khai endpoint POST /query trong `app/main.py` để trả lời câu hỏi và trích xuất nguồn dẫn.')
    } else if (cat === 'cv') {
      setSimMode('python_impl')
      setSimEntryPath('solution/predict.py')
      setSimRunCmd('python -m solution.predict')
      setSimImage('cole/sim-cv-ok-ng:1.0.0')
      setTrainImagesDir('data/train/')
      setTestImagesDir('data/test/')
      setTestVideosDir('data/test_videos/')
      setSimCode(
        'class VideoAnalyzer:\n' +
        '    """\n' +
        '    Khuôn mẫu giải thuật Computer Vision & Phân tích Video của học viên.\n' +
        '    Hệ thống chấm tự động (Autograder) sẽ gọi trực tiếp các phương thức này.\n' +
        '    """\n' +
        '    def __init__(self):\n' +
        '        # Khởi tạo mô hình hoặc nạp trọng số tại đây\n' +
        '        pass\n\n' +
        '    def process_frame(self, frame) -> dict:\n' +
        '        """\n' +
        '        Nhận 1 frame ảnh (numpy ndarray BGR từ OpenCV).\n' +
        '        Trả về dict: {\'label\': \'OK\', \'confidence\': 0.98, \'boxes\': []}\n' +
        '        """\n' +
        '        return {"label": "OK", "confidence": 0.99, "boxes": []}\n\n' +
        '    def analyze_video(self, video_path: str) -> dict:\n' +
        '        """\n' +
        '        Phân tích luồng video (ví dụ: phát hiện lỗi, vẽ heatmap sân bóng).\n' +
        '        Trả về dict kết quả: {\'fps\': 30, \'total_events\': 0, \'status\': \'completed\'}\n' +
        '        """\n' +
        '        return {"fps": 30, "total_events": 0, "status": "completed"}\n\n' +
        'def predict(input_data: dict) -> dict:\n' +
        '    """Hàm wrapper hỗ trợ kiểm thử tương thích ngược"""\n' +
        '    analyzer = VideoAnalyzer()\n' +
        '    return analyzer.process_frame(input_data.get("frame"))\n',
      )
      setSimReadme(
        '# Đề bài: Thị giác máy tính & Phân tích Video\n\n' +
        '## 1. Dữ liệu thực hành\n' +
        '- Thư mục ảnh huấn luyện & dán nhãn: `data/train/`\n' +
        '- Thư mục ảnh kiểm thử ẩn: `data/test/`\n' +
        '- Thư mục video kiểm thử thực tế: `data/test_videos/`\n\n' +
        '## 2. Tiêu chuẩn bài nộp (Contract Interface)\n' +
        'Học viên hoàn thiện lớp `VideoAnalyzer` trong file `solution/predict.py`. Hệ thống chấm điểm tự động sẽ gọi các phương thức `process_frame()` và `analyze_video()` trên tập test ẩn.\n',
      )
    } else if (cat === 'etl' || cat === 'lakehouse') {
      setSimMode('python_impl')
      setSimEntryPath('pipeline/run_etl.py')
      setSimRunCmd('python pipeline/run_etl.py')
      setSimImage('cole/python-cpu:0.1')
      setSimCode(
        'def process_pipeline(raw_records: list[dict]) -> list[dict]:\n    """Lọc và chuẩn hóa dữ liệu từ nguồn thô."""\n    return [r for r in raw_records if r.get("valid")]\n',
      )
      setSimReadme('# Đề bài: Xây dựng Pipeline ETL Dữ liệu\n\nĐọc dữ liệu thô, loại bỏ bản ghi thiếu thông tin và lưu dữ liệu chuẩn hóa.')
    } else if (cat === 'sql') {
      setSimMode('python_impl')
      setSimEntryPath('queries/analysis.sql')
      setSimRunCmd('python -m solution.runner')
      setSimImage('cole/python-cpu:0.1')
      setSimCode('-- Viết câu truy vấn phân tích doanh số và retention tại đây\nSELECT user_id, COUNT(order_id) AS total_orders\nFROM orders\nGROUP BY user_id\nHAVING COUNT(order_id) >= 3;\n')
      setSimReadme('# Đề bài: Phân tích hành vi mua sắm lặp lại\n\nViết câu truy vấn SQL trong `queries/analysis.sql` để trích xuất danh sách khách hàng trung thành.')
    } else if (cat === 'timeseries') {
      setSimMode('python_impl')
      setSimEntryPath('solution/forecast.py')
      setSimRunCmd('python -m solution.forecast')
      setSimImage('cole/python-cpu:0.1')
      setSimCode(
        'def forecast(historical_series: list[float], steps: int = 5) -> list[float]:\n    """Dự báo chuỗi thời gian không rò rỉ dữ liệu tương lai."""\n    last_val = historical_series[-1] if historical_series else 0.0\n    return [last_val] * steps\n',
      )
      setSimReadme('# Đề bài: Dự báo phụ tải chuỗi thời gian\n\nHoàn thành hàm `forecast` trong `solution/forecast.py` để dự báo giá trị cho các bước tiếp theo.')
    } else {
      setSimMode('python_impl')
      setSimEntryPath('solution/main.py')
      setSimRunCmd('python -m solution.main')
      setSimImage('cole/python-cpu:0.1')
      setSimCode('def run(data: dict) -> dict:\n    # Thuật toán học viên\n    return {"success": True}\n')
      setSimReadme('# Đề bài thực hành\n\nHoàn thiện bài làm trong thư mục `solution/`.')
    }
  }

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!simName.trim()) {
      setFormError(new Error('Vui lòng nhập tên bộ simulator.'))
      return
    }

    const finalId = simId.trim() || `cole.${simName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`

    setSubmitting(true)
    setFormError(null)
    try {
      const payload: Record<string, unknown> = {
        id: finalId,
        name: simName.trim(),
        description: simDesc.trim(),
        track: simTrack,
        category: simCategory,
        entry_path: simEntryPath.trim(),
        mode: simMode,
        image: simImage,
        run_command: simRunCmd.trim(),
        default_code: simCode,
        default_readme: simReadme,
      }

      if (simCategory === 'cv') {
        payload.dataset_config = {
          train_images_dir: trainImagesDir.trim(),
          test_images_dir: testImagesDir.trim(),
          test_videos_dir: testVideosDir.trim(),
        }
      }

      await api.post('/teach/simulators', payload)
      setShowCreateForm(false)
      // Reset form
      setSimId('')
      setSimName('')
      setSimDesc('')
      reload()
    } catch (err) {
      setFormError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1160, margin: '0 auto' }}>
      <PageHead code={vi.teachSimulators.sheetCode} title={vi.teachSimulators.heading}>
        <button
          type="button"
          className="btn btn--ember"
          id="btn-open-create-sim"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          <Icon name={showCreateForm ? 'close' : 'plus'} size={14} />
          <span>{showCreateForm ? 'Đóng form' : vi.teachSimulators.createBtn}</span>
        </button>
      </PageHead>

      <p className="muted" style={{ marginBottom: 'var(--space-6)', marginTop: '-var(--space-2)' }}>
        {vi.teachSimulators.subheading}
      </p>

      {/* Form tạo Simulator mới */}
      {showCreateForm && (
        <div
          className="panel"
          style={{
            borderLeft: '4px solid var(--ember-500)',
            marginBottom: 'var(--space-6)',
            background: 'var(--paper-50)',
          }}
        >
          <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>{vi.teachSimulators.createTitle}</span>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setShowCreateForm(false)}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="panel__body">
            {formError ? <ErrorNote error={formError} onRetry={() => setFormError(null)} id="sim-form-error" /> : null}

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Tên & Mã định danh */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                <label className="field">
                  <span className="field__label">{vi.teachSimulators.nameLabel} *</span>
                  <input
                    className="input"
                    id="new-sim-name"
                    value={simName}
                    onChange={(e) => {
                      setSimName(e.target.value)
                      if (!simId) {
                        const s = e.target.value
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/[đĐ]/g, 'd')
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-+|-+$/g, '')
                        setSimId(`cole.${s}`)
                      }
                    }}
                    placeholder={vi.teachSimulators.namePlaceholder}
                    required
                    disabled={submitting}
                  />
                </label>

                <label className="field">
                  <span className="field__label">{vi.teachSimulators.idLabel} *</span>
                  <input
                    className="input mono"
                    id="new-sim-id"
                    value={simId}
                    onChange={(e) => setSimId(e.target.value)}
                    placeholder={vi.teachSimulators.idPlaceholder}
                    required
                    disabled={submitting}
                  />
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{vi.teachSimulators.idHelp}</span>
                </label>
              </div>

              {/* 2 cấp phân loại: KHÓA HỌC >> DẠNG BÀI TOÁN */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', background: 'var(--paper-100)', padding: 'var(--space-3)', borderRadius: 'var(--radius)' }}>
                <label className="field">
                  <span className="field__label" style={{ color: 'var(--ember-700)', fontWeight: 600 }}>
                    1. {vi.teachSimulators.trackLabel} *
                  </span>
                  <select
                    className="select"
                    id="new-sim-track"
                    value={simTrack}
                    onChange={(e) => handleTrackChange(e.target.value)}
                    disabled={submitting}
                    style={{ fontWeight: 500 }}
                  >
                    {TRACKS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                    Chọn chương trình đào tạo để hiển thị các dạng bài toán chuyên môn phù hợp.
                  </span>
                </label>

                <label className="field">
                  <span className="field__label" style={{ color: 'var(--ember-700)', fontWeight: 600 }}>
                    2. {vi.teachSimulators.categoryLabel} *
                  </span>
                  <select
                    className="select"
                    id="new-sim-category"
                    value={simCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    disabled={submitting}
                  >
                    {availableCategoriesForForm.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                    Đặc thù bài toán sẽ quyết định cấu trúc code khởi tạo và cách thiết lập môi trường.
                  </span>
                </label>
              </div>

              {/* Mục đặc thù: DỮ LIỆU COMPUTER VISION (ẢNH TRAIN, ẢNH TEST, VIDEO TEST THỰC TẾ) */}
              {simCategory === 'cv' && (
                <div
                  style={{
                    background: 'var(--paper-100)',
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius)',
                    borderLeft: '4px solid var(--ember-600)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Signal tone="run">DỮ LIỆU ĐẶC THÙ COMPUTER VISION (CV &amp; VIDEO)</Signal>
                    <strong style={{ fontSize: 'var(--fs-sm)' }}>{vi.teachSimulators.cvDataTitle}</strong>
                  </div>
                  <p className="muted" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
                    {vi.teachSimulators.cvDataDesc}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
                    <label className="field">
                      <span className="field__label">📁 {vi.teachSimulators.trainImagesLabel} *</span>
                      <input
                        className="input mono"
                        id="cv-train-dir"
                        value={trainImagesDir}
                        onChange={(e) => setTrainImagesDir(e.target.value)}
                        placeholder="data/train/"
                        required
                        disabled={submitting}
                      />
                      <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        Học viên được phép truy cập tự do để train mô hình &amp; gán nhãn dữ liệu.
                      </span>
                    </label>

                    <label className="field">
                      <span className="field__label">📁 {vi.teachSimulators.testImagesLabel} *</span>
                      <input
                        className="input mono"
                        id="cv-test-dir"
                        value={testImagesDir}
                        onChange={(e) => setTestImagesDir(e.target.value)}
                        placeholder="data/test/"
                        required
                        disabled={submitting}
                      />
                      <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        Tập ảnh kiểm thử ẩn dùng để chấm điểm F1/mAP khi nộp bài.
                      </span>
                    </label>

                    <label className="field">
                      <span className="field__label">🎬 {vi.teachSimulators.testVideosLabel} *</span>
                      <input
                        className="input mono"
                        id="cv-video-dir"
                        value={testVideosDir}
                        onChange={(e) => setTestVideosDir(e.target.value)}
                        placeholder="data/test_videos/"
                        required
                        disabled={submitting}
                      />
                      <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                        Video clip thực tế để test heatmap sân bóng, đếm đối tượng hoặc phát hiện sự cố.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Sơ đồ cây cấu trúc thư mục & File bài làm chính (Gợi ý trực quan Docs & Tree diagram) */}
              <div style={{ background: 'var(--paper-100)', padding: 'var(--space-4)', borderRadius: 'var(--radius)', border: 'var(--hair) solid var(--paper-300)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--ember-800)' }}>
                      📂 {vi.teachSimulators.scaffoldTitle}
                    </div>
                    <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      {vi.teachSimulators.scaffoldDesc}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      type="button"
                      className={`btn btn--xs ${structureViewTab === 'tree' ? 'btn--ember' : 'btn--ghost'}`}
                      onClick={() => setStructureViewTab('tree')}
                    >
                      <Icon name="folder" size={12} />
                      <span>Sơ đồ cây trực quan</span>
                    </button>
                    <button
                      type="button"
                      className={`btn btn--xs ${structureViewTab === 'docs' ? 'btn--ember' : 'btn--ghost'}`}
                      onClick={() => setStructureViewTab('docs')}
                    >
                      <Icon name="file" size={12} />
                      <span>Tài liệu cấu trúc (Docs)</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                  <label className="field">
                    <span className="field__label">{vi.teachSimulators.entryPathLabel} *</span>
                    <input
                      className="input mono"
                      id="new-sim-entry-path"
                      value={simEntryPath}
                      onChange={(e) => setSimEntryPath(e.target.value)}
                      placeholder={vi.teachSimulators.entryPathPlaceholder}
                      required
                      disabled={submitting}
                    />
                    <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                      {vi.teachSimulators.entryPathHelp}
                    </span>
                  </label>

                  <label className="field">
                    <span className="field__label">{vi.teachSimulators.modeLabel}</span>
                    <select
                      className="select"
                      id="new-sim-mode"
                      value={simMode}
                      onChange={(e) => setSimMode(e.target.value as 'python_impl' | 'http_service')}
                      disabled={submitting}
                    >
                      <option value="python_impl">{vi.teachSimulators.modePython}</option>
                      <option value="http_service">{vi.teachSimulators.modeHttp}</option>
                    </select>
                  </label>
                </div>

                {/* Visual Scaffold Display */}
                {structureViewTab === 'tree' ? (
                  <div style={{ background: 'var(--ink-950)', color: '#d8dee9', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius)', fontSize: '13px', fontFamily: 'monospace', lineHeight: 1.6 }}>
                    <div style={{ color: '#88c0d0', fontWeight: 'bold' }}>📦 workspace/ (Môi trường Web IDE của học viên)</div>
                    {simCategory === 'cv' ? (
                      <>
                        <div>&nbsp;┣ 📂 <span style={{ color: '#81a1c1' }}>data/</span></div>
                        <div>&nbsp;┃ ┣ 📁 <span style={{ color: '#a3be8c' }}>{trainImagesDir.replace(/^data\//, '') || 'train/'}</span> <span style={{ color: '#616e88' }}>&larr; Bộ ảnh huấn luyện &amp; dán nhãn (Học viên train model)</span></div>
                        <div>&nbsp;┃ ┣ 📁 <span style={{ color: '#ebcb8b' }}>{testImagesDir.replace(/^data\//, '') || 'test/'}</span> <span style={{ color: '#616e88' }}>&larr; Bộ ảnh kiểm thử ẩn (Autograder chấm F1/mAP)</span></div>
                        <div>&nbsp;┃ ┗ 🎬 <span style={{ color: '#b48ead' }}>{testVideosDir.replace(/^data\//, '') || 'test_videos/'}</span> <span style={{ color: '#616e88' }}>&larr; Video kiểm thử thực tế (Chấm điểm heatmap / phân tích lỗi)</span></div>
                        <div>&nbsp;┣ 📂 <span style={{ color: '#81a1c1' }}>{simEntryPath.includes('/') ? simEntryPath.split('/')[0] + '/' : 'solution/'}</span></div>
                        <div>&nbsp;┃ ┗ 🐍 <span style={{ color: '#d08770', fontWeight: 'bold' }}>{simEntryPath.includes('/') ? simEntryPath.split('/').slice(1).join('/') : simEntryPath}</span> <span style={{ background: 'var(--ember-600)', color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold', marginLeft: '6px' }}>HỌC VIÊN CODE TẠI ĐÂY</span></div>
                        <div>&nbsp;┗ 📄 <span style={{ color: '#eceff4' }}>README.md</span> <span style={{ color: '#616e88' }}>&larr; Đề bài &amp; Hướng dẫn nghiệm thu</span></div>
                      </>
                    ) : simCategory === 'rag' ? (
                      <>
                        <div>&nbsp;┣ 📂 <span style={{ color: '#81a1c1' }}>docs/</span> <span style={{ color: '#616e88' }}>&larr; Kho tri thức văn bản doanh nghiệp</span></div>
                        <div>&nbsp;┣ 📂 <span style={{ color: '#81a1c1' }}>app/</span></div>
                        <div>&nbsp;┃ ┗ 🐍 <span style={{ color: '#d08770', fontWeight: 'bold' }}>main.py</span> <span style={{ background: 'var(--ember-600)', color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold', marginLeft: '6px' }}>DỊCH VỤ RAG FASTAPI</span></div>
                        <div>&nbsp;┗ 📄 <span style={{ color: '#eceff4' }}>README.md</span></div>
                      </>
                    ) : (
                      <>
                        <div>&nbsp;┣ 📂 <span style={{ color: '#81a1c1' }}>data/</span> <span style={{ color: '#616e88' }}>&larr; Dữ liệu mẫu thực hành</span></div>
                        <div>&nbsp;┣ 📂 <span style={{ color: '#81a1c1' }}>{simEntryPath.includes('/') ? simEntryPath.split('/')[0] + '/' : 'solution/'}</span></div>
                        <div>&nbsp;┃ ┗ 📄 <span style={{ color: '#d08770', fontWeight: 'bold' }}>{simEntryPath.includes('/') ? simEntryPath.split('/').slice(1).join('/') : simEntryPath}</span> <span style={{ background: 'var(--ember-600)', color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold', marginLeft: '6px' }}>FILE LÀM BÀI CHÍNH</span></div>
                        <div>&nbsp;┗ 📄 <span style={{ color: '#eceff4' }}>README.md</span></div>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ background: 'var(--paper-0)', padding: 'var(--space-3)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-xs)', border: 'var(--hair) solid var(--paper-200)', lineHeight: 1.6 }}>
                    <p style={{ margin: '0 0 var(--space-2)' }}>
                      <strong>Mô tả cấu trúc thư mục làm bài cho học viên:</strong>
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
                      <li>Thư mục làm việc mặc định: <code>workspace/</code></li>
                      {simCategory === 'cv' && (
                        <>
                          <li><code>{trainImagesDir}</code>: Chứa ảnh train để học viên tự train mô hình / gán nhãn.</li>
                          <li><code>{testImagesDir}</code>: Chứa tập ảnh kiểm thử ẩn dùng để chấm điểm F1/Accuracy.</li>
                          <li><code>{testVideosDir}</code>: Chứa video clip thực tế để phân tích diễn biến và heatmap.</li>
                        </>
                      )}
                      <li>File bài làm chính: <code>{simEntryPath}</code> (Học viên chỉ cần sửa file này, không sợ làm lệch cấu trúc dự án).</li>
                      <li>Hệ thống autograder sẽ tự động tìm kiếm file <code>{simEntryPath}</code> và nạp lớp <code>VideoAnalyzer</code> để chạy kiểm thử.</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Môi trường Docker Image & Lệnh chạy kiểm thử mẫu kèm chú thích rõ ràng */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                <label className="field">
                  <span className="field__label">{vi.teachSimulators.imageLabel}</span>
                  <select
                    className="select mono"
                    id="new-sim-image"
                    value={simImage}
                    onChange={(e) => setSimImage(e.target.value)}
                    disabled={submitting}
                  >
                    {DOCKER_IMAGES.map((img) => (
                      <option key={img.value} value={img.value}>
                        {img.label}
                      </option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                    {vi.teachSimulators.imageHelp}
                  </span>
                </label>

                <label className="field">
                  <span className="field__label">{vi.teachSimulators.runCommandLabel}</span>
                  <input
                    className="input mono"
                    id="new-sim-run-cmd"
                    value={simRunCmd}
                    onChange={(e) => setSimRunCmd(e.target.value)}
                    disabled={submitting}
                  />
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                    {vi.teachSimulators.runCommandHelp}
                  </span>
                </label>
              </div>

              <label className="field">
                <span className="field__label">{vi.teachSimulators.descLabel}</span>
                <textarea
                  className="textarea"
                  id="new-sim-desc"
                  rows={2}
                  value={simDesc}
                  onChange={(e) => setSimDesc(e.target.value)}
                  placeholder={vi.teachSimulators.descPlaceholder}
                  disabled={submitting}
                />
              </label>

              <label className="field">
                <span className="field__label">
                  {vi.teachSimulators.defaultCodeLabel} (File: <code className="mono">{simEntryPath || 'solution/predict.py'}</code>)
                </span>
                <textarea
                  className="textarea mono"
                  id="new-sim-code"
                  rows={6}
                  value={simCode}
                  onChange={(e) => setSimCode(e.target.value)}
                  disabled={submitting}
                />
                <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  {vi.teachSimulators.codeHelp}
                </span>
              </label>

              <label className="field">
                <span className="field__label">{vi.teachSimulators.defaultReadmeLabel}</span>
                <textarea
                  className="textarea mono"
                  id="new-sim-readme"
                  rows={4}
                  value={simReadme}
                  onChange={(e) => setSimReadme(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowCreateForm(false)}
                  disabled={submitting}
                >
                  {vi.common.cancel}
                </button>
                <button
                  type="submit"
                  className="btn btn--ember"
                  id="btn-submit-new-sim"
                  disabled={submitting || !simName.trim()}
                >
                  {submitting ? vi.teachSimulators.submitting : vi.teachSimulators.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toolbar bộ lọc theo Khóa học đào tạo và Dạng bài toán */}
      <div className="toolbar" style={{ marginBottom: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'stretch' }}>
        {/* Bộ lọc cấp 1: Khóa học */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', marginRight: 'var(--space-1)', fontWeight: 600 }}>
            Khóa học:
          </span>
          <button
            type="button"
            className={`btn btn--sm ${trackFilter === 'all' ? 'btn--ember' : 'btn--ghost'}`}
            onClick={() => {
              setTrackFilter('all')
              setCategoryFilter('all')
            }}
          >
            Tất cả khóa học ({simulators?.length ?? 0})
          </button>
          {TRACKS.map((trk) => {
            const count = simulators?.filter((s) => (s.track || 'AI_ENGINEER') === trk.id).length ?? 0
            return (
              <button
                key={trk.id}
                type="button"
                className={`btn btn--sm ${trackFilter === trk.id ? 'btn--ember' : 'btn--ghost'}`}
                onClick={() => {
                  setTrackFilter(trk.id)
                  setCategoryFilter('all')
                }}
              >
                {trk.shortName} ({count})
              </button>
            )
          })}
        </div>

        {/* Bộ lọc cấp 2: Dạng bài toán */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', borderTop: 'var(--hair) solid var(--paper-200)', paddingTop: 'var(--space-2)' }}>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', marginRight: 'var(--space-1)', fontWeight: 600 }}>
            Dạng bài toán:
          </span>
          <button
            type="button"
            className={`btn btn--sm ${categoryFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setCategoryFilter('all')}
          >
            {vi.teachSimulators.filterAll}
          </button>
          {Object.entries(ALL_CATEGORIES_MAP).map(([catKey, catInfo]) => {
            const count = simulators?.filter((s) => {
              const matchTrack = trackFilter === 'all' || (s.track || 'AI_ENGINEER') === trackFilter
              return matchTrack && s.category === catKey
            }).length ?? 0
            if (count === 0 && categoryFilter !== catKey) return null
            return (
              <button
                key={catKey}
                type="button"
                className={`btn btn--sm ${categoryFilter === catKey ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setCategoryFilter(catKey)}
              >
                {catInfo.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {loading && <Loading />}
      {error ? <ErrorNote error={error} onRetry={reload} id="simulators-load-error" /> : null}

      {/* Danh sách Simulator trong kho */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 'var(--space-4)' }}>
        {filteredSimulators.map((s) => {
          const catMeta = ALL_CATEGORIES_MAP[s.category] ?? { label: s.category.toUpperCase(), tone: 'neutral', trackName: 'AI Engineer' }
          const trackLabel = TRACKS.find((t) => t.id === s.track)?.shortName || catMeta.trackName || 'AI Engineer'
          const entryFile = s.entry_path || 'solution/predict.py'

          return (
            <div
              key={s.id}
              className="panel"
              id={`sim-card-${s.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'box-shadow var(--dur-ui) var(--ease), border-color var(--dur-ui) var(--ease)',
              }}
            >
              <div>
                <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    <Signal tone="neutral">{trackLabel}</Signal>
                    <Signal tone={catMeta.tone}>{catMeta.label}</Signal>
                  </div>
                  <span className="mono muted" style={{ fontSize: 'var(--fs-xs)' }}>v{s.version}</span>
                </div>
                <div className="panel__body">
                  <h3 style={{ margin: '0 0 var(--space-1)', fontSize: 'var(--fs-md)', fontWeight: 600 }}>{s.name}</h3>
                  <code className="sheet-code" style={{ display: 'inline-block', marginBottom: 'var(--space-3)' }}>
                    {s.id}
                  </code>
                  <p className="muted" style={{ fontSize: 'var(--fs-sm)', minHeight: 40, margin: '0 0 var(--space-3)' }}>
                    {s.description || 'Bộ simulator kiểm thử môi trường container chuyên biệt.'}
                  </p>

                  <div style={{ background: 'var(--paper-100)', padding: 'var(--space-3)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-xs)', marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="muted">File bài làm khởi tạo:</span>
                      <strong className="mono" style={{ color: 'var(--ember-700)' }}>📁 {entryFile}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="muted">Chế độ nộp bài:</span>
                      <strong className="mono">{s.mode}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="muted">Lệnh kiểm thử tự động:</span>
                      <strong className="mono">{s.run_command}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="muted">Docker Image:</span>
                      <span className="mono muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }} title={s.image}>
                        {s.image}
                      </span>
                    </div>
                    {s.dataset_config && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: 'var(--hair) dashed var(--paper-200)' }}>
                        <span className="muted">Dữ liệu CV:</span>
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--ember-700)' }}>
                          Train / Test / Video
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderTop: 'var(--hair) solid var(--paper-200)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setPreviewSim(previewSim?.id === s.id ? null : s)}
                >
                  <Icon name="file" size={14} />
                  <span>{previewSim?.id === s.id ? 'Ẩn cấu hình' : 'Xem cấu hình'}</span>
                </button>

                <Link
                  to={`/teach/assignments/new?simulator=${s.id}`}
                  className="btn btn--sm btn--ember"
                  id={`btn-create-lab-${s.id}`}
                >
                  <Icon name="plus" size={12} />
                  <span>Tạo bài lab</span>
                </Link>
              </div>

              {previewSim?.id === s.id && (
                <div style={{ padding: 'var(--space-4)', background: 'var(--paper-0)', borderTop: 'var(--hair) solid var(--paper-300)' }}>
                  {s.dataset_config && (
                    <div style={{ marginBottom: 'var(--space-3)', background: 'var(--paper-100)', padding: 'var(--space-3)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-xs)' }}>
                      <span className="mono muted" style={{ textTransform: 'uppercase', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                        Các thư mục dữ liệu được mount vào Workspace:
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div>📁 Ảnh train: <code className="mono">{s.dataset_config.train_images_dir || 'data/train/'}</code></div>
                        <div>📁 Ảnh test ẩn: <code className="mono">{s.dataset_config.test_images_dir || 'data/test/'}</code></div>
                        <div>🎬 Video kiểm thử: <code className="mono">{s.dataset_config.test_videos_dir || 'data/test_videos/'}</code></div>
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="mono muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase' }}>
                        File bài làm &amp; Khuôn mẫu giải thuật (Contract):
                      </span>
                      <code className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ember-700)' }}>
                        {entryFile}
                      </code>
                    </div>
                    <pre style={{ margin: '4px 0 0', padding: 'var(--space-3)', background: 'var(--ink-950)', color: 'var(--paper-0)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-xs)', overflow: 'auto', maxHeight: 160 }}>
                      <code>{s.default_code}</code>
                    </pre>
                  </div>
                  <div>
                    <span className="mono muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase' }}>
                      Nội dung đề bài mẫu:
                    </span>
                    <div style={{ margin: '4px 0 0', padding: 'var(--space-3)', background: 'var(--paper-100)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-xs)', maxHeight: 140, overflow: 'auto' }}>
                      <Markdown source={s.default_readme} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!loading && filteredSimulators.length === 0 && (
        <div className="panel" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>{vi.teachSimulators.empty}</p>
        </div>
      )}
    </div>
  )
}

