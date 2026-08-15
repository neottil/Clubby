import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import { theme } from '../theme';

type Modalita = 'accesso' | 'registrazione';

const formVuoto = { nome: '', cognome: '', telefono: '', email: '', password: '' };

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

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore('');
    try {
      if (modalita === 'accesso') {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
    } catch (err: any) {
      setErrore(err.message ?? 'Operazione non riuscita');
    }
  };

  const registrazione = modalita === 'registrazione';
  // In registrazione tutti i campi sono richiesti; in accesso bastano le
  // credenziali. Il bottone resta disabilitato finché non è possibile
  // procedere, così l'utente vede cosa manca prima di provare a inviare.
  const puoInviare = registrazione
    ? form.nome && form.cognome && form.telefono && form.email && form.password
    : form.email && form.password;

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
        {errore && <div style={styles.errore}>{errore}</div>}

        {registrazione && (
          <>
            <label style={styles.label}>
              Nome
              <input style={styles.input} value={form.nome} onChange={aggiorna('nome')} autoComplete='given-name' />
            </label>
            <label style={styles.label}>
              Cognome
              <input style={styles.input} value={form.cognome} onChange={aggiorna('cognome')} autoComplete='family-name' />
            </label>
            <label style={styles.label}>
              Telefono
              <input style={styles.input} type='tel' value={form.telefono} onChange={aggiorna('telefono')} autoComplete='tel' />
            </label>
          </>
        )}

        <label style={styles.label}>
          Email
          <input style={styles.input} type='email' value={form.email} onChange={aggiorna('email')} autoComplete='email' />
        </label>
        <label style={styles.label}>
          Password
          <input
            style={styles.input}
            type='password'
            value={form.password}
            onChange={aggiorna('password')}
            // Suggerisce al gestore di password del browser se salvare una
            // credenziale nuova o proporre quella esistente.
            autoComplete={registrazione ? 'new-password' : 'current-password'}
          />
        </label>
        {registrazione && (
          <p style={styles.aiuto}>La password deve essere lunga almeno 10 caratteri.</p>
        )}

        <button style={styles.button} type='submit' disabled={isLoading || !puoInviare}>
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
  button: {
    background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8,
    padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', minHeight: 44,
    marginTop: 4,
  },
  buttonSecondary: {
    background: 'transparent', color: theme.primary, border: 'none',
    padding: '12px 8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', minHeight: 44,
  },
};
