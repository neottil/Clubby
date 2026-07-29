import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import SocioSelect from '../components/SocioSelect';
import { useTableSort } from '../hooks/useTableSort';
import { useIsMobile } from '../hooks/useIsMobile';
import TableScroll from '../components/TableScroll';
import Modal from '../components/Modal';
import { MarkdownView } from '../components/MarkdownEditor';
import { theme } from '../theme';

interface Voucher {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;
}

interface Movimento {
  id: string;
  voucher_id: string;
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
  note_markdown: boolean;
}

interface Socio { id: string; nome: string; cognome: string; }

// "2026-07-14" -> "14-07-2026"
const formatDateIt = (iso: string) => {
  const [y, m, d] = String(iso).split('T')[0].split('-');
  return `${d}-${m}-${y}`;
};

// Solo l'attività: la colonna si chiama già "Origine" e l'unica origine
// possibile è un incontro, mentre la data del movimento coincide ormai con
// quella dell'incontro (vedi incontri.service.ts) ed è già nella prima
// colonna. Un'etichetta "Incontro-Mantrailing-20-07-2026" andava a capo su tre
// righe dentro il chip su schermo stretto, senza aggiungere nulla.
const incontroLabel = (m: Movimento) => m.incontro_attivita || 'Incontro';

export default function VouchersPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);
  const isMobile = useIsMobile();

  // Su schermo stretto i 16px di padding orizzontale per cella costano 128px
  // sui 375px disponibili — più di un terzo della larghezza spesa in spazio
  // vuoto, che manda la tabella in scroll orizzontale. Non è esprimibile con
  // una media query: questi sono oggetti di stile inline React.
  const cellPad = isMobile
    ? { th: { padding: '10px 8px' }, td: { padding: '10px 8px' } }
    : { th: {}, td: {} };

  const [vouchers, setVouchers]             = useState<Voucher[]>([]);
  const [soci, setSoci]                 = useState<Socio[]>([]);
  const [movimenti, setMovimenti]       = useState<Movimento[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  // Pannello aperto sotto la tabella: movimenti OPPURE ricarica, mai entrambi.
  // Un unico stato invece di due flag indipendenti: l'esclusività è così una
  // proprietà del tipo, non un invariante da mantenere a mano ad ogni handler.
  const [panel, setPanel] = useState<{ voucher: Voucher; mode: 'movimenti' | 'ricarica' } | null>(null);

  // Form nuovo voucher
  const [showVoucherForm, setShowVoucherForm]     = useState(false);
  const [voucherForm, setVoucherForm]             = useState({ socio_id: '', saldo_iniziale: '' });

  // Form nuovo movimento
  const [movForm, setMovForm]                 = useState({ importo: '', descrizione: '' });
  const [saving, setSaving]                   = useState(false);

  // Dettaglio incontro (aperto cliccando il chip "Incontro" su un movimento)
  const [incontroDetail, setIncontroDetail]   = useState<IncontroDetail | null>(null);
  const [loadingIncontro, setLoadingIncontro] = useState(false);

  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([api.getVouchers(), api.getSoci()]);
      setVouchers(b);
      setSoci(s);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openMovimenti = async (voucher: Voucher) => {
    setPanel({ voucher, mode: 'movimenti' });
    try {
      setMovimenti(await api.getMovimenti(voucher.id));
    } catch (e: any) { setError(e.message); }
  };

  const openIncontroDetail = async (incontroId: string) => {
    setLoadingIncontro(true);
    try {
      setIncontroDetail(await api.getIncontro(incontroId));
    } catch (e: any) { setError(e.message); }
    finally { setLoadingIncontro(false); }
  };

  // Non carica i movimenti: il pannello di ricarica non li mostra, quindi la
  // chiamata sarebbe sprecata (vengono caricati quando si apre "Movimenti").
  const openRicarica = (voucher: Voucher) => {
    setMovForm({ importo: '', descrizione: '' });
    setPanel({ voucher, mode: 'ricarica' });
  };

  const socioLabel = (id: string) => {
    const s = soci.find(x => x.id === id);
    return s ? `${s.cognome} ${s.nome}` : id;
  };

  const enrichedVouchers = useMemo(
    () => vouchers.map(b => ({ ...b, socioNome: socioLabel(b.socio_id) })),
    [vouchers, soci]
  );

  const filteredVouchers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return enrichedVouchers;
    return enrichedVouchers.filter(b => b.socioNome.toLowerCase().includes(q));
  }, [enrichedVouchers, filter]);

  const { sorted: sortedVouchers, toggleSort, sortIndicator } = useTableSort(filteredVouchers, {
    initialKey: 'socioNome',
    numericKeys: ['saldo_iniziale', 'saldo_residuo'],
  });

  const saveVoucher = async () => {
    setSaving(true);
    try {
      await api.createVoucher({ ...voucherForm, saldo_iniziale: parseFloat(voucherForm.saldo_iniziale) });
      setShowVoucherForm(false);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const saveMovimento = async () => {
    if (panel?.mode !== 'ricarica') return;
    const voucher = panel.voucher;
    setSaving(true);
    try {
      await api.createMovimento(voucher.id, { ...movForm, importo: parseFloat(movForm.importo) });
      // Aggiorna il saldo nella lista e passa ai movimenti: il pannello resta
      // uno solo, e la ricarica appena inserita è subito visibile.
      const updatedVouchers = await api.getVouchers();
      setVouchers(updatedVouchers);
      await openMovimenti(updatedVouchers.find(b => b.id === voucher.id) ?? voucher);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={{ ...styles.page, ...(isMobile ? { padding: 16 } : {}) }}>
      <div style={styles.header}>
        <h2 style={styles.title}>Voucher prepagati</h2>
        {user?.isAdmin && <button style={styles.btn} onClick={() => { setVoucherForm({ socio_id: '', saldo_iniziale: '' }); setShowVoucherForm(true); }}>+ Nuovo voucher</button>}
      </div>
      {error && <div style={styles.error}>{error}</div>}

      {showVoucherForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>Nuovo voucher</h3>
          <div style={styles.field}>
            <label style={styles.label}>Socio</label>
            <SocioSelect
              soci={soci.filter(s => !vouchers.some(b => b.socio_id === s.id))}
              value={voucherForm.socio_id}
              onChange={id => setVoucherForm({ ...voucherForm, socio_id: id })}
              placeholder='Cerca socio senza voucher...'
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Saldo iniziale (€)</label>
            <input type='number' step='0.01' min='0' style={styles.input} value={voucherForm.saldo_iniziale} onChange={e => setVoucherForm({ ...voucherForm, saldo_iniziale: e.target.value })} />
          </div>
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setShowVoucherForm(false)}>Annulla</button>
            <button style={styles.btn} onClick={saveVoucher} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
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
        {/* Lista vouchers */}
        <div>
          <TableScroll>
            <table style={styles.table}>
              <thead>
                <tr>
                  {([
                    ['socioNome', 'Socio'], ['data_creazione', 'Data'], ['saldo_iniziale', 'Iniziale'],
                    ['saldo_residuo', 'Residuo'],
                  ] as const).map(([key, label]) => (
                    <th key={key} style={{ ...styles.thSortable, ...cellPad.th }} onClick={() => toggleSort(key)}>
                      {label}{sortIndicator(key)}
                    </th>
                  ))}
                  <th style={{ ...styles.th, ...cellPad.th }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {sortedVouchers.map(b => (
                  <tr key={b.id} style={{ ...styles.tr, ...(panel?.voucher.id === b.id ? styles.trSelected : {}) }}>
                    <td style={{ ...styles.td, ...cellPad.td }}>{b.socioNome}</td>
                    <td style={{ ...styles.td, ...cellPad.td }}>{b.data_creazione.split('T')[0]}</td>
                    <td style={{ ...styles.td, ...cellPad.td }}>€ {Number(b.saldo_iniziale).toFixed(2)}</td>
                    <td style={{ ...styles.td, ...cellPad.td, fontWeight: 600, color: Number(b.saldo_residuo) > 0 ? theme.success : theme.danger }}>
                      € {Number(b.saldo_residuo).toFixed(2)}
                    </td>
                    <td style={{ ...styles.td, ...cellPad.td }}>
                      <button style={styles.btnSmall} onClick={() => openMovimenti(b)}>Movimenti</button>
                      {user?.isAdmin && (
                        <button style={styles.btnSmall} onClick={() => openRicarica(b)}>+ Ricarica</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          {sortedVouchers.length === 0 && (
            <p style={styles.empty}>{filter ? 'Nessun voucher corrisponde alla ricerca.' : 'Nessun voucher presente.'}</p>
          )}
        </div>

        {/* Ricarica — pannello a sé: nessuna tabella movimenti sotto */}
        {panel?.mode === 'ricarica' && (
          <div style={styles.movPanel}>
            <div style={styles.movHeader}>
              <h3 style={styles.movTitle}>Ricarica - {socioLabel(panel.voucher.socio_id)}</h3>
            </div>
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
              <button style={styles.btnSecondary} onClick={() => setPanel(null)}>Annulla</button>
              <button style={styles.btn} onClick={saveMovimento} disabled={saving}>{saving ? '...' : 'Salva'}</button>
            </div>
          </div>
        )}

        {/* Dettaglio movimenti — pannello a sé: nessun bottone "+ Ricarica" */}
        {panel?.mode === 'movimenti' && (
          <div style={styles.movPanel}>
            <div style={styles.movHeader}>
              <h3 style={styles.movTitle}>Movimenti - {socioLabel(panel.voucher.socio_id)}</h3>
            </div>

            <TableScroll>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Data', 'Importo', 'Descrizione', 'Origine'].map(h => <th key={h} style={{ ...styles.th, ...cellPad.th }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {movimenti.map(m => (
                    <tr key={m.id} style={styles.tr}>
                      <td style={{ ...styles.td, ...cellPad.td }}>{m.data_movimento.split('T')[0]}</td>
                      <td style={{ ...styles.td, ...cellPad.td, fontWeight: 600, color: m.importo >= 0 ? theme.success : theme.danger }}>
                        {m.importo >= 0 ? '+' : ''}€ {Number(m.importo).toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, ...cellPad.td }}>{m.descrizione ?? '—'}</td>
                      {/* Movimento manuale: nessuna origine da mostrare, cella vuota */}
                      <td style={{ ...styles.td, ...cellPad.td }}>
                        {m.incontro_id && (
                          <button
                            // Su schermo stretto un nome di attività lungo
                            // allargherebbe la colonna (il testo non va a
                            // capo) mandando la tabella in scroll: qui viene
                            // troncato, il nome per esteso resta nella modale
                            // che si apre al tocco.
                            style={{ ...styles.badgeIncontro, ...(isMobile ? { maxWidth: 110 } : {}) }}
                            title={incontroLabel(m)}
                            onClick={() => openIncontroDetail(m.incontro_id!)}
                          >
                            {incontroLabel(m)}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {movimenti.length === 0 && <p style={styles.empty}>Nessun movimento.</p>}
          </div>
        )}
      </div>

      {(loadingIncontro || incontroDetail) && (
        <Modal
          title={loadingIncontro ? undefined : 'Dettaglio incontro'}
          onClose={() => setIncontroDetail(null)}
          footer={<button style={styles.btnSecondary} onClick={() => setIncontroDetail(null)}>Chiudi</button>}
        >
          {loadingIncontro ? (
            <p>Caricamento...</p>
          ) : incontroDetail && (
            <>
              <div style={styles.detailRow}><span style={styles.detailLabel}>Socio</span><span>{socioLabel(incontroDetail.socio_id)}</span></div>
              <div style={styles.detailRow}><span style={styles.detailLabel}>Data</span><span>{formatDateIt(incontroDetail.data_incontro)}</span></div>
              <div style={styles.detailRow}><span style={styles.detailLabel}>Attività</span><span>{incontroDetail.attivita ?? '—'}</span></div>
              <div style={styles.detailRow}><span style={styles.detailLabel}>Costo</span><span>€ {Number(incontroDetail.costo).toFixed(2)}</span></div>
              {/* Una nota Markdown non sta sulla stessa riga dell'etichetta:
                  va impaginata sotto, altrimenti in questa modale si vedrebbe
                  la sintassi grezza schiacciata a destra. */}
              {incontroDetail.note_markdown && incontroDetail.note?.trim() ? (
                <div style={styles.detailBlock}>
                  <span style={styles.detailLabel}>Note</span>
                  <MarkdownView markdown={incontroDetail.note} />
                </div>
              ) : (
                <div style={styles.detailRow}><span style={styles.detailLabel}>Note</span><span>{incontroDetail.note ?? '—'}</span></div>
              )}
            </>
          )}
        </Modal>
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
  formCard: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
  hint: { fontSize: 13, color: '#666', marginTop: 0, marginBottom: 16 },
  badgeIncontro: {
    background: '#eff6ff', color: theme.primary, borderRadius: 999, padding: '6px 12px', fontSize: 12,
    fontWeight: 600, border: '1px solid #bfdbfe', cursor: 'pointer',
    // Una "pillola" ha senso solo su una riga: andando a capo, il raggio 999
    // la deforma. Il testo è ora corto, ma un nome di attività lungo non deve
    // comunque spezzarsi — al massimo allarga la colonna.
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  detailRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  detailBlock: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', fontSize: 14 },
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
