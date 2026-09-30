/**
 * Parametri dell'associazione configurabili dall'admin (tabella impostazione).
 */

import { query } from '../db/client.js';
import { BadRequestError } from '../middleware/auth.js';

export interface Impostazioni {
  /** Quota proposta a ogni rinnovo del tesseramento. */
  quota_tesseramento: number;
  /**
   * Percentuale di valore aggiunto a una ricarica, usata solo dove
   * RECHARGE_MODE vale "percentage" (vedi util/ricariche.ts). 0 = nessun extra.
   */
  percentuale_ricarica: number;
  /**
   * Testo multiriga stampato in cima alle ricevute: denominazione, indirizzo,
   * codice fiscale, numero di registro.
   *
   * Sta qui e non in un file del repository perché cambia senza un rilascio —
   * un trasloco o un numero di registro nuovo si correggono dalla pagina
   * Impostazioni. Il **logo** invece arriva da `branding/` nell'immagine: è un
   * file versionato, e una seconda copia nel database finirebbe per divergere
   * da quella mostrata in testa a ogni pagina.
   */
  ricevuta_intestazione: string;
  /** Piè di pagina delle ricevute: tipicamente la clausola sul bollo. */
  ricevuta_pie_pagina: string;
}

/** Quanto può essere lungo un testo libero delle ricevute. */
const MAX_TESTO = 2000;

export async function leggiImpostazioni(): Promise<Impostazioni> {
  const result = await query(`SELECT chiave, valore FROM impostazione`, {});
  const valori = new Map(result.rows.map(r => [r.chiave as string, r.valore as string]));
  return {
    quota_tesseramento: Number(valori.get('quota_tesseramento') ?? 0),
    percentuale_ricarica: Number(valori.get('percentuale_ricarica') ?? 0),
    ricevuta_intestazione: valori.get('ricevuta_intestazione') ?? '',
    ricevuta_pie_pagina: valori.get('ricevuta_pie_pagina') ?? '',
  };
}

export async function aggiornaImpostazioni(input: Partial<Impostazioni>): Promise<Impostazioni> {
  if (input.quota_tesseramento !== undefined) {
    const quota = Number(input.quota_tesseramento);
    if (input.quota_tesseramento === null || !Number.isFinite(quota) || quota < 0) {
      throw new BadRequestError('quota_tesseramento deve essere un importo >= 0');
    }
    await query(
      `INSERT INTO impostazione (chiave, valore) VALUES ('quota_tesseramento', :valore)
       ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_at = NOW()`,
      { valore: quota.toFixed(2) }
    );
  }

  if (input.percentuale_ricarica !== undefined) {
    const percentuale = Number(input.percentuale_ricarica);
    // Limite superiore volutamente largo ma presente: oltre il 100% il club
    // regalerebbe più di quanto incassa, e quasi sempre è uno zero di troppo.
    if (input.percentuale_ricarica === null || !Number.isFinite(percentuale) || percentuale < 0 || percentuale > 100) {
      throw new BadRequestError('percentuale_ricarica deve essere un numero fra 0 e 100');
    }
    await query(
      `INSERT INTO impostazione (chiave, valore) VALUES ('percentuale_ricarica', :valore)
       ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_at = NOW()`,
      { valore: String(percentuale) }
    );
  }

  // I due testi delle ricevute: stesso schema delle chiavi numeriche, ma
  // l'unico vincolo è la lunghezza. Il contenuto lo decide il club, e non c'è
  // niente da validare in una denominazione o in un riferimento di legge.
  for (const chiave of ['ricevuta_intestazione', 'ricevuta_pie_pagina'] as const) {
    const valore = input[chiave];
    if (valore === undefined) continue;
    if (typeof valore !== 'string') {
      throw new BadRequestError(`${chiave} deve essere un testo`);
    }
    if (valore.length > MAX_TESTO) {
      throw new BadRequestError(`${chiave} non può superare ${MAX_TESTO} caratteri`);
    }
    await query(
      `INSERT INTO impostazione (chiave, valore) VALUES (:chiave, :valore)
       ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_at = NOW()`,
      { chiave, valore }
    );
  }

  return leggiImpostazioni();
}
