/**
 * Tesseramenti (solo admin): la scadenza del tesseramento di ogni socio, con
 * il rinnovo e lo storico dei rinnovi.
 *
 * La quota di un rinnovo non tocca il voucher: è fatturata a parte e compare
 * in Fatturazione. Quella proposta si configura nel pannello Admin.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  createApiClient, DIMENSIONE_PAGINA,
  type RigaTesseramento, type StatoTesseramento, type Tesseramento,
} from '../api/client';
import { useElencoPaginato, type Pagina } from '../hooks/useElencoPaginato';
import { useOrdinamento } from '../hooks/useOrdinamento';
import { useValoreDifferito } from '../hooks/useValoreDifferito';
import TableScroll from '../components/TableScroll';
import Avviso from '../components/Avviso';
import CaricaAltri from '../components/CaricaAltri';
import Etichetta from '../components/Etichetta';
import IntestazioneOrdinabile from '../components/IntestazioneOrdinabile';
import { euro, dataIso, oggiIso } from '../utils/formato';
import Modal from '../components/Modal';
import { config } from '../config';
import { ui } from '../styles/ui';
import { messaggioErrore } from '../utils/errori';

/** Stessa data dell'anno dopo; il 29 febbraio diventa 28 se l'anno non è bisestile. */
function aggiungiAnno(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(y + 1, m - 1, d));
  if (data.getUTCMonth() !== m - 1) data.setUTCDate(0);
  return data.toISOString().slice(0, 10);
}

type Stato = StatoTesseramento;

// Lo stato lo calcola il backend (attivo, in scadenza entro 30 giorni,
// scaduto, mai tesserato): serve lì per filtrare e ordinare a pagine.
const STATI: Record<Stato, { etichetta: string; colore: string; sfondo: string }> = {
  attivo:      { etichetta: 'Attivo',        colore: '#166534', sfondo: '#f0fdf4' },
  in_scadenza: { etichetta: 'In scadenza',   colore: '#92400e', sfondo: '#fffbeb' },
  scaduto:     { etichetta: 'Scaduto',       colore: '#991b1b', sfondo: '#fef2f2' },
  mai:         { etichetta: 'Mai tesserato', colore: '#4b5563', sfondo: '#f3f4f6' },
};

interface Riga {
  socio_id: string;
  socioNome: string;
  ultimo_rinnovo: string;
  scadenza: string;
  rinnovi: number;
  stato: Stato;
}

function rigaDa(t: RigaTesseramento): Riga {
  return {
    socio_id: t.socio_id,
    socioNome: `${t.cognome} ${t.nome}`,
    ultimo_rinnovo: dataIso(t.ultimo_rinnovo),
    scadenza: dataIso(t.scadenza),
    rinnovi: Number(t.rinnovi),
    stato: t.stato,
  };
}

export default function TesseramentiPage() {
  const { token } = useAuth();
  const api = createApiClient(token);
  const oggi = oggiIso();

  const [quota, setQuota]           = useState(0);
  const [error, setError]           = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [filtro, setFiltro]         = useState('');
  const [filtroStato, setFiltroStato] = useState<Stato | ''>('');

  // Rinnovo in corso: la riga e i valori del form.
  const [rinnovo, setRinnovo] = useState<{ riga: Riga; data_rinnovo: string; scadenza: string; importo: string } | null>(null);
  const [erroreRinnovo, setErroreRinnovo] = useState('');
  const [saving, setSaving] = useState(false);

  // Storico aperto: la riga e i rinnovi (null mentre si caricano).
  const [storico, setStorico] = useState<{ riga: Riga; rinnovi: Tesseramento[] | null } | null>(null);

  useEffect(() => {
    api.getImpostazioni()
      .then(imp => setQuota(Number(imp.quota_tesseramento)))
      .catch(e => setError(messaggioErrore(e)));
  }, []);

  // Elenco a pagine: ricerca, filtro per stato e ordinamento li applica il
  // backend. Insieme alla pagina arrivano i conteggi per stato su tutti i soci.
  const filtroCercato = useValoreDifferito(filtro);
  const { sortKey, sortDir, toggleSort, direzione } = useOrdinamento('socioNome');
  const elenco = useElencoPaginato<RigaTesseramento, Pagina<RigaTesseramento> & { conteggi: Record<Stato, number> }>(
    offset => api.getTesseramentiPagina({
      q: filtroCercato || undefined, stato: filtroStato || undefined,
      sort: sortKey, dir: sortDir, limit: DIMENSIONE_PAGINA, offset,
    }),
    [filtroCercato, filtroStato, sortKey, sortDir],
    setError,
  );
  const righe = elenco.righe.map(rigaDa);
  const conteggi = elenco.risposta?.conteggi ?? { attivo: 0, in_scadenza: 0, scaduto: 0, mai: 0 };
  const sociTotali = Object.values(conteggi).reduce((a, b) => a + b, 0);

  /**
   * Il nuovo tesseramento parte dalla scadenza attuale se è ancora futura
   * (rinnovo anticipato: nessun giorno perso), altrimenti da oggi.
   */
  const apriRinnovo = (riga: Riga) => {
    const base = riga.scadenza && riga.scadenza > oggi ? riga.scadenza : oggi;
    setErroreRinnovo('');
    setRinnovo({ riga, data_rinnovo: oggi, scadenza: aggiungiAnno(base), importo: quota.toFixed(2) });
  };

  const confermaRinnovo = async () => {
    if (!rinnovo) return;
    setSaving(true);
    setErroreRinnovo('');
    try {
      await api.rinnovaTesseramento({
        socio_id: rinnovo.riga.socio_id,
        data_rinnovo: rinnovo.data_rinnovo,
        scadenza: rinnovo.scadenza,
        importo: Number(rinnovo.importo),
      });
      setSuccessMsg(`Tesseramento di ${rinnovo.riga.socioNome} rinnovato fino al ${rinnovo.scadenza}`);
      setRinnovo(null);
      elenco.ricarica();
    } catch (e) {
      // Dentro la modale: è lì che si sta guardando, e i valori restano da correggere.
      setErroreRinnovo(messaggioErrore(e));
    } finally {
      setSaving(false);
    }
  };

  const apriStorico = async (riga: Riga) => {
    setStorico({ riga, rinnovi: null });
    try {
      const rinnovi = await api.getStoricoTesseramenti(riga.socio_id);
      setStorico(s => (s?.riga.socio_id === riga.socio_id ? { riga, rinnovi } : s));
    } catch (e) {
      setStorico(null);
      setError(messaggioErrore(e));
    }
  };

  const importoValido = rinnovo !== null && rinnovo.importo !== '' && Number(rinnovo.importo) >= 0;
  const rinnovoCompleto = rinnovo !== null && !!rinnovo.data_rinnovo && !!rinnovo.scadenza && importoValido;

  if (!elenco.caricato && !error) return <div style={styles.loading}>Caricamento...</div>;

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Tesseramenti</h2>
      <p style={styles.hint}>
        Scadenza del tesseramento di ogni socio. Il rinnovo registra la quota, proposta dal valore
        configurato nel pannello Admin ({euro(quota)}): non tocca il voucher{config.moduli.fatturazione && ' e compare in Fatturazione'}.
      </p>
      {error && <Avviso tipo='errore' messaggio={error} onChiudi={() => setError('')} />}
      {successMsg && <Avviso tipo='successo' messaggio={successMsg} onChiudi={() => setSuccessMsg('')} />}

      <div style={styles.filterRow}>
        <input
          style={styles.filterInput}
          placeholder='Cerca per cognome o nome...'
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />
        <select
          style={styles.select}
          value={filtroStato}
          onChange={e => setFiltroStato(e.target.value as Stato | '')}
          aria-label='Filtra per stato'
        >
          <option value=''>Tutti gli stati ({sociTotali})</option>
          {(Object.keys(STATI) as Stato[]).map(s => (
            <option key={s} value={s}>{STATI[s].etichetta} ({conteggi[s]})</option>
          ))}
        </select>
      </div>

      <TableScroll>
        <table style={{ ...styles.table, opacity: elenco.loading ? 0.55 : 1 }} aria-busy={elenco.loading}>
          <thead>
            <tr>
              {([['socioNome', 'Socio'], ['ultimo_rinnovo', 'Ultimo rinnovo'], ['scadenza', 'Scadenza'], ['stato', 'Stato'], ['rinnovi', 'Rinnovi']] as const).map(([key, label]) => (
                <IntestazioneOrdinabile key={key} etichetta={label} direzione={direzione(key)} onOrdina={() => toggleSort(key)} style={{ whiteSpace: 'nowrap' }} />
              ))}
              <th style={styles.th}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(r => (
              <tr key={r.socio_id} style={styles.tr}>
                <td style={styles.td}>{r.socioNome}</td>
                <td style={styles.td}>{r.ultimo_rinnovo || '—'}</td>
                <td style={styles.td}>{r.scadenza || '—'}</td>
                <td style={styles.td}>
                  <Etichetta testo={STATI[r.stato].etichetta} colore={STATI[r.stato].colore} sfondo={STATI[r.stato].sfondo} />
                </td>
                <td style={styles.td}>{r.rinnovi}</td>
                <td style={styles.td}>
                  <button style={styles.btnSmall} onClick={() => apriRinnovo(r)}>Rinnova</button>
                  <button style={styles.btnSmall} onClick={() => apriStorico(r)} disabled={r.rinnovi === 0}>Storico</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {righe.length === 0 && !elenco.loading && (
        <p style={styles.empty}>{filtro || filtroStato ? 'Nessun socio corrisponde ai filtri.' : 'Nessun socio presente.'}</p>
      )}
      <CaricaAltri caricati={righe.length} totale={elenco.totale} inCaricamento={elenco.loadingMore} onCaricaAltri={elenco.caricaAltri} />

      {rinnovo && (
        <Modal
          title={`Rinnova tesseramento - ${rinnovo.riga.socioNome}`}
          onClose={() => setRinnovo(null)}
          footer={
            <>
              <button style={styles.btnSecondary} onClick={() => setRinnovo(null)}>Annulla</button>
              <button style={styles.btn} onClick={confermaRinnovo} disabled={saving || !rinnovoCompleto}>
                {saving ? 'Salvataggio...' : 'Conferma rinnovo'}
              </button>
            </>
          }
        >
          <p style={styles.modalInfo}>
            {rinnovo.riga.scadenza
              ? <>Scadenza attuale: <strong>{rinnovo.riga.scadenza}</strong></>
              : 'Primo tesseramento del socio.'}
          </p>
          {erroreRinnovo && <Avviso tipo='errore' messaggio={erroreRinnovo} onChiudi={() => setErroreRinnovo('')} />}
          <div style={styles.field}>
            <label style={styles.label} htmlFor='data-rinnovo'>Data del rinnovo</label>
            <input id='data-rinnovo' type='date' style={styles.input} value={rinnovo.data_rinnovo}
              onChange={e => setRinnovo({ ...rinnovo, data_rinnovo: e.target.value })} />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor='nuova-scadenza'>Nuova scadenza</label>
            <input id='nuova-scadenza' type='date' style={styles.input} value={rinnovo.scadenza}
              min={rinnovo.riga.scadenza && rinnovo.riga.scadenza > rinnovo.data_rinnovo ? rinnovo.riga.scadenza : rinnovo.data_rinnovo}
              onChange={e => setRinnovo({ ...rinnovo, scadenza: e.target.value })} />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor='quota-rinnovo'>Quota (€)</label>
            <input id='quota-rinnovo' type='number' step='0.01' min='0' style={styles.input} value={rinnovo.importo}
              onChange={e => setRinnovo({ ...rinnovo, importo: e.target.value })} />
            <p style={styles.hintCampo}>
              {config.moduli.fatturazione && 'Registrata in Fatturazione. '}Non viene scalata dal voucher.
            </p>
          </div>
        </Modal>
      )}

      {storico && (
        <Modal
          title={`Storico tesseramento - ${storico.riga.socioNome}`}
          onClose={() => setStorico(null)}
          footer={<button style={styles.btnSecondary} onClick={() => setStorico(null)}>Chiudi</button>}
        >
          {storico.rinnovi === null ? (
            <p>Caricamento...</p>
          ) : (
            <TableScroll>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Rinnovo', 'Scadenza', 'Quota'].map(h => <th key={h} style={styles.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {storico.rinnovi.map(t => (
                    <tr key={t.id} style={styles.tr}>
                      <td style={styles.td}>{dataIso(t.data_rinnovo)}</td>
                      <td style={styles.td}>{dataIso(t.scadenza)}</td>
                      <td style={styles.td}>{euro(t.importo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Modal>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ...ui,
  title: { margin: '0 0 8px', fontSize: 22, fontWeight: 700 },
  hint: { color: '#666', fontSize: 13, margin: '0 0 20px', maxWidth: 760, lineHeight: 1.5 },
  hintCampo: { fontSize: 12, color: '#666', margin: '6px 0 0' },
  filterInput: { flex: 1, minWidth: 220, maxWidth: 360, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', minHeight: 40 },
  modalInfo: { fontSize: 14, color: '#444', margin: '0 0 16px' },
  input: { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', minHeight: 40 },
};
