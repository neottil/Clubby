/**
 * Limitatore di tentativi per gli endpoint sensibili (login, registrazione).
 *
 * Contatore in memoria, non in Redis né a database: una singola replica
 * dell'authorizer è il caso normale per un'associazione, e un contatore che
 * scrive a ogni tentativo trasformerebbe un attacco a dizionario in un
 * attacco al database. Il limite di conseguenza vale per replica — se un
 * giorno le repliche diventassero più d'una, questo va sostituito con un
 * contatore condiviso.
 */

import { TooManyRequestsError } from './errors.js';

interface Finestra {
  tentativi: number;
  scadenza: number;
}

const finestre = new Map<string, Finestra>();

const MAX_TENTATIVI = 10;
const DURATA_FINESTRA_MS = 5 * 60 * 1000;

/**
 * Registra un tentativo per la chiave data (tipicamente IP + endpoint) e
 * lancia se il limite è superato.
 */
export function consumaTentativo(chiave: string): void {
  const ora = Date.now();
  const finestra = finestre.get(chiave);

  if (!finestra || finestra.scadenza < ora) {
    finestre.set(chiave, { tentativi: 1, scadenza: ora + DURATA_FINESTRA_MS });
    return;
  }

  finestra.tentativi += 1;
  if (finestra.tentativi > MAX_TENTATIVI) {
    const fraQuanto = Math.ceil((finestra.scadenza - ora) / 1000);
    throw new TooManyRequestsError(`Troppi tentativi. Riprova fra ${fraQuanto} secondi.`);
  }
}

/** Azzera il contatore dopo un'operazione riuscita. */
export function azzeraTentativi(chiave: string): void {
  finestre.delete(chiave);
}

// Pulizia periodica: senza, la mappa crescerebbe con una voce per ogni IP
// visto, per sempre. unref() perché questo timer non deve tenere vivo il
// processo impedendogli di uscire.
setInterval(() => {
  const ora = Date.now();
  for (const [chiave, finestra] of finestre) {
    if (finestra.scadenza < ora) finestre.delete(chiave);
  }
}, DURATA_FINESTRA_MS).unref();
