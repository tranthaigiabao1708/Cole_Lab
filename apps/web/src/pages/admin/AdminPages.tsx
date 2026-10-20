import { useState, type FormEvent } from 'react'
import { api, type User } from '../../core/api'
import { vi } from '../../core/copy/vi'
import { ErrorNote, Loading, PageHead, Signal, formatDateTime, usePageMeta } from '../../core/design-system/components'
import { Icon } from '../../core/design-system/icons'
import { useAsync } from '../../core/useAsync'

export function AdminUsersPage() {
  usePageMeta(vi.meta.usersTitle, 'Quản lý người dùng và vai trò.')
  const users = useAsync(() => api.get<User[]>('/admin/users'), [])
  const [form, setForm] = useState({ email: '', name: '', role: 'student', password: '' })
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api.post('/admin/users', form)
      setForm({ email: '', name: '', role: 'student', password: '' })
      users.reload()
    } catch (x) {
      setErr(x)
    } finally {
      setBusy(false)
    }
  }

  async function patch(u: User, body: Partial<User>) {
    setErr(null)
    try {
      await api.patch(`/admin/users/${u.id}`, body)
      users.reload()
    } catch (x) {
      setErr(x)
    }
  }

  return (
    <div className="page">
      <PageHead code={vi.admin.usersCode} title={vi.admin.usersHeading} />
      <form className="form-grid panel panel__body" onSubmit={create} id="admin-user-form" style={{ marginBottom: 'var(--space-6)' }}>
        <label className="field">
          <span className="field__label">{vi.admin.email}</span>
          <input className="input" id="admin-user-email" type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{vi.admin.name}</span>
          <input className="input" id="admin-user-name" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">{vi.admin.role}</span>
          <select className="select" id="admin-user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(vi.roles).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{vi.admin.password}</span>
          <input className="input" id="admin-user-password" type="password" minLength={8} required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <div>
          <button className="btn" id="admin-user-create" disabled={busy}>
            <Icon name="plus" />
            {vi.admin.create}
          </button>
        </div>
      </form>
      {err ? <ErrorNote error={err} id="admin-user-error" /> : null}
      {users.loading && <Loading />}
      {users.data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{vi.admin.name}</th>
                <th>{vi.admin.email}</th>
                <th>{vi.admin.role}</th>
                <th>{vi.admin.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="mono">{u.email}</td>
                  <td>
                    <select className="select select--sm" id={`admin-role-${u.id}`} value={u.role}
                      onChange={(e) => patch(u, { role: e.target.value as User['role'] })}>
                      {Object.entries(vi.roles).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.status === 'locked' ? (
                      <Signal tone="critical">{vi.admin.statusLocked}</Signal>
                    ) : (
                      <Signal tone="pass">{vi.admin.statusActive}</Signal>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn--ghost btn--sm" id={`admin-lock-${u.id}`}
                      onClick={() => patch(u, { status: u.status === 'locked' ? 'active' : 'locked' })}>
                      {u.status === 'locked' ? vi.admin.unlock : vi.admin.lock}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface AuditRow {
  id: string
  at: string
  actor_id: string | null
  actor_type: string
  action: string
  target_type: string | null
  target_id: string | null
  meta: Record<string, unknown> | null
}

export function AdminAuditPage() {
  usePageMeta(vi.meta.auditTitle, 'Nhật ký thao tác hệ thống.')
  const [filter, setFilter] = useState('')
  const q = useAsync(
    () => api.get<AuditRow[]>(`/admin/audit?limit=300${filter ? `&action=${encodeURIComponent(filter)}` : ''}`),
    [filter],
  )
  return (
    <div className="page">
      <PageHead code={vi.admin.auditCode} title={vi.admin.auditHeading}>
        <label className="field">
          <span className="field__label">{vi.admin.filter}</span>
          <input className="input mono" id="audit-filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      </PageHead>
      {q.error ? <ErrorNote error={q.error} onRetry={q.reload} id="audit-error" /> : null}
      {q.loading && !q.data && <Loading />}
      {q.data && (
        <div className="table-wrap" style={{ maxHeight: '70vh' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{vi.admin.at}</th>
                <th>{vi.admin.actor}</th>
                <th>{vi.admin.action}</th>
                <th>{vi.admin.target}</th>
                <th>{vi.admin.meta}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}>
                  <td className="num">{formatDateTime(a.at)}</td>
                  <td className="mono" style={{ fontSize: 'var(--fs-xs)' }}>{a.actor_id ?? a.actor_type}</td>
                  <td className="mono">{a.action}</td>
                  <td className="mono" style={{ fontSize: 'var(--fs-xs)' }}>
                    {a.target_type ? `${a.target_type}:${a.target_id}` : vi.common.none}
                  </td>
                  <td className="mono" style={{ fontSize: 'var(--fs-xs)', maxWidth: 360, wordBreak: 'break-all' }}>
                    {a.meta ? JSON.stringify(a.meta) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
