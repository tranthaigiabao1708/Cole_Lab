import { useEffect, type ReactNode } from 'react'
import { vi } from '../copy/vi'
import { ApiError } from '../api'
import { Icon } from './icons'

/** Sets document title + meta description per page (SEO + tab clarity). */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title
    if (description) {
      let m = document.querySelector('meta[name="description"]')
      if (!m) {
        m = document.createElement('meta')
        m.setAttribute('name', 'description')
        document.head.appendChild(m)
      }
      m.setAttribute('content', description)
    }
  }, [title, description])
}

/** Drafting-sheet section code, e.g. "AI-M5-B53" or "TỜ 02". */
export function SheetCode({ children, tone }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return <span className={`sheet-code ${tone === 'dark' ? 'sheet-code--dark' : ''}`}>{children}</span>
}

/** Italic serif editorial label — atlas-style annotation. */
export function Annot({ children }: { children: ReactNode }) {
  return <span className="annot">{children}</span>
}

/** Large mono number with a small caps label. Values must come from data. */
export function Metric({ value, label, id }: { value: ReactNode; label: string; id?: string }) {
  return (
    <div className="metric" id={id}>
      <span className="metric__value">{value}</span>
      <span className="metric__label">{label}</span>
    </div>
  )
}

/** The only "not implemented" surface for DE/BA (docs/design/10 §4). No buttons, ever. */
export function StatusBlock({ trackName, plannedKinds, id }: { trackName: string; plannedKinds: string[]; id?: string }) {
  return (
    <div className="status-block" role="note" id={id}>
      <div className="status-block__title">{vi.status.notImplementedTitle}</div>
      <div className="status-block__body">{vi.status.notImplementedBody(trackName)}</div>
      {plannedKinds.length > 0 && (
        <div className="status-block__kinds">
          <span className="annot">{vi.status.plannedKinds}</span> {plannedKinds.join(' · ')}
        </div>
      )}
    </div>
  )
}

export function Loading({ label }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading__bar" />
      <span>{label ?? vi.common.loading}</span>
    </div>
  )
}

export function ErrorNote({ error, onRetry, id }: { error: unknown; onRetry?: () => void; id?: string }) {
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error)
  const code = error instanceof ApiError ? error.code : null
  return (
    <div className="error-note" role="alert" id={id}>
      <Icon name="alert" size={16} />
      <span>
        {msg}
        {code && <code className="error-note__code">{code}</code>}
      </span>
      {onRetry && (
        <button className="btn btn--ghost btn--sm" onClick={onRetry} id={id ? `${id}-retry` : undefined}>
          {vi.common.retry}
        </button>
      )}
    </div>
  )
}

export function Signal({ tone, children }: { tone: 'pass' | 'warn' | 'critical' | 'neutral' | 'run'; children: ReactNode }) {
  return <span className={`signal signal--${tone}`}>{children}</span>
}

/** Page header: left-aligned serif title, sheet code, optional right-hand slot. */
export function PageHead({ code, title, children }: { code?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head reveal">
      <div>
        {code && <SheetCode>{code}</SheetCode>}
        <h1 className="page-head__title">{title}</h1>
      </div>
      {children && <div className="page-head__aside">{children}</div>}
    </header>
  )
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDateTime(iso: string): string {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso)
  const d = new Date(hasZone ? iso : iso + 'Z')
  return d.toLocaleString('vi-VN', { hour12: false })
}

export function RatingControl({
  value,
  onChange,
  disabled = false,
  id,
}: {
  value: number
  onChange?: (val: number) => void
  disabled?: boolean
  id?: string
}) {
  return (
    <div className="rating-control" id={id} role="group" aria-label="Đánh giá chất lượng">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          className={`rating-star ${star <= value ? 'rating-star--active' : ''}`}
          onClick={() => onChange && onChange(star)}
          title={`${star} sao`}
          aria-label={`${star} sao`}
          style={{
            background: 'none',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: '1.25rem',
            padding: '2px 4px',
            color: star <= value ? 'var(--ember-500, #d97706)' : 'var(--graphite-300, #cbd5e1)',
            transition: 'transform 0.15s ease, color 0.15s ease',
          }}
        >
          {star <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

