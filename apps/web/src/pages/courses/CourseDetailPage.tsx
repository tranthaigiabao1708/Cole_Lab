import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, type AssignmentSummary, type CourseDetail, type Lesson, type Module } from '../../core/api'
import { vi } from '../../core/copy/vi'
import {
  ErrorNote,
  Loading,
  Metric,
  SheetCode,
  StatusBlock,
  pad2,
  usePageMeta,
} from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'
import { trackOf, type TrackConfig } from '../../tracks/config'

const SURFACE = { stage: 'surface-stage', fog: 'surface-fog', ochre: 'surface-ochre' }
const ACCENT: Record<string, string> = {
  AI_ENGINEER: 'var(--track-ai)',
  DATA_ENGINEER: '#5f7a6c',
  BUSINESS_ANALYST: '#957a48',
}

function lessonCode(t: TrackConfig, m: Module, l: Lesson): string {
  const s = l.session_numbers.length ? `B${l.session_numbers.join('+')}` : l.kind === 'project' ? 'P' : `L${l.order}`
  return `${t.code}-${m.code}-${s}`
}

function LessonRow({
  t,
  m,
  l,
  assignments,
}: {
  t: TrackConfig
  m: Module
  l: Lesson
  assignments: AssignmentSummary[]
}) {
  const hasMore = Boolean(l.content || l.objectives || l.practice)
  return (
    <div className="lesson" id={`lesson-${l.id}`}>
      <div className="lesson__code">{lessonCode(t, m, l)}</div>
      <div>
        <div className="lesson__title">
          {l.kind === 'project' && <span className="annot">{vi.course.project} · </span>}
          {l.title}
        </div>
        {hasMore && (
          <details className="lesson__more">
            <summary id={`lesson-more-${l.id}`}>
              <Icon name="chevronRight" size={12} />
              {vi.course.content}
            </summary>
            <dl>
              {l.content && (
                <>
                  <dt>{vi.course.content}</dt>
                  <dd>{l.content}</dd>
                </>
              )}
              {l.objectives && (
                <>
                  <dt>{vi.course.objectives}</dt>
                  <dd>{l.objectives}</dd>
                </>
              )}
              {l.practice && (
                <>
                  <dt>{vi.course.practice}</dt>
                  <dd>{l.practice}</dd>
                </>
              )}
            </dl>
          </details>
        )}
      </div>
      <div className="lesson__aside">
        {t.executionEnabled
          ? assignments.map((a) => (
              <Link key={a.id} className="go" to={`/assignments/${a.id}`} id={`lesson-asg-${a.slug}`}>
                {vi.course.practiceLink}: {a.title} <Icon name="arrowRight" size={14} />
              </Link>
            ))
          : l.practice_candidate && <span className="lesson__planned">{vi.status.practicePlanned}</span>}
      </div>
    </div>
  )
}

export function CourseDetailPage() {
  const { courseId } = useParams()
  const loc = useLocation()
  const { data, error, loading, reload } = useAsync(() => api.get<CourseDetail>(`/courses/${courseId}`), [courseId])
  const [active, setActive] = useState<string | null>(null)
  usePageMeta(data ? `${data.title} — COLE LAB` : vi.meta.coursesTitle, data ? `Đề cương ${data.title}` : undefined)

  useEffect(() => {
    if (!data) return
    const hash = loc.hash.slice(1)
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' })
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id)
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    data.modules.forEach((m) => {
      const el = document.getElementById(m.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [data, loc.hash])

  if (loading) return <div className="page"><Loading /></div>
  if (error || !data) return <div className="page"><ErrorNote error={error} onRetry={reload} id="course-error" /></div>

  const t = trackOf(data.track)
  const byLesson = new Map<string, AssignmentSummary[]>()
  data.assignments.forEach((a) => {
    if (a.lesson_id) byLesson.set(a.lesson_id, [...(byLesson.get(a.lesson_id) ?? []), a])
  })
  const groups: { name: string | null; mods: Module[] }[] = []
  data.modules.forEach((m) => {
    const last = groups[groups.length - 1]
    if (last && last.name === m.group_path) last.mods.push(m)
    else groups.push({ name: m.group_path, mods: [m] })
  })

  return (
    <div style={{ ['--accent' as string]: ACCENT[data.track] }}>
      <section className={`course-hero ${SURFACE[t.surface]}`}>
        <div className="course-hero__inner">
          <SheetCode tone={t.surface === 'stage' ? 'dark' : 'light'}>
            {t.code} · {t.name} · {data.slug}
          </SheetCode>
          <h1 className="course-hero__title reveal">{data.title}</h1>
          <div className="course-hero__row">
            <div className="course-hero__metrics reveal reveal-2">
              <Metric value={data.stats.sessions} label={vi.stats.lessons} />
              <Metric value={data.stats.modules} label={vi.stats.modules} />
              {t.executionEnabled ? (
                <Metric value={data.assignments.length} label={vi.stats.practice} />
              ) : (
                <Metric value={data.stats.practice_candidates} label={vi.stats.practiceCandidates} />
              )}
            </div>
            {!t.executionEnabled && (
              <StatusBlock trackName={t.name} plannedKinds={t.plannedKinds} id="course-status" />
            )}
          </div>
        </div>
      </section>

      <div className="course-layout">
        <nav className="toc" aria-label={vi.course.toc}>
          <div className="toc__head">{vi.course.toc}</div>
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.name && <div className="toc__group">{g.name}</div>}
              {g.mods.map((m) => (
                <button
                  key={m.id}
                  id={`toc-${m.id}`}
                  className={`toc__item${active === m.id ? ' is-active' : ''}`}
                  onClick={() => document.getElementById(m.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <span className="num">{pad2(m.order)}</span>
                  <span>{m.title}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div>
          {data.modules.map((m) => (
            <section className="module" id={m.id} key={m.id} aria-labelledby={`mod-title-${m.id}`}>
              <div className="module__head">
                <span className="module__num">{pad2(m.order)}</span>
                <div>
                  {m.group_path && <div className="annot">{m.group_path}</div>}
                  <h2 className="module__title" id={`mod-title-${m.id}`}>
                    {m.title}
                  </h2>
                </div>
              </div>
              {m.objectives && (
                <div className="module__objectives">
                  <span className="annot">{vi.course.objectives}</span>
                  <div className="prewrap">{m.objectives}</div>
                </div>
              )}
              {m.lessons.map((l) => (
                <LessonRow key={l.id} t={t} m={m} l={l} assignments={byLesson.get(l.id) ?? []} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
