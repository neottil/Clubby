import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import PasswordInput from '../components/PasswordInput';
import Avviso from '../components/Avviso';
import { theme } from '../theme';
import { messaggioErrore } from '../utils/errori';

type Modalita = 'accesso' | 'registrazione';

const formVuoto = { email: '', password: '' };

/**
 * Lunghezza minima della password, la stessa che applica l'authorizer
 * (erroreValidazionePassword in crypto/password.ts). Duplicarla qui serve solo
 * a dirlo prima dell'invio: la verifica che conta resta quella del server.
 */
const LUNGHEZZA_MINIMA_PASSWORD = 10;

export default function LoginPage() {
  const { login, register, isLoading, sessionExpired } = useAuth();
  const [modalita, setModalita] = useState<Modalita>('accesso');
  const [form, setForm] = useState(formVuoto);
  const [errore, setErrore] = useState('');

  const aggiorna = (campo: keyof typeof formVuoto) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [campo]: e.target.value });

  const cambiaModalita = (nuova: Modalita) => {
    setModalita(nuova);
    setErrore('');
  };

  const registrazione = modalita === 'registrazione';

  /**
   * Primo requisito non soddisfatto, o null se si può inviare.
   *
   * Restituisce un messaggio invece di un booleano perché il bottone resta
   * sempre attivo: un bottone disabilitato non dice cosa manca, e premerlo
   * senza che accada nulla è il modo peggiore di comunicare un errore.
   */
  const requisitoMancante = (): string | null => {
    if (!form.email.trim()) {
      return registrazione
        ? 'L\'email è obbligatoria: è con quella che accedi.'
        : 'Inserisci l\'email con cui ti sei registrato.';
    }
    if (!registrazione) {
      if (!form.password) return 'Inserisci la password.';
      return null;
    }
    if (form.password.length < LUNGHEZZA_MINIMA_PASSWORD) {
      return `La password deve essere lunga almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri.`;
    }
    return null;
  };

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore('');

    const mancante = requisitoMancante();
    if (mancante) {
      setErrore(mancante);
      return;
    }

    try {
      if (modalita === 'accesso') {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
    } catch (err) {
      setErrore(messaggioErrore(err, 'Operazione non riuscita'));
    }
  };

  // Il promemoria sulla lunghezza sparisce appena il requisito è soddisfatto:
  // continuare a mostrarlo lo farebbe leggere come un rimprovero a chi ha già
  // fatto la cosa giusta.
  const mostraAiutoPassword =
    registrazione && form.password.length < LUNGHEZZA_MINIMA_PASSWORD;

  // Finché manca qualcosa il bottone è grigio, ma NON disabilitato: il colore
  // rende evidente che non si è pronti, e il click resta l'unico modo per
  // sapere quale campo manca. Un bottone disabilitato non lo direbbe, non
  // prende il focus da tastiera e i lettori di schermo lo saltano.
  const pronto = requisitoMancante() === null;

  return (
    <div style={styles.container}>
      <form style={styles.card} onSubmit={invia}>
        <h1 style={styles.title}>{config.tenantName}</h1>
        <p style={styles.subtitle}>
          {registrazione ? 'Crea il tuo account' : 'Accedi al tuo account'}
        </p>

        {sessionExpired && !errore && (
          <div style={styles.avviso}>La sessione è scaduta. Accedi di nuovo per continuare.</div>
        )}
        {errore && <Avviso tipo='errore' messaggio={errore} onChiudi={() => setErrore('')} />}

        {registrazione && (
          // I dati anagrafici non si chiedono qui: sono della scheda socio,
          // che tiene l'associazione, e il collegamento lo fa un
          // amministratore. Dirlo prima evita che l'app sembri rotta quando,
          // subito dopo la registrazione, non mostra alcun dato.
          <p style={styles.aiutoSopra}>
            Servono solo email e password. Dopo la registrazione un amministratore collegherà
            il tuo account alla tua scheda socio: fino ad allora non vedrai ancora i tuoi dati.
          </p>
        )}

        <label style={styles.label}>
          Email
          <input style={styles.input} type='email' value={form.email} onChange={aggiorna('email')} autoComplete='email' />
        </label>
        <label style={styles.label}>
          Password
          <PasswordInput
            value={form.password}
            onChange={password => setForm({ ...form, password })}
            // Suggerisce al gestore di password del browser se salvare una
            // credenziale nuova o proporre quella esistente.
            autoComplete={registrazione ? 'new-password' : 'current-password'}
          />
        </label>
        {mostraAiutoPassword && (
          <p style={styles.aiuto}>
            La password deve essere lunga almeno {LUNGHEZZA_MINIMA_PASSWORD} caratteri.
          </p>
        )}

        <button
          style={{ ...styles.button, ...(pronto ? {} : styles.buttonInattivo) }}
          type='submit'
          disabled={isLoading}
        >
          {isLoading ? 'Attendi...' : registrazione ? 'Registrati' : 'Accedi'}
        </button>

        <button
          style={styles.buttonSecondary}
          type='button'
          onClick={() => cambiaModalita(registrazione ? 'accesso' : 'registrazione')}
          disabled={isLoading}
        >
          {registrazione ? 'Ho già un account, accedi' : 'Non hai un account? Registrati'}
        </button>

        {!registrazione && (
          // Senza invio di email non esiste un recupero self-service: dirlo
          // qui evita che l'utente cerchi un link "password dimenticata" che
          // non c'è.
          <p style={styles.aiuto}>
            Password dimenticata? Chiedi a un amministratore di azzerarla.
          </p>
        )}
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
    width: '100%',
    maxWidth: 380,
    boxSizing: 'border-box',
  },
  title: { fontSize: 28, fontWeight: 700, margin: '0 0 4px', color: theme.navBg, textAlign: 'center' },
  subtitle: { color: '#666', marginTop: 0, marginBottom: 24, textAlign: 'center', fontSize: 14 },
  avviso: { background: '#fff7ed', color: '#9a3412', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 },
  errore: { background: '#fee', color: theme.danger, padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 },
  label: { display: 'block', fontSize: 13, color: '#555', fontWeight: 500, marginBottom: 12 },
  input: {
    display: 'block', width: '100%', marginTop: 4, padding: '10px 12px',
    borderRadius: 6, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box',
  },
  aiuto: { fontSize: 12, color: '#777', margin: '0 0 12px', textAlign: 'center' },
  aiutoSopra: {
    fontSize: 13, color: '#555', lineHeight: 1.5, margin: '0 0 16px',
    background: '#f1f5f9', borderRadius: 8, padding: '10px 14px',
  },
  button: {
    background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8,
    padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', minHeight: 44,
    marginTop: 4,
  },
  // Grigio, ma con contrasto sufficiente a restare leggibile: non è un
  // bottone spento, è un bottone che segnala "non ancora".
  buttonInattivo: { background: '#d1d5db', color: '#4b5563' },
  buttonSecondary: {
    background: 'transparent', color: theme.primary, border: 'none',
    padding: '12px 8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', minHeight: 44,
  },
};
