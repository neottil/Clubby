/**
 * Ricevute (solo admin), in due schede.
 *
 *   Crea ricevuta     le voci ancora da documentare, con la selezione e
 *                     l'emissione
 *   Ricevute emesse   lo storico dei documenti prodotti, riapribili in PDF
 *
 * I filtri per socio e periodo stanno SOPRA le schede e valgono per entrambe:
 * "cosa resta da regitrare a Rossi" e "cosa gli ho già consegnato" sono la
 * stessa domanda vista da due lati, e farli ridigitare a ogni cambio di scheda
 * sarebbe attrito senza guadagno. La selezione e "mostra emesse" restano
 * invece nella prima, perché appartengono solo a quella.
 *
 * Tre voci e solo tre: ricariche dei voucher, quote di tesseramento e incontri
 * non coperti da voucher. Gli incontri pagati col voucher, le rettifiche e il
 * saldo importato non compaiono (il perché è in
 * service/documenti/voci.service.ts nel backend).
 *
 * Accanto, la ricevuta libera (spec 013): per chi non è socio, con intestatario
 * e righe scritti a mano. Non passa dalle voci, ma finisce nella stessa
 * numerazione e nella stessa scheda delle ricevute emesse.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  createApiClient, DIMENSIONE_PAGINA,
  type VoceDocumento, type Socio, type Documento, type AnteprimaDocumento,
} from '../api/client';
import SocioSelect from '../components/SocioSelect';
import DateRangeFilter, { dataCompleta } from '../components/DateRangeFilter';
import TableScroll from '../components/TableScroll';
import Avviso from '../components/Avviso';
import CaricaAltri from '../components/CaricaAltri';
import TotaliFiltri from '../components/TotaliFiltri';
import Etichetta from '../components/Etichetta';
import Modal from '../components/Modal';
import Tabs from '../components/Tabs';
import ApriRicevuta from '../components/ApriRicevuta';
import { nomeFileRicevuta, scaricaBlob, apriPdfBase64, pdfDaBase64 } from '../utils/ricevuta';
import { euro, dataIso, oggiIso } from '../utils/formato';
import { ui } from '../styles/ui';
import { useSelezione } from '../hooks/useSelezione';
import { messaggioErrore } from '../utils/errori';

const VOCI: Record<VoceDocumento['tipo'], { etichetta: string; colore: string; sfondo: string }> = {
  ricarica:     { etichetta: 'Ricarica voucher', colore: '#1d4ed8', sfondo: '#eff6ff' },
  tesseramento: { etichetta: 'Tesseramento',     colore: '#92400e', sfondo: '#fffbeb' },
  incontro:     { etichetta: 'Incontro',         colore: '#374151', sfondo: '#f3f4f6' },
};

export default function RicevutePage() {
  const { token } = useAuth();
  const api = createApiClient(token);

  const [scheda, setScheda] = useState('voci');

  // --- Filtri condivisi fra le due schede -------------------------------
  const [soci, setSoci]       = useState<Socio[]>([]);
  const [socioId, setSocioId] = useState('');
  const [dataDa, setDataDa]   = useState('');
  const [dataA, setDataA]     = useState('');

  const [error, setError] = useState('');

  useEffect(() => {
    api.getSoci().then(setSoci).catch(e => setError(messaggioErrore(e)));
  }, []);

  const da = dataCompleta(dataDa);
  const a  = dataCompleta(dataA);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Ricevute</h2>
      <p style={styles.hint}>
        Ricariche dei voucher, quote di tesseramento e incontri non coperti da voucher. Gli incontri
        pagati con il voucher non compaiono: il loro valore è già nella ricarica che li copre.
      </p>
      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}

      <div style={styles.filterRow}>
        <div style={styles.filterSocio}>
          <SocioSelect
            soci={soci}
            value={socioId}
            onChange={setSocioId}
            placeholder='Filtra per socio...'
            resetLabel='Tutti i soci'
          />
        </div>
        <DateRangeFilter from={dataDa} to={dataA} onFromChange={setDataDa} onToChange={setDataA} />
      </div>

      <Tabs
        attiva={scheda}
        onCambia={setScheda}
        schede={[
          {
            id: 'voci',
            etichetta: 'Crea ricevuta',
            contenuto: (
              <SchedaVoci
                api={api}
                soci={soci}
                socioId={socioId}
                da={da}
                a={a}
              />
            ),
          },
          {
            id: 'emesse',
            etichetta: 'Ricevute emesse',
            contenuto: <SchedaDocumenti api={api} socioId={socioId} da={da} a={a} />,
          },
        ]}
      />
    </div>
  );
}

type Api = ReturnType<typeof createApiClient>;

// =====================================================================
// Scheda "Crea ricevuta"
// =====================================================================

interface SchedaVociProps {
  api: Api;
  soci: Socio[];
  socioId: string;
  da?: string;
  a?: string;
}

function SchedaVoci({ api, soci, socioId, da, a }: SchedaVociProps) {
  const [voci, setVoci]                   = useState<VoceDocumento[]>([]);
  const [total, setTotal]                 = useState(0);
  const [totaleImporto, setTotaleImporto] = useState(0);
  const [loading, setLoading]             = useState(true);
  const [caricato, setCaricato]           = useState(false);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [errore, setErrore]               = useState('');
  // Le voci già registrate sono nascoste di default: la scheda serve a sapere
  // che cosa resta da registrare, non a rivedere ogni volta tutto lo storico.
  const [mostraEmesse, setMostraEmesse]   = useState(false);

  // --- Emissione ---------------------------------------------------------
  const [modaleAperta, setModaleAperta] = useState(false);
  // La ricevuta libera ha una modale sua: non usa né il socio filtrato né la
  // selezione, e chiudendola la pagina resta com'era (spec 013).
  const [liberaAperta, setLiberaAperta] = useState(false);
  const [causale, setCausale]           = useState('');
  const [anteprima, setAnteprima]       = useState<AnteprimaDocumento | null>(null);
  const [inCorso, setInCorso]           = useState(false);
  const [esito, setEsito]               = useState('');

  const richiestaCorrente = useRef(0);

  const filtri = () => ({
    socio_id: socioId || undefined,
    da,
    a,
    includi_emesse: (mostraEmesse ? '1' : undefined) as '1' | undefined,
    limit: DIMENSIONE_PAGINA,
  });

  const load = async () => {
    const richiesta = ++richiestaCorrente.current;
    setLoading(true);
    setErrore('');
    try {
      const r = await api.getVociDocumento({ ...filtri(), offset: 0 });
      if (richiesta !== richiestaCorrente.current) return;
      setVoci(r.data);
      setTotal(r.total);
      setTotaleImporto(Number(r.totale_importo ?? 0));
      setCaricato(true);
    } catch (e) {
      if (richiesta === richiestaCorrente.current) setErrore(messaggioErrore(e));
    } finally {
      if (richiesta === richiestaCorrente.current) setLoading(false);
    }
  };

  const caricaAltri = async () => {
    const richiesta = richiestaCorrente.current;
    setLoadingMore(true);
    try {
      const r = await api.getVociDocumento({ ...filtri(), offset: voci.length });
      if (richiesta !== richiestaCorrente.current) return;
      setVoci(prev => [...prev, ...r.data]);
      setTotal(r.total);
      setTotaleImporto(Number(r.totale_importo ?? 0));
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(); }, [socioId, da, a, mostraEmesse]);

  const filtriAttivi = !!(socioId || da || a);

  // Una voce è identificata dalla coppia (tipo, id): le tre fonti sono tabelle
  // diverse, e due voci di tipo diverso possono in teoria avere lo stesso id.
  const chiaveVoce = (v: VoceDocumento) => `${v.tipo}:${v.id}`;
  const selezionabili = useMemo(
    () => voci.filter(v => !v.emessa_il).map(chiaveVoce),
    [voci],
  );
  const selezione = useSelezione(selezionabili, JSON.stringify([socioId, da, a, mostraEmesse]));

  const socioScelto = soci.find(s => s.id === socioId);
  // Una ricevuta è intestata a UNA persona: senza un socio nel filtro non si
  // saprebbe a chi. Il pulsante resta visibile ma spento, col perché nel title.
  const motivoBlocco = !socioId
    ? 'Scegli un socio nel filtro: una ricevuta è intestata a una persona sola'
    : selezione.quanti === 0
      ? 'Seleziona almeno una voce'
      : '';

  const vociScelte = () => selezione.ids.map(chiave => {
    const [tipo, id] = chiave.split(':');
    return { tipo: tipo as VoceDocumento['tipo'], id };
  });

  const generaAnteprima = async () => {
    setInCorso(true);
    setErrore('');
    try {
      setAnteprima(await api.anteprimaDocumento({
        socio_id: socioId,
        causale: causale.trim(),
        voci: vociScelte(),
      }));
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setInCorso(false);
    }
  };

  const conferma = async () => {
    setInCorso(true);
    setErrore('');
    try {
      const emesso = await api.emettiDocumento({
        socio_id: socioId,
        causale: causale.trim(),
        voci: vociScelte(),
      });
      // Il nome si ricalcola invece di usare emesso.nome_file: è lo stesso, ma
      // così il download subito dopo l'emissione e quello dalle tabelle
      // passano dall'unica funzione che decide come si chiama una ricevuta.
      scaricaBlob(pdfDaBase64(emesso.pdf_base64), nomeFileRicevuta(emesso.anno, emesso.numero));
      setEsito(`Ricevuta n. ${emesso.numero}/${emesso.anno} emessa per ${euro(emesso.importo)}.`);
      chiudiModale();
      selezione.azzera();
      await load();
    } catch (e) {
      // Il 409 arriva qui: le voci sono cambiate fra l'anteprima e la
      // conferma, e il messaggio del backend dice già cosa fare.
      setErrore(messaggioErrore(e));
      setAnteprima(null);
    } finally {
      setInCorso(false);
    }
  };

  const chiudiModale = () => {
    setModaleAperta(false);
    setAnteprima(null);
    setCausale('');
  };

  return (
    <>
      {errore && <Avviso tipo='errore' messaggio={errore} onChiudi={() => setErrore('')} />}
      {esito && <Avviso tipo='successo' messaggio={esito} onChiudi={() => setEsito('')} />}

      <div style={styles.barraEmissione}>
        <label style={styles.checkboxLabel}>
          <input
            type='checkbox'
            checked={mostraEmesse}
            onChange={e => setMostraEmesse(e.target.checked)}
          />
          Mostra anche le voci con ricevuta già emessa
        </label>

        <div style={styles.azioni}>
          <TotaliFiltri numero={total} singolare='voce' plurale='voci' importo={totaleImporto} />
          <button
            style={{ ...styles.btn, ...(motivoBlocco ? styles.btnSpento : {}) }}
            onClick={() => setModaleAperta(true)}
            disabled={!!motivoBlocco}
            title={motivoBlocco || undefined}
          >
            Emetti ricevuta ({selezione.quanti})
          </button>
          <button
            style={styles.btnSecondario}
            onClick={() => setLiberaAperta(true)}
            title='Per chi non è socio: intestatario e righe si scrivono a mano'
          >
            Ricevuta libera
          </button>
        </div>
      </div>

      {!caricato ? (
        <div style={styles.loading}>Caricamento...</div>
      ) : (
        <>
          <TableScroll>
            <table style={{ ...styles.table, opacity: loading ? 0.55 : 1 }} aria-busy={loading}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.thScelta }}>
                    {/* `indeterminate` non è un attributo JSX: si imposta solo
                        sull'elemento. È lo stato "alcune sì, altre no". */}
                    <input
                      type='checkbox'
                      checked={selezione.tutte}
                      ref={el => { if (el) el.indeterminate = selezione.parziale; }}
                      onChange={selezione.invertiTutti}
                      disabled={selezionabili.length === 0}
                      aria-label='Seleziona tutte le voci caricate'
                    />
                  </th>
                  {['Data', 'Socio', 'Voce', 'Descrizione', 'Importo'].map(h => (
                    <th key={h} style={h === 'Importo' ? { ...styles.th, textAlign: 'right' } : styles.th}>{h}</th>
                  ))}
                  <th style={{ ...styles.th, ...styles.thDoc }}>Ricevuta</th>
                </tr>
              </thead>
              <tbody>
                {voci.map(v => (
                  <tr key={chiaveVoce(v)} style={styles.tr}>
                    <td style={{ ...styles.td, ...styles.tdScelta }}>
                      {/* Una voce già registrata resta spuntata e bloccata:
                          l'emissione non si annulla. */}
                      <input
                        type='checkbox'
                        checked={!!v.emessa_il || selezione.contiene(chiaveVoce(v))}
                        disabled={!!v.emessa_il}
                        onChange={() => selezione.inverti(chiaveVoce(v))}
                        title={v.emessa_il ? 'Documento già emesso: non si può annullare' : undefined}
                        aria-label={`Seleziona ${VOCI[v.tipo].etichetta} di ${v.cognome} ${v.nome} del ${dataIso(v.data)}`}
                      />
                    </td>
                    <td style={styles.td}>{dataIso(v.data)}</td>
                    <td style={styles.td}>{v.cognome} {v.nome}</td>
                    <td style={styles.td}>
                      <Etichetta testo={VOCI[v.tipo].etichetta} colore={VOCI[v.tipo].colore} sfondo={VOCI[v.tipo].sfondo} />
                    </td>
                    <td style={styles.td}>{v.descrizione}</td>
                    <td style={{ ...styles.td, ...styles.importo }}>{euro(v.importo)}</td>
                    <td style={{ ...styles.td, ...styles.tdDoc }}>
                      <ApriRicevuta
                        api={api}
                        documentoId={v.documento_id}
                        anno={v.documento_anno}
                        numero={v.documento_numero}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          {voci.length === 0 && !loading && !errore && (
            <p style={styles.empty}>
              {filtriAttivi ? 'Nessuna voce corrisponde ai filtri.' : 'Nessuna voce in attesa di ricevuta.'}
            </p>
          )}

          <CaricaAltri caricati={voci.length} totale={total} inCaricamento={loadingMore} onCaricaAltri={caricaAltri} />
        </>
      )}

      {modaleAperta && (
        <Modal
          title={anteprima ? 'Conferma la ricevuta' : 'Emetti ricevuta'}
          width={anteprima ? 460 : 400}
          onClose={chiudiModale}
          footer={
            anteprima ? (
              <>
                <button style={styles.btnSecondario} onClick={() => setAnteprima(null)} disabled={inCorso}>
                  Indietro
                </button>
                <button style={styles.btn} onClick={conferma} disabled={inCorso}>
                  {inCorso ? 'Emissione...' : 'Conferma ed emetti'}
                </button>
              </>
            ) : (
              <>
                <button style={styles.btnSecondario} onClick={chiudiModale} disabled={inCorso}>
                  Annulla
                </button>
                <button
                  style={{ ...styles.btn, ...(causale.trim() ? {} : styles.btnSpento) }}
                  onClick={generaAnteprima}
                  disabled={!causale.trim() || inCorso}
                >
                  {inCorso ? 'Generazione...' : 'Genera anteprima'}
                </button>
              </>
            )
          }
        >
          <p style={styles.riepilogo}>
            <strong>{socioScelto ? `${socioScelto.cognome} ${socioScelto.nome}` : ''}</strong>
            {' — '}
            {selezione.quanti} {selezione.quanti === 1 ? 'voce' : 'voci'}
          </p>

          {anteprima ? (
            <>
              <p style={styles.riepilogo}>
                Ricevuta n. <strong>{anteprima.numero_provvisorio}/{anteprima.anno}</strong> —{' '}
                <strong>{euro(anteprima.importo)}</strong>
                <br />
                <span style={styles.lettere}>{anteprima.importo_lettere}</span>
              </p>
              <button style={styles.btnSecondario} onClick={() => apriPdfBase64(anteprima.pdf_base64)}>
                Apri l'anteprima in PDF
              </button>
              <p style={styles.avvertenza}>
                Il numero è provvisorio: quello definitivo viene assegnato alla conferma.
                Una ricevuta emessa non si annulla.
              </p>
            </>
          ) : (
            <label style={styles.campo}>
              Causale
              <input
                style={styles.input}
                value={causale}
                onChange={e => setCausale(e.target.value)}
                placeholder='es. educazione cinofila'
                autoFocus
                maxLength={500}
              />
            </label>
          )}
        </Modal>
      )}

      {liberaAperta && (
        <ModaleRicevutaLibera
          api={api}
          onChiudi={() => setLiberaAperta(false)}
          onEmessa={messaggio => { setLiberaAperta(false); setEsito(messaggio); }}
        />
      )}
    </>
  );
}

// =====================================================================
// Ricevuta libera (spec 013)
// =====================================================================

interface RigaForm {
  /** Solo per React: le righe si tolgono da qualunque posizione. */
  chiave: number;
  data: string;
  descrizione: string;
  importo: string;
}

const MAX_RIGHE_LIBERE = 50;

/**
 * Ricevuta per chi non è socio — un iscritto di un altro club a una gara, un
 * partecipante a un evento. Intestatario, causale e righe li scrive l'admin;
 * numerazione, intestazione e piè di pagina sono quelli di ogni ricevuta.
 *
 * Il percorso dopo il form è lo stesso della ricevuta di un socio: anteprima
 * con numero provvisorio, poi conferma, che non si annulla.
 */
function ModaleRicevutaLibera({ api, onChiudi, onEmessa }: {
  api: Api;
  onChiudi: () => void;
  onEmessa: (messaggio: string) => void;
}) {
  const oggi = oggiIso();
  const prossimaChiave = useRef(1);
  const rigaVuota = (): RigaForm => ({ chiave: prossimaChiave.current++, data: oggi, descrizione: '', importo: '' });

  const [intestatario, setIntestatario] = useState('');
  const [causale, setCausale]           = useState('');
  // Finché l'admin non la tocca, la causale segue la descrizione della prima
  // riga: con una riga sola sono quasi sempre la stessa frase.
  const [causaleToccata, setCausaleToccata] = useState(false);
  const [righe, setRighe]               = useState<RigaForm[]>(() => [rigaVuota()]);
  const [anteprima, setAnteprima]       = useState<AnteprimaDocumento | null>(null);
  const [inCorso, setInCorso]           = useState(false);
  const [errore, setErrore]             = useState('');

  const aggiorna = (chiave: number, campo: keyof Omit<RigaForm, 'chiave'>, valore: string) => {
    setRighe(prev => prev.map(r => r.chiave === chiave ? { ...r, [campo]: valore } : r));
    if (!causaleToccata && campo === 'descrizione' && righe[0]?.chiave === chiave) setCausale(valore);
  };

  const importoRiga = (r: RigaForm) => parseFloat(r.importo);
  const totale = Math.round(righe.reduce((t, r) => t + (importoRiga(r) > 0 ? importoRiga(r) : 0), 0) * 100) / 100;

  const motivoBlocco = !intestatario.trim()
    ? 'Scrivi l\'intestatario'
    : !causale.trim()
      ? 'Scrivi la causale'
      : righe.some(r => !r.descrizione.trim())
        ? 'Ogni riga ha bisogno di una descrizione'
        : righe.some(r => !(importoRiga(r) > 0))
          ? 'Ogni riga ha bisogno di un importo positivo'
          : righe.some(r => r.data > oggi)
            ? 'Una riga ha una data futura'
            : '';

  const corpo = () => ({
    intestatario: intestatario.trim(),
    causale: causale.trim(),
    righe: righe.map(r => ({
      data: r.data || undefined,
      descrizione: r.descrizione.trim(),
      importo: importoRiga(r),
    })),
  });

  const generaAnteprima = async () => {
    setInCorso(true);
    setErrore('');
    try {
      setAnteprima(await api.anteprimaDocumento(corpo()));
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setInCorso(false);
    }
  };

  const conferma = async () => {
    setInCorso(true);
    setErrore('');
    try {
      const emesso = await api.emettiDocumento(corpo());
      scaricaBlob(pdfDaBase64(emesso.pdf_base64), nomeFileRicevuta(emesso.anno, emesso.numero));
      onEmessa(
        `Ricevuta libera n. ${emesso.numero}/${emesso.anno} emessa per ${euro(emesso.importo)}: la trovi in Ricevute emesse.`
      );
    } catch (e) {
      setErrore(messaggioErrore(e));
      setAnteprima(null);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Modal
      title={anteprima ? 'Conferma la ricevuta libera' : 'Ricevuta libera'}
      width={anteprima ? 460 : 640}
      onClose={onChiudi}
      footer={
        anteprima ? (
          <>
            <button style={styles.btnSecondario} onClick={() => setAnteprima(null)} disabled={inCorso}>
              Indietro
            </button>
            <button style={styles.btn} onClick={conferma} disabled={inCorso}>
              {inCorso ? 'Emissione...' : 'Conferma ed emetti'}
            </button>
          </>
        ) : (
          <>
            <button style={styles.btnSecondario} onClick={onChiudi} disabled={inCorso}>
              Annulla
            </button>
            <button
              style={{ ...styles.btn, ...(motivoBlocco ? styles.btnSpento : {}) }}
              onClick={generaAnteprima}
              disabled={!!motivoBlocco || inCorso}
              title={motivoBlocco || undefined}
            >
              {inCorso ? 'Generazione...' : 'Genera anteprima'}
            </button>
          </>
        )
      }
    >
      {errore && <Avviso tipo='errore' messaggio={errore} onChiudi={() => setErrore('')} />}

      {anteprima ? (
        <>
          <p style={styles.riepilogo}>
            <strong>{intestatario.trim()}</strong>
            {' — '}
            {righe.length} {righe.length === 1 ? 'riga' : 'righe'}
          </p>
          <p style={styles.riepilogo}>
            Ricevuta n. <strong>{anteprima.numero_provvisorio}/{anteprima.anno}</strong> —{' '}
            <strong>{euro(anteprima.importo)}</strong>
            <br />
            <span style={styles.lettere}>{anteprima.importo_lettere}</span>
          </p>
          <button style={styles.btnSecondario} onClick={() => apriPdfBase64(anteprima.pdf_base64)}>
            Apri l'anteprima in PDF
          </button>
          <p style={styles.avvertenza}>
            Il numero è provvisorio: quello definitivo viene assegnato alla conferma.
            Una ricevuta emessa non si annulla.
          </p>
        </>
      ) : (
        <div style={styles.formLibera}>
          <p style={styles.notaLibera}>
            Per chi non è socio, ad esempio l'iscritto di un altro club a una gara. Per gli incassi
            di un socio registrati in Clubby usa le voci: la ricevuta libera non compare nella sua area.
          </p>
          <label style={styles.campo}>
            Intestatario
            <input
              style={styles.input}
              value={intestatario}
              onChange={e => setIntestatario(e.target.value)}
              placeholder='es. Mario Rossi — ASD Cinofila Lago'
              autoFocus
              maxLength={200}
            />
          </label>
          <label style={styles.campo}>
            Causale
            <input
              style={styles.input}
              value={causale}
              onChange={e => { setCausale(e.target.value); setCausaleToccata(true); }}
              placeholder='es. iscrizione alla gara del 12 ottobre'
              maxLength={500}
            />
          </label>

          <div style={styles.campo}>
            Righe
            {righe.map((r, i) => (
              <div key={r.chiave} style={styles.rigaLibera}>
                <input
                  type='date'
                  style={{ ...styles.input, ...styles.rigaData }}
                  value={r.data}
                  max={oggi}
                  onChange={e => aggiorna(r.chiave, 'data', e.target.value)}
                  aria-label={`Data della riga ${i + 1}`}
                />
                <input
                  style={{ ...styles.input, ...styles.rigaDescrizione }}
                  value={r.descrizione}
                  onChange={e => aggiorna(r.chiave, 'descrizione', e.target.value)}
                  placeholder='Descrizione'
                  maxLength={300}
                  aria-label={`Descrizione della riga ${i + 1}`}
                />
                <input
                  type='number'
                  step='0.01'
                  min='0.01'
                  style={{ ...styles.input, ...styles.rigaImporto }}
                  value={r.importo}
                  onChange={e => aggiorna(r.chiave, 'importo', e.target.value)}
                  placeholder='€'
                  aria-label={`Importo della riga ${i + 1}`}
                />
                <button
                  style={styles.btnSmall}
                  onClick={() => setRighe(prev => prev.filter(x => x.chiave !== r.chiave))}
                  disabled={righe.length === 1}
                  title={righe.length === 1 ? 'Serve almeno una riga' : 'Togli la riga'}
                  aria-label={`Togli la riga ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <div style={styles.piedeRighe}>
              <button
                style={styles.btnSmall}
                onClick={() => setRighe(prev => [...prev, rigaVuota()])}
                disabled={righe.length >= MAX_RIGHE_LIBERE}
              >
                + Aggiungi riga
              </button>
              <span>Totale <strong>{euro(totale)}</strong></span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// =====================================================================
// Scheda "Ricevute emesse"
// =====================================================================

function SchedaDocumenti({ api, socioId, da, a }: { api: Api; socioId: string; da?: string; a?: string }) {
  const [documenti, setDocumenti]     = useState<Documento[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [caricato, setCaricato]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errore, setErrore]           = useState('');

  const richiestaCorrente = useRef(0);

  const filtri = () => ({
    socio_id: socioId || undefined,
    da,
    a,
    limit: DIMENSIONE_PAGINA,
  });

  const load = async () => {
    const richiesta = ++richiestaCorrente.current;
    setLoading(true);
    setErrore('');
    try {
      const r = await api.getDocumenti({ ...filtri(), offset: 0 });
      if (richiesta !== richiestaCorrente.current) return;
      setDocumenti(r.data);
      setTotal(r.total);
      setCaricato(true);
    } catch (e) {
      if (richiesta === richiestaCorrente.current) setErrore(messaggioErrore(e));
    } finally {
      if (richiesta === richiestaCorrente.current) setLoading(false);
    }
  };

  const caricaAltri = async () => {
    const richiesta = richiestaCorrente.current;
    setLoadingMore(true);
    try {
      const r = await api.getDocumenti({ ...filtri(), offset: documenti.length });
      if (richiesta !== richiestaCorrente.current) return;
      setDocumenti(prev => [...prev, ...r.data]);
      setTotal(r.total);
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { load(); }, [socioId, da, a]);

  const filtriAttivi = !!(socioId || da || a);

  return (
    <>
      {errore && <Avviso tipo='errore' messaggio={errore} onChiudi={() => setErrore('')} />}

      {!caricato ? (
        <div style={styles.loading}>Caricamento...</div>
      ) : (
        <>
          <TableScroll>
            <table style={{ ...styles.table, opacity: loading ? 0.55 : 1 }} aria-busy={loading}>
              <thead>
                <tr>
                  {/* "Intestatario" e non "Socio": con le ricevute libere
                      (spec 013) non tutti gli intestatari sono soci. */}
                  {['Ricevuta', 'Data', 'Intestatario', 'Causale', 'Importo'].map(h => (
                    <th key={h} style={h === 'Importo' ? { ...styles.th, textAlign: 'right' } : styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documenti.map(d => (
                  <tr key={d.id} style={styles.tr}>
                    {/* Il codice È il collegamento al PDF: una colonna in più
                        col solo scarica ripeterebbe lo stesso numero due volte
                        sulla stessa riga. */}
                    <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                      <ApriRicevuta api={api} documentoId={d.id} anno={d.anno} numero={d.numero} />
                    </td>
                    <td style={styles.td}>{dataIso(d.data_documento)}</td>
                    {/* intestatario e non cognome+nome: è come si chiamava il
                        socio quando la ricevuta è stata consegnata, e il
                        documento deve restare leggibile com'era. */}
                    <td style={styles.td}>
                      {d.intestatario}
                      {/* Chi scorre l'elenco deve sapere che questa persona
                          non la troverà fra i soci. */}
                      {d.socio_id === null && (
                        <>
                          {' '}
                          <Etichetta testo='non socio' colore='#6b21a8' sfondo='#faf5ff' />
                        </>
                      )}
                    </td>
                    <td style={styles.td}>{d.causale}</td>
                    <td style={{ ...styles.td, ...styles.importo }}>{euro(d.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          {documenti.length === 0 && !loading && !errore && (
            <p style={styles.empty}>
              {/* I due casi non vogliono dire la stessa cosa: confonderli fa
                  sospettare un guasto quando è solo un filtro. */}
              {filtriAttivi
                ? 'Nessuna ricevuta corrisponde ai filtri.'
                : 'Nessuna ricevuta emessa.'}
            </p>
          )}

          <CaricaAltri caricati={documenti.length} totale={total} inCaricamento={loadingMore} onCaricaAltri={caricaAltri} />
        </>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  title: { margin: '0 0 8px', fontSize: 22, fontWeight: 700 },
  hint: { color: '#666', fontSize: 13, margin: '0 0 20px', maxWidth: 760, lineHeight: 1.5 },
  filterSocio: { width: 260, maxWidth: '100%' },
  importo: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 600 },
  // Riga fra i filtri e la tabella: a sinistra lo switch, a destra l'azione.
  barraEmissione: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, flexWrap: 'wrap', marginBottom: 12,
  },
  azioni: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', cursor: 'pointer' },
  btnSpento: { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' },
  btnSecondario: {
    background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8,
    padding: '8px 16px', minHeight: 40, cursor: 'pointer', font: 'inherit',
  },
  // Colonna delle caselle: larghezza fissa, così resta allineata fra
  // intestazione e righe e non si allarga col contenuto delle altre.
  thScelta: { width: 44, textAlign: 'center' },
  tdScelta: { width: 44, textAlign: 'center' },
  // Colonna del codice ricevuta: niente larghezza fissa (44px bastavano a
  // un'icona, non a "2026_60") e niente a capo dentro al codice.
  thDoc: { whiteSpace: 'nowrap' },
  tdDoc: { whiteSpace: 'nowrap' },
  campo: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#555' },
  riepilogo: { margin: '0 0 12px', fontSize: 14, color: '#374151', lineHeight: 1.5 },
  lettere: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  avvertenza: { margin: '12px 0 0', fontSize: 12, color: '#92400e', lineHeight: 1.5 },
  // Ricevuta libera: su schermo stretto la riga va a capo, con la descrizione
  // a tutta larghezza sotto data e importo.
  formLibera: { display: 'flex', flexDirection: 'column', gap: 14 },
  notaLibera: { margin: 0, fontSize: 12, color: '#6b7280', lineHeight: 1.5 },
  rigaLibera: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  rigaData: { width: 150, flex: '0 0 150px' },
  rigaDescrizione: { width: 'auto', flex: '1 1 200px', minWidth: 0 },
  rigaImporto: { width: 110, flex: '0 0 110px' },
  piedeRighe: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, flexWrap: 'wrap', color: '#374151', fontSize: 14,
  },
};
