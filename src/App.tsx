import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { JoinInvite } from './pages/JoinInvite';
import { Dashboard } from './pages/Dashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminSchoolInsights } from './pages/AdminSchoolInsights';
import { ResetPassword } from './pages/ResetPassword';
import { UpdatePassword } from './pages/UpdatePassword';
import './App.css';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="loading-spinner-icon" /> Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function AppContent() {
  const location = useLocation();
  // Dashboard and admin are full-screen apps — no public navbar
  const isAppRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dashboard');
  // Auth pages and home page have dark header
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/' || location.pathname === '/reset-password' || location.pathname === '/update-password';

  return (
    <div className="app-layout">
      {!isAppRoute && <Navbar dark={isAuthPage} />}
      <main className={`main-content${isAppRoute ? ' admin-page' : ''}`}>
        <Routes>
          <Route path="/"        element={<Home />} />
          <Route path="/login"   element={<Login />} />
          <Route path="/signup"  element={<Signup />} />
          <Route path="/join/:token" element={<JoinInvite />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
          <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/admin/school/:id" element={<ProtectedRoute><AdminSchoolInsights /></ProtectedRoute>} />
          <Route path="/admin/*"     element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

// Cached screen data: show what we have instantly, refresh in the background; never refetch just because
// the window regained focus; collapse duplicate requests fired within 5 s (e.g. React's dev double effects).
const swrOptions = { revalidateOnFocus: false, dedupingInterval: 5000 };

export default function App() {
  return (
    <SWRConfig value={swrOptions}>
      <AuthProvider>
        <Router>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </Router>
      </AuthProvider>
    </SWRConfig>
  );
}
