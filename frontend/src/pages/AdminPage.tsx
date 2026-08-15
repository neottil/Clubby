import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import TableScroll from '../components/TableScroll';
import SocioSelect from '../components/SocioSelect';
import SearchSelect from '../components/SearchSelect';
import { theme } from '../theme';

/** Utente come lo espone l'authorizer attraverso il backend. */
interface UtenteRegistrato {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  ruolo: 'admin' | 'viewer';
  attivo: boolean;
  cambio_password_richiesto: boolean;
}
interface Socio { id: string; nome: string; cognome: string; email: string | null; id_viewer: string | null; }

export default function AdminPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const api = createApiClient(token);

  const [utenti, setUtenti]               = useState<UtenteRegistrato[]>([]);
  const [soci, setSoci]                   = useState<Socio[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [successMsg, setSuccessMsg]       = useState('');
  // Password temporanea appena generata: mostrata una sola volta, non è più
  // recuperabile dopo (a database c'è solo il suo hash).
  const [passwordTemporanea, setPasswordTemporanea] = useState<{ email: string; password: string } | null>(null);

  // Form associa utente
  const [assocForm, setAssocForm]         = useState({ socio_id: '', utente_id: '' });
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (!user?.isAdmin) { navigate('/soci'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([api.getAdminUsers(), api.getSoci()]);
      setUtenti(u);
      setSoci(s);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const associa = async () => {
    setSaving(true);
    setError('');
    try {
      await api.associaViewer(assocForm);
      setSuccessMsg('Utente associato al socio');
      setAssocForm({ socio_id: '', utente_id: '' });
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const emailUtenteAssociato = (viewerId: string) =>
    utenti.find(u => u.id === viewerId)?.email ?? '—';

  const disassocia = async (socioId: string) => {
    if (!confirm('Rimuovere l\'associazione viewer?')) return;
    try {
      await api.disassociaViewer(socioId);
      setSuccessMsg('Associazione rimossa');
      load();
    } catch (e: any) { setError(e.message); }
  };

  const promuovi = async (u: UtenteRegistrato) => {
    if (!confirm(`Promuovere ${u.email} ad admin?`)) return;
    try {
      await api.promuoviAdmin({ utente_id: u.id });
      setSuccessMsg(`${u.email} promosso ad admin`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const retrocedi = async (u: UtenteRegistrato) => {
    // Cambiare ruolo chiude le sessioni aperte dell'interessato: il ruolo sta
    // dentro il token, e finché quello vecchio non scade porterebbe ancora i
    // permessi di prima.
    if (!confirm(`Retrocedere ${u.email} a solo viewer? Dovrà rifare l'accesso.`)) return;
    try {
      await api.retrocediAdmin({ utente_id: u.id });
      setSuccessMsg(`${u.email} retrocesso a viewer`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const resetPassword = async (u: UtenteRegistrato) => {
    if (!confirm(
      `Azzerare la password di ${u.email}?\n\n` +
      `Verrà generata una password temporanea da consegnare all'interessato, ` +
      `che dovrà sostituirla al primo accesso. Le sessioni aperte verranno chiuse.`
    )) return;
    setError('');
    try {
      const esito = await api.resetPassword({ utente_id: u.id });
      setPasswordTemporanea({ email: u.email, password: esito.password_temporanea });
      setSuccessMsg('');
      load();
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;



  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Pannello Admin</h2>

      {error      && <div style={styles.error}>{error}</div>}
      {successMsg && <div style={styles.success}>{successMsg}</div>}

      {/* Mostrata una sola volta: a database resta solo l'hash, quindi
          ricaricando la pagina questa password non è più recuperabile e
          servirebbe un nuovo azzeramento. */}
      {passwordTemporanea && (
        <div style={styles.passwordBox}>
          <strong>Password temporanea per {passwordTemporanea.email}</strong>
          <code style={styles.passwordValore}>{passwordTemporanea.password}</code>
          <p style={styles.passwordNota}>
            Consegnala all'interessato: le verrà chiesto di sostituirla al primo accesso.
            Non sarà più visibile dopo aver chiuso questo avviso.
          </p>
          <button style={styles.btnSmall} onClick={() => setPasswordTemporanea(null)}>Ho preso nota</button>
        </div>
      )}

      {/* Associa utente a socio */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Associa utente a socio</h3>
        <p style={styles.hint}>Seleziona il socio e inserisci l'email (utente registrato) dell'utente da associare.</p>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Socio</label>
            <SocioSelect
              soci={soci}
              value={assocForm.socio_id}
              onChange={id => setAssocForm({ ...assocForm, socio_id: id })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Utente registrato</label>
            {/* L'utente è identificato dal suo id: l'email resta l'etichetta
                mostrata, ma è modificabile dall'interessato e non è quindi un
                riferimento stabile. */}
            <SearchSelect
              options={utenti.filter(u => u.ruolo !== 'admin')}
              value={assocForm.utente_id}
              onChange={id => setAssocForm({ ...assocForm, utente_id: id })}
              getValue={u => u.id}
              getLabel={u => `${u.cognome} ${u.nome} — ${u.email}`}
              placeholder='Cerca per nome o email...'
              emptyLabel='Nessun utente trovato'
            />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button style={styles.btn} onClick={associa} disabled={saving || !assocForm.socio_id || !assocForm.utente_id}>
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
                const kcEmail = emailUtenteAssociato(s.id_viewer!);
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
                {['Nominativo', 'Email', 'Telefono', 'Ruolo', 'Stato', 'Azioni'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {utenti.map(u => (
                <tr key={u.id} style={styles.tr}>
                  <td style={styles.td}>{u.cognome} {u.nome}</td>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>{u.telefono ?? '—'}</td>
                  <td style={styles.td}>{u.ruolo}</td>
                  <td style={styles.td}>
                    {!u.attivo
                      ? '✗ Disattivato'
                      : u.cambio_password_richiesto
                        ? '⏳ Password da impostare'
                        : '✓ Attivo'}
                  </td>
                  <td style={styles.td}>
                    {u.ruolo !== 'admin' && (
                      <button style={styles.btnSmall} onClick={() => promuovi(u)}>Promuovi admin</button>
                    )}
                    {/* Un admin non può retrocedere sé stesso: sarebbe il modo
                        più rapido di restare senza nessun amministratore.
                        L'authorizer lo impedisce comunque, il bottone nascosto
                        evita di far scoprire il divieto con un errore. */}
                    {u.ruolo === 'admin' && u.id !== user?.sub && (
                      <button style={{ ...styles.btnSmall, ...styles.btnDanger }} onClick={() => retrocedi(u)}>Retrocedi a viewer</button>
                    )}
                    <button style={styles.btnSmall} onClick={() => resetPassword(u)}>Azzera password</button>
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
  passwordBox: { background: '#fffbeb', border: '1px solid #fcd34d', padding: '16px 20px', borderRadius: 8, marginBottom: 16 },
  passwordValore: {
    display: 'block', margin: '10px 0', padding: '10px 14px', background: '#fff',
    border: '1px solid #e5e7eb', borderRadius: 6, fontFamily: 'monospace', fontSize: 18,
    letterSpacing: 1, userSelect: 'all',
  },
  passwordNota: { fontSize: 13, color: '#78350f', margin: '0 0 12px' },
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
