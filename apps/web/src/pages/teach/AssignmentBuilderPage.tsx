import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type CourseDetail, type CourseSummary, type Lesson, type TeachSimulator } from '../../core/api'
import { vi } from '../../core/copy/vi'
import {
  ErrorNote,
  Loading,
  PageHead,
  usePageMeta,
} from '../../core/design-system/components'
import { Markdown } from '../../core/design-system/Markdown'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'
import { trackOf } from '../../tracks/config'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}

export function AssignmentBuilderPage() {
  usePageMeta(vi.builder.heading, vi.builder.subheading)
  const nav = useNavigate()
  const [params] = useSearchParams()

  const urlCourseId = params.get('courseId') ?? ''
  const urlLessonId = params.get('lessonId') ?? ''
  const urlSimulator = params.get('simulator') ?? ''

  // Load kho simulator động từ backend
  const { data: simulators, loading: simsLoading } = useAsync(
    () => api.get<TeachSimulator[]>('/teach/simulators'),
    [],
  )

  const { data: courses, loading: coursesLoading } = useAsync(() => api.get<CourseSummary[]>('/courses'), [])
  const [selectedCourseId, setSelectedCourseId] = useState(urlCourseId)

  useEffect(() => {
    if (urlCourseId && !selectedCourseId) {
      setSelectedCourseId(urlCourseId)
    }
  }, [urlCourseId, selectedCourseId])

  const { data: courseDetail, loading: detailLoading } = useAsync(
    () => (selectedCourseId ? api.get<CourseDetail>(`/courses/${selectedCourseId}`) : Promise.resolve(null)),
    [selectedCourseId],
  )

  // Danh sách các buổi học của khóa
  const allLessons = useMemo(() => {
    if (!courseDetail) return []
    const list: { lesson: Lesson; moduleCode: string; moduleTitle: string }[] = []
    courseDetail.modules.forEach((m) => {
      m.lessons.forEach((l) => {
        list.push({ lesson: l, moduleCode: m.code, moduleTitle: m.title })
      })
    })
    return list
  }, [courseDetail])

  const [selectedLessonId, setSelectedLessonId] = useState(urlLessonId)

  useEffect(() => {
    if (urlLessonId) setSelectedLessonId(urlLessonId)
  }, [urlLessonId])

  const currentLessonItem = useMemo(
    () => allLessons.find((item) => item.lesson.id === selectedLessonId),
    [allLessons, selectedLessonId],
  )

  const [pluginId, setPluginId] = useState(urlSimulator || 'cole.cv-ok-ng')

  // Set default pluginId when simulators loaded
  useEffect(() => {
    if (simulators && simulators.length > 0) {
      if (urlSimulator && simulators.some((s) => s.id === urlSimulator)) {
        setPluginId(urlSimulator)
      } else if (!simulators.some((s) => s.id === pluginId)) {
        setPluginId(simulators[0].id)
      }
    }
  }, [simulators, urlSimulator, pluginId])

  const currentSim = useMemo(
    () => simulators?.find((s) => s.id === pluginId),
    [simulators, pluginId],
  )

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [runCommand, setRunCommand] = useState('')
  const [readme, setReadme] = useState('')
  const [starterCode, setStarterCode] = useState('')
  const [readmeTab, setReadmeTab] = useState<'edit' | 'preview'>('edit')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [createdResult, setCreatedResult] = useState<{ id: string; slug: string; title: string } | null>(null)

  // Populate simulator details when currentSim changes and fields are empty
  useEffect(() => {
    if (currentSim) {
      setRunCommand((prev) => (prev ? prev : currentSim.run_command))
      setReadme((prev) => (prev ? prev : currentSim.default_readme))
      setStarterCode((prev) => (prev ? prev : currentSim.default_code))
    }
  }, [currentSim])

  // Tự động gợi ý title & slug theo buổi học
  useEffect(() => {
    if (currentLessonItem && !title) {
      const sNum = currentLessonItem.lesson.session_numbers.length
        ? `B${currentLessonItem.lesson.session_numbers.join('+')}`
        : `L${currentLessonItem.lesson.order}`
      const defaultTitle = `Thực hành ${sNum}: ${currentLessonItem.lesson.title}`
      setTitle(defaultTitle)
      if (!slugManual) {
        setSlug(slugify(`${currentLessonItem.moduleCode}-${sNum}-${currentLessonItem.lesson.title}`))
      }
    }
  }, [currentLessonItem, title, slugManual])

  const [qualityGates, setQualityGates] = useState<Array<{
    id: string
    title: string
    tool: string
    required_keywords: string
    required_files: string
    mentor_hint: string
    is_blocking: boolean
  }>>([
    {
      id: 'preprocessing',
      title: 'Tiền xử lý ảnh (CLAHE & Letterbox)',
      tool: 'OpenCV',
      required_keywords: 'preprocess_frame, clahe, letterbox',
      required_files: '',
      mentor_hint: 'Cần cân bằng chói sáng đèn sân bóng và giữ tỷ lệ ảnh 640x640 tránh làm méo cầu thủ.',
      is_blocking: true,
    },
    {
      id: 'annotations',
      title: 'Quản trị nhãn Ground Truth chuẩn COCO',
      tool: 'CVAT / Roboflow',
      required_keywords: '',
      required_files: 'annotations/annotations.json',
      mentor_hint: 'Cần tệp nhãn Bounding Box chuẩn để huấn luyện và đánh giá mAP.',
      is_blocking: true,
    },
    {
      id: 'training',
      title: 'Pipeline Huấn luyện & Tinh chỉnh mô hình',
      tool: 'PyTorch / W&B',
      required_keywords: 'train_tactical_model, lr, optimizer, epochs',
      required_files: 'solution/train.py',
      mentor_hint: 'Xây dựng kịch bản train 30 epochs, tinh chỉnh siêu tham số và áp dụng Early Stopping.',
      is_blocking: true,
    },
    {
      id: 'loss_curves',
      title: 'Chẩn đoán Overfitting qua Biểu đồ',
      tool: 'TensorBoard',
      required_keywords: '',
      required_files: 'runs/train/curves.png',
      mentor_hint: 'Yêu cầu xuất đồ thị Train/Val Loss để phát hiện hiện tượng học vẹt và xác định điểm dừng tối ưu.',
      is_blocking: true,
    },
    {
      id: 'homography_2d',
      title: 'Sa bàn 2D & Ma trận Bản đồ nhiệt',
      tool: 'SciPy / StatsBomb',
      required_keywords: 'analyze_video, heatmap_grid',
      required_files: '',
      mentor_hint: 'Chuyển đổi phối cảnh camera sân cỏ sang tọa độ 2D phẳng 105x68m.',
      is_blocking: true,
    },
    {
      id: 'onnx_deployment',
      title: 'Tối ưu hóa mô hình & Cấu hình YAML',
      tool: 'ONNX Runtime',
      required_keywords: '',
      required_files: 'configs/tactical_config.yaml',
      mentor_hint: 'Tách biệt siêu tham số cấu hình và tối ưu hóa runtime suy luận.',
      is_blocking: false,
    },
  ])

  const handlePluginChange = (newPluginId: string) => {
    setPluginId(newPluginId)
    const newSim = simulators?.find((s) => s.id === newPluginId)
    if (newSim) {
      setRunCommand(newSim.run_command)
      setReadme(newSim.default_readme)
      setStarterCode(newSim.default_code)
    }
  }

  const loadCvTemplate = () => {
    setQualityGates([
      {
        id: 'preprocessing',
        title: 'Tiền xử lý ảnh (CLAHE & Letterbox)',
        tool: 'OpenCV',
        required_keywords: 'preprocess_frame, clahe, letterbox',
        required_files: '',
        mentor_hint: 'Cân bằng chói sáng đèn sân bóng và giữ tỷ lệ ảnh 640x640.',
        is_blocking: true,
      },
      {
        id: 'annotations',
        title: 'Quản trị nhãn Ground Truth',
        tool: 'CVAT / Roboflow',
        required_keywords: '',
        required_files: 'annotations/annotations.json',
        mentor_hint: 'Cần tệp nhãn Bounding Box chuẩn để huấn luyện và đánh giá mAP.',
        is_blocking: true,
      },
      {
        id: 'training',
        title: 'Pipeline Huấn luyện & Tinh chỉnh',
        tool: 'PyTorch / W&B',
        required_keywords: 'train_tactical_model, lr, optimizer, epochs',
        required_files: 'solution/train.py',
        mentor_hint: 'Xây dựng kịch bản train, tinh chỉnh siêu tham số và áp dụng Early Stopping.',
        is_blocking: true,
      },
      {
        id: 'loss_curves',
        title: 'Chẩn đoán Overfitting qua Biểu đồ',
        tool: 'TensorBoard',
        required_keywords: '',
        required_files: 'runs/train/curves.png',
        mentor_hint: 'Yêu cầu xuất đồ thị Train/Val Loss để phát hiện overfitting.',
        is_blocking: true,
      },
      {
        id: 'homography_2d',
        title: 'Sa bàn 2D & Ma trận Nhiệt',
        tool: 'SciPy',
        required_keywords: 'analyze_video, heatmap_grid',
        required_files: '',
        mentor_hint: 'Chuyển đổi phối cảnh camera sân cỏ sang tọa độ 2D phẳng 105x68m.',
        is_blocking: true,
      },
      {
        id: 'onnx_deployment',
        title: 'Tối ưu hóa mô hình ONNX & Config',
        tool: 'ONNX Runtime',
        required_keywords: '',
        required_files: 'configs/tactical_config.yaml',
        mentor_hint: 'Tách biệt siêu tham số cấu hình và tối ưu hóa runtime suy luận.',
        is_blocking: false,
      },
    ])
  }

  const loadRagTemplate = () => {
    setQualityGates([
      {
        id: 'chunking',
        title: 'Chunking & Tiền xử lý Văn bản',
        tool: 'LangChain',
        required_keywords: 'split_documents, chunk_size, chunk_overlap',
        required_files: '',
        mentor_hint: 'Cần phân đoạn văn bản phù hợp với ngữ cảnh truy vấn và không làm đứt đoạn ý nghĩa.',
        is_blocking: true,
      },
      {
        id: 'embedding',
        title: 'Vector Embedding & Lưu trữ Index',
        tool: 'FAISS / Chroma',
        required_keywords: 'embeddings, similarity_search',
        required_files: 'data/faiss_index.bin',
        mentor_hint: 'Sinh vector đại diện và đánh chỉ mục để tìm kiếm nhanh.',
        is_blocking: true,
      },
      {
        id: 'evaluation',
        title: 'Đánh giá Độ chính xác & Trích dẫn Nguồn',
        tool: 'Ragas / TruLens',
        required_keywords: 'faithfulness, answer_relevancy',
        required_files: 'eval_results.json',
        mentor_hint: 'Đánh giá câu trả lời của mô hình RAG về độ trung thực và liên quan.',
        is_blocking: true,
      },
    ])
  }

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (!slugManual) {
      setSlug(slugify(val))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedCourseId) {
      setError(new Error('Vui lòng chọn khóa học.'))
      return
    }
    if (!title.trim() || !slug.trim()) {
      setError(new Error('Vui lòng nhập đầy đủ tiêu đề và mã slug.'))
      return
    }

    setBusy(true)
    setError(null)
    try {
      const payload = {
        course_id: selectedCourseId,
        lesson_id: selectedLessonId || null,
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        plugin_id: pluginId,
        assignment_type: 'lab',
        readme: readme.trim(),
        run_command: runCommand.trim(),
        starter_code: starterCode,
        timeout_s: 180,
        rubric: qualityGates.map((q) => ({
          id: q.id,
          title: q.title.trim(),
          tool: q.tool.trim(),
          required_keywords: q.required_keywords.split(',').map((s) => s.trim()).filter(Boolean),
          required_files: q.required_files.split(',').map((s) => s.trim()).filter(Boolean),
          mentor_hint: q.mentor_hint.trim(),
          is_blocking: q.is_blocking,
        })),
      }
      const res = await api.post<{ id: string; slug: string; title: string }>('/assignments', payload)
      setCreatedResult(res)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const track = courseDetail ? trackOf(courseDetail.track) : null

  return (
    <div className="page" style={{ maxWidth: 1040, margin: '0 auto' }}>
      <PageHead
        code={track ? `${track.code} · ${vi.builder.sheetCode}` : vi.builder.sheetCode}
        title={vi.builder.heading}
      >
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link to="/teach/simulators" className="btn btn--sm btn--ghost">
            <Icon name="terminal" size={14} />
            <span>Kho bộ simulator</span>
          </Link>
          {selectedCourseId && courseDetail && (
            <Link
              to={`/courses/${courseDetail.track.toLowerCase().replace(/_/g, '-')}/${courseDetail.id}`}
              className="btn btn--sm btn--ghost"
            >
              <Icon name="arrowRight" size={14} style={{ transform: 'rotate(180deg)' }} />
              <span>{vi.builder.backToCourse}</span>
            </Link>
          )}
        </div>
      </PageHead>

      <p className="muted" style={{ marginBottom: 'var(--space-6)', marginTop: '-var(--space-2)' }}>
        {vi.builder.subheading}
      </p>

      {createdResult ? (
        <div
          className="panel"
          style={{
            borderLeft: '4px solid var(--signal-pass)',
            background: 'var(--signal-pass-bg, #f0fdf4)',
            padding: 'var(--space-5)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <Icon name="check" size={20} style={{ color: 'var(--signal-pass)' }} />
            <h2 style={{ fontSize: 'var(--fs-lg)', margin: 0, fontWeight: 600 }}>{vi.builder.successMsg}</h2>
          </div>
          <p style={{ margin: '0 0 var(--space-4)' }}>
            Bài lab <strong>{createdResult.title}</strong> (<code>{createdResult.slug}</code>) đã được tạo thành công và liên kết vào khung chương trình đào tạo.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Link to={`/assignments/${createdResult.id}`} className="btn btn--ember">
              {vi.builder.viewAssignment} <Icon name="arrowRight" size={14} />
            </Link>
            {courseDetail && (
              <Link
                to={`/courses/${courseDetail.track.toLowerCase().replace(/_/g, '-')}/${courseDetail.id}`}
                className="btn btn--ghost"
              >
                {vi.builder.backToCourse}
              </Link>
            )}
          </div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {error ? <ErrorNote error={error} onRetry={() => setError(null)} id="builder-error" /> : null}

        {/* Khóa học & Buổi học */}
        <div className="panel">
          <div className="panel__head">
            <span>1. Khung chương trình & Buổi học liên kết</span>
          </div>
          <div className="panel__body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            <label className="field">
              <span className="field__label">{vi.builder.courseLabel} *</span>
              <select
                className="select"
                id="builder-course"
                value={selectedCourseId}
                disabled={busy || coursesLoading}
                onChange={(e) => {
                  setSelectedCourseId(e.target.value)
                  setSelectedLessonId('')
                }}
                required
              >
                <option value="">-- Chọn khóa học --</option>
                {courses?.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.track}] {c.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">{vi.builder.sessionLabel}</span>
              <select
                className="select"
                id="builder-lesson"
                value={selectedLessonId}
                disabled={busy || detailLoading || !selectedCourseId}
                onChange={(e) => setSelectedLessonId(e.target.value)}
              >
                <option value="">-- Chọn buổi học (hoặc để trống nếu tạo đề chung) --</option>
                {allLessons.map((item) => {
                  const s = item.lesson.session_numbers.length
                    ? `B${item.lesson.session_numbers.join('+')}`
                    : `L${item.lesson.order}`
                  return (
                    <option key={item.lesson.id} value={item.lesson.id}>
                      [{item.moduleCode} - {s}] {item.lesson.title}
                    </option>
                  )
                })}
              </select>
            </label>
          </div>
          {currentLessonItem && (
            <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--paper-100)', borderTop: 'var(--hair) solid var(--paper-200)', fontSize: 'var(--fs-sm)' }}>
              <span className="mono muted">Đang liên kết:</span>{' '}
              <strong>
                {currentLessonItem.moduleCode} · {currentLessonItem.lesson.session_numbers.length ? `Buổi ${currentLessonItem.lesson.session_numbers.join(', ')}` : currentLessonItem.lesson.title}
              </strong>{' '}
              — {currentLessonItem.lesson.title}
            </div>
          )}
        </div>

        {/* Thông tin định danh bài lab */}
        <div className="panel">
          <div className="panel__head">
            <span>2. Định danh đề bài thực hành</span>
          </div>
          <div className="panel__body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field__label">{vi.builder.titleLabel} *</span>
              <input
                className="input"
                id="builder-title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={vi.builder.titlePlaceholder}
                required
                disabled={busy}
              />
            </label>

            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field__label">{vi.builder.slugLabel} *</span>
              <input
                className="input mono"
                id="builder-slug"
                value={slug}
                onChange={(e) => {
                  setSlugManual(true)
                  setSlug(e.target.value)
                }}
                placeholder={vi.builder.slugPlaceholder}
                required
                disabled={busy}
              />
            </label>
          </div>
        </div>

        {/* Môi trường Simulator & Chạy kiểm thử (Lấy từ Kho Simulator) */}
        <div className="panel">
          <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>3. Bộ Simulator kiểm thử đặc thù</span>
            <Link to="/teach/simulators" className="go" style={{ fontSize: 'var(--fs-xs)' }}>
              Quản lý kho Simulator <Icon name="arrowRight" size={12} />
            </Link>
          </div>
          <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <label className="field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="field__label">{vi.builder.simulatorLabel} *</span>
                {currentSim && (
                  <span className="annot" style={{ fontSize: 'var(--fs-xs)' }}>
                    Chuyên môn: {currentSim.category_name} · Chế độ: {currentSim.mode}
                  </span>
                )}
              </div>
              <select
                className="select"
                id="builder-simulator"
                value={pluginId}
                onChange={(e) => handlePluginChange(e.target.value)}
                disabled={busy || simsLoading}
              >
                {simsLoading && <option value="">Đang tải kho simulator…</option>}
                {simulators?.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.category.toUpperCase()}] {s.name} ({s.id})
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)', marginTop: '2px' }}>
                {currentSim?.description || vi.builder.simulatorHelp}
              </span>
            </label>

            {currentSim && (
              <div style={{ background: 'var(--paper-100)', padding: 'var(--space-3)', borderRadius: 'var(--radius)', fontSize: 'var(--fs-xs)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span className="muted">File bài làm chính của học viên:</span>
                  <strong className="mono" style={{ color: 'var(--ember-700)' }}>📁 {currentSim.entry_path || 'solution/predict.py'}</strong>
                </div>
                {currentSim.dataset_config && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: 'var(--hair) dashed var(--paper-200)' }}>
                    <span className="muted" style={{ display: 'block', marginBottom: '2px' }}>Thư mục dữ liệu mount vào Workspace:</span>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', color: 'var(--ink-900)' }}>
                      <span>📁 Train: <code className="mono">{currentSim.dataset_config.train_images_dir || 'data/train/'}</code></span>
                      <span>📁 Test ẩn: <code className="mono">{currentSim.dataset_config.test_images_dir || 'data/test/'}</code></span>
                      <span>🎬 Video: <code className="mono">{currentSim.dataset_config.test_videos_dir || 'data/test_videos/'}</code></span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <label className="field">
              <span className="field__label">Lệnh chạy kiểm thử mẫu (Run Command)</span>
              <input
                className="input mono"
                id="builder-run-command"
                value={runCommand}
                onChange={(e) => setRunCommand(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
        </div>

        {/* Mô tả đề bài Markdown */}
        <div className="panel">
          <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>4. {vi.builder.readmeLabel}</span>
            <div style={{ display: 'inline-flex', gap: '4px' }}>
              <button
                type="button"
                className={`btn btn--sm ${readmeTab === 'edit' ? 'btn--ember' : 'btn--ghost'}`}
                onClick={() => setReadmeTab('edit')}
              >
                Soạn thảo
              </button>
              <button
                type="button"
                className={`btn btn--sm ${readmeTab === 'preview' ? 'btn--ember' : 'btn--ghost'}`}
                onClick={() => setReadmeTab('preview')}
              >
                Xem trước
              </button>
            </div>
          </div>
          <div className="panel__body">
            {readmeTab === 'edit' ? (
              <textarea
                className="textarea mono"
                id="builder-readme"
                rows={12}
                value={readme}
                onChange={(e) => setReadme(e.target.value)}
                placeholder={vi.builder.readmePlaceholder}
                disabled={busy}
                style={{ width: '100%', minHeight: 220 }}
              />
            ) : (
              <div
                style={{
                  minHeight: 220,
                  padding: 'var(--space-4)',
                  background: 'var(--paper-0)',
                  border: 'var(--hair) solid var(--paper-300)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <Markdown source={readme} />
              </div>
            )}
          </div>
        </div>

        {/* Mã nguồn khởi tạo (Starter Code) */}
        <div className="panel">
          <div className="panel__head">
            <span>5. Mã nguồn khởi tạo cho học viên (Starter Code)</span>
          </div>
          <div className="panel__body">
            <textarea
              className="textarea mono"
              id="builder-starter-code"
              rows={10}
              value={starterCode}
              onChange={(e) => setStarterCode(e.target.value)}
              disabled={busy}
              style={{ width: '100%', minHeight: 180 }}
            />
          </div>
        </div>

        {/* Tiêu chuẩn Kiểm soát Chất lượng & Rubric Chuyên môn */}
        <div className="panel" style={{ border: '1px solid var(--paper-300)' }}>
          <div className="panel__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>6. Tiêu chuẩn Kiểm soát Chất lượng & Rubric Chuyên môn (Quality Gate & Mentor Rubric)</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={loadCvTemplate}
                title="Nạp sẵn 6 chặng chuẩn Computer Vision"
              >
                <Icon name="list" size={13} /> Nạp mẫu Computer Vision
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={loadRagTemplate}
                title="Nạp sẵn chặng chuẩn RAG / NLP"
              >
                <Icon name="list" size={13} /> Nạp mẫu RAG / NLP
              </button>
              <button
                type="button"
                className="btn btn--sm btn--secondary"
                onClick={() => {
                  const newId = `gate_${Date.now()}`
                  setQualityGates((prev) => [
                    ...prev,
                    {
                      id: newId,
                      title: 'Tiêu chí mới',
                      tool: 'Thư viện chuyên ngành',
                      required_keywords: '',
                      required_files: '',
                      mentor_hint: 'Hướng dẫn sư phạm khi học viên gặp khó khăn.',
                      is_blocking: true,
                    },
                  ])
                }}
              >
                <Icon name="plus" size={13} /> Thêm tiêu chí
              </button>
            </div>
          </div>
          <div className="panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
              Giảng viên thiết lập các mốc kỹ thuật, từ khóa code, tệp tin bắt buộc và lời gợi ý sư phạm. Trợ giảng tự động đối chiếu với code học viên để đặt dấu hỏi (?) gợi mở và áp dụng cổng chất lượng.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {qualityGates.map((q, idx) => (
                <div
                  key={q.id}
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid var(--paper-200)',
                    background: 'var(--paper-50)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--ink-800)',
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <strong style={{ fontSize: '14px' }}>Chặng {idx + 1}: {q.title}</strong>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: q.is_blocking ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                          color: q.is_blocking ? '#ef4444' : '#6366f1',
                          border: `1px solid ${q.is_blocking ? 'rgba(239, 68, 68, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {q.is_blocking ? 'Bắt buộc (Chặn nộp)' : 'Khuyến nghị'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => setQualityGates((prev) => prev.filter((_, i) => i !== idx))}
                      style={{ color: 'var(--signal-critical)' }}
                      title="Xóa tiêu chí này"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                    <label className="field">
                      <span className="field__label">Tên chặng / Mục tiêu *</span>
                      <input
                        className="input"
                        value={q.title}
                        onChange={(e) => {
                          const val = e.target.value
                          setQualityGates((prev) => prev.map((item, i) => (i === idx ? { ...item, title: val } : item)))
                        }}
                        placeholder="Ví dụ: Tiền xử lý ảnh (CLAHE)"
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Công cụ / Thư viện liên quan</span>
                      <input
                        className="input"
                        value={q.tool}
                        onChange={(e) => {
                          const val = e.target.value
                          setQualityGates((prev) => prev.map((item, i) => (i === idx ? { ...item, tool: val } : item)))
                        }}
                        placeholder="Ví dụ: OpenCV / Albumentations"
                      />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                    <label className="field">
                      <span className="field__label">Từ khóa code / Tên hàm bắt buộc (cách nhau bởi dấu phẩy)</span>
                      <input
                        className="input mono"
                        value={q.required_keywords}
                        onChange={(e) => {
                          const val = e.target.value
                          setQualityGates((prev) => prev.map((item, i) => (i === idx ? { ...item, required_keywords: val } : item)))
                        }}
                        placeholder="Ví dụ: preprocess_frame, clahe, letterbox"
                      />
                    </label>

                    <label className="field">
                      <span className="field__label">Tệp tin bắt buộc phải xuất ra (cách nhau bởi dấu phẩy)</span>
                      <input
                        className="input mono"
                        value={q.required_files}
                        onChange={(e) => {
                          const val = e.target.value
                          setQualityGates((prev) => prev.map((item, i) => (i === idx ? { ...item, required_files: val } : item)))
                        }}
                        placeholder="Ví dụ: runs/train/curves.png"
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span className="field__label">Lời gợi ý sư phạm của Giảng viên (khi học viên thiếu hoặc tắc)</span>
                    <input
                      className="input"
                      value={q.mentor_hint}
                      onChange={(e) => {
                        const val = e.target.value
                        setQualityGates((prev) => prev.map((item, i) => (i === idx ? { ...item, mentor_hint: val } : item)))
                      }}
                      placeholder="Ví dụ: Nhắc học viên về ảnh hưởng của bóng râm và chói sáng đèn sân vận động..."
                    />
                  </label>

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={q.is_blocking}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setQualityGates((prev) => prev.map((item, i) => (i === idx ? { ...item, is_blocking: checked } : item)))
                      }}
                    />
                    <span>Kích hoạt cổng chặn nộp bài nếu học viên chưa hoàn thành chặng này (Hard Quality Gate)</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => nav(-1)}
            disabled={busy}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="btn btn--ember"
            disabled={busy || !title.trim() || !slug.trim()}
            id="builder-submit"
            style={{ padding: '0 var(--space-6)' }}
          >
            {busy ? (
              <>
                <Loading label={vi.builder.submitting} />
              </>
            ) : (
              <>
                <Icon name="plus" size={16} />
                <span>{vi.builder.submit}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
