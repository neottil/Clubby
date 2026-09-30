/**
 * Elenco incontri: tabella paginata con filtri, form di inserimento e modifica.
 *
 * Condiviso fra la pagina Incontri e la pagina Resoconto, che mostrano la
 * stessa tabella da due punti di vista diversi — gli incontri a cui un account
 * ha partecipato come socio, e quelli che ha tenuto come istruttore. Tenerle in
 * un solo componente garantisce che intestazioni, filtri e comportamento
 * restino identici, invece di divergere a ogni modifica fatta su una sola.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createApiClient, nomeIstruttore, DIMENSIONE_PAGINA, type Attivita, type Istruttore, type Socio, type Voucher, type Incontro } from '../api/client';
import SocioSelect from './SocioSelect';
import ActivitySelect from './ActivitySelect';
import DateRangeFilter, { dataCompleta } from './DateRangeFilter';
import TableScroll from './TableScroll';
import Avviso from './Avviso';
import CaricaAltri from './CaricaAltri';
import TotaliFiltri from './TotaliFiltri';
import IntestazioneOrdinabile from './IntestazioneOrdinabile';
import ApriRicevuta from './ApriRicevuta';
import { config } from '../config';
import { euro, dataIso, oggiIso } from '../utils/formato';
import Modal from './Modal';
import { MarkdownEditor, MarkdownView } from './MarkdownEditor';
import { ui } from '../styles/ui';
import { messaggioErrore } from '../utils/errori';
import { useSelezione } from '../hooks/useSelezione';



interface ElencoIncontriProps {
  /** Omesso: nessuna intestazione né margini di pagina, per incorporare l'elenco in un'altra pagina. */
  titolo?: string;
  /**
   * In quale veste compare chi guarda:
   *   'socio'       gli incontri a cui ha partecipato — sola lettura
   *   'istruttore'  gli incontri che ha tenuto — li crea e li modifica
   *   omesso        tutti gli incontri, per la gestione dell'admin
   */
  ambito?: 'socio' | 'istruttore';
  /**
   * Mostra, a destra nella riga dei filtri, numero e costo complessivo degli
   * incontri che soddisfano i filtri correnti.
   */
  mostraTotali?: boolean;
  /**
   * Filtri fissi, non modificabili dall'utente: il resoconto dell'admin li usa
   * per restringere l'elenco a un istruttore o a un socio. Il backend li
   * rispetta solo per gli admin.
   */
  socioId?: string;
  istruttoreId?: string;
  /** Nessuna creazione né modifica, qualunque sia il ruolo di chi guarda. */
  solaLettura?: boolean;
  /**
   * Mostra lo stato di rendicontazione: lo switch per far comparire anche gli
   * incontri già rendicontati e, per il solo admin, le caselle con cui
   * sceglierli e il pulsante per marcarli.
   *
   * Attivo in Resoconti, non nella pagina Incontri: lì l'elenco è la vista di
   * gestione di tutti gli incontri, e nasconderne una parte in base a un fatto
   * che riguarda il compenso dell'istruttore sarebbe fuori posto.
   */
  rendicontazione?: boolean;
}

const emptyForm = { socio_id: '', data_incontro: '', attivita_id: '', istruttore_id: '', costo: '', note: '', note_markdown: false };


export default function ElencoIncontri({
  titolo, ambito, mostraTotali = false, socioId, istruttoreId, solaLettura = false,
  rendicontazione = false,
}: ElencoIncontriProps) {
  const { token, user } = useAuth();
  const api = createApiClient(token);

  // Chi rendiconta è l'admin: l'istruttore vede lo stato dei propri incontri ma
  // non lo decide, altrimenti stabilirebbe da sé quanto gli spetta.
  const puoRendicontare = rendicontazione && !!user?.isAdmin;
  // Default opposti di proposito: l'admin apre Resoconti per sapere che cosa
  // resta da rendicontare, quindi parte senza i già fatti; l'istruttore apre la
  // stessa pagina per consultare il proprio lavoro, e nascondergli metà dello
  // storico sarebbe incomprensibile.
  const [mostraRendicontati, setMostraRendicontati] = useState(!user?.isAdmin);
  const [rendicontando, setRendicontando] = useState(false);
  const [esitoRendiconto, setEsitoRendiconto] = useState('');

  const [incontri, setIncontri] = useState<Incontro[]>([]);
  // Quanti incontri soddisfano i filtri in tutto, non quanti ne sono caricati:
  // è ciò che dice se c'è ancora qualcosa da caricare.
  const [total, setTotal]       = useState(0);
  // Costo complessivo degli incontri filtrati, calcolato dal database: sommare
  // le righe caricate darebbe un valore più basso finché non si carica tutto.
  const [totaleCosto, setTotaleCosto] = useState(0);
  const [soci, setSoci]         = useState<Socio[]>([]);
  const [vouchers, setVouchers]     = useState<Voucher[]>([]);
  const [attivita, setAttivita]     = useState<Attivita[]>([]);
  const [istruttori, setIstruttori] = useState<Istruttore[]>([]);
  const [loading, setLoading]   = useState(true);
  // Diventa true al primo caricamento riuscito. Da lì in poi un ricaricamento
  // (cambio di filtro) non sostituisce più la pagina con "Caricamento...":
  // smontarla chiudeva il calendario del filtro data e interrompeva la
  // digitazione dell'anno, perché ogni cifra cambia il valore del campo.
  const [caricato, setCaricato] = useState(false);
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
    ambito,
    socio_id: socioId,
    istruttore_id: istruttoreId,
    q: filtroCercato || undefined,
    attivita_id: attivitaFilter || undefined,
    da: dataCompleta(dataDa),
    a: dataCompleta(dataA),
    // Il filtro si accende solo dove la rendicontazione è in gioco: altrove
    // l'elenco deve restare quello di sempre.
    solo_da_rendicontare: (rendicontazione && !mostraRendicontati ? '1' : undefined) as '1' | undefined,
    sort: sortKey,
    dir: sortDir,
    limit: DIMENSIONE_PAGINA,
  });

  /** Ricarica dall'inizio: primo chunk, sostituendo quanto già caricato. */
  const load = async () => {
    const richiesta = ++richiestaCorrente.current;
    setLoading(true);
    // Un errore precedente non deve sopravvivere a un caricamento riuscito:
    // resterebbe una fascia rossa permanente sopra dei dati validi.
    setError('');
    try {
      // Il listino serve completo solo all'admin, che può modificare un
      // incontro registrato su un'attività nel frattempo disattivata: agli
      // altri il backend serve già l'elenco giusto (all'istruttore, le sole
      // attività a cui è abilitato).
      const [i, s, b, at, ist] = await Promise.all([
        api.getIncontri({ ...queryFiltri(), offset: 0 }),
        api.getSoci(),
        api.getVouchers(),
        api.getAttivita(!!user?.isAdmin),
        api.getIstruttori(),
      ]);
      if (richiesta !== richiestaCorrente.current) return;
      setIncontri(i.data);
      setTotal(i.total);
      setTotaleCosto(i.totale_costo ?? 0);
      setSoci(s);
      setVouchers(b);
      setAttivita(at);
      setIstruttori(ist);
      setCaricato(true);
    } catch (e) {
      if (richiesta === richiestaCorrente.current) setError(messaggioErrore(e));
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
      setTotaleCosto(i.totale_costo ?? 0);
    } catch (e) {
      setError(messaggioErrore(e));
    } finally {
      setLoadingMore(false);
    }
  };

  // Ogni cambio di filtro o di ordinamento riparte dalla prima pagina: le
  // righe già caricate rispondevano a criteri diversi.
  useEffect(() => { load(); }, [filtroCercato, attivitaFilter, dataDa, dataA, sortKey, sortDir, socioId, istruttoreId, mostraRendicontati]);

  // Righe che si possono scegliere: quelle già rendicontate hanno la casella
  // spuntata e bloccata, e non devono finire né nel conteggio del pulsante né
  // in ciò che sceglie la casella in testata.
  const selezionabili = useMemo(
    () => incontri.filter(i => !i.rendicontato_il).map(i => i.id),
    [incontri],
  );
  // Al variare di questa chiave la selezione si azzera: sono i filtri, non le
  // righe caricate — "Carica altri" non deve perdere ciò che si era scelto.
  const chiaveSelezione = JSON.stringify([
    filtroCercato, attivitaFilter, dataDa, dataA, socioId, istruttoreId, mostraRendicontati,
  ]);
  const selezione = useSelezione(selezionabili, chiaveSelezione);

  const rendiconta = async () => {
    setRendicontando(true);
    setEsitoRendiconto('');
    try {
      const esito = await api.rendicontaIncontri(selezione.ids);
      // Richiesti e rendicontati differiscono se un altro admin ha marcato le
      // stesse righe nel frattempo: dirlo evita di far credere che siano state
      // aggiornate tutte.
      const gia = esito.richiesti - esito.rendicontati;
      setEsitoRendiconto(
        `${esito.rendicontati} ${esito.rendicontati === 1 ? 'incontro rendicontato' : 'incontri rendicontati'}` +
        (gia > 0 ? ` (${gia} lo ${gia === 1 ? 'era' : 'erano'} già)` : '') + '.'
      );
      selezione.azzera();
      await load();
    } catch (e) {
      setError(messaggioErrore(e));
    } finally {
      setRendicontando(false);
    }
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };
  const direzione = (key: string) => (sortKey === key ? sortDir : null);

  const socioLabel = (id: string) => {
    const s = soci.find(x => x.id === id);
    return s ? `${s.cognome} ${s.nome}` : id;
  };

  /** Nome dell'istruttore da id: a database c'è solo l'identificativo. */
  const istruttoreLabel = (id: string | null) => {
    if (!id) return '—';
    const i = istruttori.find(x => x.id === id);
    // Un istruttore che ha perso il ruolo (o è stato disattivato) non compare
    // più in elenco, ma i suoi incontri restano: meglio dirlo che mostrare un
    // identificativo illeggibile.
    return i ? nomeIstruttore(i) : 'Non più istruttore';
  };

  // Chi può creare e modificare dipende da ruolo E ambito. Gli incontri a cui
  // si è partecipato come socio sono sempre in sola lettura: li registra chi
  // li ha tenuti. Il backend applica comunque le stesse regole; qui si evita
  // solo di mostrare bottoni che porterebbero a un rifiuto.
  const puoCreare = !solaLettura && (
    (ambito === undefined && !!user?.isAdmin) ||
    (ambito === 'istruttore' && !!user?.isIstruttore));
  // Un incontro si chiude per DUE motivi indipendenti, e in entrambi i casi il
  // backend rifiuta modifica ed eliminazione:
  //
  //   rendicontato   il club ha riconosciuto il compenso all'istruttore, e il
  //                  conteggio su cui è stato pagato deve restare ricostruibile
  //   documentato    l'incontro è finito in una ricevuta consegnata al socio,
  //                  che deve continuare a riferire qualcosa di immutato
  //
  // Sono cose diverse: un incontro può essere l'uno senza l'altro. Fino alla
  // spec 004 l'elenco conosceva solo il primo, quindi sugli incontri
  // documentati mostrava pulsanti che il backend poi rifiutava.
  const documentato = (i: Incontro) => !!i.documento_id;
  // Nel Resoconto l'istruttore vede gli incontri che ha TENUTO, di altri soci:
  // il backend non gli manda la ricevuta e la colonna non ha senso. Per l'admin
  // la manda anche lì, ma la colonna resterebbe comunque fuori posto in una
  // vista che parla del compenso dell'istruttore, non degli incassi.
  const mostraRicevute = config.moduli.ricevute && ambito !== 'istruttore';
  const puoModificare = (i: Incontro) =>
    ambito !== 'socio' &&
    !i.rendicontato_il &&
    !documentato(i) &&
    (!!user?.isAdmin || (!!user?.isIstruttore && i.istruttore_id === user.sub));

  // La ricerca per nominativo ha senso solo dove i soci sono tanti: fra gli
  // incontri a cui si è partecipato come socio, o di un socio scelto, il socio
  // è sempre lo stesso.
  const mostraRicerca = ambito !== 'socio' && !socioId;

  // Attività proponibili nel form: le attive, più quella già salvata
  // sull'incontro in modifica (che può essere stata disattivata nel
  // frattempo). Senza l'innesto il campo apparirebbe vuoto e salvare
  // cambierebbe l'attività senza che nessuno l'abbia chiesto.
  const attivitaSelezionabili = useMemo(() => {
    const attive = attivita.filter(a => a.attiva);
    const salvata = attivita.find(a => a.id === form.attivita_id);
    return salvata && !salvata.attiva ? [salvata, ...attive] : attive;
  }, [attivita, form.attivita_id]);

  // In creazione, un istruttore registra per sé: il campo è preimpostato e non
  // viene nemmeno mostrato (il backend lo forza comunque al chiamante).
  const openCreate = () => {
    setForm({
      ...emptyForm,
      data_incontro: oggiIso(),
      istruttore_id: user?.isIstruttore ? user.sub : '',
    });
    setEditId(null);
    setShowForm(true);
  };
  const openEdit   = (i: Incontro) => { setForm({ socio_id: i.socio_id, data_incontro: dataIso(i.data_incontro), attivita_id: i.attivita_id, istruttore_id: i.istruttore_id ?? '', costo: String(i.costo), note: i.note ?? '', note_markdown: !!i.note_markdown }); setEditId(i.id); setShowForm(true); };

  // Selezionando un'attività propone il costo di listino; resta comunque
  // modificabile a mano, perché l'incontro conserva il proprio costo.
  const onActivityChange = (attivitaId: string) => {
    const scelta = attivita.find(a => a.id === attivitaId);
    setForm({ ...form, attivita_id: attivitaId, costo: scelta ? String(scelta.costo_default) : form.costo });
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
          `Il socio ha un voucher con saldo residuo di ${euro(voucherSocio.saldo_residuo)}.\n` +
          `Questo incontro (${euro(costo)}) porterà il saldo a ${euro(nuovoSaldo)} (negativo).\n\n` +
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
    } catch (e) {
      setError(messaggioErrore(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Eliminare questo incontro?')) return;
    try { await api.deleteIncontro(id); load(); }
    catch (e) { setError(messaggioErrore(e)); }
  };

  // Nome del socio: arriva già con la riga (il backend fa sempre la JOIN con
  // socio), il fallback copre solo il caso di un socio cancellato.
  const enriched = useMemo(() => incontri.map(i => ({
    ...i,
    socioNome: i.cognome && i.nome ? `${i.cognome} ${i.nome}` : socioLabel(i.socio_id),
  })), [incontri, soci]);

  // Colonne ordinabili. Istruttore compare solo se ce n'è almeno uno
  // registrato: dove l'associazione ne ha uno solo (o nessuno) sarebbe una
  // colonna sempre uguale a sé stessa.
  const colonneOrdinabili: [string, string][] = [
    ['socioNome', 'Socio'],
    ['data_incontro', 'Data'],
    ['attivita', 'Attività'],
    ...(istruttori.length > 0 ? [['istruttore', 'Istruttore'] as [string, string]] : []),
    ['costo', 'Costo'],
  ];

  const filtriAttivi = !!(filter || attivitaFilter || dataDa || dataA);

  if (loading && !caricato) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={titolo ? styles.page : undefined}>
      {titolo && (
        <div style={styles.header}>
          <h2 style={styles.title}>{titolo}</h2>
          {puoCreare && <button style={styles.btn} onClick={openCreate}>+ Nuovo incontro</button>}
        </div>
      )}
      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}

      <div style={styles.filterRow}>
        {mostraRicerca && (
          <input
            style={styles.filterInput}
            placeholder='Cerca per socio o attività...'
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        )}
        <div style={styles.filterSelect}>
          <ActivitySelect
            options={attivita}
            value={attivitaFilter}
            onChange={setAttivitaFilter}
            resetLabel='Tutte le attività'
          />
        </div>
        <DateRangeFilter from={dataDa} to={dataA} onFromChange={setDataDa} onToChange={setDataA} />

        {/* Totali calcolati dal database sugli stessi filtri della tabella:
            valgono per l'intero risultato, anche per le righe non ancora
            caricate. aria-live perché cambiano a ogni filtro, e un lettore di
            schermo deve poterlo annunciare. */}
        {mostraTotali && (
          <TotaliFiltri numero={total} singolare='incontro' plurale='incontri' importo={totaleCosto} />
        )}
      </div>

      {rendicontazione && (
        <div style={styles.barraRendiconto}>
          <label style={styles.checkboxLabel}>
            <input
              type='checkbox'
              checked={mostraRendicontati}
              onChange={e => setMostraRendicontati(e.target.checked)}
            />
            Mostra anche gli incontri già rendicontati
          </label>

          {puoRendicontare && (
            <button
              style={{ ...styles.btn, ...(selezione.quanti === 0 ? styles.btnSpento : {}) }}
              onClick={rendiconta}
              disabled={selezione.quanti === 0 || rendicontando}
            >
              {rendicontando ? 'Salvataggio...' : `Rendiconta (${selezione.quanti})`}
            </button>
          )}
        </div>
      )}

      {esitoRendiconto && (
        <Avviso tipo='successo' messaggio={esitoRendiconto} onChiudi={() => setEsitoRendiconto('')} />
      )}

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
            <ActivitySelect options={attivitaSelezionabili} value={form.attivita_id} onChange={onActivityChange} />
            {attivitaSelezionabili.length === 0 && (
              <p style={styles.hintCampo}>
                {user?.isIstruttore
                  ? 'Non sei abilitato a nessuna attività: chiedi a un amministratore di assegnartene.'
                  : 'Nessuna attività in listino: creane una dalla pagina Impostazioni.'}
              </p>
            )}
          </div>
          {/* Il campo compare solo per l'admin, e solo se c'è almeno un
              istruttore registrato. Un istruttore registra sempre per sé: il
              backend gli impone comunque il proprio identificativo, quindi
              mostrargli una scelta sarebbe una scelta finta. */}
          {user?.isAdmin && istruttori.length > 0 && (
            <div style={styles.field}>
              <label style={styles.label} htmlFor='istruttore'>Istruttore</label>
              <select
                id='istruttore'
                style={styles.selectPieno}
                value={form.istruttore_id}
                onChange={e => setForm({ ...form, istruttore_id: e.target.value })}
              >
                <option value=''>— Nessuno</option>
                {istruttori.map(i => (
                  <option key={i.id} value={i.id}>{nomeIstruttore(i)}</option>
                ))}
                {/* Un incontro può essere attribuito a chi nel frattempo non è
                    più istruttore: senza questa opzione il campo apparirebbe
                    vuoto e salvare cancellerebbe l'attribuzione. */}
                {form.istruttore_id && !istruttori.some(i => i.id === form.istruttore_id) && (
                  <option value={form.istruttore_id}>Non più istruttore</option>
                )}
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
            <button style={styles.btn} onClick={save} disabled={saving || !form.attivita_id}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          </div>
        </div>
      )}

      <TableScroll>
        {/* Durante un ricaricamento restano visibili le righe precedenti,
            attenuate: dice che il risultato sta cambiando senza far sparire
            la pagina. */}
        <table style={{ ...styles.table, opacity: loading ? 0.55 : 1 }} aria-busy={loading}>
          <thead>
            <tr>
              {puoRendicontare && (
                <th style={{ ...styles.th, ...styles.thScelta }}>
                  {/* `indeterminate` non è un attributo JSX: si imposta solo
                      sull'elemento. È lo stato "alcune sì, altre no", senza il
                      quale la casella direbbe "nessuna selezionata" mentre
                      metà lo sono. */}
                  <input
                    type='checkbox'
                    checked={selezione.tutte}
                    ref={el => { if (el) el.indeterminate = selezione.parziale; }}
                    onChange={selezione.invertiTutti}
                    disabled={selezionabili.length === 0}
                    aria-label='Seleziona tutti gli incontri caricati'
                  />
                </th>
              )}
              {colonneOrdinabili.map(([key, label]) => (
                <IntestazioneOrdinabile key={key} etichetta={label} direzione={direzione(key)} onOrdina={() => toggleSort(key)} />
              ))}
              <th style={styles.th}>Note</th>
              {/* La ricevuta arriva dal backend solo a chi ne è intestatario:
                  la colonna c'è quando almeno una riga potrebbe averla, cioè
                  col modulo attivo e fuori dal Resoconto dell'istruttore. */}
              {mostraRicevute && <th style={styles.th}>Ricevuta</th>}
              {puoCreare && <th style={styles.th}>Azioni</th>}
            </tr>
          </thead>
          <tbody>
            {enriched.map(i => (
              <tr key={i.id} style={styles.tr}>
                {puoRendicontare && (
                  <td style={{ ...styles.td, ...styles.tdScelta }}>
                    {/* Un incontro già rendicontato resta spuntato e bloccato:
                        la rendicontazione non si annulla, quindi togliere la
                        spunta non vorrebbe dire niente. */}
                    <input
                      type='checkbox'
                      checked={!!i.rendicontato_il || selezione.contiene(i.id)}
                      disabled={!!i.rendicontato_il}
                      onChange={() => selezione.inverti(i.id)}
                      title={i.rendicontato_il ? 'Già rendicontato: non si può annullare' : undefined}
                      aria-label={`Seleziona l'incontro di ${i.socioNome} del ${dataIso(i.data_incontro)}`}
                    />
                  </td>
                )}
                <td style={styles.td}>{i.socioNome}</td>
                <td style={styles.td}>{dataIso(i.data_incontro)}</td>
                <td style={styles.td}>{i.attivita}</td>
                {istruttori.length > 0 && <td style={styles.td}>{istruttoreLabel(i.istruttore_id)}</td>}
                <td style={styles.td}>{euro(i.costo)}</td>
                <td style={styles.td}>
                  {i.note?.trim()
                    ? <button style={styles.btnSmall} onClick={() => setNotaAperta(i)}>Visualizza</button>
                    : '—'}
                </td>
                {mostraRicevute && (
                  <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                    <ApriRicevuta
                      api={api}
                      documentoId={i.documento_id ?? null}
                      anno={i.documento_anno ?? null}
                      numero={i.documento_numero ?? null}
                    />
                  </td>
                )}
                {puoCreare && (
                  <td style={styles.td}>
                    {puoModificare(i) ? (
                      <>
                        <button style={styles.btnSmall} onClick={() => openEdit(i)}>Modifica</button>
                        <button style={{ ...styles.btnSmall, ...styles.btnDanger }} onClick={() => remove(i.id)}>Elimina</button>
                      </>
                    ) : documentato(i) ? (
                      // Due stati distinti e non un "Chiuso" unico: dicono due
                      // cose diverse a chi chiede perché non può correggere.
                      <span style={styles.chiuso} title='Compreso in una ricevuta emessa: non più modificabile'>In ricevuta</span>
                    ) : i.rendicontato_il ? (
                      <span style={styles.chiuso} title='Rendicontato: non più modificabile'>Rendicontato</span>
                    ) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {enriched.length === 0 && !loading && !error && (
        <p style={styles.empty}>
          {filtriAttivi
            ? 'Nessun incontro corrisponde ai filtri.'
            : ambito === 'istruttore' && !istruttoreId
              ? 'Non hai ancora tenuto incontri.'
              : 'Nessun incontro registrato.'}
        </p>
      )}

      {/* Caricamento incrementale: la tabella mostra i primi risultati e si
          allunga a richiesta, invece di scaricare l'intero storico all'apertura.
          Il contatore dice sempre a che punto si è del totale filtrato, così
          "Carica altri" non è un pozzo senza fondo. */}
      <CaricaAltri caricati={enriched.length} totale={total} inCaricamento={loadingMore} onCaricaAltri={caricaAltri} />

      {notaAperta && (
        <Modal
          title={`Note - ${socioLabel(notaAperta.socio_id)} del ${dataIso(notaAperta.data_incontro)}`}
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
  ...ui,
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { margin: 0, fontSize: 22, fontWeight: 700 },
  formTitle: { margin: '0 0 16px', fontSize: 16, fontWeight: 700 },
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  hintCampo: { fontSize: 13, color: '#92400e', margin: '6px 0 0' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', cursor: 'pointer', marginBottom: 4 },
  notaTesto: { whiteSpace: 'pre-wrap', fontSize: 14, color: '#333', lineHeight: 1.5 },
  // Riga fra i filtri e la tabella: a sinistra lo switch, a destra l'azione.
  // flexWrap perché su schermo stretto le due cose non ci stanno affiancate.
  barraRendiconto: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, flexWrap: 'wrap', marginBottom: 12,
  },
  // Pulsante senza nulla di selezionato: resta leggibile ma non invita a
  // premerlo, e comunque è disabilitato.
  btnSpento: { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' },
  // Colonna delle caselle: larghezza fissa, così non si allarga al crescere
  // del contenuto delle altre e resta allineata fra intestazione e righe.
  thScelta: { width: 44, textAlign: 'center' },
  tdScelta: { width: 44, textAlign: 'center' },
  // Al posto dei bottoni su una riga chiusa: dice perché non ci sono, invece
  // di lasciare un trattino che sembrerebbe una mancanza di permessi.
  chiuso: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
  readOnlyField: { width: '100%', padding: '8px 12px', borderRadius: 6, background: '#f1f5f9', color: '#555', fontSize: 14, boxSizing: 'border-box' },
  // Contenitore dell'ActivitySelect di filtro: il bordo/padding sono ora del
  // suo input interno, qui resta solo la larghezza nella riga dei filtri.
  filterSelect: { width: 220, minWidth: 220 },
};
