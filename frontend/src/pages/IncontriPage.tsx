import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient } from '../api/client';
import { config, istruttoriAbilitati } from '../config';
import SocioSelect from '../components/SocioSelect';
import ActivitySelect from '../components/ActivitySelect';
import DateRangeFilter from '../components/DateRangeFilter';
import TableScroll from '../components/TableScroll';
import Modal from '../components/Modal';
import { MarkdownEditor, MarkdownView } from '../components/MarkdownEditor';
import { theme } from '../theme';

interface Incontro {
  id: string;
  socio_id: string;
  data_incontro: string;
  attivita: string;
  // null per gli incontri registrati prima dell'introduzione del campo, o
  // quando il tenant non configura VITE_SELECT_ISTRUTTORI_VALUES (un solo
  // istruttore: il campo non viene mostrato affatto).
  istruttore: string | null;
  costo: number;
  note: string | null;
  // Formato di "note": false = testo semplice, true = Markdown. Deciso in fase
  // di inserimento e salvato a db, così la modale sa come renderizzare senza
  // doverlo dedurre dal contenuto.
  note_markdown: boolean;
  nome?: string;
  cognome?: string;
}

interface Socio { id: string; nome: string; cognome: string; }
interface Voucher { id: string; socio_id: string; saldo_residuo: number; }

const emptyForm = { socio_id: '', data_incontro: '', attivita: '', istruttore: '', costo: '', note: '', note_markdown: false };
const activityOptions = Object.keys(config.activityCostMapping);

// Righe caricate a ogni "Carica altri". Allineato al default del backend
// (incontri.service.ts): non è un vincolo, ma tenere lo stesso valore evita
// pagine di dimensione diversa a seconda di chi decide.
const PAGE_SIZE = 25;

// Righe della tabella arricchite col nome del socio: è la forma su cui lavorano
// ordinamento e ricerca, non l'Incontro grezzo dell'API.
type IncontroRiga = Incontro & { socioNome: string };

// La colonna Istruttore c'è solo dove gli istruttori sono configurati (vedi il
// campo nel form): è visibile sia ad admin che a viewer.
const colonneOrdinabili: [keyof IncontroRiga, string][] = [
  ['socioNome', 'Socio'],
  ['data_incontro', 'Data'],
  ['attivita', 'Attività'],
  ...(istruttoriAbilitati ? [['istruttore', 'Istruttore'] as [keyof IncontroRiga, string]] : []),
  ['costo', 'Costo'],
];

export default function IncontriPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);

  const [incontri, setIncontri] = useState<Incontro[]>([]);
  // Quanti incontri soddisfano i filtri in tutto, non quanti ne sono caricati:
  // è ciò che dice se c'è ancora qualcosa da caricare.
  const [total, setTotal]       = useState(0);
  const [soci, setSoci]         = useState<Socio[]>([]);
  const [vouchers, setVouchers]     = useState<Voucher[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]           = useState('');
  const [attivitaFilter, setAttivitaFilter] = useState('');
  const [dataDa, setDataDa]           = useState('');
  const [dataA, setDataA]             = useState('');
  // Ordinamento: applicato dal database, non sull'array già caricato — con i
  // dati a pagine, riordinare in locale ordinerebbe solo la parte visibile.
  // Default: data decrescente, cioè gli incontri più recenti per primi.
  const [sortKey, setSortKey]   = useState<string>('data_incontro');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  // Incontro di cui è aperta la modale di lettura della nota.
  const [notaAperta, setNotaAperta]   = useState<Incontro | null>(null);

  // Testo di ricerca "calmato": senza, ogni tasto premuto farebbe una chiamata
  // al backend. Si aspetta una breve pausa nella digitazione.
  const [filtroCercato, setFiltroCercato] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setFiltroCercato(filter), 300);
    return () => clearTimeout(t);
  }, [filter]);

  // Identifica la richiesta di elenco più recente: le risposte possono
  // arrivare fuori ordine (cambio filtro rapido), e senza questo confronto una
  // risposta vecchia potrebbe sovrascrivere quella nuova.
  const richiestaCorrente = useRef(0);

  const queryFiltri = () => ({
    q: filtroCercato || undefined,
    attivita: attivitaFilter || undefined,
    da: dataDa || undefined,
    a: dataA || undefined,
    sort: sortKey,
    dir: sortDir,
    limit: PAGE_SIZE,
  });

  /** Ricarica dall'inizio: primo chunk, sostituendo quanto già caricato. */
  const load = async () => {
    const richiesta = ++richiestaCorrente.current;
    setLoading(true);
    try {
      const [i, s, b] = await Promise.all([
        api.getIncontri({ ...queryFiltri(), offset: 0 }),
        api.getSoci(),
        api.getVouchers(),
      ]);
      if (richiesta !== richiestaCorrente.current) return;
      setIncontri(i.data);
      setTotal(i.total);
      setSoci(s);
      setVouchers(b);
    } catch (e: any) {
      if (richiesta === richiestaCorrente.current) setError(e.message);
    } finally {
      if (richiesta === richiestaCorrente.current) setLoading(false);
    }
  };

  /** Aggiunge il chunk successivo in coda a quelli già mostrati. */
  const caricaAltri = async () => {
    const richiesta = richiestaCorrente.current;
    setLoadingMore(true);
    try {
      const i = await api.getIncontri({ ...queryFiltri(), offset: incontri.length });
      // Un cambio di filtro mentre il chunk era in volo ha già rimpiazzato la
      // lista: accodare queste righe le mescolerebbe a un filtro diverso.
      if (richiesta !== richiestaCorrente.current) return;
      setIncontri(prev => [...prev, ...i.data]);
      setTotal(i.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Ogni cambio di filtro o di ordinamento riparte dalla prima pagina: le
  // righe già caricate rispondevano a criteri diversi.
  useEffect(() => { load(); }, [filtroCercato, attivitaFilter, dataDa, dataA, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIndicator = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const socioLabel = (id: string) => {
    const s = soci.find(x => x.id === id);
    return s ? `${s.cognome} ${s.nome}` : id;
  };

  // In creazione l'istruttore è preselezionato sul primo della lista
  // configurata (il caso più frequente: chi inserisce è chi ha tenuto
  // l'incontro). In modifica si mostra invece il valore salvato, vuoto
  // compreso: precompilare il primo della lista su un incontro storico senza
  // istruttore gli attribuirebbe al salvataggio un nome che nessuno ha scelto.
  const openCreate = () => {
    setForm({
      ...emptyForm,
      data_incontro: new Date().toISOString().split('T')[0],
      istruttore: config.istruttori[0] ?? '',
    });
    setEditId(null);
    setShowForm(true);
  };
  const openEdit   = (i: Incontro) => { setForm({ socio_id: i.socio_id, data_incontro: String(i.data_incontro).split('T')[0], attivita: i.attivita, istruttore: i.istruttore ?? '', costo: String(i.costo), note: i.note ?? '', note_markdown: !!i.note_markdown }); setEditId(i.id); setShowForm(true); };

  // Selezionando un'attività propone il costo di default associato
  // (VITE_ACTIVITY_SELECT_VALUES_MAPPING); resta comunque modificabile a mano.
  const onActivityChange = (attivita: string) => {
    const costoDefault = config.activityCostMapping[attivita];
    setForm({ ...form, attivita, costo: costoDefault !== undefined ? String(costoDefault) : form.costo });
  };

  const save = async () => {
    const costo = parseFloat(form.costo);

    // Se il socio ha un voucher, avvisa (con conferma) quando questo incontro
    // porterebbe il saldo sotto zero — non blocca l'operazione, solo se il
    // saldo è già negativo lo farà il backend.
    const voucherSocio = vouchers.find(v => v.socio_id === form.socio_id);
    if (voucherSocio) {
      const vecchioCosto = editId ? Number(incontri.find(i => i.id === editId)?.costo ?? 0) : 0;
      const nuovoSaldo = Number(voucherSocio.saldo_residuo) + vecchioCosto - costo;
      if (nuovoSaldo < 0) {
        const confermato = confirm(
          `Il socio ha un voucher con saldo residuo di € ${Number(voucherSocio.saldo_residuo).toFixed(2)}.\n` +
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

  // Nome del socio: arriva già con la riga (il backend fa sempre la JOIN con
  // socio), il fallback copre solo il caso di un socio cancellato.
  const enriched = useMemo(() => incontri.map(i => ({
    ...i,
    socioNome: i.cognome && i.nome ? `${i.cognome} ${i.nome}` : socioLabel(i.socio_id),
  })), [incontri, soci]);

  // Attività proposte nel filtro: quelle configurate, non quelle ricavate
  // dalle righe caricate. Con l'elenco a pagine, quelle presenti nei chunk già
  // scaricati sono un sottoinsieme arbitrario — l'elenco cambierebbe man mano
  // che si carica, e mancherebbero attività che esistono più avanti.
  const attivitaFiltrabili = useMemo(() => {
    const presenti = new Set(activityOptions);
    // Un'attività salvata ma non più in configurazione resta filtrabile finché
    // compare fra le righe caricate.
    for (const i of incontri) presenti.add(i.attivita);
    return [...presenti].sort();
  }, [incontri]);

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
            placeholder='Cerca per socio o attività...'
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        )}
        <div style={styles.filterSelect}>
          <ActivitySelect
            options={attivitaFiltrabili}
            value={attivitaFilter}
            onChange={setAttivitaFilter}
            resetLabel='Tutte le attività'
          />
        </div>
        {/* Il filtro per date è disponibile a tutti, viewer compresi: il
            viewer vede solo i propri incontri, ma su un'annata intera la
            lista è comunque lunga da scorrere. */}
        <DateRangeFilter from={dataDa} to={dataA} onFromChange={setDataDa} onToChange={setDataA} />
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
            <label style={styles.label}>Attività *</label>
            <ActivitySelect options={activityOptions} value={form.attivita} onChange={onActivityChange} />
          </div>
          {/* Solo se il tenant ha configurato più istruttori: con un istruttore
              solo il campo non aggiungerebbe informazione, e chiederlo a ogni
              inserimento sarebbe attrito inutile. Select nativa e non
              ActivitySelect: la lista è di pochi nomi, una casella di ricerca
              sarebbe più lenta da usare di un menu a tendina. */}
          {istruttoriAbilitati && (
            <div style={styles.field}>
              <label style={styles.label} htmlFor='istruttore'>Istruttore</label>
              <select
                id='istruttore'
                style={styles.input}
                value={form.istruttore}
                onChange={e => setForm({ ...form, istruttore: e.target.value })}
              >
                {/* Presente solo in modifica di un incontro senza istruttore:
                    in creazione il primo nome è già preselezionato e questa
                    opzione vuota non serve. */}
                {!form.istruttore && <option value=''>—</option>}
                {/* Un incontro salvato può avere un istruttore non più in
                    elenco (lista cambiata dopo il salvataggio): innestato fra
                    le opzioni, altrimenti il campo apparirebbe vuoto in
                    modifica e salvare lo cancellerebbe. */}
                {(form.istruttore && !config.istruttori.includes(form.istruttore)
                  ? [form.istruttore, ...config.istruttori]
                  : config.istruttori
                ).map(nome => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </div>
          )}
          <div style={styles.field}>
            <label style={styles.label}>Costo (€)</label>
            <input type='number' step='0.01' min='0' style={styles.input} value={form.costo} onChange={e => setForm({ ...form, costo: e.target.value })} />
          </div>
          <div style={styles.field}>
            <div style={styles.labelRow}>
              <label style={styles.label}>Note</label>
              <label style={styles.checkboxLabel}>
                <input
                  type='checkbox'
                  checked={form.note_markdown}
                  onChange={e => setForm({ ...form, note_markdown: e.target.checked })}
                />
                Markdown
              </label>
            </div>
            {form.note_markdown ? (
              // key: MDXEditor legge "markdown" solo al montaggio e poi
              // gestisce il testo internamente. Senza una key legata
              // all'incontro aperto, passando da "Modifica A" a "Modifica B"
              // resterebbe visualizzata la nota di A.
              <MarkdownEditor
                key={editId ?? 'nuovo'}
                markdown={form.note}
                onChange={note => setForm(f => ({ ...f, note }))}
              />
            ) : (
              <textarea style={styles.textarea} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            )}
          </div>
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setShowForm(false)}>Annulla</button>
            {/* L'attività è obbligatoria (NOT NULL a db, validata anche dal
                backend): il bottone resta disabilitato finché non è scelta,
                così l'utente lo vede prima di provare a salvare invece di
                ricevere un errore dopo. */}
            <button style={styles.btn} onClick={save} disabled={saving || !form.attivita}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </div>
      )}

      <TableScroll>
        <table style={styles.table}>
          <thead>
            <tr>
              {colonneOrdinabili.map(([key, label]) => (
                <th key={key} style={styles.thSortable} onClick={() => toggleSort(key)}>
                  {label}{sortIndicator(key)}
                </th>
              ))}
              <th style={styles.th}>Note</th>
              {user?.isAdmin && <th style={styles.th}>Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {enriched.map(i => (
              <tr key={i.id} style={styles.tr}>
                <td style={styles.td}>{i.socioNome}</td>
                <td style={styles.td}>{String(i.data_incontro).split('T')[0]}</td>
                <td style={styles.td}>{i.attivita}</td>
                {istruttoriAbilitati && <td style={styles.td}>{i.istruttore ?? '—'}</td>}
                <td style={styles.td}>€ {Number(i.costo).toFixed(2)}</td>
                <td style={styles.td}>
                  {i.note?.trim()
                    ? <button style={styles.btnSmall} onClick={() => setNotaAperta(i)}>Visualizza</button>
                    : '—'}
                </td>
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
      {enriched.length === 0 && !loading && (
        <p style={styles.empty}>{filter || attivitaFilter || dataDa || dataA ? 'Nessun incontro corrisponde ai filtri.' : 'Nessun incontro registrato.'}</p>
      )}

      {/* Caricamento incrementale: la tabella mostra i primi risultati e si
          allunga a richiesta, invece di scaricare l'intero storico all'apertura.
          Il contatore dice sempre a che punto si è del totale filtrato, così
          "Carica altri" non è un pozzo senza fondo. */}
      {enriched.length > 0 && (
        <div style={styles.paginazione}>
          <span style={styles.conteggio}>{enriched.length} di {total}</span>
          {enriched.length < total && (
            <button style={styles.btnSecondary} onClick={caricaAltri} disabled={loadingMore}>
              {loadingMore ? 'Caricamento...' : 'Carica altri'}
            </button>
          )}
        </div>
      )}

      {notaAperta && (
        <Modal
          title={`Note - ${socioLabel(notaAperta.socio_id)} del ${String(notaAperta.data_incontro).split('T')[0]}`}
          width={640}
          onClose={() => setNotaAperta(null)}
          footer={<button style={styles.btnSecondary} onClick={() => setNotaAperta(null)}>Chiudi</button>}
        >
          {notaAperta.note_markdown
            ? <MarkdownView markdown={notaAperta.note ?? ''} />
            // Nota in testo semplice: va resa così com'è, senza interpretare
            // la sintassi Markdown. whiteSpace pre-wrap per non perdere gli
            // a capo, che in HTML collasserebbero.
            : <div style={styles.notaTesto}>{notaAperta.note}</div>}
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
  btnDanger: { background: '#fee', color: theme.danger },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 13, color: '#555', marginBottom: 4, fontWeight: 500 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', cursor: 'pointer', marginBottom: 4 },
  notaTesto: { whiteSpace: 'pre-wrap', fontSize: 14, color: '#333', lineHeight: 1.5 },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, minHeight: 80, boxSizing: 'border-box' },
  readOnlyField: { width: '100%', padding: '8px 12px', borderRadius: 6, background: '#f1f5f9', color: '#555', fontSize: 14, boxSizing: 'border-box' },
  formActions: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  paginazione: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' },
  conteggio: { fontSize: 13, color: '#666' },
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
