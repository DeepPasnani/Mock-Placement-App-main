import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';

// Pages
import LoginPage from './pages/Login';
import AdminLayout from './pages/admin/Layout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminTests from './pages/admin/Tests';
import TestCreator from './pages/admin/TestCreator';
import AdminResults from './pages/admin/Results';
import AdminUsers from './pages/admin/Users';
import AdminAdmins from './pages/admin/Admins';
import AdminQuestionBank from './pages/admin/QuestionBank';
import SendEmail from './pages/admin/SendEmail';
import Landing from './pages/Landing';

import StudentLayout from './pages/student/Layout';
import StudentTests from './pages/student/Tests';
import StudentResults from './pages/student/Results';
import TestInterface from './pages/student/TestInterface';
import ResultDetail from './pages/student/ResultDetail';

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
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' || user.role === 'super_admin' ? '/admin' : '/student'} replace /> : <LoginPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={<RequireAuth role="admin"><AdminLayout /></RequireAuth>}>
        <Route index element={<AdminDashboard />} />
        <Route path="tests" element={<AdminTests />} />
        <Route path="tests/new" element={<TestCreator />} />
        <Route path="tests/:id/edit" element={<TestCreator />} />
        <Route path="results" element={<AdminResults />} />
        <Route path="results/:testId" element={<AdminResults />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="admins" element={<AdminAdmins />} />
        <Route path="question-bank" element={<AdminQuestionBank />} />
        <Route path="email" element={<SendEmail />} />
      </Route>

      {/* Student routes */}
      <Route path="/student" element={<RequireAuth role="student"><StudentLayout /></RequireAuth>}>
        <Route index element={<StudentTests />} />
        <Route path="results" element={<StudentResults />} />
        <Route path="results/:submissionId" element={<ResultDetail />} />
      </Route>

      {/* Test taking - full screen, no layout */}
      <Route path="/test/:testId" element={<RequireAuth role="student"><TestInterface /></RequireAuth>} />

      {/* Public landing page (redirects straight to dashboard if already signed in) */}
      <Route path="/" element={user ? <Navigate to={user.role === 'admin' || user.role === 'super_admin' ? '/admin' : '/student'} replace /> : <Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
