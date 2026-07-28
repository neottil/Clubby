import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import { fetchFrontendVersion } from '../config';

/** Versione non ancora arrivata (null) vs. richiesta fallita (false). */
type VersionState = string | null | false;

function VersionRow({ label, version }: { label: string; version: VersionState }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={{ ...styles.value, ...(version === false ? styles.valueError : {}) }}>
        {version === false ? 'non disponibile' : version ?? '...'}
      </span>
    </div>
  );
}

export default function InfoPage() {
  const { token } = useAuth();

  // Nessuna delle due versioni è compilata nel bundle: ognuna arriva dal
  // componente che sta effettivamente girando (vedi config.ts), così restano
  // corrette anche quando i due scope vengono deployati separatamente.
  const [feVersion, setFeVersion] = useState<VersionState>(null);
  const [beVersion, setBeVersion] = useState<VersionState>(null);

  useEffect(() => {
    let annullato = false;

    fetchFrontendVersion()
      .then(v => { if (!annullato) setFeVersion(v); });

    createApiClient(token).getVersion()
      .then(res => { if (!annullato) setBeVersion(res.version); })
      .catch(()  => { if (!annullato) setBeVersion(false); });

    return () => { annullato = true; };
  }, [token]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Info</h2>
        <VersionRow label='Frontend' version={feVersion} />
        <VersionRow label='Backend'  version={beVersion} />
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
  row: { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  label: { color: '#666', fontWeight: 500 },
  value: { fontWeight: 600, color: '#333', wordBreak: 'break-all', textAlign: 'right' },
  valueError: { color: '#999', fontWeight: 500, fontStyle: 'italic' },
};
