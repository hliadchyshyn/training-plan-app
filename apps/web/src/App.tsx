import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.js'
import { Layout } from './components/Layout.js'

const named = <T extends string>(fn: () => Promise<Record<T, React.ComponentType>>, key: T) =>
  lazy(() => fn().then((m) => ({ default: m[key] })))

const LoginPage = named(() => import('./pages/LoginPage.js'), 'LoginPage')
const RegisterPage = named(() => import('./pages/RegisterPage.js'), 'RegisterPage')
const WeeklyCalendarPage = named(() => import('./pages/WeeklyCalendarPage.js'), 'WeeklyCalendarPage')
const GroupPlanDetailPage = named(() => import('./pages/GroupPlanDetailPage.js'), 'GroupPlanDetailPage')
const IndividualPlanPage = named(() => import('./pages/IndividualPlanPage.js'), 'IndividualPlanPage')
const TrainerDashboardPage = named(() => import('./pages/trainer/TrainerDashboardPage.js'), 'TrainerDashboardPage')
const CreateGroupPlanPage = named(() => import('./pages/trainer/CreateGroupPlanPage.js'), 'CreateGroupPlanPage')
const CreateIndividualPlanPage = named(() => import('./pages/trainer/CreateIndividualPlanPage.js'), 'CreateIndividualPlanPage')
const TeamManagementPage = named(() => import('./pages/trainer/TeamManagementPage.js'), 'TeamManagementPage')
const FeedbackSummaryPage = named(() => import('./pages/trainer/FeedbackSummaryPage.js'), 'FeedbackSummaryPage')
const EditIndividualPlanPage = named(() => import('./pages/trainer/EditIndividualPlanPage.js'), 'EditIndividualPlanPage')
const AdminPage = named(() => import('./pages/admin/AdminPage.js'), 'AdminPage')
const StravaConnectPage = named(() => import('./pages/StravaConnectPage.js'), 'StravaConnectPage')
const StravaCallbackPage = named(() => import('./pages/StravaCallbackPage.js'), 'StravaCallbackPage')

const StravaLoginCallbackPage = lazy(() => import('./pages/StravaLoginCallbackPage.js'))
const StravaConnectCallbackPage = lazy(() => import('./pages/StravaConnectCallbackPage.js'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.js'))
const ProfilePage = lazy(() => import('./pages/ProfilePage.js'))
const IntervalsConnectPage = lazy(() => import('./pages/IntervalsConnectPage.js'))
const WatchWorkoutsPage = lazy(() => import('./pages/WatchWorkoutsPage.js'))
const WatchWorkoutDetailPage = lazy(() => import('./pages/WatchWorkoutDetailPage.js'))
const CreateWatchWorkoutPage = lazy(() => import('./pages/CreateWatchWorkoutPage.js'))
const EditWatchWorkoutPage = lazy(() => import('./pages/EditWatchWorkoutPage.js'))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage.js'))
const TemplateDetailPage = lazy(() => import('./pages/TemplateDetailPage.js'))
const EditTemplatePage = lazy(() => import('./pages/EditTemplatePage.js'))
const HelpPage = lazy(() => import('./pages/HelpPage.js'))

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, _hasHydrated } = useAuthStore((s) => ({ user: s.user, _hasHydrated: s._hasHydrated }))
  if (!_hasHydrated) return <div className="page-loading" />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function NotFoundPage() {
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>404</div>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>Сторінку не знайдено</p>
      <a href="/" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>← На головну</a>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <Suspense fallback={<div className="page-loading" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/strava/login-callback" element={<StravaLoginCallbackPage />} />
          <Route path="/strava/connect-callback" element={<StravaConnectCallbackPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/404" element={<NotFoundPage />} />

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

            <Route path="/strava/connect" element={<StravaConnectPage />} />
            <Route path="/strava/connected" element={<StravaCallbackPage />} />
            <Route path="/intervals" element={<IntervalsConnectPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/help" element={<HelpPage />} />

            <Route path="/watch-workouts" element={<WatchWorkoutsPage />} />
            <Route path="/watch-workouts/new" element={<CreateWatchWorkoutPage />} />
            <Route path="/watch-workouts/:id" element={<WatchWorkoutDetailPage />} />
            <Route path="/watch-workouts/:id/edit" element={<EditWatchWorkoutPage />} />

            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/templates/new" element={<Navigate to="/watch-workouts/new?saveAsTemplate=1" replace />} />
            <Route path="/templates/:id" element={<TemplateDetailPage />} />
            <Route path="/templates/:id/edit" element={<EditTemplatePage />} />

            <Route
              path="/admin"
              element={
                <RequireRole roles={['ADMIN']}>
                  <AdminPage />
                </RequireRole>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
