import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import SocioSelect from '../components/SocioSelect';
import { useTableSort } from '../hooks/useTableSort';
import { theme } from '../theme';

interface Buono {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;
  note: string | null;
}

interface Movimento {
  id: string;
  buono_id: string;
  incontro_id: string | null;
  data_movimento: string;
  importo: number;
  descrizione: string | null;
  incontro_attivita?: string | null;
  incontro_data?: string | null;
}

interface IncontroDetail {
  id: string;
  socio_id: string;
  data_incontro: string;
  attivita: string | null;
  costo: number;
  note: string | null;
}

interface Socio { id: string; nome: string; cognome: string; }

// "2026-07-14" -> "14-07-2026"
const formatDateIt = (iso: string) => {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return `${d}-${m}-${y}`;
};

const incontroLabel = (m: Movimento) => {
  const parts = ['Incontro'];
  if (m.incontro_attivita) parts.push(m.incontro_attivita);
  if (m.incontro_data) parts.push(formatDateIt(m.incontro_data));
  return parts.join('-');
};

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

  // Dettaglio incontro (aperto cliccando il chip "Incontro" su un movimento)
  const [incontroDetail, setIncontroDetail]   = useState<IncontroDetail | null>(null);
  const [loadingIncontro, setLoadingIncontro] = useState(false);

  const [filter, setFilter] = useState('');

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

  const openIncontroDetail = async (incontroId: string) => {
    setLoadingIncontro(true);
    try {
      setIncontroDetail(await api.getIncontro(incontroId));
    } catch (e: any) { setError(e.message); }
    finally { setLoadingIncontro(false); }
  };

  const openRicarica = async (b: Buono) => {
    await loadMovimenti(b);
    setMovForm({ importo: '', descrizione: '' });
    setShowMovForm(true);
  };

  const socioLabel = (id: string) => {
    const s = soci.find(x => x.id === id);
    return s ? `${s.cognome} ${s.nome}` : id;
  };

  const enrichedBuoni = useMemo(
    () => buoni.map(b => ({ ...b, socioNome: socioLabel(b.socio_id) })),
    [buoni, soci]
  );

  const filteredBuoni = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return enrichedBuoni;
    return enrichedBuoni.filter(b => b.socioNome.toLowerCase().includes(q));
  }, [enrichedBuoni, filter]);

  const { sorted: sortedBuoni, toggleSort, sortIndicator } = useTableSort(filteredBuoni, {
    initialKey: 'socioNome',
    numericKeys: ['saldo_iniziale', 'saldo_residuo'],
  });

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
        <h2 style={styles.title}>Voucher prepagati</h2>
        {user?.isAdmin && <button style={styles.btn} onClick={() => { setBuonoForm({ socio_id: '', saldo_iniziale: '', note: '' }); setShowBuonoForm(true); }}>+ Nuovo voucher</button>}
      </div>
      {error && <div style={styles.error}>{error}</div>}

      {showBuonoForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>Nuovo voucher</h3>
          <div style={styles.field}>
            <label style={styles.label}>Socio</label>
            <SocioSelect
              soci={soci.filter(s => !buoni.some(b => b.socio_id === s.id))}
              value={buonoForm.socio_id}
              onChange={id => setBuonoForm({ ...buonoForm, socio_id: id })}
              placeholder='Cerca socio senza voucher...'
            />
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

      {user?.isAdmin && (
        <div style={styles.filterRow}>
          <input
            style={styles.filterInput}
            placeholder='Cerca per socio...'
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      )}

      <div style={styles.grid}>
        {/* Lista buoni */}
        <div>
          <table style={styles.table}>
            <thead>
              <tr>
                {([
                  ['socioNome', 'Socio'], ['data_creazione', 'Data'], ['saldo_iniziale', 'Iniziale'],
                  ['saldo_residuo', 'Residuo'],
                ] as const).map(([key, label]) => (
                  <th key={key} style={styles.thSortable} onClick={() => toggleSort(key)}>
                    {label}{sortIndicator(key)}
                  </th>
                ))}
                <th style={styles.th}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {sortedBuoni.map(b => (
                <tr key={b.id} style={{ ...styles.tr, ...(selectedBuono?.id === b.id ? styles.trSelected : {}) }}>
                  <td style={styles.td}>{b.socioNome}</td>
                  <td style={styles.td}>{b.data_creazione.split('T')[0]}</td>
                  <td style={styles.td}>€ {Number(b.saldo_iniziale).toFixed(2)}</td>
                  <td style={{ ...styles.td, fontWeight: 600, color: Number(b.saldo_residuo) > 0 ? theme.success : theme.danger }}>
                    € {Number(b.saldo_residuo).toFixed(2)}
                  </td>
                  <td style={styles.td}>
                    <button style={styles.btnSmall} onClick={() => loadMovimenti(b)}>Movimenti</button>
                    {user?.isAdmin && (
                      <button style={styles.btnSmall} onClick={() => openRicarica(b)}>+ Ricarica</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedBuoni.length === 0 && (
            <p style={styles.empty}>{filter ? 'Nessun voucher corrisponde alla ricerca.' : 'Nessun voucher presente.'}</p>
          )}
        </div>

        {/* Dettaglio movimenti */}
        {selectedBuono && (
          <div style={styles.movPanel}>
            <div style={styles.movHeader}>
              <h3 style={styles.movTitle}>Movimenti - {socioLabel(selectedBuono.socio_id)}</h3>
              {user?.isAdmin && (
                <button style={styles.btn} onClick={() => { setMovForm({ importo: '', descrizione: '' }); setShowMovForm(true); }}>+ Ricarica</button>
              )}
            </div>

            {showMovForm && (
              <div style={styles.formCard}>
                <p style={styles.hint}>
                  Per ricariche o correzioni manuali del saldo. Gli addebiti per gli incontri vengono
                  creati automaticamente e non vanno inseriti qui.
                </p>
                <div style={styles.field}>
                  <label style={styles.label}>Importo (€) - positivo: ricarica, negativo: correzione in addebito</label>
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
                  {['Data', 'Importo', 'Descrizione', 'Origine'].map(h => <th key={h} style={styles.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {movimenti.map(m => (
                  <tr key={m.id} style={styles.tr}>
                    <td style={styles.td}>{m.data_movimento.split('T')[0]}</td>
                    <td style={{ ...styles.td, fontWeight: 600, color: m.importo >= 0 ? theme.success : theme.danger }}>
                      {m.importo >= 0 ? '+' : ''}€ {Number(m.importo).toFixed(2)}
                    </td>
                    <td style={styles.td}>{m.descrizione ?? '—'}</td>
                    <td style={styles.td}>
                      {m.incontro_id
                        ? <button style={styles.badgeIncontro} onClick={() => openIncontroDetail(m.incontro_id!)}>{incontroLabel(m)}</button>
                        : <span style={styles.badgeManuale}>Manuale</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movimenti.length === 0 && <p style={styles.empty}>Nessun movimento.</p>}
          </div>
        )}
      </div>

      {(loadingIncontro || incontroDetail) && (
        <div style={styles.modalOverlay} onClick={() => setIncontroDetail(null)}>
          <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
            {loadingIncontro ? (
              <p>Caricamento...</p>
            ) : incontroDetail && (
              <>
                <h3 style={styles.formTitle}>Dettaglio incontro</h3>
                <div style={styles.detailRow}><span style={styles.detailLabel}>Socio</span><span>{socioLabel(incontroDetail.socio_id)}</span></div>
                <div style={styles.detailRow}><span style={styles.detailLabel}>Data</span><span>{formatDateIt(incontroDetail.data_incontro)}</span></div>
                <div style={styles.detailRow}><span style={styles.detailLabel}>Attività</span><span>{incontroDetail.attivita ?? '—'}</span></div>
                <div style={styles.detailRow}><span style={styles.detailLabel}>Costo</span><span>€ {Number(incontroDetail.costo).toFixed(2)}</span></div>
                <div style={styles.detailRow}><span style={styles.detailLabel}>Note</span><span>{incontroDetail.note ?? '—'}</span></div>
                <div style={styles.formActions}>
                  <button style={styles.btnSecondary} onClick={() => setIncontroDetail(null)}>Chiudi</button>
                </div>
              </>
            )}
          </div>
        </div>
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
  btn: { background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 },
  btnSecondary: { background: '#e5e7eb', color: '#333', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 },
  btnSmall: { background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, marginRight: 6 },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, minHeight: 80, boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
  hint: { fontSize: 13, color: '#666', marginTop: 0, marginBottom: 16 },
  badgeIncontro: {
    background: '#eff6ff', color: theme.primary, borderRadius: 999, padding: '2px 10px', fontSize: 12,
    fontWeight: 600, border: '1px solid #bfdbfe', cursor: 'pointer',
  },
  badgeManuale: { background: '#f1f5f9', color: '#666', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600 },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modalCard: { background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  detailRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  detailLabel: { color: '#666', fontWeight: 500 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  filterInput: { flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  filterSelect: { padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, background: '#fff' },
  grid: { display: 'flex', flexDirection: 'column', gap: 32 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  th: { padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555', borderBottom: '1px solid #e5e7eb' },
  thSortable: {
    padding: '12px 16px', textAlign: 'left', background: '#f1f5f9', fontSize: 13, fontWeight: 600, color: '#555',
    borderBottom: '1px solid #e5e7eb', cursor: 'pointer', userSelect: 'none',
  },
  tr: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
  trSelected: { background: '#eff6ff' },
  td: { padding: '11px 16px', fontSize: 14, color: '#333' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  movPanel: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  movHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  movTitle: { margin: 0, fontSize: 16, fontWeight: 700 },
};
