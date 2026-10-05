import { useEffect, useState } from 'react';
import { createApiClient } from '../api/client';
import { authApi } from '../auth/authApi';
import { fetchFrontendVersion } from '../config';

/**
 * undefined = richiesta in corso; null = non disponibile, sia perché la
 * richiesta è fallita sia perché il componente non dichiara una versione.
 * Per chi legge le due cose si equivalgono: non si sa cosa stia girando.
 */
type VersionState = string | null | undefined;

function VersionRow({ label, version }: { label: string; version: VersionState }) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span style={{ ...styles.value, ...(version === null ? styles.valueError : {}) }}>
        {version === null ? 'non disponibile' : version ?? '...'}
      </span>
    </div>
  );
}

/**
 * Raggiungibile anche senza accesso (vedi App.tsx): serve soprattutto quando
 * l'accesso non funziona. Per questo nessuna delle tre chiamate usa il token.
 */
export default function InfoPage() {
  // Nessuna delle versioni è compilata nel bundle: ognuna arriva dal
  // componente che sta effettivamente girando (vedi config.ts), così restano
  // corrette anche quando i tre moduli vengono deployati separatamente.
  const [feVersion, setFeVersion] = useState<VersionState>(undefined);
  const [beVersion, setBeVersion] = useState<VersionState>(undefined);
  const [authVersion, setAuthVersion] = useState<VersionState>(undefined);
  // Versione dello schema: il numero dell'ultima migrazione applicata, letto
  // dal backend nella stessa risposta della sua versione.
  const [dbVersion, setDbVersion] = useState<VersionState>(undefined);

  useEffect(() => {
    let annullato = false;

    fetchFrontendVersion()
      .then(v => { if (!annullato) setFeVersion(v); });

    createApiClient(null).getVersion()
      .then(res => { if (!annullato) { setBeVersion(res.version ?? null); setDbVersion(res.db ?? null); } })
      .catch(()  => { if (!annullato) { setBeVersion(null); setDbVersion(null); } });

    authApi.versione()
      .then(res => { if (!annullato) setAuthVersion(res.version ?? null); })
      .catch(()  => { if (!annullato) setAuthVersion(null); });

    return () => { annullato = true; };
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Info</h2>
        <VersionRow label='Frontend'   version={feVersion} />
        <VersionRow label='Backend'    version={beVersion} />
        <VersionRow label='Authorizer' version={authVersion} />
        <VersionRow label='Database'   version={dbVersion} />
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
