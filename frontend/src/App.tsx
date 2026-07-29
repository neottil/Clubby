import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SociPage from './pages/SociPage';
import IncontriPage from './pages/IncontriPage';
import VouchersPage from './pages/VouchersPage';
import AdminPage from './pages/AdminPage';
import InfoPage from './pages/InfoPage';

function CallbackPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/', { replace: true });
    }
  }, [isLoading, user, navigate]);

  return <div style={{ padding: 64, textAlign: 'center' }}>{isLoading ? 'Autenticazione in corso...' : 'Reindirizzamento...'}</div>;
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div style={{ padding: 64, textAlign: 'center' }}>Caricamento...</div>;
  if (!user)     return <Navigate to='/login' replace />;

  // Voucher è la home per tutti: sia admin che viewer atterrano lì dopo il login.
  const defaultRoute = '/voucher';

  return (
    <Layout>
      <Routes>
        <Route path='/'         element={<Navigate to={defaultRoute} replace />} />
        <Route path='/soci'     element={<SociPage />} />
        <Route path='/incontri' element={<IncontriPage />} />
        <Route path='/voucher'  element={<VouchersPage />} />
        <Route path='/admin'    element={<AdminPage />} />
        <Route path='/info'     element={<InfoPage />} />
        <Route path='*'         element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path='/login'    element={<LoginPage />} />
          <Route path='/callback' element={<CallbackPage />} />
          <Route path='/*'        element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
