/**
 * Ricerca testuale degli elenchi, la stessa ovunque (soci, voucher,
 * tesseramenti, menu di scelta; il backend fa lo stesso per gli incontri, in
 * backend/src/util/ricerca.ts — le due implementazioni vanno tenute
 * allineate, altrimenti la stessa query dà risultati diversi nell'elenco e
 * nel menu).
 *
 * Parola per parola: ogni parola cercata deve comparire nel testo, in
 * qualunque ordine. Cercare la frase intera fallirebbe su "istruttore du"
 * contro "Due Istruttore", perché l'elenco mostra cognome e nome in un ordine
 * e chi cerca li scrive spesso nell'altro.
 *
 * Ogni parola si confronta a INIZIO PAROLA, non in mezzo: "du" trova "Due" ma
 * non "Educazione". Il prezzo è che non si cerca più un frammento interno,
 * cosa che nessuno fa digitando il nome di una persona.
 */

/** Caratteri con un significato proprio in un'espressione regolare. */
const METACARATTERI = /[\\^$.|?*+()[\]{}]/g;

export function corrispondeRicerca(testo: string, ricerca: string): boolean {
  const parole = ricerca.trim().split(/\s+/).filter(Boolean);
  if (parole.length === 0) return true;
  return parole.every(parola => espressione(parola).test(testo));
}

/**
 * L'espressione regolare per una parola cercata.
 *
 * Il vincolo di inizio parola è "non preceduto da lettera o cifra", che tratta
 * l'underscore come separatore, ed è lo stesso confine usato dal backend. Non
 * si applica a un frammento che inizia con un separatore ("_test"), per cui
 * "inizio parola" non vorrebbe dire niente.
 */
function espressione(parola: string): RegExp {
  const schema = parola.replace(METACARATTERI, '\\$&');
  const inizioParola = /^[\p{L}\p{N}]/u.test(parola);
  return new RegExp(inizioParola ? `(?<![\\p{L}\\p{N}])${schema}` : schema, 'iu');
}
