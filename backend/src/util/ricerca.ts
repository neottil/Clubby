/**
 * Ricerca testuale degli elenchi, la stessa per tutti (incontri, soci,
 * voucher, tesseramenti; il frontend fa lo stesso nei menu di scelta).
 *
 * Parola per parola: ogni parola cercata deve comparire in almeno una delle
 * colonne, in qualunque ordine. Cercare la frase intera in una colonna sola
 * non troverebbe "istruttore du" in Istruttore Due, dove le due parole stanno
 * in colonne diverse.
 */

/**
 * Condizioni SQL (da unire in AND) per la ricerca `q` sulle colonne date, con
 * i relativi parametri aggiunti a `params`. Nessuna condizione se `q` è vuota.
 *
 * `colonne` sono espressioni SQL fisse scritte dal chiamante, mai testo del
 * client: finiscono concatenate nella query.
 */
export function condizioniRicerca(
  q: string | undefined,
  colonne: string[],
  params: Record<string, unknown>,
): string[] {
  const parole = (q ?? '').trim().split(/\s+/).filter(Boolean);
  return parole.map((parola, i) => {
    const nome = `ricerca${i}`;
    params[nome] = `%${parola}%`;
    return `(${colonne.map(c => `${c} ILIKE :${nome}`).join(' OR ')})`;
  });
}
