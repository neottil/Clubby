import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';

interface CognitoUser { sub: string; email: string; groups: string[]; enabled: boolean; }
interface Socio { id: string; nome: string; cognome: string; id_viewer: string | null; }

export default function AdminPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const api = createApiClient(token);

  const [cognitoUsers, setCognitoUsers] = useState<CognitoUser[]>([]);
  const [soci, setSoci]                 = useState<Socio[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');

  // Form associa viewer
  const [assocForm, setAssocForm]       = useState({ socio_id: '', cognito_username: '' });
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    if (!user?.isAdmin) { navigate('/soci'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([api.getAdminUsers(), api.getSoci()]);
      setCognitoUsers(u);
      setSoci(s);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const associa = async () => {
    setSaving(true);
    setError('');
    try {
      await api.associaViewer(assocForm);
      setSuccessMsg('Viewer associato con successo');
      setAssocForm({ socio_id: '', cognito_username: '' });
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const disassocia = async (socioId: string) => {
    if (!confirm('Rimuovere l\'associazione viewer?')) return;
    try {
      await api.disassociaViewer(socioId);
      setSuccessMsg('Associazione rimossa');
      load();
    } catch (e: any) { setError(e.message); }
  };

  const promuovi = async (cognitoUsername: string) => {
    if (!confirm(`Promuovere ${cognitoUsername} ad admin?`)) return;
    try {
      await api.promuoviAdmin({ cognito_username: cognitoUsername });
      setSuccessMsg(`${cognitoUsername} promosso ad admin`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  const socioLabel = (id: string) => { const s = soci.find(x => x.id === id); return s ? `${s.cognome} ${s.nome}` : id; };

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Pannello Admin</h2>

      {error      && <div style={styles.error}>{error}</div>}
      {successMsg && <div style={styles.success}>{successMsg}</div>}

      {/* Associa viewer a socio */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Associa viewer a socio</h3>
        <p style={styles.hint}>Seleziona il socio e inserisci l'email (username Cognito) del viewer da associare.</p>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Socio</label>
            <select style={styles.input} value={assocForm.socio_id} onChange={e => setAssocForm({ ...assocForm, socio_id: e.target.value })}>
              <option value=''>— Seleziona socio —</option>
              {soci.map(s => <option key={s.id} value={s.id}>{s.cognome} {s.nome}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Username Cognito (email)</label>
            <select style={styles.input} value={assocForm.cognito_username} onChange={e => setAssocForm({ ...assocForm, cognito_username: e.target.value })}>
              <option value=''>— Seleziona utente —</option>
              {cognitoUsers.filter(u => !u.groups.includes('admin')).map(u => (
                <option key={u.sub} value={u.email}>{u.email}</option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button style={styles.btn} onClick={associa} disabled={saving || !assocForm.socio_id || !assocForm.cognito_username}>
              {saving ? '...' : 'Associa'}
            </button>
          </div>
        </div>
      </section>

      {/* Lista soci con viewer */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Soci con viewer associato</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Socio', 'Viewer (Cognito sub)', 'Azioni'].map(h => <th key={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {soci.filter(s => s.id_viewer).map(s => (
              <tr key={s.id} style={styles.tr}>
                <td style={styles.td}>{s.cognome} {s.nome}</td>
                <td style={styles.tdMono}>{s.id_viewer}</td>
                <td style={styles.td}>
                  <button style={{ ...styles.btnSmall, ...styles.btnDanger }} onClick={() => disassocia(s.id)}>Rimuovi</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {soci.filter(s => s.id_viewer).length === 0 && <p style={styles.empty}>Nessun viewer associato.</p>}
      </section>

      {/* Lista utenti Cognito */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Utenti Cognito</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Email', 'Gruppi', 'Stato', 'Azioni'].map(h => <th key={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {cognitoUsers.map(u => (
              <tr key={u.sub} style={styles.tr}>
                <td style={styles.td}>{u.email}</td>
                <td style={styles.td}>{u.groups.join(', ') || 'viewer'}</td>
                <td style={styles.td}>{u.enabled ? '✓ Attivo' : '✗ Disabilitato'}</td>
                <td style={styles.td}>
                  {!u.groups.includes('admin') && (
                    <button style={styles.btnSmall} onClick={() => promuovi(u.email)}>Promuovi admin</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 32 },
  title: { margin: '0 0 24px', fontSize: 22, fontWeight: 700 },
  loading: { padding: 48, textAlign: 'center', color: '#666' },
  error: { background: '#fee', color: '#c00', padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  success: { background: '#f0fdf4', color: '#16a34a', padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  section: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  sectionTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 700 },
  hint: { color: '#666', fontSize: 13, marginBottom: 16 },
  row: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  btn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  btnSmall: { background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnDanger: { background: '#fee', color: '#c00' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  tdMono: { padding: '11px 16px', fontSize: 12, color: '#555', fontFamily: 'monospace' },
  empty: { textAlign: 'center', color: '#999', marginTop: 16 },
};
