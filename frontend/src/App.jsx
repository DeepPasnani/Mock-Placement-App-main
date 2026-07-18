import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { useStore } from './store';

const LoginPage = lazy(() => import('./pages/Login'));
const AdminLayout = lazy(() => import('./pages/admin/Layout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminTests = lazy(() => import('./pages/admin/Tests'));
const TestCreator = lazy(() => import('./pages/admin/TestCreator'));
const AdminResults = lazy(() => import('./pages/admin/Results'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminAdmins = lazy(() => import('./pages/admin/Admins'));
const AdminQuestionBank = lazy(() => import('./pages/admin/QuestionBank'));
const SendEmail = lazy(() => import('./pages/admin/SendEmail'));
const Landing = lazy(() => import('./pages/Landing'));

const StudentLayout = lazy(() => import('./pages/student/Layout'));
const StudentTests = lazy(() => import('./pages/student/Tests'));
const StudentResults = lazy(() => import('./pages/student/Results'));
const TestInterface = lazy(() => import('./pages/student/TestInterface'));
const ResultDetail = lazy(() => import('./pages/student/ResultDetail'));

function SuspenseFallback() {
  return (
    <div className="min-h-screen bg-deck flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="spinner text-accent" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.15" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-annotation">Loading...</p>
      </div>
    </div>
  );
}

function RequireAuth({ children, role }) {
  const { user } = useStore();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role) {
    const allowedRoles = role === 'admin' ? ['admin', 'super_admin'] : [role];
    if (!allowedRoles.includes(user.role)) {
      return <Navigate to={user.role === 'admin' || user.role === 'super_admin' ? '/admin' : '/student'} replace />;
    }
  }
  return children;
}

export default function App() {
  const { user, refreshUser } = useStore();

  useEffect(() => {
    const token = localStorage.getItem('pp_token');
    if (token && !user) refreshUser();
  }, []);

  return (
    <Suspense fallback={<SuspenseFallback />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' || user.role === 'super_admin' ? '/admin' : '/student'} replace /> : <ErrorBoundary><LoginPage /></ErrorBoundary>} />

      {/* Admin routes */}
      <Route path="/admin" element={<RequireAuth role="admin"><AdminLayout /></RequireAuth>}>
        <Route index element={<ErrorBoundary><AdminDashboard /></ErrorBoundary>} />
        <Route path="tests" element={<ErrorBoundary><AdminTests /></ErrorBoundary>} />
        <Route path="tests/new" element={<ErrorBoundary><TestCreator /></ErrorBoundary>} />
        <Route path="tests/:id/edit" element={<ErrorBoundary><TestCreator /></ErrorBoundary>} />
        <Route path="results" element={<ErrorBoundary><AdminResults /></ErrorBoundary>} />
        <Route path="results/:testId" element={<ErrorBoundary><AdminResults /></ErrorBoundary>} />
        <Route path="users" element={<ErrorBoundary><AdminUsers /></ErrorBoundary>} />
        <Route path="admins" element={<ErrorBoundary><AdminAdmins /></ErrorBoundary>} />
        <Route path="question-bank" element={<ErrorBoundary><AdminQuestionBank /></ErrorBoundary>} />
        <Route path="email" element={<ErrorBoundary><SendEmail /></ErrorBoundary>} />
      </Route>

      {/* Student routes */}
      <Route path="/student" element={<RequireAuth role="student"><StudentLayout /></RequireAuth>}>
        <Route index element={<ErrorBoundary><StudentTests /></ErrorBoundary>} />
        <Route path="results" element={<ErrorBoundary><StudentResults /></ErrorBoundary>} />
        <Route path="results/:submissionId" element={<ErrorBoundary><ResultDetail /></ErrorBoundary>} />
      </Route>

      {/* Test taking - full screen, no layout */}
      <Route path="/test/:testId" element={<RequireAuth role="student"><ErrorBoundary><TestInterface /></ErrorBoundary></RequireAuth>} />

      {/* Public landing page (redirects straight to dashboard if already signed in) */}
      <Route path="/" element={user ? <Navigate to={user.role === 'admin' || user.role === 'super_admin' ? '/admin' : '/student'} replace /> : <ErrorBoundary><Landing /></ErrorBoundary>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
