import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { createApiClient, nomeIstruttore, DIMENSIONE_PAGINA, type Attivita, type Istruttore, type TaglioRicarica } from '../api/client';
import { useElencoPaginato, type Pagina } from '../hooks/useElencoPaginato';
import CaricaAltri from '../components/CaricaAltri';
import TableScroll from '../components/TableScroll';
import Avviso from '../components/Avviso';
import { euro } from '../utils/formato';
import SocioSelect from '../components/SocioSelect';
import CardCollassabile from '../components/CardCollassabile';
import Modal from '../components/Modal';
import { theme } from '../theme';
import { config } from '../config';
import { ui } from '../styles/ui';

/** Utente come lo espone l'authorizer attraverso il backend. */
interface UtenteRegistrato {
  id: string;
  email: string;
  /**
   * Nominativo e telefono della scheda socio collegata: null finché l'account
   * non ne ha una. L'authorizer conosce solo email e ruolo.
   */
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  socio_id: string | null;
  ruolo: Ruolo;
  /** Privilegio di amministrare l'app, indipendente dal ruolo nel club. */
  admin: boolean;
  attivo: boolean;
  cambio_password_richiesto: boolean;
}

type Ruolo = 'socio' | 'istruttore';
const RUOLI: Ruolo[] = ['socio', 'istruttore'];
interface Socio { id: string; nome: string; cognome: string; email: string | null; id_viewer: string | null; }

export default function AdminPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const api = createApiClient(token);

  // Tutti i soci: servono al menu della modale "Collega socio".
  const [soci, setSoci]                   = useState<Socio[]>([]);
  const [attivita, setAttivita]           = useState<Attivita[]>([]);
  // Quota di tesseramento, come stringa del campo di input.
  const [quotaTesseramento, setQuotaTesseramento] = useState('');
  // Ricariche: percentuale (modalità percentage) e tagli (modalità map).
  const [percentualeRicarica, setPercentualeRicarica] = useState('');
  const [tagli, setTagli] = useState<TaglioRicarica[]>([]);
  const [nuovoTaglio, setNuovoTaglio] = useState({ importo: '', valore: '' });
  const [istruttori, setIstruttori]       = useState<Istruttore[]>([]);
  // Nuova voce di listino, e riga in modifica (solo una per volta).
  const [nuovaAttivita, setNuovaAttivita] = useState({ nome: '', costo_default: '' });
  const [attivitaInModifica, setAttivitaInModifica] = useState<{ id: string; nome: string; costo_default: string } | null>(null);
  // "Caricamento..." solo al primo caricamento: ricaricare dopo ogni azione
  // smonterebbe le card, richiudendole e perdendo quanto aperto dall'admin.
  const [caricato, setCaricato]           = useState(false);
  const [error, setError]                 = useState('');
  const [successMsg, setSuccessMsg]       = useState('');
  // Password temporanea appena generata: mostrata una sola volta, non è più
  // recuperabile dopo (a database c'è solo il suo hash).
  const [passwordTemporanea, setPasswordTemporanea] = useState<{ email: string; password: string } | null>(null);

  // Collegamento in corso: l'account e il socio scelto nella modale.
  const [collegamento, setCollegamento]   = useState<{ utente: UtenteRegistrato; socio_id: string } | null>(null);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (!user?.isAdmin) { navigate('/soci'); return; }
    load();
  }, [user]);

  // Le tabelle degli account e delle schede libere sono a pagine, come le
  // altre. Non si caricano da sole (abilitato = false): le ricarica load(),
  // che è l'unico punto da cui la pagina si aggiorna dopo ogni azione.
  const elencoUtenti = useElencoPaginato<UtenteRegistrato, Pagina<UtenteRegistrato> & { da_collegare: number }>(
    offset => api.getAdminUsersPagina({ limit: DIMENSIONE_PAGINA, offset }),
    [], setError, false,
  );
  const elencoSociLiberi = useElencoPaginato<Socio>(
    offset => api.getSociPagina({ senza_account: '1', sort: 'cognome', limit: DIMENSIONE_PAGINA, offset }),
    [], setError, false,
  );

  const load = async () => {
    elencoUtenti.ricarica();
    elencoSociLiberi.ricarica();
    try {
      // Il listino completo, disattivate comprese: è la pagina in cui si
      // riattivano.
      const [s, at, ist, imp, tg] = await Promise.all([
        api.getSoci(), api.getAttivita(true), api.getIstruttori(), api.getImpostazioni(),
        api.getTagliRicarica(),
      ]);
      setQuotaTesseramento(Number(imp.quota_tesseramento).toFixed(2));
      setPercentualeRicarica(String(Number(imp.percentuale_ricarica)));
      setTagli(tg);
      setSoci(s);
      setAttivita(at);
      setIstruttori(ist);
      setCaricato(true);
    } catch (e: any) { setError(e.message); }
  };

  /**
   * Nominativo di un account: è quello della sua scheda socio, quindi manca
   * finché l'account non ne ha una.
   */
  const nominativo = (u: UtenteRegistrato) =>
    u.cognome || u.nome ? `${u.cognome ?? ''} ${u.nome ?? ''}`.trim() : null;

  // Schede socio ancora libere, per il menu di "Collega socio": le uniche
  // collegabili a un account. La card con la loro tabella usa invece
  // elencoSociLiberi, a pagine.
  const sociSenzaAccount = useMemo(
    () => soci.filter(s => !s.id_viewer).sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`)),
    [soci]
  );

  // Ordine (da collegare in cima) e conteggio dei da collegare li fa il
  // backend, sull'insieme degli account e non sulla pagina.
  const daCollegare = elencoUtenti.risposta?.da_collegare ?? 0;

  // -------------------------------------------------------------
  // Collegamento account ↔ socio
  // -------------------------------------------------------------
  const apriCollegamento = (u: UtenteRegistrato) => {
    setError('');
    setCollegamento({ utente: u, socio_id: '' });
  };

  const confermaCollegamento = async () => {
    if (!collegamento?.socio_id) return;
    const socio = soci.find(s => s.id === collegamento.socio_id);
    setSaving(true);
    setError('');
    try {
      await api.associaViewer({ socio_id: collegamento.socio_id, utente_id: collegamento.utente.id });
      setSuccessMsg(`${collegamento.utente.email} collegato a ${socio ? `${socio.cognome} ${socio.nome}` : 'socio'}`);
      setCollegamento(null);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  /** Scollega l'account dal socio. Lo stato dell'account non viene toccato. */
  const scollega = async (u: UtenteRegistrato) => {
    if (!u.socio_id) return;
    if (!confirm(
      `Scollegare ${u.email} dalla scheda di ${nominativo(u) ?? 'questo socio'}?\n\n` +
      'La scheda resta con tutti i suoi dati, pronta per un altro account. ' +
      'L\'account resta attivo ma non vedrà più alcun dato finché non lo colleghi a una scheda.'
    )) return;
    setError('');
    try {
      await api.disassociaViewer(u.socio_id);
      setSuccessMsg(`${u.email}: account scollegato`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  /**
   * Disattiva o riattiva un account.
   *
   * Un account disattivato non può più accedere e le sue sessioni vengono
   * chiuse; nulla viene cancellato, e la riattivazione lo rimette com'era.
   * Il collegamento alla scheda socio non viene toccato: se va sciolto, lo
   * decide l'admin con "Scollega".
   */
  const cambiaAttivo = async (u: UtenteRegistrato) => {
    const messaggio = u.attivo
      ? `Disattivare l'account ${u.email}?\n\n` +
        `Non potrà più accedere e le sue sessioni verranno chiuse. ` +
        (u.socio_id ? `Resterà collegato alla scheda di ${nominativo(u)}. ` : '') +
        `Nessun dato viene cancellato.`
      : `Riattivare l'account ${u.email}?\n\nPotrà di nuovo accedere.`;

    if (!confirm(messaggio)) return;
    setError('');
    try {
      await api.cambiaAttivo(u.id, !u.attivo);
      setSuccessMsg(`${u.email}: account ${u.attivo ? 'disattivato' : 'riattivato'}`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const cambiaRuolo = async (u: UtenteRegistrato, ruolo: Ruolo) => {
    if (ruolo === u.ruolo) return;
    // Cambiare ruolo chiude le sessioni aperte dell'interessato: il ruolo sta
    // dentro il token, e finché quello vecchio non scade porterebbe ancora i
    // permessi di prima.
    if (!confirm(`Assegnare a ${u.email} il ruolo "${ruolo}"? Dovrà rifare l'accesso.`)) return;
    setError('');
    try {
      await api.impostaRuolo(u.id, ruolo);
      setSuccessMsg(`${u.email}: ruolo ${ruolo}`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  /**
   * Concede o toglie il privilegio di amministrare l'app. Il proprio non si
   * può togliere: la casella è bloccata sulla propria riga, e l'authorizer lo
   * rifiuta comunque.
   */
  const cambiaAdmin = async (u: UtenteRegistrato, admin: boolean) => {
    const messaggio = admin
      ? `Concedere a ${u.email} il privilegio di amministratore? Dovrà rifare l'accesso.`
      : `Togliere a ${u.email} il privilegio di amministratore? Dovrà rifare l'accesso.`;
    if (!confirm(messaggio)) return;
    setError('');
    try {
      await api.impostaAdmin(u.id, admin);
      setSuccessMsg(`${u.email}: ${admin ? 'ora è amministratore' : 'non è più amministratore'}`);
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

  // -------------------------------------------------------------
  // Tesseramento
  // -------------------------------------------------------------
  const salvaQuota = async () => {
    setError('');
    try {
      const imp = await api.aggiornaImpostazioni({ quota_tesseramento: Number(quotaTesseramento) });
      setQuotaTesseramento(Number(imp.quota_tesseramento).toFixed(2));
      setSuccessMsg('Quota di tesseramento aggiornata');
    } catch (e: any) { setError(e.message); }
  };

  // -------------------------------------------------------------
  // Ricariche
  // -------------------------------------------------------------
  const salvaPercentuale = async () => {
    setError('');
    try {
      const imp = await api.aggiornaImpostazioni({ percentuale_ricarica: Number(percentualeRicarica) });
      setPercentualeRicarica(String(Number(imp.percentuale_ricarica)));
      setSuccessMsg('Percentuale di ricarica aggiornata');
    } catch (e: any) { setError(e.message); }
  };

  const aggiungiTaglio = async () => {
    setError('');
    try {
      await api.creaTaglioRicarica({
        importo: Number(nuovoTaglio.importo),
        valore: Number(nuovoTaglio.valore),
      });
      setNuovoTaglio({ importo: '', valore: '' });
      setTagli(await api.getTagliRicarica());
      setSuccessMsg('Taglio aggiunto');
    } catch (e: any) { setError(e.message); }
  };

  const rimuoviTaglio = async (id: string) => {
    setError('');
    try {
      await api.eliminaTaglioRicarica(id);
      setTagli(await api.getTagliRicarica());
      // Nessun avviso di conferma: i movimenti già registrati non cambiano,
      // perché hanno il proprio valore scritto sulla riga.
      setSuccessMsg('Taglio rimosso');
    } catch (e: any) { setError(e.message); }
  };

  const taglioCompleto = Number(nuovoTaglio.importo) > 0 && Number(nuovoTaglio.valore) > 0;

  // Riassunto della card chiusa: dice a colpo d'occhio se la funzionalità è
  // attiva e come, senza doverla aprire.
  const riepilogoRicariche =
    config.modalitaRicarica === 'percentage' ? `+${percentualeRicarica || 0}% sul credito`
    : config.modalitaRicarica === 'map'      ? `${tagli.length} tagli`
    : 'non attive';

  // -------------------------------------------------------------
  // Listino attività
  // -------------------------------------------------------------
  const creaAttivita = async () => {
    setError('');
    try {
      await api.createAttivita({
        nome: nuovaAttivita.nome,
        costo_default: Number(nuovaAttivita.costo_default) || 0,
      });
      setNuovaAttivita({ nome: '', costo_default: '' });
      setSuccessMsg('Attività creata');
      load();
    } catch (e: any) { setError(e.message); }
  };

  const salvaAttivita = async () => {
    if (!attivitaInModifica) return;
    setError('');
    try {
      await api.updateAttivita(attivitaInModifica.id, {
        nome: attivitaInModifica.nome,
        costo_default: Number(attivitaInModifica.costo_default) || 0,
      });
      setAttivitaInModifica(null);
      setSuccessMsg('Attività aggiornata');
      load();
    } catch (e: any) { setError(e.message); }
  };

  // Disattivare è la via normale per togliere un'attività: sparisce dalle
  // scelte dei nuovi incontri ma resta sullo storico, e si può riattivare.
  const cambiaStatoAttivita = async (a: Attivita) => {
    setError('');
    try {
      await api.updateAttivita(a.id, { attiva: !a.attiva });
      setSuccessMsg(a.attiva ? `"${a.nome}" disattivata` : `"${a.nome}" riattivata`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  // L'eliminazione è definitiva, ed è permessa solo per un'attività mai usata
  // (tipicamente creata per errore): con incontri collegati il backend la
  // rifiuta, così lo storico non perde mai il riferimento.
  const eliminaAttivita = async (a: Attivita) => {
    if (!confirm(
      `Eliminare definitivamente l'attività "${a.nome}"?\n\n` +
      `È possibile solo se non è mai stata usata in un incontro. ` +
      `Se è già stata usata, disattivala: sparirà dalle scelte ma resterà nello storico.`
    )) return;
    setError('');
    try {
      await api.deleteAttivita(a.id);
      setSuccessMsg(`"${a.nome}" eliminata`);
      load();
    } catch (e: any) { setError(e.message); }
  };

  /**
   * Abilita o disabilita un'attività per un istruttore. L'API sostituisce
   * l'insieme completo, quindi si invia lo stato risultante di tutte le
   * caselle, non la singola differenza.
   */
  const toggleAbilitazione = async (istruttore: Istruttore, attivitaId: string) => {
    const attuali = istruttore.attivita_ids ?? [];
    const nuove = attuali.includes(attivitaId)
      ? attuali.filter(id => id !== attivitaId)
      : [...attuali, attivitaId];
    // Aggiornamento ottimistico: la casella deve rispondere subito al click,
    // e un errore fa comunque ricaricare lo stato vero dal server.
    setIstruttori(prev => prev.map(i => (i.id === istruttore.id ? { ...i, attivita_ids: nuove } : i)));
    try {
      await api.setAbilitazioni(istruttore.id, nuove);
    } catch (e: any) {
      setError(e.message);
      load();
    }
  };

  if (!caricato && !error) return <div style={styles.loading}>Caricamento...</div>;

  const attivitaAttive = attivita.filter(a => a.attiva);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Pannello Admin</h2>

      {error      && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}
      {successMsg && <Avviso tipo='successo' messaggio={successMsg} onChiudi={() => setSuccessMsg('')} />}

      {/* Mostrata una sola volta: a database resta solo l'hash, quindi
          ricaricando la pagina questa password non è più recuperabile e
          servirebbe un nuovo azzeramento. In una modale e non in cima alla
          pagina: l'azzeramento si fa dalla card Utenti, più in basso, e un
          riquadro fuori dallo schermo passava inosservato. Si chiude solo dal
          bottone, non con Esc o cliccando fuori: chiuderla per sbaglio
          significherebbe perdere la password. */}
      {passwordTemporanea && (
        <Modal
          title='Password temporanea'
          width={420}
          onClose={() => {}}
          footer={<button style={styles.btn} onClick={() => setPasswordTemporanea(null)}>Ho preso nota</button>}
        >
          <p style={styles.passwordNota}>Per <strong>{passwordTemporanea.email}</strong>:</p>
          <code style={styles.passwordValore}>{passwordTemporanea.password}</code>
          <p style={styles.passwordNota}>
            Consegnala all'interessato: le verrà chiesto di sostituirla al primo accesso.
            Non sarà più visibile dopo aver chiuso questa finestra.
          </p>
        </Modal>
      )}

      {/* Ricariche — sempre visibile, anche dove la modalità è "free": la
          configurazione si prepara prima di attivarla, e una card che compare
          dal nulla dopo un cambio di variabile sarebbe più difficile da
          trovare che una che spiega come accenderla. */}
      <CardCollassabile titolo='Ricariche' riepilogo={riepilogoRicariche}>
        {config.modalitaRicarica === 'free' && (
          <p style={styles.hint}>
            Per utilizzare questa funzionalità devi abilitarla configurando <code>RECHARGE_MODE</code> a
            <code> percentage</code> o <code>map</code>. Finché resta <code>free</code>, una ricarica
            accredita sul voucher esattamente l'importo pagato.
          </p>
        )}

        {config.modalitaRicarica === 'percentage' && (
          <>
            <p style={styles.hint}>
              Percentuale aggiunta al credito di ogni ricarica: pagando € 100 con il 10%, il socio si
              trova € 110 sul voucher. In Fatturazione compaiono i € 100 pagati, non il valore accreditato.
            </p>
            <div style={styles.row}>
              <div style={{ flex: 1, maxWidth: 240 }}>
                <label style={styles.label} htmlFor='percentuale-ricarica'>Percentuale (%)</label>
                <input
                  id='percentuale-ricarica'
                  type='number' step='0.1' min='0' max='100'
                  style={styles.input}
                  value={percentualeRicarica}
                  onChange={e => setPercentualeRicarica(e.target.value)}
                />
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <button
                  style={styles.btn}
                  onClick={salvaPercentuale}
                  disabled={percentualeRicarica === '' || Number(percentualeRicarica) < 0 || Number(percentualeRicarica) > 100}
                >Salva</button>
              </div>
            </div>
          </>
        )}

        {config.modalitaRicarica === 'map' && (
          <>
            <p style={styles.hint}>
              Tagli proposti al momento della ricarica: per ciascuno, quanto paga il socio e quanto gli
              viene accreditato sul voucher. In Fatturazione compare l'importo pagato. I tagli sono
              mostrati dal più economico, e rimuoverne uno non tocca le ricariche già registrate.
            </p>

            <TableScroll>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Importo pagato</th>
                    <th style={styles.th}>Valore sul voucher</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {tagli.map(t => (
                    <tr key={t.id}>
                      <td style={styles.td}>{euro(t.importo)}</td>
                      <td style={styles.td}>{euro(t.valore)}</td>
                      <td style={styles.td}>
                        <button
                          style={styles.btnTaglio}
                          onClick={() => rimuoviTaglio(t.id)}
                          aria-label={`Rimuovi il taglio da ${euro(t.importo)}`}
                          title='Rimuovi'
                        >−</button>
                      </td>
                    </tr>
                  ))}
                  {/* Riga di inserimento in fondo alla tabella, con le stesse
                      colonne: il "+" sta dove starà il "−" della riga una volta
                      aggiunta. */}
                  <tr>
                    <td style={styles.td}>
                      <input
                        type='number' step='0.01' min='0' placeholder='es. 100'
                        style={styles.input}
                        aria-label='Importo pagato del nuovo taglio'
                        value={nuovoTaglio.importo}
                        onChange={e => setNuovoTaglio({ ...nuovoTaglio, importo: e.target.value })}
                      />
                    </td>
                    <td style={styles.td}>
                      <input
                        type='number' step='0.01' min='0' placeholder='es. 110'
                        style={styles.input}
                        aria-label='Valore accreditato del nuovo taglio'
                        value={nuovoTaglio.valore}
                        onChange={e => setNuovoTaglio({ ...nuovoTaglio, valore: e.target.value })}
                      />
                    </td>
                    <td style={styles.td}>
                      <button
                        style={{ ...styles.btnTaglio, ...styles.btnPrimarioSmall }}
                        onClick={aggiungiTaglio}
                        disabled={!taglioCompleto}
                        aria-label='Aggiungi il taglio'
                        title='Aggiungi'
                      >+</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </CardCollassabile>

      {/* Tesseramento — solo se il club ha il modulo attivo: la quota
          configurata qui serve unicamente alla pagina Tesseramenti. */}
      {config.moduli.tesseramento && (
      <CardCollassabile titolo='Tesseramento' riepilogo={`Quota € ${quotaTesseramento}`}>
        <p style={styles.hint}>
          Quota proposta a ogni rinnovo dalla pagina Tesseramenti. Resta modificabile sul singolo rinnovo,
          e i rinnovi già registrati non cambiano se cambia questo valore.
        </p>
        <div style={styles.row}>
          <div style={{ flex: 1, maxWidth: 240 }}>
            <label style={styles.label} htmlFor='quota-tesseramento'>Quota di tesseramento (€)</label>
            <input
              id='quota-tesseramento'
              type='number' step='0.01' min='0'
              style={styles.input}
              value={quotaTesseramento}
              onChange={e => setQuotaTesseramento(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              style={styles.btn}
              onClick={salvaQuota}
              disabled={quotaTesseramento === '' || Number(quotaTesseramento) < 0}
            >Salva</button>
          </div>
        </div>
      </CardCollassabile>
      )}

      {/* Listino attività */}
      <CardCollassabile
        titolo='Attività'
        riepilogo={`${attivitaAttive.length} attive${attivita.length > attivitaAttive.length ? `, ${attivita.length - attivitaAttive.length} disattivate` : ''}`}
      >
        <p style={styles.hint}>
          Le attività proponibili in un incontro e il costo che viene suggerito quando si sceglie
          l'attività. Il costo resta modificabile sul singolo incontro, e gli incontri già
          registrati non cambiano se il listino cambia.
          {' '}<strong>Disattiva</strong> toglie l'attività dalle scelte dei nuovi incontri e la lascia
          nello storico; si può riattivare. <strong>Elimina</strong> la cancella definitivamente, ed è
          possibile solo se non è mai stata usata in un incontro.
        </p>
        <div style={styles.row}>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>Nome</label>
            <input
              style={styles.input}
              value={nuovaAttivita.nome}
              placeholder='Es. Mantrailing'
              onChange={e => setNuovaAttivita({ ...nuovaAttivita, nome: e.target.value })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Costo proposto (€)</label>
            <input
              type='number' step='0.01' min='0'
              style={styles.input}
              value={nuovaAttivita.costo_default}
              onChange={e => setNuovaAttivita({ ...nuovaAttivita, costo_default: e.target.value })}
            />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button style={styles.btn} onClick={creaAttivita} disabled={!nuovaAttivita.nome.trim()}>Aggiungi</button>
          </div>
        </div>

        <TableScroll>
          <table style={{ ...styles.table, marginTop: 16 }}>
            <thead>
              <tr>
                {['Attività', 'Costo proposto', 'Stato', 'Azioni'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {attivita.map(a => {
                const inModifica = attivitaInModifica?.id === a.id;
                return (
                  <tr key={a.id} style={styles.tr}>
                    <td style={styles.td}>
                      {inModifica
                        ? <input
                            style={styles.input}
                            value={attivitaInModifica.nome}
                            onChange={e => setAttivitaInModifica({ ...attivitaInModifica, nome: e.target.value })}
                          />
                        : a.nome}
                    </td>
                    <td style={styles.td}>
                      {inModifica
                        ? <input
                            type='number' step='0.01' min='0'
                            style={styles.input}
                            value={attivitaInModifica.costo_default}
                            onChange={e => setAttivitaInModifica({ ...attivitaInModifica, costo_default: e.target.value })}
                          />
                        : euro(a.costo_default)}
                    </td>
                    <td style={styles.td}>{a.attiva ? '✓ Attiva' : '— Disattivata'}</td>
                    <td style={styles.td}>
                      {inModifica ? (
                        <>
                          <button style={styles.btnSmall} onClick={salvaAttivita}>Salva</button>
                          <button style={styles.btnSmall} onClick={() => setAttivitaInModifica(null)}>Annulla</button>
                        </>
                      ) : (
                        <>
                          <button
                            style={styles.btnSmall}
                            onClick={() => setAttivitaInModifica({ id: a.id, nome: a.nome, costo_default: String(a.costo_default) })}
                          >Modifica</button>
                          <button
                            style={styles.btnSmall}
                            onClick={() => cambiaStatoAttivita(a)}
                            title={a.attiva
                              ? 'Toglie l\'attività dalle scelte dei nuovi incontri; resta nello storico'
                              : 'Rende di nuovo l\'attività selezionabile nei nuovi incontri'}
                          >
                            {a.attiva ? 'Disattiva' : 'Riattiva'}
                          </button>
                          <button
                            style={{ ...styles.btnSmall, ...styles.btnDanger }}
                            onClick={() => eliminaAttivita(a)}
                            title='Cancella definitivamente: solo per attività mai usate in un incontro'
                          >Elimina</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        {attivita.length === 0 && <p style={styles.empty}>Nessuna attività in listino.</p>}
      </CardCollassabile>

      {/* Abilitazioni degli istruttori */}
      <CardCollassabile
        titolo='Abilitazioni degli istruttori'
        riepilogo={`${istruttori.length} ${istruttori.length === 1 ? 'istruttore' : 'istruttori'}`}
      >
        <p style={styles.hint}>
          Ogni istruttore può registrare incontri solo per le attività qui spuntate. Per rendere
          istruttore un utente, assegnagli il ruolo nella card Utenti - Soci.
        </p>
        {istruttori.length === 0 ? (
          <p style={styles.empty}>Nessun utente ha il ruolo istruttore.</p>
        ) : attivitaAttive.length === 0 ? (
          <p style={styles.empty}>Nessuna attività attiva da assegnare.</p>
        ) : (
          <TableScroll>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Istruttore</th>
                  {attivitaAttive.map(a => (
                    <th key={a.id} style={styles.th}>{a.nome}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {istruttori.map(i => (
                  <tr key={i.id} style={styles.tr}>
                    <td style={styles.td}>{nomeIstruttore(i)}</td>
                    {attivitaAttive.map(a => (
                      <td key={a.id} style={styles.td}>
                        <input
                          type='checkbox'
                          checked={(i.attivita_ids ?? []).includes(a.id)}
                          onChange={() => toggleAbilitazione(i, a.id)}
                          aria-label={`${a.nome} per ${nomeIstruttore(i)}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </CardCollassabile>

      {/* Soci senza utente associato */}
      <CardCollassabile
        titolo='Soci senza utente associato'
        riepilogo={`${elencoSociLiberi.totale} ${elencoSociLiberi.totale === 1 ? 'socio' : 'soci'}`}
      >
        <p style={styles.hint}>
          Schede socio a cui non è collegato nessun account: sono gestite solo dall'amministrazione e la
          persona non vede i propri dati nell'app. Per collegarne una usa "Collega socio" sull'account,
          nella card Utenti - Soci.
        </p>
        <TableScroll>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Socio', 'Email'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {elencoSociLiberi.righe.map(s => (
                <tr key={s.id} style={styles.tr}>
                  <td style={styles.td}>{s.cognome} {s.nome}</td>
                  <td style={styles.td}>{s.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        {elencoSociLiberi.caricato && elencoSociLiberi.righe.length === 0 && <p style={styles.empty}>Tutti i soci hanno un account collegato.</p>}
        <CaricaAltri caricati={elencoSociLiberi.righe.length} totale={elencoSociLiberi.totale} inCaricamento={elencoSociLiberi.loadingMore} onCaricaAltri={elencoSociLiberi.caricaAltri} />
      </CardCollassabile>

      {/* Utenti - Soci */}
      <CardCollassabile
        titolo='Utenti - Soci'
        riepilogo={daCollegare > 0
          ? `${elencoUtenti.totale} account · ${daCollegare} da collegare`
          : `${elencoUtenti.totale} account`}
        attenzione={daCollegare > 0}
      >
        <p style={styles.hint}>
          Gli account registrati e la scheda socio a cui sono collegati; in cima quelli ancora da
          collegare. Il collegamento è sempre manuale.
          {' '}<strong>Al collegamento l'email dell'account viene copiata sul socio e da quel
          momento non è più modificabile.</strong>
        </p>
        <p style={styles.hint}>
          <strong>Disattiva</strong>: l'account non può più accedere e le sue sessioni vengono chiuse.
          Il collegamento alla scheda socio resta com'è: per scioglierlo usa "Scollega".
          Non si cancella nessun dato, e l'account si può riattivare.
        </p>
        <TableScroll>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Socio', 'Email', 'Telefono', 'Ruolo', 'Admin', 'Stato', 'Azioni'].map(h => <th key={h} style={styles.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {elencoUtenti.righe.map(u => {
                const nome = nominativo(u);
                const collegabile = u.attivo && sociSenzaAccount.length > 0;
                return (
                  <tr key={u.id} style={{ ...styles.tr, ...(!u.socio_id ? styles.trDaCollegare : {}) }}>
                    <td style={styles.td}>
                      {nome ?? <span style={styles.nonCollegato}>Non collegato</span>}
                    </td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>{u.telefono ?? '—'}</td>
                    <td style={styles.td}>
                      {/* Il ruolo nel club è modificabile per chiunque, sé stessi
                          compresi: non tocca il privilegio di amministrazione,
                          quindi non c'è rischio di chiudersi fuori. */}
                      <select
                        style={styles.select}
                        value={u.ruolo}
                        onChange={e => cambiaRuolo(u, e.target.value as Ruolo)}
                        aria-label={`Ruolo di ${u.email}`}
                      >
                        {RUOLI.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={styles.td}>
                      {/* Bloccata sulla propria riga: togliersi da soli il
                          privilegio è il modo più rapido di restare senza
                          amministratori. */}
                      <input
                        type='checkbox'
                        checked={u.admin}
                        disabled={u.id === user?.sub}
                        onChange={e => cambiaAdmin(u, e.target.checked)}
                        aria-label={`Amministratore: ${u.email}`}
                        title={u.id === user?.sub ? 'Non puoi togliere a te stesso il privilegio di amministratore' : undefined}
                      />
                    </td>
                    <td style={styles.td}>
                      {!u.attivo
                        ? '✗ Disattivato'
                        : u.cambio_password_richiesto
                          ? '⏳ Password da impostare'
                          : '✓ Attivo'}
                    </td>
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      {u.socio_id ? (
                        <button style={styles.btnSmall} onClick={() => scollega(u)}>Scollega</button>
                      ) : (
                        <button
                          style={{ ...styles.btnSmall, ...(collegabile ? styles.btnPrimarioSmall : {}) }}
                          onClick={() => apriCollegamento(u)}
                          disabled={!collegabile}
                          title={!u.attivo
                            ? 'Riattiva l\'account prima di collegarlo'
                            : sociSenzaAccount.length === 0 ? 'Nessuna scheda socio libera' : undefined}
                        >Collega socio</button>
                      )}
                      <button style={styles.btnSmall} onClick={() => resetPassword(u)}>Azzera password</button>
                      {/* Un admin non può spegnere sé stesso: si chiuderebbe
                          fuori dalla porta con la chiave dentro. */}
                      {u.id !== user?.sub && (
                        <button
                          style={{ ...styles.btnSmall, ...(u.attivo ? styles.btnDanger : {}) }}
                          onClick={() => cambiaAttivo(u)}
                          title={u.attivo
                            ? 'Blocca l\'accesso e chiude le sessioni; nessun dato viene cancellato'
                            : 'Consente di nuovo l\'accesso'}
                        >
                          {u.attivo ? 'Disattiva' : 'Riattiva'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        {elencoUtenti.caricato && elencoUtenti.righe.length === 0 && <p style={styles.empty}>Nessun account registrato.</p>}
        <CaricaAltri caricati={elencoUtenti.righe.length} totale={elencoUtenti.totale} inCaricamento={elencoUtenti.loadingMore} onCaricaAltri={elencoUtenti.caricaAltri} />
      </CardCollassabile>

      {collegamento && (
        <Modal
          title={`Collega ${collegamento.utente.email}`}
          onClose={() => setCollegamento(null)}
          footer={
            <>
              <button style={styles.btnSecondary} onClick={() => setCollegamento(null)}>Annulla</button>
              <button style={styles.btn} onClick={confermaCollegamento} disabled={saving || !collegamento.socio_id}>
                {saving ? 'Collegamento...' : 'Collega'}
              </button>
            </>
          }
        >
          <p style={styles.hint}>
            Scegli la scheda socio di questa persona. Solo le schede ancora libere sono selezionabili.
            {' '}<strong>L'email dell'account verrà copiata sul socio e da quel momento non sarà più
            modificabile.</strong>
          </p>
          <label style={styles.label}>Socio</label>
          <SocioSelect
            soci={sociSenzaAccount}
            value={collegamento.socio_id}
            onChange={id => setCollegamento({ ...collegamento, socio_id: id })}
          />
        </Modal>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  title: { margin: '0 0 24px', fontSize: 22, fontWeight: 700 },
  passwordValore: {
    display: 'block', margin: '10px 0', padding: '10px 14px', background: '#fff',
    border: '1px solid #e5e7eb', borderRadius: 6, fontFamily: 'monospace', fontSize: 18,
    letterSpacing: 1, userSelect: 'all',
  },
  passwordNota: { fontSize: 13, color: '#444', margin: '0 0 12px' },
  hint: { color: '#666', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 },
  row: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  btn: { background: theme.primary, color: theme.primaryText, border: 'none', borderRadius: 8, padding: '8px 20px', minHeight: 40, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  btnPrimarioSmall: { background: theme.primary, color: theme.primaryText, fontWeight: 600 },
  // Quadrato: "+" e "−" occupano lo stesso spazio, così la riga non si sposta
  // quando il bottone cambia di significato una volta salvato il taglio.
  btnTaglio: {
    width: 36, height: 36, borderRadius: 8, border: '1px solid #e5e7eb',
    background: '#f8fafc', cursor: 'pointer', fontSize: 20, lineHeight: 1,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  trDaCollegare: { background: '#fffbeb' },
  nonCollegato: { color: '#92400e', fontWeight: 600 },
  empty: { textAlign: 'center', color: '#999', marginTop: 16 },
};
