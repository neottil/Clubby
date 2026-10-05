/**
 * Versione dello schema del database: il numero dell'ultima migrazione
 * applicata (spec 005, V8–V9).
 *
 * Non c'è un numero di versione scritto a parte: il registro `migrazione`,
 * scritto da scripts/migra.sh nella stessa transazione di ciascun file, è già
 * l'elenco dei passi che lo schema ha fatto. I nomi sono ordinabili per regola
 * (backend/src/db/migrations/README.md), quindi l'ultima è la maggiore.
 */

import { query } from '../db/client.js';

/**
 * "003" per 003_ricevute.sql. null se il registro non c'è (database nato dalla
 * baseline e mai migrato), è vuoto, o il database non risponde: chi chiama
 * vuole comunque la versione del backend, ed è proprio quando il database è il
 * problema che serve leggerla.
 */
export async function versioneDatabase(): Promise<string | null> {
  try {
    const { rows } = await query('SELECT nome FROM migrazione ORDER BY nome DESC LIMIT 1');
    const nome = rows[0]?.nome;
    if (typeof nome !== 'string') return null;
    return nome.match(/^\d+/)?.[0] ?? null;
  } catch {
    return null;
  }
}
