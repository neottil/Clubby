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
      <div style={styles.card}>
        <h2 style={styles.title}>Info</h2>
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
  // 56px = altezza della navbar (vedi Layout.tsx): centra la card nello
  // spazio effettivamente visibile sotto la navbar, non nell'intero viewport.
  page: { minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, boxSizing: 'border-box' },
  title: { margin: '0 0 20px', fontSize: 22, fontWeight: 700, textAlign: 'center' },
  card: { background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', width: '100%', maxWidth: 400 },
  error: { background: '#fee', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  label: { color: '#666', fontWeight: 500 },
  value: { fontWeight: 600, color: '#333' },
};
