import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import { config } from '../config';
import SocioSelect from '../components/SocioSelect';
import ActivitySelect from '../components/ActivitySelect';
import { useTableSort } from '../hooks/useTableSort';
import TableScroll from '../components/TableScroll';
import { theme } from '../theme';

interface Incontro {
  id: string;
  socio_id: string;
  data_incontro: string;
  attivita: string | null;
  costo: number;
  note: string | null;
  nome?: string;
  cognome?: string;
}

interface Socio { id: string; nome: string; cognome: string; }
interface Buono { id: string; socio_id: string; saldo_residuo: number; }

const emptyForm = { socio_id: '', data_incontro: '', attivita: '', costo: '', note: '' };
const activityOptions = Object.keys(config.activityCostMapping);

export default function IncontriPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);

  const [incontri, setIncontri] = useState<Incontro[]>([]);
  const [soci, setSoci]         = useState<Socio[]>([]);
  const [buoni, setBuoni]       = useState<Buono[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]           = useState('');
  const [attivitaFilter, setAttivitaFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [i, s, b] = await Promise.all([api.getIncontri(), api.getSoci(), api.getBuoni()]);
      setIncontri(i);
      setSoci(s);
      setBuoni(b);
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
  const openEdit   = (i: Incontro) => { setForm({ socio_id: i.socio_id, data_incontro: String(i.data_incontro).split('T')[0], attivita: i.attivita ?? '', costo: String(i.costo), note: i.note ?? '' }); setEditId(i.id); setShowForm(true); };

  // Selezionando un'attività propone il costo di default associato
  // (VITE_ACTIVITY_SELECT_VALUES_MAPPING); resta comunque modificabile a mano.
  const onActivityChange = (attivita: string) => {
    const costoDefault = config.activityCostMapping[attivita];
    setForm({ ...form, attivita, costo: costoDefault !== undefined ? String(costoDefault) : form.costo });
  };

  const save = async () => {
    const costo = parseFloat(form.costo);

    // Se il socio ha un buono, avvisa (con conferma) quando questo incontro
    // porterebbe il saldo sotto zero — non blocca l'operazione, solo se il
    // saldo è già negativo lo farà il backend.
    const buono = buoni.find(b => b.socio_id === form.socio_id);
    if (buono) {
      const vecchioCosto = editId ? Number(incontri.find(i => i.id === editId)?.costo ?? 0) : 0;
      const nuovoSaldo = Number(buono.saldo_residuo) + vecchioCosto - costo;
      if (nuovoSaldo < 0) {
        const confermato = confirm(
          `Il socio ha un buono con saldo residuo di € ${Number(buono.saldo_residuo).toFixed(2)}.\n` +
          `Questo incontro (€ ${costo.toFixed(2)}) porterà il saldo a € ${nuovoSaldo.toFixed(2)} (negativo).\n\n` +
          `Vuoi procedere comunque?`
        );
        if (!confermato) return;
      }
    }

    setSaving(true);
    try {
      const payload = { ...form, costo };
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

  const enriched = useMemo(() => incontri.map(i => ({
    ...i,
    socioNome: i.cognome && i.nome ? `${i.cognome} ${i.nome}` : socioLabel(i.socio_id),
  })), [incontri, soci]);

  const attivitaPresenti = useMemo(
    () => Array.from(new Set(enriched.map(i => i.attivita).filter((a): a is string => !!a))).sort(),
    [enriched]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return enriched.filter(i => {
      if (attivitaFilter && i.attivita !== attivitaFilter) return false;
      if (!q) return true;
      return `${i.socioNome} ${i.attivita ?? ''} ${i.note ?? ''}`.toLowerCase().includes(q);
    });
  }, [enriched, filter, attivitaFilter]);

  const { sorted, toggleSort, sortIndicator } = useTableSort(filtered, {
    initialKey: 'data_incontro',
    numericKeys: ['costo'],
  });

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.title}>Incontri</h2>
        {user?.isAdmin && <button style={styles.btn} onClick={openCreate}>+ Nuovo incontro</button>}
      </div>
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.filterRow}>
        {user?.isAdmin && (
          <input
            style={styles.filterInput}
            placeholder='Cerca per socio, attività o note...'
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        )}
        {/* Filtra tra le sole attività effettivamente presenti negli incontri
            caricati, non tra quelle configurate: filtrare per un'attività che
            nessun incontro ha svuoterebbe la tabella senza motivo apparente. */}
        <div style={styles.filterSelect}>
          <ActivitySelect
            options={attivitaPresenti}
            value={attivitaFilter}
            onChange={setAttivitaFilter}
            resetLabel='Tutte le attività'
          />
        </div>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>{editId ? 'Modifica incontro' : 'Nuovo incontro'}</h3>
          <div style={styles.field}>
            <label style={styles.label}>Socio</label>
            {editId ? (
              <div style={styles.readOnlyField}>{socioLabel(form.socio_id)}</div>
            ) : (
              <SocioSelect soci={soci} value={form.socio_id} onChange={id => setForm({ ...form, socio_id: id })} />
            )}
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Data</label>
            <input type='date' style={styles.input} value={form.data_incontro} onChange={e => setForm({ ...form, data_incontro: e.target.value })} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Attività</label>
            <ActivitySelect options={activityOptions} value={form.attivita} onChange={onActivityChange} />
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

      <TableScroll>
        <table style={styles.table}>
          <thead>
            <tr>
              {([
                ['socioNome', 'Socio'], ['data_incontro', 'Data'], ['attivita', 'Attività'], ['costo', 'Costo'],
              ] as const).map(([key, label]) => (
                <th key={key} style={styles.thSortable} onClick={() => toggleSort(key)}>
                  {label}{sortIndicator(key)}
                </th>
              ))}
              <th style={styles.th}>Note</th>
              {user?.isAdmin && <th style={styles.th}>Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(i => (
              <tr key={i.id} style={styles.tr}>
                <td style={styles.td}>{i.socioNome}</td>
                <td style={styles.td}>{String(i.data_incontro).split('T')[0]}</td>
                <td style={styles.td}>{i.attivita ?? '—'}</td>
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
      </TableScroll>
      {sorted.length === 0 && !loading && (
        <p style={styles.empty}>{filter || attivitaFilter ? 'Nessun incontro corrisponde ai filtri.' : 'Nessun incontro registrato.'}</p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 32 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  loading: { padding: 48, textAlign: 'center', color: '#666' },
  error: { background: '#fee', color: theme.danger, padding: '10px 16px', borderRadius: 8, marginBottom: 16 },
  btn: { background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8, padding: '8px 20px', minHeight: 40, cursor: 'pointer', fontWeight: 600 },
  btnSecondary: { background: '#e5e7eb', color: '#333', border: 'none', borderRadius: 8, padding: '8px 20px', minHeight: 40, cursor: 'pointer', fontWeight: 600 },
  btnSmall: { background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '8px 14px', minHeight: 40, cursor: 'pointer', fontSize: 13, marginRight: 6 },
  btnDanger: { background: '#fee', color: theme.danger },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, minHeight: 80, boxSizing: 'border-box' },
  readOnlyField: { width: '100%', padding: '8px 12px', borderRadius: 6, background: '#f1f5f9', color: '#555', fontSize: 14, boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  filterInput: { flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  // Contenitore dell'ActivitySelect di filtro: il bordo/padding sono ora del
  // suo input interno, qui resta solo la larghezza nella riga dei filtri.
  filterSelect: { width: 220, minWidth: 220 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  thSortable: {
    padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555',
    borderBottom: '1px solid #e5e7eb', cursor: 'pointer', userSelect: 'none',
  },
  tr: { borderBottom: '1px solid #f1f5f9' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
};
