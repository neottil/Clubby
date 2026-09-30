/**
 * Numerazione progressiva dei documenti, azzerata a ogni anno.
 *
 * Il numero si assegna **alla conferma**, dentro la transazione che scrive il
 * documento — mai all'anteprima. È la scelta che fa sparire da sola la
 * questione delle bozze: senza numero prenotato non ci sono documenti a metà
 * da raccogliere.
 */

import type { QueryFn } from '../../db/client.js';

/**
 * Il prossimo numero per l'anno indicato, riservato per questa transazione.
 *
 * Una sola istruzione atomica, che prende il lock sulla riga dell'anno. Due
 * admin che confermano nello stesso istante non ricevono entrambi lo stesso
 * numero: il secondo attende i millisecondi che serve al primo e riceve il
 * successivo — **nessuna delle due emissioni fallisce**. E se la transazione
 * va in rollback il numero torna disponibile, invece di lasciare un buco come
 * farebbe una SEQUENCE.
 *
 * Va chiamata con la `query` della transazione, non con quella globale: fuori
 * da una transazione il lock si rilascerebbe subito e la garanzia cadrebbe.
 */
export async function prossimoNumero(anno: number, q: QueryFn): Promise<number> {
  const result = await q(
    `INSERT INTO documento_numerazione (anno, ultimo)
     VALUES (:anno, 1)
     ON CONFLICT (anno) DO UPDATE
       SET ultimo = documento_numerazione.ultimo + 1, updated_at = NOW()
     RETURNING ultimo`,
    { anno }
  );
  return Number(result.rows[0].ultimo);
}

/**
 * Il numero che verrebbe assegnato adesso, senza riservarlo.
 *
 * Serve **solo all'anteprima**, che mostra un numero provvisorio: fra
 * l'anteprima e la conferma un altro admin può emettere, e il documento
 * definitivo prendere il numero dopo. Per questo il PDF viene rigenerato alla
 * conferma invece di conservare quello dell'anteprima.
 */
export async function numeroProvvisorio(anno: number, q: QueryFn): Promise<number> {
  // MAX su una chiave primaria: la riga è al più una. L'aggregato restituisce
  // comunque una riga anche quando l'anno non esiste ancora, quindi COALESCE
  // basta a coprire il primo documento dell'anno. Niente "::INTEGER": i
  // parametri con nome sono sostituiti da una regex su `:parola`, che
  // scambierebbe il cast per un parametro (vedi db/client.ts).
  const result = await q(
    `SELECT COALESCE(MAX(ultimo), 0) + 1 AS prossimo
       FROM documento_numerazione WHERE anno = :anno`,
    { anno }
  );
  return Number(result.rows[0].prossimo);
}
