import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import TableScroll from '../components/TableScroll';
import { theme } from '../theme';

interface KeycloakUser { sub: string; email: string; groups: string[]; enabled: boolean; }
interface Socio { id: string; nome: string; cognome: string; email: string | null; id_viewer: string | null; }

export default function AdminPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const api = createApiClient(token);

  const [keycloakUsers, setKeycloakUsers] = useState<KeycloakUser[]>([]);
  const [soci, setSoci]                   = useState<Socio[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [successMsg, setSuccessMsg]       = useState('');

  // Form associa viewer
  const [assocForm, setAssocForm]         = useState({ socio_id: '', keycloak_user_id: '' });
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (!user?.isAdmin) { navigate('/soci'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([api.getAdminUsers(), api.getSoci()]);
      setKeycloakUsers(u);
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
      setAssocForm({ socio_id: '', keycloak_user_id: '' });
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const kcEmailByViewerId = (viewerId: string) =>
    keycloakUsers.find(u => u.sub === viewerId)?.email ?? '—';

  const disassocia = async (socioId: string) => {
    if (!confirm('Rimuovere l\'associazione viewer?')) return;
    try {
      await api.disassociaViewer(socioId);
      setSuccessMsg('Associazione rimossa');
      load();
    } catch (e: any) { setError(e.message); }
  };

  const promuovi = async (userEmail: string) => {
    if (!confirm(`Promuovere ${userEmail} ad admin?`)) return;
    try {
      await api.promuoviAdmin({ keycloak_user_id: userEmail });
      setSuccessMsg(`${userEmail} promosso ad admin`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;



  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Pannello Admin</h2>

      {error      && <div style={styles.error}>{error}</div>}
      {successMsg && <div style={styles.success}>{successMsg}</div>}

      {/* Associa utente a socio */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Associa utente a socio</h3>
        <p style={styles.hint}>Seleziona il socio e inserisci l'email (utente registrato) dell'utente da associare.</p>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Socio</label>
            <select style={styles.input} value={assocForm.socio_id} onChange={e => setAssocForm({ ...assocForm, socio_id: e.target.value })}>
              <option value=''>— Seleziona socio —</option>
              {soci.map(s => <option key={s.id} value={s.id}>{s.cognome} {s.nome}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Utente registrato (email)</label>
            <select style={styles.input} value={assocForm.keycloak_user_id} onChange={e => setAssocForm({ ...assocForm, keycloak_user_id: e.target.value })}>
              <option value=''>— Seleziona utente —</option>
              {keycloakUsers.filter(u => !u.groups.includes('admin')).map(u => (
                <option key={u.sub} value={u.email}>{u.email}</option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button style={styles.btn} onClick={associa} disabled={saving || !assocForm.socio_id || !assocForm.keycloak_user_id}>
              {saving ? '...' : 'Associa'}
            </button>
          </div>
        </div>
      </section>

      {/* Lista soci con utente associato */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Soci con utente associato</h3>
        <TableScroll>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Socio', 'Email socio', 'Email utente Registrato', 'Azioni'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {soci.filter(s => s.id_viewer).map(s => {
                const kcEmail = kcEmailByViewerId(s.id_viewer!);
                const mismatch = s.email && kcEmail !== '—' && s.email !== kcEmail;
                return (
                  <tr key={s.id} style={styles.tr}>
                    <td style={styles.td}>{s.cognome} {s.nome}</td>
                    <td style={styles.td}>{s.email ?? '—'}</td>
                    <td style={{ ...styles.td, ...(mismatch ? styles.emailMismatch : {}) }}>
                      {kcEmail}{mismatch && ' ⚠️'}
                    </td>
                    <td style={styles.td}>
                      <button style={{ ...styles.btnSmall, ...styles.btnDanger }} onClick={() => disassocia(s.id)}>Rimuovi</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        {soci.filter(s => s.id_viewer).length === 0 && <p style={styles.empty}>Nessun viewer associato.</p>}
      </section>

      {/* Lista utenti Registrati */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Utenti Registrati</h3>
        <TableScroll>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Email', 'Ruoli', 'Stato', 'Azioni'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {keycloakUsers.map(u => (
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
        </TableScroll>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 32 },
  title: { margin: '0 0 24px', fontSize: 22, fontWeight: 700 },
  loading: { padding: 48, textAlign: 'center', color: '#666' },
  error: { background: '#fee', color: theme.danger, padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  success: { background: '#f0fdf4', color: theme.success, padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  section: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  sectionTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 700 },
  hint: { color: '#666', fontSize: 13, marginBottom: 16 },
  row: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  btn: { background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8, padding: '8px 20px', minHeight: 40, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  btnSmall: { background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '8px 14px', minHeight: 40, cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnDanger: { background: '#fee', color: theme.danger },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  emailMismatch: { color: theme.danger, fontWeight: 600 },
  empty: { textAlign: 'center', color: '#999', marginTop: 16 },
};
