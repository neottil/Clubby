import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';

interface Buono {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;
  attivo: boolean;
  note: string | null;
}

interface Movimento {
  id: string;
  buono_id: string;
  data_movimento: string;
  importo: number;
  descrizione: string | null;
}

interface Socio { id: string; nome: string; cognome: string; }

export default function BuoniPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);

  const [buoni, setBuoni]               = useState<Buono[]>([]);
  const [soci, setSoci]                 = useState<Socio[]>([]);
  const [selectedBuono, setSelectedBuono] = useState<Buono | null>(null);
  const [movimenti, setMovimenti]       = useState<Movimento[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  // Form nuovo buono
  const [showBuonoForm, setShowBuonoForm]     = useState(false);
  const [buonoForm, setBuonoForm]             = useState({ socio_id: '', saldo_iniziale: '', note: '' });

  // Form nuovo movimento
  const [showMovForm, setShowMovForm]         = useState(false);
  const [movForm, setMovForm]                 = useState({ importo: '', descrizione: '' });
  const [saving, setSaving]                   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([api.getBuoni(), api.getSoci()]);
      setBuoni(b);
      setSoci(s);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadMovimenti = async (buono: Buono) => {
    setSelectedBuono(buono);
    try {
      setMovimenti(await api.getMovimenti(buono.id));
    } catch (e: any) { setError(e.message); }
  };

  const socioLabel = (id: string) => {
    const s = soci.find(x => x.id === id);
    return s ? `${s.cognome} ${s.nome}` : id;
  };

  const saveBuono = async () => {
    setSaving(true);
    try {
      await api.createBuono({ ...buonoForm, saldo_iniziale: parseFloat(buonoForm.saldo_iniziale) });
      setShowBuonoForm(false);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const saveMovimento = async () => {
    if (!selectedBuono) return;
    setSaving(true);
    try {
      await api.createMovimento(selectedBuono.id, { ...movForm, importo: parseFloat(movForm.importo) });
      setShowMovForm(false);
      await loadMovimenti(selectedBuono);
      // Aggiorna saldo nella lista
      const updatedBuoni = await api.getBuoni();
      const updated = updatedBuoni.find(b => b.id === selectedBuono.id) ?? selectedBuono;
      setBuoni(updatedBuoni);
      setSelectedBuono(updated);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Buoni prepagati</h2>
        {user?.isAdmin && <button style={styles.btn} onClick={() => { setBuonoForm({ socio_id: '', saldo_iniziale: '', note: '' }); setShowBuonoForm(true); }}>+ Nuovo buono</button>}
      </div>
      {error && <div style={styles.error}>{error}</div>}

      {showBuonoForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>Nuovo buono</h3>
          <div style={styles.field}>
            <label style={styles.label}>Socio</label>
            <select style={styles.input} value={buonoForm.socio_id} onChange={e => setBuonoForm({ ...buonoForm, socio_id: e.target.value })}>
              <option value=''>— Seleziona —</option>
              {soci.filter(s => !buoni.some(b => b.socio_id === s.id)).map(s => <option key={s.id} value={s.id}>{s.cognome} {s.nome}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Saldo iniziale (€)</label>
            <input type='number' step='0.01' min='0' style={styles.input} value={buonoForm.saldo_iniziale} onChange={e => setBuonoForm({ ...buonoForm, saldo_iniziale: e.target.value })} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Note</label>
            <textarea style={styles.textarea} value={buonoForm.note} onChange={e => setBuonoForm({ ...buonoForm, note: e.target.value })} />
          </div>
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setShowBuonoForm(false)}>Annulla</button>
            <button style={styles.btn} onClick={saveBuono} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {/* Lista buoni */}
        <div>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Socio', 'Data', 'Iniziale', 'Residuo', 'Stato', ''].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buoni.map(b => (
                <tr key={b.id} style={{ ...styles.tr, ...(selectedBuono?.id === b.id ? styles.trSelected : {}) }}>
                  <td style={styles.td}>{socioLabel(b.socio_id)}</td>
                  <td style={styles.td}>{b.data_creazione.split('T')[0]}</td>
                  <td style={styles.td}>€ {Number(b.saldo_iniziale).toFixed(2)}</td>
                  <td style={{ ...styles.td, fontWeight: 600, color: Number(b.saldo_residuo) > 0 ? '#16a34a' : '#dc2626' }}>
                    € {Number(b.saldo_residuo).toFixed(2)}
                  </td>
                  <td style={styles.td}>{b.attivo ? '✓ Attivo' : '✗ Chiuso'}</td>
                  <td style={styles.td}>
                    <button style={styles.btnSmall} onClick={() => loadMovimenti(b)}>Movimenti</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {buoni.length === 0 && <p style={styles.empty}>Nessun buono presente.</p>}
        </div>

        {/* Dettaglio movimenti */}
        {selectedBuono && (
          <div style={styles.movPanel}>
            <div style={styles.movHeader}>
              <h3 style={styles.movTitle}>Movimenti - {socioLabel(selectedBuono.socio_id)}</h3>
              {user?.isAdmin && (
                <button style={styles.btn} onClick={() => { setMovForm({ importo: '', descrizione: '' }); setShowMovForm(true); }}>+ Movimento</button>
              )}
            </div>

            {showMovForm && (
              <div style={styles.formCard}>
                <div style={styles.field}>
                  <label style={styles.label}>Importo (€) - positivo: ricarica, negativo: addebito</label>
                  <input type='number' step='0.01' style={styles.input} value={movForm.importo} onChange={e => setMovForm({ ...movForm, importo: e.target.value })} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Descrizione</label>
                  <input style={styles.input} value={movForm.descrizione} onChange={e => setMovForm({ ...movForm, descrizione: e.target.value })} />
                </div>
                <div style={styles.formActions}>
                  <button style={styles.btnSecondary} onClick={() => setShowMovForm(false)}>Annulla</button>
                  <button style={styles.btn} onClick={saveMovimento} disabled={saving}>{saving ? '...' : 'Salva'}</button>
                </div>
              </div>
            )}

            <table style={styles.table}>
              <thead>
                <tr>
                  {['Data', 'Importo', 'Descrizione'].map(h => <th key={h} style={styles.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {movimenti.map(m => (
                  <tr key={m.id} style={styles.tr}>
                    <td style={styles.td}>{m.data_movimento.split('T')[0]}</td>
                    <td style={{ ...styles.td, fontWeight: 600, color: m.importo >= 0 ? '#16a34a' : '#dc2626' }}>
                      {m.importo >= 0 ? '+' : ''}€ {Number(m.importo).toFixed(2)}
                    </td>
                    <td style={styles.td}>{m.descrizione ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movimenti.length === 0 && <p style={styles.empty}>Nessun movimento.</p>}
          </div>
        )}
      </div>
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
  formCard: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, minHeight: 80, boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
  grid: { display: 'flex', flexDirection: 'column', gap: 32 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
  trSelected: { background: '#eff6ff' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  movPanel: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  movHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  movTitle: { margin: 0, fontSize: 16, fontWeight: 700 },
};
