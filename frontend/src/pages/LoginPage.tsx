import { useAuth } from '../auth/AuthContext';
import { config } from '../config';

export default function LoginPage() {
  const { login, register, isLoading } = useAuth();

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>ClubManager</h1>
        <p style={styles.subtitle}>{config.tenantName}</p>
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
    color: '#1a1a2e',
  },
  subtitle: {
    color: '#666',
    marginBottom: 32,
  },
  button: {
    background: '#2563eb',
    color: '#fff',
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
    color: '#2563eb',
    border: '1px solid #2563eb',
    borderRadius: 8,
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 12,
  },
};
