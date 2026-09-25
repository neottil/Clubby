/**
 * Tagli di ricarica preconfigurati e calcolo di quanto accreditare.
 *
 * Il punto di tutto il file è tenere separate due quantità che prima
 * coincidevano:
 *   importoPagato   quanto il socio ha pagato: è ciò che finisce in Fatturazione
 *   valore          quanto entra sul voucher: pagato + eventuale extra
 *
 * Il valore lo decide SEMPRE il server, a partire dalla modalità configurata
 * (RECHARGE_MODE) e dalla configurazione salvata: il client dice solo quanto si
 * paga. Lasciarglielo mandare significherebbe permettere a chi conosce l'API di
 * accreditarsi il credito che preferisce.
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
  /** Va in Fatturazione (colonna importo_pagato), null se uguale al valore. */
  importoPagato: number | null;
}

/**
 * Traduce l'importo richiesto dall'admin nelle due quantità del movimento,
 * secondo la modalità configurata per questo ambiente.
 *
 * In modalità `map` l'importo deve corrispondere esattamente a un taglio
 * configurato: il valore accreditato si legge da lì. Accettare un importo
 * qualsiasi, magari accreditandolo tale e quale, aggirerebbe in silenzio la
 * configurazione del club.
 */
export async function calcolaRicarica(importoRichiesto: unknown): Promise<EsitoRicarica> {
  const pagato = importoValido(importoRichiesto, 'importo');

  switch (modalitaRicarica()) {
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
      if (tagli.length === 0) {
        throw new BadRequestError(
          'Nessun taglio di ricarica configurato: impostali nel pannello Admin, card Ricariche'
        );
      }
      const taglio = tagli.find(t => Number(t.importo) === pagato);
      if (!taglio) {
        const disponibili = tagli.map(t => Number(t.importo).toFixed(2)).join(', ');
        throw new BadRequestError(
          `Importo non previsto: le ricariche disponibili sono ${disponibili}`
        );
      }
      const valore = arrotondaImporto(Number(taglio.valore));
      return { valore, importoPagato: valore === pagato ? null : pagato };
    }
  }
}
