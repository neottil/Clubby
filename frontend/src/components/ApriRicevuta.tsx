import { useState, type CSSProperties } from 'react';
import type { createApiClient } from '../api/client';
import { messaggioErrore } from '../utils/errori';
import { codiceRicevuta, nomeFileRicevuta, scaricaBlob } from '../utils/ricevuta';

interface ApriRicevutaProps {
  api: ReturnType<typeof createApiClient>;
  /** Null quando la riga non è compresa in nessuna ricevuta: non si rende niente. */
  documentoId: string | null;
  /** Anno e numero: il codice mostrato e il nome del file. */
  anno: number | null;
  numero: number | null;
}

/**
 * Il codice di una ricevuta, cliccabile per scaricarne il PDF.
 *
 * Sta fra i componenti e non dentro una pagina perché lo usano in tre: le voci
 * e le ricevute emesse in Ricevute, e i movimenti del socio in Voucher. Il
 * nome del file viene da `utils/ricevuta`, così lo stesso documento arriva sul
 * disco con lo stesso nome da qualunque tabella lo si scarichi.
 *
 * Il codice al posto di un'icona perché dice *quale* ricevuta: con l'icona,
 * per saperlo bisognava scaricarla.
 */
export default function ApriRicevuta({ api, documentoId, anno, numero }: ApriRicevutaProps) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');

  // anno e numero mancano solo sulle voci marcate come emesse prima della 003,
  // che un documento non ce l'hanno: senza codice da mostrare non si rende
  // niente, come per le righe senza ricevuta.
  if (!documentoId || anno === null || numero === null) return null;

  const codice = codiceRicevuta(anno, numero);

  const apri = async () => {
    setInCorso(true);
    setErrore('');
    try {
      scaricaBlob(await api.getDocumentoPdf(documentoId), nomeFileRicevuta(anno, numero));
    } catch (e) {
      // L'errore resta sul pulsante, come title: una riga di tabella non è il
      // posto per un avviso a tutta larghezza, e il caso è raro.
      setErrore(messaggioErrore(e, 'Ricevuta non disponibile'));
    } finally {
      setInCorso(false);
    }
  };

  return (
    <button
      type='button'
      onClick={apri}
      disabled={inCorso}
      style={{ ...styles.codice, ...(errore ? styles.codiceErrore : {}) }}
      title={errore || `Scarica la ricevuta ${codice}`}
      aria-label={errore || `Scarica la ricevuta ${codice}`}
    >
      {inCorso ? '…' : errore ? `⚠ ${codice}` : codice}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  codice: {
    background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0',
    minHeight: 32, font: 'inherit', fontSize: 13, whiteSpace: 'nowrap',
    color: '#1d4ed8', textDecoration: 'underline',
  },
  codiceErrore: { cursor: 'help', color: '#92400e', textDecoration: 'none' },
};
