import { Link } from 'react-router-dom'
import { api, type CourseDetail, type CourseSummary } from '../../core/api'
import { useAuth } from '../../core/auth'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, SheetCode, Signal, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'
import { TRACK_ORDER, trackOf } from '../../tracks/config'

const ACCENT: Record<string, string> = {
  AI_ENGINEER: 'var(--track-ai)',
  DATA_ENGINEER: 'var(--track-de)',
  BUSINESS_ANALYST: 'var(--track-ba)',
}

async function load() {
  const courses = (await api.get<CourseSummary[]>('/courses')).sort(
    (a, b) => TRACK_ORDER.indexOf(a.track as never) - TRACK_ORDER.indexOf(b.track as never),
  )
  const active = courses.filter((c) => c.execution_status === 'active')
  const details = await Promise.all(active.map((c) => api.get<CourseDetail>(`/courses/${c.id}`)))
  return { courses, details }
}

export function DashboardPage() {
  usePageMeta(vi.meta.dashboardTitle, 'Tổng quan khóa học và bài thực hành.')
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(load, [])
  const today = new Date().toLocaleDateString('vi-VN')

  const assignments = (data?.details ?? []).flatMap((c) =>
    c.assignments.map((a) => ({ ...a, course: c })),
  )

  return (
    <>
      <section className="dash-stage surface-stage">
        <div className="dash-stage__inner">
          <div className="page-head reveal" style={{ borderColor: 'var(--ink-600)' }}>
            <div>
              <SheetCode tone="dark">{today}</SheetCode>
              <h1 className="page-head__title">{vi.dashboard.heading}</h1>
            </div>
            <div className="page-head__aside muted">{user?.name}</div>
          </div>
          <div className="section-label" style={{ marginTop: 0, color: 'var(--bone-500)' }}>
            {vi.dashboard.inProgress}
          </div>
          {loading && <Loading />}
          {error ? <ErrorNote error={error} onRetry={reload} id="dash-error" /> : null}
          {data && assignments.length === 0 && <p className="muted">{vi.dashboard.noAssignments}</p>}
          {assignments.length > 0 && (
            <div className="dash-grid reveal reveal-2">
              {assignments.map((a) => (
                <article className="dash-card" key={a.id}>
                  <SheetCode tone="dark">
                    {trackOf(a.course.track).code}
                    {a.version ? ` · v${a.version}` : ''}
                  </SheetCode>
                  <h2 className="dash-card__title">{a.title}</h2>
                  <div className="muted">{a.course.title}</div>
                  {a.status !== 'published' && <Signal tone="neutral">{a.status}</Signal>}
                  <div className="dash-card__foot">
                    <Link className="go" to={`/assignments/${a.id}`} id={`dash-open-${a.slug}`}>
                      {vi.dashboard.viewAssignment} <Icon name="arrowRight" size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      <div className="page" style={{ paddingTop: 'var(--space-5)' }}>
        <div className="section-label">{vi.dashboard.courses}</div>
        {data && (
          <ul className="course-lines reveal reveal-3">
            {data.courses.map((c) => {
              const t = trackOf(c.track)
              return (
                <li key={c.id} className="course-line" style={{ ['--accent' as string]: ACCENT[c.track] }}>
                  <span className="course-line__code">{t.code}</span>
                  <Link to={`/courses/${t.slug}/${c.id}`} className="course-line__title" id={`dash-course-${c.slug}`}>
                    {c.title}
                  </Link>
                  <span className="course-line__stats">
                    {c.stats.sessions} {vi.stats.lessons} · {c.stats.modules} {vi.stats.modules}
                  </span>
                  {c.execution_status === 'active' ? (
                    <Link className="go" to={`/courses/${t.slug}/${c.id}`} id={`dash-course-go-${c.slug}`}>
                      {vi.courses.open} <Icon name="arrowRight" size={14} />
                    </Link>
                  ) : (
                    <span className="annot">{vi.status.notImplementedTitle}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
