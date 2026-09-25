import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient, DIMENSIONE_PAGINA, type UltimaRicarica, type TaglioRicarica } from '../api/client';
import SocioSelect from '../components/SocioSelect';
import { useIsMobile } from '../hooks/useIsMobile';
import { useElencoPaginato } from '../hooks/useElencoPaginato';
import { useOrdinamento } from '../hooks/useOrdinamento';
import { useValoreDifferito } from '../hooks/useValoreDifferito';
import TableScroll from '../components/TableScroll';
import Avviso from '../components/Avviso';
import CaricaAltri from '../components/CaricaAltri';
import IntestazioneOrdinabile from '../components/IntestazioneOrdinabile';
import { euro, dataIso, dataItaliana, oggiIso } from '../utils/formato';
import Modal from '../components/Modal';
import { MarkdownView } from '../components/MarkdownEditor';
import { theme } from '../theme';
import { config } from '../config';
import { ui } from '../styles/ui';

interface Voucher {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;
  /** Nominativo del socio: presente nelle righe dell'elenco paginato. */
  nome?: string;
  cognome?: string;
}

interface Movimento {
  id: string;
  voucher_id: string;
  incontro_id: string | null;
  tipo: 'ricarica' | 'addebito';
  data_movimento: string;
  /** Valore sul voucher: è questo che muove il saldo. */
  importo: number;
  /**
   * Quanto è stato pagato, se meno del valore accreditato (ricariche con
   * extra). null quando le due cose coincidono.
   */
  importo_pagato: number | null;
  descrizione: string | null;
}

interface IncontroDetail {
  id: string;
  socio_id: string;
  data_incontro: string;
  attivita: string;
  costo: number;
  note: string | null;
  note_markdown: boolean;
}

interface Socio { id: string; nome: string; cognome: string; }


// Lente d'ingrandimento: la colonna non mostra più un testo ma l'azione che
// apre il dettaglio dell'incontro. L'attività, unico dato che il vecchio chip
// riportava, è ormai già scritta nella descrizione del movimento
// ("Incontro: {attivita}", vedi incontri.service.ts) e ripeterla accanto
// costava larghezza — critica su schermo stretto — senza aggiungere nulla.
// SVG inline e non un file: è l'unica icona del progetto, e "currentColor" le
// fa seguire il colore del bottone senza altra configurazione.
const IconLente = () => (
  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor'
       strokeWidth='2' strokeLinecap='round' aria-hidden='true'>
    <circle cx='11' cy='11' r='7' />
    <line x1='16.5' y1='16.5' x2='21' y2='21' />
  </svg>
);


const ETICHETTA_TIPO: Record<Movimento['tipo'], string> = {
  ricarica: 'Ricarica',
  addebito: 'Addebito',
};

const formVoucherVuoto = { socio_id: '', importaSaldo: false, saldo_iniziale: '' };

export default function VouchersPage() {
  const { token, user } = useAuth();
  const api = createApiClient(token);
  const isMobile = useIsMobile();
  // Le spiegazioni sulle ricariche rimandano alla pagina Fatturazione: senza
  // quel modulo la pagina non esiste, e citarla confonderebbe.
  const inFatturazione = config.moduli.fatturazione;

  // Su schermo stretto i 16px di padding orizzontale per cella costano 128px
  // sui 375px disponibili — più di un terzo della larghezza spesa in spazio
  // vuoto, che manda la tabella in scroll orizzontale. Non è esprimibile con
  // una media query: questi sono oggetti di stile inline React.
  const cellPad = isMobile
    ? { th: { padding: '10px 8px' }, td: { padding: '10px 8px' } }
    : { th: {}, td: {} };

  // Tutti i soci: solo per l'admin, che ne sceglie uno creando un voucher.
  const [soci, setSoci]                 = useState<Socio[]>([]);
  // Soci che hanno già un voucher: esclusi dalla scelta del nuovo. Letti
  // all'apertura del form, non con la pagina: servono solo lì.
  const [sociConVoucher, setSociConVoucher] = useState<Set<string>>(new Set());
  const [movimenti, setMovimenti]       = useState<Movimento[]>([]);
  // Totale dei movimenti del voucher aperto, non quanti ne sono caricati: un
  // socio ne accumula uno per incontro, quindi il pannello ne mostra un blocco
  // per volta e questo dice se ce ne sono altri.
  const [movimentiTotal, setMovimentiTotal] = useState(0);
  const [loadingMovimenti, setLoadingMovimenti] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  // Pannello aperto sotto la tabella: movimenti OPPURE ricarica, mai entrambi.
  // Un unico stato invece di due flag indipendenti: l'esclusività è così una
  // proprietà del tipo, non un invariante da mantenere a mano ad ogni handler.
  const [panel, setPanel] = useState<{ voucher: Voucher; mode: 'movimenti' | 'ricarica' } | null>(null);

  // Form nuovo voucher
  const [showVoucherForm, setShowVoucherForm]     = useState(false);
  const [voucherForm, setVoucherForm]             = useState(formVoucherVuoto);

  // Ricarica: solo l'importo. Gli addebiti nascono dagli incontri e non si
  // inseriscono a mano (il backend li rifiuta).
  const [importoRicarica, setImportoRicarica] = useState('');
  // Proposta a oggi, modificabile per registrare una ricarica pagata in un
  // altro giorno: è la data con cui compare in movimenti e Fatturazione.
  const [dataRicarica, setDataRicarica] = useState(oggiIso());
  // Configurazione delle ricariche, letta solo dove serve alla modalità attiva
  // (entrambe le API sono riservate all'admin, l'unico che registra ricariche).
  const [tagli, setTagli] = useState<TaglioRicarica[]>([]);
  const [percentuale, setPercentuale] = useState(0);
  const [saving, setSaving]                   = useState(false);

  // Dettaglio incontro (aperto cliccando il chip "Incontro" su un movimento)
  const [incontroDetail, setIncontroDetail]   = useState<IncontroDetail | null>(null);
  const [loadingIncontro, setLoadingIncontro] = useState(false);

  const [filter, setFilter] = useState('');

  // Scheda socio di chi guarda: individua il proprio voucher, mostrato nella
  // card in cima. Per l'istruttore conta anche per i permessi: riceve i saldi
  // di tutti, ma i movimenti solo del proprio voucher.
  const [mioSocioId, setMioSocioId] = useState<string | null>(null);
  // Il proprio voucher, mostrato nella card (null se non ce l'ha).
  const [mioVoucher, setMioVoucher] = useState<Voucher | null>(null);

  // Ultima ricarica del proprio voucher: chiesta a parte, con una query che
  // legge solo quella riga. Non arriva con l'elenco dei voucher perché
  // servirebbe a questa sola scheda, e lì andrebbe calcolata per ogni riga.
  const [ultimaRicarica, setUltimaRicarica] = useState<UltimaRicarica | null>(null);

  const caricaMioVoucher = async (socioId: string | null) => {
    const voucher = socioId ? (await api.getVouchers(socioId))[0] ?? null : null;
    setMioVoucher(voucher);
    setUltimaRicarica(voucher ? (await api.getUltimaRicarica(voucher.id)) ?? null : null);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [mio, s] = await Promise.all([
        // 204 = nessuna scheda collegata: arriva come undefined.
        api.getStatoSocio(),
        user?.isAdmin ? api.getSoci() : Promise.resolve([]),
      ]);
      const socioId = mio?.id ?? null;
      setMioSocioId(socioId);
      setSoci(s);
      await caricaMioVoucher(socioId);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // La tabella serve a chi vede i voucher degli altri: admin e istruttore. Un
  // socio riceve solo il proprio, già nella card.
  const mostraTabella = !!user?.isAdmin || !!user?.isIstruttore;

  // Voucher degli altri soci, a pagine: ricerca e ordinamento li applica il
  // backend, che esclude anche il proprio (è nella card). Parte solo dopo aver
  // saputo quale sia il proprio, per non mostrarlo per un attimo in tabella.
  const filtroCercato = useValoreDifferito(filter);
  const { sortKey, sortDir, toggleSort, direzione } = useOrdinamento('socioNome');
  const elenco = useElencoPaginato<Voucher>(
    offset => api.getVouchersPagina({
      q: filtroCercato || undefined, sort: sortKey, dir: sortDir,
      escludi_socio_id: mioSocioId ?? undefined,
      limit: DIMENSIONE_PAGINA, offset,
    }),
    [filtroCercato, sortKey, sortDir, mioSocioId],
    setError,
    mostraTabella && !loading,
  );

  /** Ricarica card e tabella, dopo una modifica ai saldi. */
  const aggiornaSaldi = async () => {
    await caricaMioVoucher(mioSocioId);
    if (mostraTabella) elenco.ricarica();
  };

  const openMovimenti = async (voucher: Voucher) => {
    setPanel({ voucher, mode: 'movimenti' });
    // Riparte sempre dal primo blocco: il pannello può essere già stato aperto
    // su un altro voucher, e i suoi movimenti non c'entrano con questo.
    setMovimenti([]);
    setMovimentiTotal(0);
    try {
      const m = await api.getMovimenti(voucher.id, { limit: DIMENSIONE_PAGINA, offset: 0 });
      setMovimenti(m.data);
      setMovimentiTotal(m.total);
    } catch (e: any) { setError(e.message); }
  };

  // Il bottone "Movimenti" apre e chiude: ripremuto sullo stesso voucher
  // chiude il pannello invece di ricaricarlo.
  const movimentiAperti = (voucher: Voucher) =>
    panel?.mode === 'movimenti' && panel.voucher.id === voucher.id;
  const toggleMovimenti = (voucher: Voucher) => {
    if (movimentiAperti(voucher)) setPanel(null);
    else openMovimenti(voucher);
  };

  const caricaAltriMovimenti = async () => {
    if (panel?.mode !== 'movimenti') return;
    setLoadingMovimenti(true);
    try {
      const m = await api.getMovimenti(panel.voucher.id, {
        limit: DIMENSIONE_PAGINA,
        offset: movimenti.length,
      });
      setMovimenti(prev => [...prev, ...m.data]);
      setMovimentiTotal(m.total);
    } catch (e: any) { setError(e.message); }
    finally { setLoadingMovimenti(false); }
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
    setImportoRicarica('');
    setDataRicarica(oggiIso());
    setPanel({ voucher, mode: 'ricarica' });
  };

  // Tagli e percentuale: caricati una volta sola all'apertura della pagina, e
  // solo nella modalità che li usa. Un errore qui non blocca la pagina — la
  // ricarica resta possibile, è il backend a validarla comunque.
  useEffect(() => {
    if (!user?.isAdmin) return;
    if (config.modalitaRicarica === 'map') {
      api.getTagliRicarica().then(setTagli).catch(() => setTagli([]));
    }
    if (config.modalitaRicarica === 'percentage') {
      api.getImpostazioni()
        .then(imp => setPercentuale(Number(imp.percentuale_ricarica)))
        .catch(() => setPercentuale(0));
    }
  }, [user?.isAdmin]);

  /** Nominativo del socio di un voucher: dalla riga se c'è, altrimenti dall'elenco soci. */
  const socioLabel = (voucher: Voucher) => {
    if (voucher.cognome || voucher.nome) return `${voucher.cognome ?? ''} ${voucher.nome ?? ''}`.trim();
    const s = soci.find(x => x.id === voucher.socio_id);
    return s ? `${s.cognome} ${s.nome}` : '';
  };

  // Il proprio voucher sta in una card a sé, sopra la tabella, per chiunque
  // abbia una scheda socio collegata — admin compresi, che sono anche soci.
  // Per istruttori e soci è inoltre l'unico di cui si possono aprire i
  // movimenti. La card compare a tutti tranne all'admin senza scheda socio:
  // per lui "Non hai un voucher" non direbbe nulla, non essendo un socio.
  const mostraCard = !user?.isAdmin || !!mioSocioId;

  const apriNuovoVoucher = async () => {
    setVoucherForm(formVoucherVuoto);
    setShowVoucherForm(true);
    try {
      const tutti = await api.getVouchers();
      setSociConVoucher(new Set(tutti.map(v => v.socio_id)));
    } catch (e: any) { setError(e.message); }
  };

  const saveVoucher = async () => {
    setSaving(true);
    try {
      const saldoImportato = parseFloat(voucherForm.saldo_iniziale);
      const importato = voucherForm.importaSaldo && saldoImportato > 0;
      // Il voucher nasce senza credito acquistato: quello si registra con una
      // ricarica, l'unica voce che finisce in Fatturazione. Il saldo importato
      // parte solo se l'admin ha scelto esplicitamente di importarlo.
      const nuovo = await api.createVoucher({
        socio_id: voucherForm.socio_id,
        saldo_iniziale: importato ? saldoImportato : 0,
      });
      setShowVoucherForm(false);
      await aggiornaSaldi();
      // Voucher nuovo: il passo successivo è registrare il credito acquistato,
      // quindi si apre subito la ricarica. Con un saldo importato il voucher
      // è già pronto all'uso e non serve.
      if (!importato) openRicarica(nuovo);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const ricaricaValida = parseFloat(importoRicarica) > 0 && !!dataRicarica;

  /**
   * Quanto finirà sul voucher, mostrato sotto il campo prima di salvare.
   * È solo un'anteprima: il valore vero lo ricalcola il backend dalla stessa
   * configurazione, e non viene mai inviato da qui.
   * null quando non c'è niente da anticipare (modalità free, importo vuoto, o
   * percentuale non configurata).
   */
  const valoreAccreditato = (() => {
    const pagato = parseFloat(importoRicarica);
    if (config.modalitaRicarica !== 'percentage' || !(pagato > 0) || !(percentuale > 0)) return null;
    return Math.round(pagato * (1 + percentuale / 100) * 100) / 100;
  })();

  const saveRicarica = async () => {
    if (panel?.mode !== 'ricarica' || !ricaricaValida) return;
    const voucher = panel.voucher;
    setSaving(true);
    try {
      // Descrizione fissa: identifica la voce nell'elenco movimenti e in
      // Fatturazione.
      await api.createMovimento(voucher.id, {
        tipo: 'ricarica',
        importo: parseFloat(importoRicarica),
        data_movimento: dataRicarica,
        descrizione: 'Ricarica voucher',
      });
      // Aggiorna i saldi e passa ai movimenti: il pannello resta uno solo, e
      // la ricarica appena inserita è subito visibile.
      const [aggiornato] = await api.getVouchers(voucher.socio_id);
      await aggiornaSaldi();
      await openMovimenti({ ...voucher, ...aggiornato });
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={styles.loading}>Caricamento...</div>;

  // I pannelli (movimenti, ricarica) compaiono vicino a ciò da cui si aprono:
  // sotto la card se riguardano il proprio voucher, sotto la tabella se
  // riguardano quello di un altro socio.
  const pannelloSulMio = !!mioVoucher && panel?.voucher.id === mioVoucher.id;
  // Sul proprio voucher il pannello non è una card a sé ma una sezione della
  // card "Il tuo voucher", che si allunga per contenerlo. Il nome del socio
  // nel titolo lì sarebbe superfluo: è la propria card.
  const stilePannello = pannelloSulMio ? styles.sezioneInCard : styles.movPanel;
  const titoloPannello = (azione: string, voucher: Voucher) =>
    pannelloSulMio ? azione : `${azione} - ${socioLabel(voucher)}`;

  // Ricarica — pannello a sé: nessuna tabella movimenti sotto.
  const pannelloRicarica = panel?.mode === 'ricarica' && (
    <div style={stilePannello}>
      <div style={styles.movHeader}>
        <h3 style={styles.movTitle}>{titoloPannello('Ricarica', panel.voucher)}</h3>
      </div>
      <p style={styles.hint}>
        Credito acquistato dal socio: aumenta il saldo{inFatturazione && ' e compare in Fatturazione'}. Gli addebiti
        nascono dagli incontri registrati e non si inseriscono qui.
        {config.modalitaRicarica !== 'free' && inFatturazione &&
          ' In Fatturazione compare l\'importo pagato, non il valore accreditato.'}
      </p>
      <div style={styles.field}>
        <label style={styles.label} htmlFor='data-ricarica'>Data</label>
        <input id='data-ricarica' type='date' style={styles.input} value={dataRicarica} onChange={e => setDataRicarica(e.target.value)} />
      </div>
      {/* In modalità "map" l'importo si sceglie fra i tagli configurati
          dall'admin: un campo libero accetterebbe valori che il backend
          rifiuta comunque, non essendoci un taglio corrispondente. */}
      {config.modalitaRicarica === 'map' ? (
        <div style={styles.field}>
          <label style={styles.label} htmlFor='importo-ricarica'>Ricarica</label>
          <select
            id='importo-ricarica'
            style={styles.input}
            value={importoRicarica}
            onChange={e => setImportoRicarica(e.target.value)}
          >
            <option value=''>Scegli un taglio...</option>
            {tagli.map(t => (
              <option key={t.id} value={String(t.importo)}>
                {euro(t.importo)} → {euro(t.valore)} sul voucher
              </option>
            ))}
          </select>
          {tagli.length === 0 && (
            <p style={styles.hintCampo}>
              Nessun taglio configurato: impostali nel pannello Admin, card Ricariche.
            </p>
          )}
        </div>
      ) : (
        <div style={styles.field}>
          <label style={styles.label} htmlFor='importo-ricarica'>Importo pagato (€)</label>
          <input id='importo-ricarica' type='number' step='0.01' min='0.01' style={styles.input} value={importoRicarica} onChange={e => setImportoRicarica(e.target.value)} />
          {valoreAccreditato !== null && (
            <p style={styles.hintCampo}>
              Sul voucher verranno accreditati <strong>{euro(valoreAccreditato)}</strong>.
            </p>
          )}
        </div>
      )}
      <div style={styles.formActions}>
        <button style={styles.btnSecondary} onClick={() => setPanel(null)}>Annulla</button>
        <button style={styles.btn} onClick={saveRicarica} disabled={saving || !ricaricaValida}>{saving ? '...' : 'Salva'}</button>
      </div>
    </div>
  );

  // Dettaglio movimenti — pannello a sé: nessun bottone "Ricarica".
  const pannelloMovimenti = panel?.mode === 'movimenti' && (
    <div style={stilePannello}>
      <div style={styles.movHeader}>
        <h3 style={styles.movTitle}>{titoloPannello('Movimenti', panel.voucher)}</h3>
      </div>

      <TableScroll>
        <table style={styles.table}>
          <thead>
            <tr>
              {['Data', 'Tipo', 'Importo', 'Descrizione', 'Dettagli'].map(h => <th key={h} style={{ ...styles.th, ...cellPad.th }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {movimenti.map(m => (
              <tr key={m.id} style={styles.tr}>
                <td style={{ ...styles.td, ...cellPad.td }}>{dataIso(m.data_movimento)}</td>
                <td style={{ ...styles.td, ...cellPad.td }}>{ETICHETTA_TIPO[m.tipo] ?? '—'}</td>
                <td style={{ ...styles.td, ...cellPad.td, fontWeight: 600, color: m.importo >= 0 ? theme.success : theme.danger }}>
                  {m.importo >= 0 ? '+' : ''}{euro(m.importo)}
                  {/* Ricarica con valore extra: la colonna mostra il credito
                      ricevuto, che qui è più di quanto è stato pagato. Senza
                      questa riga il numero non tornerebbe con la Fatturazione. */}
                  {m.importo_pagato != null && (
                    <div style={styles.pagato}>pagati {euro(m.importo_pagato)}</div>
                  )}
                </td>
                <td style={{ ...styles.td, ...cellPad.td }}>{m.descrizione ?? '—'}</td>
                {/* Movimento manuale: nessun incontro da aprire, cella vuota */}
                <td style={{ ...styles.td, ...cellPad.td }}>
                  {m.incontro_id && (
                    <button
                      style={styles.btnDettaglio}
                      title='Dettaglio incontro'
                      aria-label='Dettaglio incontro'
                      onClick={() => openIncontroDetail(m.incontro_id!)}
                    >
                      <IconLente />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {movimenti.length === 0 && <p style={styles.empty}>Nessun movimento.</p>}
      <CaricaAltri caricati={movimenti.length} totale={movimentiTotal} inCaricamento={loadingMovimenti} onCaricaAltri={caricaAltriMovimenti} />
    </div>
  );

  return (
    <div style={{ ...styles.page, ...(isMobile ? { padding: 16 } : {}) }}>
      <div style={styles.header}>
        <h2 style={styles.title}>Voucher prepagati</h2>
        {user?.isAdmin && <button style={styles.btn} onClick={apriNuovoVoucher}>+ Nuovo voucher</button>}
      </div>
      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}

      {showVoucherForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>Nuovo voucher</h3>
          <div style={styles.field}>
            <label style={styles.label}>Socio</label>
            <SocioSelect
              soci={soci.filter(s => !sociConVoucher.has(s.id))}
              value={voucherForm.socio_id}
              onChange={id => setVoucherForm({ ...voucherForm, socio_id: id })}
              placeholder='Cerca socio senza voucher...'
            />
          </div>
          <p style={styles.hintCampo}>
            Il voucher nasce senza credito. L'importo acquistato dal socio si registra subito dopo con una
            ricarica{inFatturazione && ', che compare in Fatturazione'}.
          </p>
          {/* Il saldo importato è dietro una spunta di proposito: serve solo a
              portare in Clubby voucher venduti prima, e un campo sempre
              visibile verrebbe scambiato per l'importo acquistato. */}
          <div style={styles.field}>
            <label style={styles.checkboxLabel}>
              <input
                type='checkbox'
                checked={voucherForm.importaSaldo}
                onChange={e => setVoucherForm({ ...voucherForm, importaSaldo: e.target.checked, saldo_iniziale: '' })}
              />
              Importa il saldo di un voucher già esistente
            </label>
            {voucherForm.importaSaldo && (
              <div style={styles.importaSaldo}>
                <p style={styles.avvisoImport}>
                  Solo per la configurazione iniziale del sistema: porta in Clubby il credito residuo di un
                  voucher venduto prima di usarlo. <strong>Non corrisponde a una ricarica</strong>
                  {inFatturazione && ' e non compare in Fatturazione'}. Per un voucher nuovo lascia la spunta
                  disattivata e registra il credito acquistato con una ricarica.
                </p>
                <label style={styles.label} htmlFor='saldo-importato'>Saldo importato (€)</label>
                <input id='saldo-importato' type='number' step='0.01' min='0' style={styles.input} value={voucherForm.saldo_iniziale} onChange={e => setVoucherForm({ ...voucherForm, saldo_iniziale: e.target.value })} />
              </div>
            )}
          </div>
          <div style={styles.formActions}>
            <button style={styles.btnSecondary} onClick={() => setShowVoucherForm(false)}>Annulla</button>
            <button style={styles.btn} onClick={saveVoucher} disabled={saving || !voucherForm.socio_id}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </div>
      )}

      {/* Il proprio voucher. */}
      {mostraCard && (
        <div style={styles.mioVoucher}>
          <h3 style={styles.movTitle}>Il tuo voucher</h3>
          {mioVoucher ? (
            <div style={styles.mioVoucherCorpo}>
              <div style={styles.mioVoucherDati}>
                <div>
                  <div style={styles.mioVoucherEtichetta}>Saldo residuo</div>
                  <div style={{ ...styles.mioVoucherSaldo, color: Number(mioVoucher.saldo_residuo) > 0 ? theme.success : theme.danger }}>
                    {euro(mioVoucher.saldo_residuo)}
                  </div>
                </div>
                <div>
                  <div style={styles.mioVoucherEtichetta}>Attivo dal</div>
                  <div>{dataIso(mioVoucher.data_creazione)}</div>
                </div>
                <div>
                  <div style={styles.mioVoucherEtichetta}>Ultima ricarica</div>
                  <div>
                    {ultimaRicarica
                      ? `${dataIso(ultimaRicarica.data_movimento)} · ${euro(ultimaRicarica.importo)}`
                      : '---'}
                  </div>
                </div>
              </div>
              <div>
                <button style={styles.btnSmall} onClick={() => toggleMovimenti(mioVoucher)} aria-expanded={movimentiAperti(mioVoucher)}>
                  {movimentiAperti(mioVoucher) ? 'Nascondi movimenti' : 'Movimenti'}
                </button>
                {user?.isAdmin && (
                  <button style={styles.btnSmall} onClick={() => openRicarica(mioVoucher)}>Ricarica</button>
                )}
              </div>
            </div>
          ) : (
            <p style={styles.hint}>Non hai un voucher attivo.</p>
          )}
          {pannelloSulMio && pannelloRicarica}
          {pannelloSulMio && pannelloMovimenti}
        </div>
      )}

      {/* Admin e istruttore vedono i voucher di tutti i soci; un socio solo
          il proprio, già nella card qui sopra. */}
      {mostraTabella && (
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
        {/* Voucher degli altri soci: il proprio è nella card qui sopra */}
        {mostraTabella && <div>
          <TableScroll>
            <table style={{ ...styles.table, opacity: elenco.loading ? 0.55 : 1 }} aria-busy={elenco.loading}>
              <thead>
                <tr>
                  {([
                    ['socioNome', 'Socio'], ['data_creazione', 'Data'], ['saldo_iniziale', 'Iniziale'],
                    ['saldo_residuo', 'Residuo'],
                  ] as const).map(([key, label]) => (
                    <IntestazioneOrdinabile key={key} etichetta={label} direzione={direzione(key)} onOrdina={() => toggleSort(key)} style={cellPad.th} />
                  ))}
                  <th style={{ ...styles.th, ...cellPad.th }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {elenco.righe.map(b => (
                  <tr key={b.id} style={{ ...styles.tr, ...(panel?.voucher.id === b.id ? styles.trSelected : {}) }}>
                    <td style={{ ...styles.td, ...cellPad.td }}>{socioLabel(b)}</td>
                    <td style={{ ...styles.td, ...cellPad.td }}>{dataIso(b.data_creazione)}</td>
                    <td style={{ ...styles.td, ...cellPad.td }}>{euro(b.saldo_iniziale)}</td>
                    <td style={{ ...styles.td, ...cellPad.td, fontWeight: 600, color: Number(b.saldo_residuo) > 0 ? theme.success : theme.danger }}>
                      {euro(b.saldo_residuo)}
                    </td>
                    <td style={{ ...styles.td, ...cellPad.td }}>
                      {/* In tabella, per chi non è admin, ci sono solo voucher
                          altrui: saldi visibili, movimenti no. */}
                      {user?.isAdmin && (
                        <>
                          <button style={styles.btnSmall} onClick={() => toggleMovimenti(b)} aria-expanded={movimentiAperti(b)}>
                            {movimentiAperti(b) ? 'Nascondi movimenti' : 'Movimenti'}
                          </button>
                          <button style={styles.btnSmall} onClick={() => openRicarica(b)}>Ricarica</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          {elenco.righe.length === 0 && !elenco.loading && (
            <p style={styles.empty}>{filter ? 'Nessun voucher corrisponde alla ricerca.' : 'Nessun voucher presente.'}</p>
          )}
          <CaricaAltri caricati={elenco.righe.length} totale={elenco.totale} inCaricamento={elenco.loadingMore} onCaricaAltri={elenco.caricaAltri} />
        </div>}

        {!pannelloSulMio && pannelloRicarica}
        {!pannelloSulMio && pannelloMovimenti}
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
              <div style={styles.detailRow}><span style={styles.detailLabel}>Socio</span><span>{panel ? socioLabel(panel.voucher) : ''}</span></div>
              <div style={styles.detailRow}><span style={styles.detailLabel}>Data</span><span>{dataItaliana(incontroDetail.data_incontro)}</span></div>
              <div style={styles.detailRow}><span style={styles.detailLabel}>Attività</span><span>{incontroDetail.attivita}</span></div>
              <div style={styles.detailRow}><span style={styles.detailLabel}>Costo</span><span>{euro(incontroDetail.costo)}</span></div>
              {/* Una nota non sta sulla stessa riga dell'etichetta: va
                  impaginata sotto, altrimenti si vedrebbe la sintassi Markdown
                  grezza schiacciata a destra, e un testo semplice andrebbe a
                  capo dove capita. Il testo semplice conserva gli a capo
                  (pre-wrap) come nella pagina Incontri: senza, l'HTML li
                  collassa e una nota scritta a elenco diventa un blocco unico. */}
              {incontroDetail.note?.trim() ? (
                <div style={styles.detailBlock}>
                  <span style={styles.detailLabel}>Note</span>
                  {incontroDetail.note_markdown
                    ? <MarkdownView markdown={incontroDetail.note} />
                    : <div style={styles.notaTesto}>{incontroDetail.note}</div>}
                </div>
              ) : (
                <div style={styles.detailRow}><span style={styles.detailLabel}>Note</span><span>—</span></div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  hint: { fontSize: 13, color: '#666', marginTop: 0, marginBottom: 16 },
  hintCampo: { fontSize: 12, color: '#666', margin: '6px 0 0' },
  // Sotto l'importo di una ricarica con extra: peso e colore normali, perché
  // il dato principale della colonna resta il credito ricevuto.
  pagato: { fontSize: 11, color: '#666', fontWeight: 400, marginTop: 2 },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#333', cursor: 'pointer' },
  importaSaldo: { marginTop: 10, paddingLeft: 12, borderLeft: '3px solid #fcd34d' },
  avvisoImport: { fontSize: 13, color: '#78350f', background: '#fffbeb', padding: '8px 12px', borderRadius: 6, margin: '0 0 10px', lineHeight: 1.5 },
  // Bottone a icona: larghezza fissa e indipendente dal contenuto della riga,
  // così la colonna non si allarga mai. 32px di lato è la dimensione minima
  // consigliata per un bersaglio tattile su questa densità di tabella.
  btnDettaglio: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, padding: 0,
    background: '#eff6ff', color: theme.primary, border: '1px solid #bfdbfe',
    borderRadius: 6, cursor: 'pointer',
  },
  detailRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
  detailBlock: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', fontSize: 14 },
  // Come in ElencoIncontri: gli a capo scritti nella nota vanno conservati.
  notaTesto: { whiteSpace: 'pre-wrap', fontSize: 14, color: '#333', lineHeight: 1.5 },
  detailLabel: { color: '#666', fontWeight: 500 },
  filterRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  filterSelect: { padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, background: '#fff' },
  grid: { display: 'flex', flexDirection: 'column', gap: 32 },
  tr: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
  trSelected: { background: '#eff6ff' },
  movPanel: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
  movHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  movTitle: { margin: 0, fontSize: 16, fontWeight: 700 },
  mioVoucher: {
    background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 12,
    // Bordo sempre visibile: distingue la card del proprio voucher dal resto
    // della pagina, a pannello aperto o chiuso.
    border: '2px solid #bfdbfe',
  },
  // Movimenti e ricarica del proprio voucher, dentro la sua card.
  sezioneInCard: { borderTop: '1px solid #e5e7eb', paddingTop: 16 },
  mioVoucherCorpo: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  mioVoucherDati: { display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 14 },
  mioVoucherEtichetta: { fontSize: 12, color: '#666', marginBottom: 4 },
  mioVoucherSaldo: { fontSize: 24, fontWeight: 700 },
};
