import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import PasswordInput from '../components/PasswordInput';
import Avviso from '../components/Avviso';
import { theme } from '../theme';
import { messaggioErrore } from '../utils/errori';

/** Stessa soglia applicata dall'authorizer, vedi crypto/password.ts. */
const LUNGHEZZA_MINIMA_PASSWORD = 10;

/**
 * Cambio password obbligatorio, mostrato al posto dell'applicazione quando
 * l'account porta ancora una password temporanea assegnata da un admin.
 *
 * È una schermata bloccante e non una voce di menu: la password temporanea
 * viene consegnata a voce o per messaggio, quindi va sostituita prima di
 * poter fare qualunque altra cosa.
 */
export default function CambioPasswordPage() {
  const { cambiaPassword, logout, isLoading } = useAuth();
  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore('');
    if (nuova !== conferma) {
      setErrore('Le due password non coincidono');
      return;
    }
    try {
      await cambiaPassword(attuale, nuova);
    } catch (err) {
      setErrore(messaggioErrore(err, 'Cambio password non riuscito'));
    }
  };

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={invia}>
        <h1 style={styles.title}>Imposta una nuova password</h1>
        <p style={styles.subtitle}>
          Stai usando una password temporanea. Scegline una tua per continuare.
        </p>

        {errore && <Avviso tipo='errore' messaggio={errore} onChiudi={() => setErrore('')} />}

        <label style={styles.label}>
          Password temporanea
          <PasswordInput value={attuale} onChange={setAttuale} autoComplete='current-password' />
        </label>
        <label style={styles.label}>
          Nuova password
          <PasswordInput value={nuova} onChange={setNuova} autoComplete='new-password' />
        </label>
        <label style={styles.label}>
          Conferma nuova password
          <PasswordInput value={conferma} onChange={setConferma} autoComplete='new-password' />
        </label>
        {/* Come nel form di registrazione, il promemoria sparisce quando il
            requisito è soddisfatto invece di restare lì a rimproverare. */}
        {nuova.length < LUNGHEZZA_MINIMA_PASSWORD && (
          <p style={styles.aiuto}>Almeno {LUNGHEZZA_MINIMA_PASSWORD} caratteri.</p>
        )}

        <button
          style={styles.button}
          type='submit'
          disabled={isLoading || !attuale || !nuova || !conferma}
        >
          {isLoading ? 'Attendi...' : 'Salva la nuova password'}
        </button>
        <button style={styles.buttonSecondary} type='button' onClick={logout} disabled={isLoading}>
          Esci
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f5f5f5', padding: 16,
  },
  card: {
    background: '#fff', borderRadius: 12, padding: 32,
    boxShadow: '0 4px 24px rgba(0,0,0,0.10)', width: '100%', maxWidth: 380, boxSizing: 'border-box',
  },
  title: { fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: theme.navBg, textAlign: 'center' },
  subtitle: { color: '#666', marginTop: 0, marginBottom: 24, textAlign: 'center', fontSize: 14 },
  errore: { background: '#fee', color: theme.danger, padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 },
  label: { display: 'block', fontSize: 13, color: '#555', fontWeight: 500, marginBottom: 12 },
  input: {
    display: 'block', width: '100%', marginTop: 4, padding: '10px 12px',
    borderRadius: 6, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box',
  },
  aiuto: { fontSize: 12, color: '#777', margin: '0 0 12px' },
  button: {
    background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8,
    padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', minHeight: 44,
  },
  buttonSecondary: {
    background: 'transparent', color: '#666', border: 'none',
    padding: '12px 8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', minHeight: 44,
  },
};
