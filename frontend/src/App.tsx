import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { LogoMark } from './components/Icons';
import { LoginPage } from './pages/LoginPage';
import { MessengerPage } from './pages/MessengerPage';
import { RegisterPage } from './pages/RegisterPage';

function LoadingScreen() {
  return (
    <main className="app-loading">
      <LogoMark className="app-loading__mark" />
      <span>PulseChat</span>
    </main>
  );
}

function ProtectedRoute() {
  const { user, isReady } = useAuth();
  if (!isReady) return <LoadingScreen />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicRoute() {
  const { user, isReady } = useAuth();
  if (!isReady) return <LoadingScreen />;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<MessengerPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
