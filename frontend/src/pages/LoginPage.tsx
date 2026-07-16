import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import { theme } from '../theme';

export default function LoginPage() {
  const { login, register, isLoading, sessionExpired } = useAuth();

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{config.tenantName}ClubManager</h1>
        <p style={styles.subtitle}>ClubManager</p>
        {sessionExpired && (
          <div style={styles.sessionExpired}>
            La sessione è scaduta. Accedi di nuovo per continuare.
          </div>
        )}
        <button
          style={styles.button}
          onClick={login}
          disabled={isLoading}
        >
          {isLoading ? 'Caricamento...' : 'Accedi'}
        </button>
        <button
          style={styles.buttonSecondary}
          onClick={register}
          disabled={isLoading}
        >
          Registrati
        </button>
      </div>
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
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '48px 64px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
    textAlign: 'center',
    minWidth: 320,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    margin: '0 0 8px 0',
    color: theme.navBg,
  },
  subtitle: {
    color: '#666',
    marginBottom: 32,
  },
  sessionExpired: {
    background: '#fee',
    color: theme.danger,
    padding: '10px 16px',
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 14,
  },
  button: {
    background: theme.primary,
    color: theme.primaryText,
    border: 'none',
    borderRadius: 8,
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  buttonSecondary: {
    background: 'transparent',
    color: theme.primary,
    border: `1px solid ${theme.primary}`,
    borderRadius: 8,
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 12,
  },
};
