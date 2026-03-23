import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.js'
import { LoginPage } from './pages/LoginPage.js'
import { RegisterPage } from './pages/RegisterPage.js'
import { WeeklyCalendarPage } from './pages/WeeklyCalendarPage.js'
import { GroupPlanDetailPage } from './pages/GroupPlanDetailPage.js'
import { IndividualPlanPage } from './pages/IndividualPlanPage.js'
import { TrainerDashboardPage } from './pages/trainer/TrainerDashboardPage.js'
import { CreateGroupPlanPage } from './pages/trainer/CreateGroupPlanPage.js'
import { CreateIndividualPlanPage } from './pages/trainer/CreateIndividualPlanPage.js'
import { TeamManagementPage } from './pages/trainer/TeamManagementPage.js'
import { FeedbackSummaryPage } from './pages/trainer/FeedbackSummaryPage.js'
import { EditIndividualPlanPage } from './pages/trainer/EditIndividualPlanPage.js'
import { AdminPage } from './pages/admin/AdminPage.js'
import { Layout } from './components/Layout.js'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<WeeklyCalendarPage />} />
          <Route path="/plan/:id" element={<GroupPlanDetailPage />} />
          <Route path="/individual-plan/:id" element={<IndividualPlanPage />} />

          <Route
            path="/trainer"
            element={
              <RequireRole roles={['TRAINER', 'ADMIN']}>
                <TrainerDashboardPage />
              </RequireRole>
            }
          />
          <Route
            path="/trainer/plans/new"
            element={
              <RequireRole roles={['TRAINER', 'ADMIN']}>
                <CreateGroupPlanPage />
              </RequireRole>
            }
          />
          <Route
            path="/trainer/plans/new/individual"
            element={
              <RequireRole roles={['TRAINER', 'ADMIN']}>
                <CreateIndividualPlanPage />
              </RequireRole>
            }
          />
          <Route
            path="/trainer/athletes"
            element={
              <RequireRole roles={['TRAINER', 'ADMIN']}>
                <TeamManagementPage />
              </RequireRole>
            }
          />
          <Route
            path="/trainer/feedback/:id"
            element={
              <RequireRole roles={['TRAINER', 'ADMIN']}>
                <FeedbackSummaryPage />
              </RequireRole>
            }
          />
          <Route
            path="/trainer/plans/individual/:id/edit"
            element={
              <RequireRole roles={['TRAINER', 'ADMIN']}>
                <EditIndividualPlanPage />
              </RequireRole>
            }
          />

          <Route
            path="/admin"
            element={
              <RequireRole roles={['ADMIN']}>
                <AdminPage />
              </RequireRole>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
