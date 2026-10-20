import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '../core/auth'
import { vi } from '../core/copy/vi'
import { Loading, PageHead } from '../core/design-system/components'
import { AdminAuditPage, AdminUsersPage } from '../pages/admin/AdminPages'
import { LoginPage } from '../pages/auth/LoginPage'
import { CourseDetailPage } from '../pages/courses/CourseDetailPage'
import { CoursesPage } from '../pages/courses/CoursesPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { ImportWizardPage } from '../pages/teach/ImportWizardPage'
import { Shell } from './Shell'

function RequireAuth({ children, role }: { children: ReactNode; role?: 'teacher' | 'admin' }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="page"><Loading /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  if (role === 'admin' && user.role !== 'admin') return <Forbidden />
  if (role === 'teacher' && user.role === 'student') return <Forbidden />
  return <>{children}</>
}

function Forbidden() {
  return (
    <div className="page">
      <PageHead code="403" title={vi.errors.forbidden} />
    </div>
  )
}

function NotFound() {
  return (
    <div className="page">
      <PageHead code="404" title={vi.errors.notFound} />
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="courses/:track/:courseId" element={<CourseDetailPage />} />
            <Route path="teach/import" element={<RequireAuth role="teacher"><ImportWizardPage /></RequireAuth>} />
            <Route path="teach/import/:importId" element={<RequireAuth role="teacher"><ImportWizardPage /></RequireAuth>} />
            <Route path="admin/users" element={<RequireAuth role="admin"><AdminUsersPage /></RequireAuth>} />
            <Route path="admin/audit" element={<RequireAuth role="admin"><AdminAuditPage /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
