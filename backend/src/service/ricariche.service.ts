/**
 * Tagli di ricarica preconfigurati e calcolo di quanto accreditare.
 *
 * Il punto di tutto il file è tenere separate due quantità che prima
 * coincidevano:
 *   importoPagato   quanto il socio ha pagato: è ciò che finisce nelle ricevute
 *   valore          quanto entra sul voucher: pagato + eventuale extra
 *
 * Il valore lo decide il server, a partire dalla modalità configurata
 * (RECHARGE_MODE) e dalla configurazione salvata: il client dice solo quanto si
 * paga. L'unica eccezione, dichiarata, è la voce "Altro importo…" della
 * modalità a tagli (spec 013), in cui l'admin indica anche il valore: la rotta
 * è riservata a lui, che potrebbe comunque già creare un taglio qualsiasi.
 */

import { query } from '../db/client.js';
import { BadRequestError, NotFoundError } from '../middleware/auth.js';
import { leggiImpostazioni } from './impostazioni.service.js';
import { modalitaRicarica, arrotondaImporto } from '../util/ricariche.js';

export interface TaglioRicarica {
  id: string;
  /** Quanto paga il socio: è l'etichetta della voce nella select. */
  importo: number;
  /** Quanto viene accreditato sul voucher. */
  valore: number;
  created_at: string;
}

/** Tagli configurati, dal più economico: è l'ordine in cui compaiono nella select. */
export async function listTagli(): Promise<TaglioRicarica[]> {
  const result = await query(
    `SELECT id, importo, valore, created_at FROM ricarica_taglio ORDER BY importo ASC`,
    {}
  );
  return result.rows as unknown as TaglioRicarica[];
}

function importoValido(valore: unknown, campo: string): number {
  const numero = Number(valore);
  if (valore === undefined || valore === null || valore === '' || !Number.isFinite(numero) || numero <= 0) {
    throw new BadRequestError(`${campo} deve essere un importo positivo`);
  }
  return arrotondaImporto(numero);
}

export async function creaTaglio(input: { importo: unknown; valore: unknown }): Promise<TaglioRicarica> {
  const importo = importoValido(input.importo, 'importo');
  const valore  = importoValido(input.valore, 'valore');

  // Un taglio che accredita meno di quanto costa non è una configurazione
  // plausibile: quasi sempre è importo e valore invertiti nel form.
  if (valore < importo) {
    throw new BadRequestError('Il valore accreditato non può essere inferiore all\'importo pagato');
  }

  const esistente = await query(
    `SELECT id FROM ricarica_taglio WHERE importo = :importo`,
    { importo }
  );
  if (esistente.rows.length > 0) {
    throw new BadRequestError(`Esiste già un taglio da ${importo.toFixed(2)}`);
  }

  const result = await query(
    `INSERT INTO ricarica_taglio (importo, valore) VALUES (:importo, :valore)
     RETURNING id, importo, valore, created_at`,
    { importo, valore }
  );
  return result.rows[0] as unknown as TaglioRicarica;
}

export async function eliminaTaglio(id: string): Promise<void> {
  const result = await query(`DELETE FROM ricarica_taglio WHERE id = :id RETURNING id`, { id });
  if (result.rows.length === 0) {
    throw new NotFoundError(`Taglio con id ${id} non trovato`);
  }
}

/** Quanto è stato pagato e quanto va accreditato, per una ricarica richiesta. */
export interface EsitoRicarica {
  /** Va sul voucher (colonna importo del movimento). */
  valore: number;
  /** Va nelle ricevute (colonna importo_pagato), null se uguale al valore. */
  importoPagato: number | null;
}

/**
 * Traduce l'importo richiesto dall'admin nelle due quantità del movimento,
 * secondo la modalità configurata per questo ambiente.
 *
 * In modalità `map` ci sono due strade (spec 013):
 *   - solo `importo`: deve corrispondere esattamente a un taglio, e il valore
 *     accreditato si legge da lì. Un importo fuori taglio senza valore resta
 *     un errore: accreditarlo tale e quale sarebbe una scelta che nessuno ha
 *     fatto;
 *   - `importo` e `valore`: è la voce "Altro importo…" del form, e l'admin
 *     dichiara entrambi. Vale il valore indicato anche se l'importo coincide
 *     con un taglio, perché è ciò che l'admin ha scritto e visto a schermo.
 *
 * Nelle altre modalità il valore lo decide la configurazione, e un `valore`
 * nel corpo è rifiutato invece che ignorato: chi lo manda crederebbe di
 * averlo impostato.
 */
export async function calcolaRicarica(
  importoRichiesto: unknown,
  valoreRichiesto?: unknown
): Promise<EsitoRicarica> {
  const pagato = importoValido(importoRichiesto, 'importo');
  const modalita = modalitaRicarica();

  if (valoreRichiesto !== undefined && valoreRichiesto !== null) {
    if (modalita !== 'map') {
      throw new BadRequestError('Il valore accreditato si indica solo nella modalità a tagli');
    }
    const valore = importoValido(valoreRichiesto, 'valore');
    if (valore < pagato) {
      throw new BadRequestError('Il valore accreditato non può essere inferiore all\'importo pagato');
    }
    return { valore, importoPagato: valore === pagato ? null : pagato };
  }

  switch (modalita) {
    case 'free':
      // Pagato e accreditato coincidono: importo_pagato resta NULL, come per
      // tutte le ricariche registrate prima che i moduli esistessero.
      return { valore: pagato, importoPagato: null };

    case 'percentage': {
      const { percentuale_ricarica: percentuale } = await leggiImpostazioni();
      if (!(percentuale > 0)) {
        // Percentuale non ancora configurata: la ricarica vale quanto è stata
        // pagata, invece di fallire. L'admin la imposta dal pannello.
        return { valore: pagato, importoPagato: null };
      }
      const valore = arrotondaImporto(pagato * (1 + percentuale / 100));
      return { valore, importoPagato: valore === pagato ? null : pagato };
    }

    case 'map': {
      const tagli = await listTagli();
      const taglio = tagli.find(t => Number(t.importo) === pagato);
      if (!taglio) {
        const disponibili = tagli.length > 0
          ? `i tagli disponibili sono ${tagli.map(t => Number(t.importo).toFixed(2)).join(', ')}`
          : 'non ci sono tagli configurati';
        throw new BadRequestError(
          `Importo non previsto (${disponibili}): scegli un taglio o indica il valore da accreditare`
        );
      }
      const valore = arrotondaImporto(Number(taglio.valore));
      return { valore, importoPagato: valore === pagato ? null : pagato };
    }
  }
}
