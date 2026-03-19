import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';

interface Socio {
  id: string;
  nome: string;
  cognome: string;
  email: string | null;
  telefono: string | null;
  data_iscrizione: string;
  id_viewer: string | null;
  note: string | null;
}

const emptyForm = { nome: '', cognome: '', email: '', telefono: '', note: '' };

export default function SociPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);

  const [soci, setSoci]           = useState<Socio[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setSoci(await api.getSoci());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit   = (s: Socio) => {
    setForm({ nome: s.nome, cognome: s.cognome, email: s.email ?? '', telefono: s.telefono ?? '', note: s.note ?? '' });
    setEditId(s.id);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editId) {
        await api.updateSocio(editId, form);
      } else {
        await api.createSocio(form);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Eliminare questo socio?')) return;
    try {
      await api.deleteSocio(id);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Soci</h2>
        {user?.isAdmin && (
          <button style={styles.btn} onClick={openCreate}>+ Nuovo socio</button>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>{editId ? 'Modifica socio' : 'Nuovo socio'}</h3>
          {['nome', 'cognome', 'email', 'telefono', 'note'].map(field => (
            <div key={field} style={styles.field}>
              <label style={styles.label}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
              {field === 'note' ? (
                <textarea
                  style={styles.textarea}
                  value={(form as any)[field]}
                  onChange={e => setForm({ ...form, [field]: e.target.value })}
                />
              ) : (
                <input
                  style={styles.input}
                  value={(form as any)[field]}
                  onChange={e => setForm({ ...form, [field]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setShowForm(false)}>Annulla</button>
            <button style={styles.btn} onClick={save} disabled={saving}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>
      )}

      <table style={styles.table}>
        <thead>
          <tr>
            {['Cognome', 'Nome', 'Email', 'Telefono', 'Iscritto dal', ...(user?.isAdmin ? ['Azioni'] : [])].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {soci.map(s => (
            <tr key={s.id} style={styles.tr}>
              <td style={styles.td}>{s.cognome}</td>
              <td style={styles.td}>{s.nome}</td>
              <td style={styles.td}>{s.email ?? '—'}</td>
              <td style={styles.td}>{s.telefono ?? '—'}</td>
              <td style={styles.td}>{String(s.data_iscrizione).split('T')[0]}</td>
              {user?.isAdmin && (
                <td style={styles.td}>
                  <button style={styles.btnSmall} onClick={() => openEdit(s)}>Modifica</button>
                  <button style={{ ...styles.btnSmall, ...styles.btnDanger }} onClick={() => remove(s.id)}>Elimina</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {soci.length === 0 && !loading && (
        <p style={styles.empty}>Nessun socio presente.</p>
      )}
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
