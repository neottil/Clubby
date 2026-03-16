import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import SociPage from './pages/SociPage';
import IncontriPage from './pages/IncontriPage';
import BuoniPage from './pages/BuoniPage';
import AdminPage from './pages/AdminPage';

function CallbackPage() {
  // Gestisce il redirect OAuth: il codice è intercettato da AuthContext
  const { isLoading } = useAuth();
  return <div style={{ padding: 64, textAlign: 'center' }}>{isLoading ? 'Autenticazione in corso...' : 'Reindirizzamento...'}</div>;
}

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div style={{ padding: 64, textAlign: 'center' }}>Caricamento...</div>;
  if (!user)     return <Navigate to='/login' replace />;

  return (
    <Layout>
      <Routes>
        <Route path='/'         element={<Navigate to='/soci' replace />} />
        <Route path='/soci'     element={<SociPage />} />
        <Route path='/incontri' element={<IncontriPage />} />
        <Route path='/buoni'    element={<BuoniPage />} />
        <Route path='/admin'    element={<AdminPage />} />
        <Route path='*'         element={<Navigate to='/soci' replace />} />
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
