import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../core/auth'
import { vi } from '../core/copy/vi'
import { Icon } from '../core/design-system/icons'

export function Shell() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  if (!user) return null
  const isTeacher = user.role === 'teacher' || user.role === 'admin'
  const isAdmin = user.role === 'admin'
  const link = ({ isActive }: { isActive: boolean }) => `topbar__link${isActive ? ' active' : ''}`

  return (
    <>
      <a href="#main" className="skip-link" id="skip-to-main">
        {vi.nav.skip}
      </a>
      <header className="topbar">
        <NavLink to="/" className="topbar__brand" id="nav-brand" aria-label={vi.brand.name}>
          <span className="topbar__mark" aria-hidden="true" />
          {vi.brand.name}
        </NavLink>
        <nav className="topbar__nav" aria-label="Chính">
          <NavLink to="/" end className={link} id="nav-dashboard">
            {vi.nav.dashboard}
          </NavLink>
          <NavLink to="/courses" className={link} id="nav-courses">
            {vi.nav.courses}
          </NavLink>
          <NavLink to="/submissions" className={link} id="nav-results">
            {vi.nav.results}
          </NavLink>
          {isTeacher && (
            <>
              <span className="topbar__sep" aria-hidden="true" />
              <NavLink to="/teach/import" className={link} id="nav-teach-import">
                {vi.nav.teachImport}
              </NavLink>
            </>
          )}
          {isAdmin && (
            <>
              <span className="topbar__sep" aria-hidden="true" />
              <NavLink to="/admin/users" className={link} id="nav-admin-users">
                {vi.nav.adminUsers}
              </NavLink>
              <NavLink to="/admin/plugins" className={link} id="nav-admin-plugins">
                {vi.nav.adminPlugins}
              </NavLink>
              <NavLink to="/admin/runtime" className={link} id="nav-admin-runtime">
                {vi.nav.adminRuntime}
              </NavLink>
              <NavLink to="/admin/audit" className={link} id="nav-admin-audit">
                {vi.nav.adminAudit}
              </NavLink>
            </>
          )}
        </nav>
        <div className="topbar__user">
          <span className="topbar__role">{vi.roles[user.role]}</span>
          <span>{user.name}</span>
          <button
            className="topbar__logout"
            id="btn-logout"
            onClick={async () => {
              await logout()
              nav('/login')
            }}
          >
            <Icon name="logout" />
            {vi.nav.logout}
          </button>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </>
  )
}
