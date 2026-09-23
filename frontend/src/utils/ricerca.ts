/**
 * Ricerca testuale degli elenchi, la stessa ovunque (soci, voucher,
 * tesseramenti, menu di scelta; il backend fa lo stesso per gli incontri).
 *
 * Parola per parola: ogni parola cercata deve comparire da qualche parte nel
 * testo, in qualunque ordine. Cercare la frase intera fallirebbe su "istruttore
 * du" contro "Due Istruttore", perché l'elenco mostra cognome e nome in un
 * ordine e chi cerca li scrive spesso nell'altro.
 */
export function corrispondeRicerca(testo: string, ricerca: string): boolean {
  const parole = ricerca.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parole.length === 0) return true;
  const dove = testo.toLowerCase();
  return parole.every(p => dove.includes(p));
}
