import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../core/auth'
import { vi } from '../../core/copy/vi'
import { ErrorNote, SheetCode, usePageMeta } from '../../core/design-system/components'
import { TRACKS, TRACK_ORDER } from '../../tracks/config'

const SWATCH: Record<string, string> = {
  AI_ENGINEER: 'var(--track-ai)',
  DATA_ENGINEER: 'var(--track-de)',
  BUSINESS_ANALYST: 'var(--track-ba)',
}

export function LoginPage() {
  usePageMeta(vi.meta.loginTitle, 'Đăng nhập vào nền tảng thực hành COLE LAB.')
  const { user, login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (user) return <Navigate to="/" replace />

  const from = (loc.state as { from?: string } | null)?.from ?? '/'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      nav(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <section className="login__stage surface-stage" aria-hidden="false">
        <div className="login__brand">
          <span className="topbar__mark" aria-hidden="true" />
          {vi.brand.name}
        </div>
        <p className="login__plate reveal">
          {TRACKS.AI_ENGINEER.name}
          <br />
          <em>{TRACKS.DATA_ENGINEER.name}</em>
          <br />
          {TRACKS.BUSINESS_ANALYST.name}
        </p>
        <div className="login__legend reveal reveal-2">
          {TRACK_ORDER.map((t) => (
            <div key={t}>
              <span className="sw" style={{ background: SWATCH[t] }} />
              <span className="mono">{TRACKS[t].code}</span> · {TRACKS[t].name}
            </div>
          ))}
        </div>
      </section>
      <section className="login__panel">
        <form className="login__form reveal reveal-3" onSubmit={onSubmit} id="login-form">
          <div>
            <SheetCode>{vi.login.sheetCode}</SheetCode>
            <h1>{vi.login.heading}</h1>
          </div>
          <label className="field">
            <span className="field__label">{vi.login.email}</span>
            <input
              className="input"
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{vi.login.password}</span>
            <input
              className="input"
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <ErrorNote error={error} id="login-error" /> : null}
          <button className="btn btn--ember" type="submit" disabled={busy} id="login-submit">
            {busy ? vi.login.submitting : vi.login.submit}
          </button>
        </form>
      </section>
    </div>
  )
}
