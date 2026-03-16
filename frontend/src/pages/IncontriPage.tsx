import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';

interface Incontro {
  id: string;
  socio_id: string;
  data_incontro: string;
  costo: number;
  note: string | null;
  nome?: string;
  cognome?: string;
}

interface Socio { id: string; nome: string; cognome: string; }

const emptyForm = { socio_id: '', data_incontro: '', costo: '', note: '' };

export default function IncontriPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);

  const [incontri, setIncontri] = useState<Incontro[]>([]);
  const [soci, setSoci]         = useState<Socio[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [i, s] = await Promise.all([api.getIncontri(), api.getSoci()]);
      setIncontri(i);
      setSoci(s);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const socioLabel = (id: string) => {
    const s = soci.find(x => x.id === id);
    return s ? `${s.cognome} ${s.nome}` : id;
  };

  const openCreate = () => { setForm({ ...emptyForm, data_incontro: new Date().toISOString().split('T')[0] }); setEditId(null); setShowForm(true); };
  const openEdit   = (i: Incontro) => { setForm({ socio_id: i.socio_id, data_incontro: i.data_incontro, costo: String(i.costo), note: i.note ?? '' }); setEditId(i.id); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form, costo: parseFloat(form.costo) };
      if (editId) await api.updateIncontro(editId, payload);
      else        await api.createIncontro(payload);
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Eliminare questo incontro?')) return;
    try { await api.deleteIncontro(id); load(); }
    catch (e: any) { setError(e.message); }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Incontri</h2>
        {user?.isAdmin && <button style={styles.btn} onClick={openCreate}>+ Nuovo incontro</button>}
      </div>
      {error && <div style={styles.error}>{error}</div>}

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>{editId ? 'Modifica incontro' : 'Nuovo incontro'}</h3>
          <div style={styles.field}>
            <label style={styles.label}>Socio</label>
            <select style={styles.input} value={form.socio_id} onChange={e => setForm({ ...form, socio_id: e.target.value })}>
              <option value=''>— Seleziona —</option>
              {soci.map(s => <option key={s.id} value={s.id}>{s.cognome} {s.nome}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Data</label>
            <input type='date' style={styles.input} value={form.data_incontro} onChange={e => setForm({ ...form, data_incontro: e.target.value })} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Costo (€)</label>
            <input type='number' step='0.01' min='0' style={styles.input} value={form.costo} onChange={e => setForm({ ...form, costo: e.target.value })} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Note</label>
            <textarea style={styles.textarea} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </div>
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setShowForm(false)}>Annulla</button>
            <button style={styles.btn} onClick={save} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </div>
      )}

      <table style={styles.table}>
        <thead>
          <tr>
            {['Socio', 'Data', 'Costo', 'Note', ...(user?.isAdmin ? ['Azioni'] : [])].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {incontri.map(i => (
            <tr key={i.id} style={styles.tr}>
              <td style={styles.td}>{i.cognome && i.nome ? `${i.cognome} ${i.nome}` : socioLabel(i.socio_id)}</td>
              <td style={styles.td}>{i.data_incontro}</td>
              <td style={styles.td}>€ {Number(i.costo).toFixed(2)}</td>
              <td style={styles.td}>{i.note ?? '—'}</td>
              {user?.isAdmin && (
                <td style={styles.td}>
                  <button style={styles.btnSmall} onClick={() => openEdit(i)}>Modifica</button>
                  <button style={{ ...styles.btnSmall, ...styles.btnDanger }} onClick={() => remove(i.id)}>Elimina</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {incontri.length === 0 && !loading && <p style={styles.empty}>Nessun incontro registrato.</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 32 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  loading: { padding: 48, textAlign: 'center', color: '#666' },
  error: { background: '#fee', color: '#c00', padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  btn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 },
  btnSecondary: { background: '#e5e7eb', color: '#333', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 },
  btnSmall: { background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnDanger: { background: '#fee', color: '#c00' },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, minHeight: 80, boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
};
