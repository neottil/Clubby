import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import CambioPasswordPage from './pages/CambioPasswordPage';
import SociPage from './pages/SociPage';
import IncontriPage from './pages/IncontriPage';
import VouchersPage from './pages/VouchersPage';
import ResocontoPage from './pages/ResocontoPage';
import AdminPage from './pages/AdminPage';
import InfoPage from './pages/InfoPage';

function ProtectedRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div style={{ padding: 64, textAlign: 'center' }}>Caricamento...</div>;
  if (!user)     return <Navigate to='/login' replace />;

  // Password temporanea non ancora sostituita: nessuna rotta dell'app è
  // raggiungibile finché non lo è. Il backend rifiuterebbe comunque le
  // operazioni, ma è meglio dirlo qui che lasciar sbattere l'utente contro
  // errori sparsi.
  if (user.cambioPasswordRichiesto) return <CambioPasswordPage />;

  // Voucher è la home per tutti: sia admin che viewer atterrano lì dopo il login.
  const defaultRoute = '/voucher';

  return (
    <Layout>
      <Routes>
        <Route path='/'         element={<Navigate to={defaultRoute} replace />} />
        <Route path='/soci'     element={<SociPage />} />
        <Route path='/incontri' element={<IncontriPage />} />
        <Route path='/voucher'  element={<VouchersPage />} />
        {/* Resoconto è solo per admin: la rotta non viene nemmeno registrata
            per un viewer, così l'URL digitato a mano ricade sul catch-all e
            torna alla home invece di aprire una pagina che poi fallirebbe. */}
        {user.isAdmin && <Route path='/resoconto' element={<ResocontoPage />} />}
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
          {/* Non c'è più una rotta /callback: con l'accesso via email e
              password non si esce dall'app verso un provider esterno, quindi
              non c'è alcun ritorno da gestire. */}
          <Route path='/login' element={<LoginPage />} />
          <Route path='/*'     element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
