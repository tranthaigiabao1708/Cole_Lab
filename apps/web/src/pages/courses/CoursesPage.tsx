import { Link } from 'react-router-dom'
import { api, type CourseDetail, type CourseSummary } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, Metric, StatusBlock, pad2, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'
import { TRACK_ORDER, trackOf } from '../../tracks/config'

async function load() {
  const list = await api.get<CourseSummary[]>('/courses')
  const details = await Promise.all(list.map((c) => api.get<CourseDetail>(`/courses/${c.id}`)))
  return details.sort((a, b) => TRACK_ORDER.indexOf(a.track as never) - TRACK_ORDER.indexOf(b.track as never))
}

const SURFACE = { stage: 'surface-stage', fog: 'surface-fog', ochre: 'surface-ochre' }
const SWATCH: Record<string, string> = {
  AI_ENGINEER: 'var(--track-ai)',
  DATA_ENGINEER: 'var(--track-de)',
  BUSINESS_ANALYST: 'var(--track-ba)',
}

function splitTitle(title: string) {
  // Left-aligned two-line title: last word(s) set in italic serif — atlas plate style.
  const words = title.trim().split(/\s+/)
  if (words.length < 3) return { head: title, tail: '' }
  const cut = Math.ceil(words.length * 0.55)
  return { head: words.slice(0, cut).join(' '), tail: words.slice(cut).join(' ') }
}

export function CoursesPage() {
  usePageMeta(vi.meta.coursesTitle, 'Danh sách khóa học: AI Engineer, Data Engineer, Business Analyst.')
  const { data, error, loading, reload } = useAsync(load, [])

  return (
    <>
      <div className="page" style={{ paddingBottom: 'var(--space-5)' }}>
        <header className="page-head reveal" style={{ marginBottom: 0 }}>
          <h1 className="page-head__title">{vi.courses.heading}</h1>
        </header>
      </div>
      {loading && (
        <div className="page">
          <Loading />
        </div>
      )}
      {error ? (
        <div className="page">
          <ErrorNote error={error} onRetry={reload} id="courses-error" />
        </div>
      ) : null}
      {data && data.length === 0 && (
        <div className="page">
          <p className="muted">{vi.courses.empty}</p>
        </div>
      )}
      {data?.map((c, i) => {
        const t = trackOf(c.track)
        const { head, tail } = splitTitle(c.title)
        const to = `/courses/${t.slug}/${c.id}`
        return (
          <section
            key={c.id}
            className={`band ${SURFACE[t.surface]} reveal`}
            style={{ animationDelay: `${i * 90}ms` }}
            aria-labelledby={`band-title-${c.slug}`}
          >
            <div>
              <div className="band__code" style={{ color: SWATCH[c.track] }}>
                <span className="band__swatch" />
                <span>
                  {pad2(i + 1)} · {t.code} · {t.name}
                </span>
              </div>
              <h2 className="band__title" id={`band-title-${c.slug}`}>
                {head} {tail && <em>{tail}</em>}
              </h2>
              <div className="band__metrics">
                <Metric value={c.stats.sessions} label={vi.stats.lessons} />
                <Metric value={c.stats.modules} label={vi.stats.modules} />
                {t.executionEnabled ? (
                  <Metric value={c.assignments.length} label={vi.stats.practice} />
                ) : (
                  <Metric value={c.stats.practice_candidates} label={vi.stats.practiceCandidates} />
                )}
              </div>
              {t.executionEnabled ? (
                <Link className="go" to={to} id={`courses-open-${c.slug}`}>
                  {vi.courses.open} <Icon name="arrowRight" size={14} />
                </Link>
              ) : (
                <>
                  <StatusBlock trackName={t.name} plannedKinds={t.plannedKinds} id={`status-${c.slug}`} />
                  <div style={{ marginTop: 'var(--space-4)' }}>
                    <Link className="go" to={to} id={`courses-outline-${c.slug}`}>
                      {vi.courses.open} <Icon name="arrowRight" size={14} />
                    </Link>
                  </div>
                </>
              )}
            </div>
            <div>
              <div className="band__index-head">{vi.courses.index}</div>
              <ol className="band__index">
                {c.modules.map((m) => (
                  <li key={m.id}>
                    <span className="num">{pad2(m.order)}</span>
                    <Link to={`${to}#${m.id}`} id={`band-mod-${m.id}`}>
                      {m.title}
                    </Link>
                    <span className="count">{m.lessons.length}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )
      })}
    </>
  )
}
