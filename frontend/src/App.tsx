import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { config } from './config';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import CambioPasswordPage from './pages/CambioPasswordPage';
import SociPage from './pages/SociPage';
import IncontriPage from './pages/IncontriPage';
import VouchersPage from './pages/VouchersPage';
import ResocontoPage from './pages/ResocontoPage';
import AdminPage from './pages/AdminPage';
import ResocontiAdminPage from './pages/ResocontiAdminPage';
import TesseramentiPage from './pages/TesseramentiPage';
import FatturazionePage from './pages/FatturazionePage';
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
        {/* Resoconto è la pagina dell'istruttore con gli incontri che ha
            tenuto. Non c'è per gli admin, che vedono gli stessi dati da
            Resoconti scegliendo sé stessi. Le rotte non registrate ricadono
            sul catch-all e tornano alla home, invece di aprire una pagina
            vuota o rifiutata dal backend. */}
        {user.isIstruttore && !user.isAdmin && <Route path='/resoconto' element={<ResocontoPage />} />}
        {user.isAdmin && <Route path='/resoconti'    element={<ResocontiAdminPage />} />}
        {/* Moduli opzionali: se il club non li ha attivi la rotta non esiste
            proprio, e /tesseramenti digitato a mano ricade sul catch-all qui
            sotto tornando alla home. Il backend risponde comunque 404 alle
            relative API (backend/src/util/moduli.ts). */}
        {user.isAdmin && config.moduli.tesseramento && <Route path='/tesseramenti' element={<TesseramentiPage />} />}
        {user.isAdmin && config.moduli.fatturazione && <Route path='/fatturazione' element={<FatturazionePage />} />}
        <Route path='/admin'    element={<AdminPage />} />
        <Route path='/info'     element={<InfoPage />} />
        <Route path='*'         element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </Layout>
  );
}

/**
 * Pagina di accesso, ma solo finché non c'è una sessione.
 *
 * Il redirect vive qui e non nel gestore del form perché deve valere per
 * qualunque modo di arrivare su /login: dopo un accesso riuscito, dopo una
 * registrazione, o digitando l'indirizzo a mano con la sessione già aperta.
 * Senza, l'accesso andava a buon fine ma la schermata restava quella del
 * form, e sembrava che il bottone non facesse nulla.
 *
 * `replace`: il tasto indietro non deve riportare al form di una sessione
 * ormai aperta.
 */
function RottaAccesso() {
  const { user } = useAuth();
  return user ? <Navigate to='/' replace /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Non c'è più una rotta /callback: con l'accesso via email e
              password non si esce dall'app verso un provider esterno, quindi
              non c'è alcun ritorno da gestire. */}
          <Route path='/login' element={<RottaAccesso />} />
          <Route path='/*'     element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
