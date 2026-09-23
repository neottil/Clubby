/**
 * Parametri dell'associazione configurabili dall'admin (tabella impostazione).
 */

import { query } from '../db/client.js';
import { BadRequestError } from '../middleware/auth.js';

export interface Impostazioni {
  /** Quota proposta a ogni rinnovo del tesseramento. */
  quota_tesseramento: number;
}

export async function leggiImpostazioni(): Promise<Impostazioni> {
  const result = await query(`SELECT chiave, valore FROM impostazione`, {});
  const valori = new Map(result.rows.map(r => [r.chiave as string, r.valore as string]));
  return {
    quota_tesseramento: Number(valori.get('quota_tesseramento') ?? 0),
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
  return leggiImpostazioni();
}
