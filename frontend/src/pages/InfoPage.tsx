import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import { config } from '../config';

export default function InfoPage() {
  const { token } = useAuth();
  const api = createApiClient(token);

  const [backendVersion, setBackendVersion] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getVersion()
      .then(r => setBackendVersion(r.version))
      .catch((e: any) => setError(e.message));
  }, []);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Info</h2>
      <div style={styles.card}>
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.row}>
          <span style={styles.label}>Frontend</span>
          <span style={styles.value}>{config.appVersion}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Backend</span>
          <span style={styles.value}>{backendVersion ?? (error ? '—' : 'Caricamento...')}</span>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 32 },
  title: { margin: '0 0 24px', fontSize: 22, fontWeight: 700 },
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', maxWidth: 400 },
  error: { background: '#fee', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  label: { color: '#666', fontWeight: 500 },
  value: { fontWeight: 600, color: '#333' },
};
