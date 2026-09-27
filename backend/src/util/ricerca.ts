/**
 * Ricerca testuale degli elenchi, la stessa per tutti (incontri, soci,
 * voucher, tesseramenti; il frontend fa lo stesso nei menu di scelta, vedi
 * frontend/src/utils/ricerca.ts — le due implementazioni vanno tenute
 * allineate, altrimenti la stessa query dà risultati diversi nell'elenco e
 * nel menu).
 *
 * Parola per parola: ogni parola cercata deve comparire in almeno una delle
 * colonne, in qualunque ordine. Cercare la frase intera in una colonna sola
 * non troverebbe "istruttore du" in Istruttore Due, dove le due parole stanno
 * in colonne diverse.
 *
 * Ogni parola si confronta a INIZIO PAROLA, non in mezzo. La differenza si
 * vede negli incontri, che cercano anche sul nome dell'attività: con il
 * confronto per sottostringa "socio du" restituiva anche gli incontri di
 * Socio Uno, perché "du" compare dentro "E-du-cazione". Il prezzo è che non
 * si cerca più un frammento interno ("cazione" non trova Educazione), cosa
 * che nessuno fa digitando il nome di una persona.
 */

/**
 * Caratteri che nelle espressioni regolari di Postgres hanno un significato
 * proprio: nel testo cercato sono da intendere alla lettera, altrimenti una
 * parentesi digitata per caso farebbe fallire l'intera query.
 */
const METACARATTERI = /[\\^$.|?*+()[\]{}]/g;

/**
 * Condizioni SQL (da unire in AND) per la ricerca `q` sulle colonne date, con
 * i relativi parametri aggiunti a `params`. Nessuna condizione se `q` è vuota.
 *
 * `colonne` sono espressioni SQL fisse scritte dal chiamante, mai testo del
 * client: finiscono concatenate nella query. Il testo cercato viaggia invece
 * sempre come parametro.
 */
export function condizioniRicerca(
  q: string | undefined,
  colonne: string[],
  params: Record<string, unknown>,
): string[] {
  const parole = (q ?? '').trim().split(/\s+/).filter(Boolean);
  return parole.map((parola, i) => {
    const nome = `ricerca${i}`;
    params[nome] = schemaRicerca(parola);
    return `(${colonne.map(c => `${c} ~* :${nome}`).join(' OR ')})`;
  });
}

/**
 * L'espressione regolare per una parola cercata.
 *
 * `(?<![[:alnum:]])` è il vincolo di inizio parola: la posizione trovata non
 * deve essere preceduta da una lettera o una cifra. Si usa questo invece di
 * `\m` perché `\m` considera anche l'underscore parte della parola, mentre
 * qui è un separatore come gli altri.
 *
 * Il vincolo si applica solo alle parole che cominciano con una lettera o una
 * cifra: per un frammento che inizia con un separatore ("_test") l'idea di
 * "inizio parola" non vuol dire niente, e imporla lo renderebbe introvabile.
 */
function schemaRicerca(parola: string): string {
  const schema = parola.replace(METACARATTERI, '\\$&');
  return /^[\p{L}\p{N}]/u.test(parola) ? `(?<![[:alnum:]])${schema}` : schema;
}
