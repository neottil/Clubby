/**
 * Paginazione degli elenchi (incontri, movimenti, ricevute): lettura dei
 * parametri dalla query string e limiti comuni.
 */

/** Righe per pagina quando il client non lo indica. */
export const LIMITE_PREDEFINITO = 25;

// Tetto massimo per una singola pagina: senza, un client potrebbe chiedere
// limit=1000000 e riportare il problema che la paginazione serve a evitare.
export const LIMITE_MASSIMO = 200;

/** Intero non negativo da query string, o undefined se assente/non valido. */
export function intParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * True se il client chiede un elenco a pagine. Soci, voucher, tesseramenti e
 * account restano disponibili anche per intero, senza limit/offset: servono
 * completi ai menu di scelta e ai conteggi, che non sono tabelle da scorrere.
 */
export function paginazioneRichiesta(qs: Record<string, string> | undefined): boolean {
  return qs?.limit !== undefined || qs?.offset !== undefined;
}

/** Direzione di ordinamento dalla query string: solo 'asc' o 'desc'. */
export function direzione(valore: string | undefined, predefinita: 'asc' | 'desc' = 'asc'): 'ASC' | 'DESC' {
  const d = valore === 'asc' || valore === 'desc' ? valore : predefinita;
  return d === 'asc' ? 'ASC' : 'DESC';
}

/** limit e offset richiesti, riportati nei limiti ammessi. */
export function limiteEOffset(opzioni: { limit?: number; offset?: number }): { limit: number; offset: number } {
  return {
    limit: Math.min(Math.max(1, opzioni.limit ?? LIMITE_PREDEFINITO), LIMITE_MASSIMO),
    offset: Math.max(0, opzioni.offset ?? 0),
  };
}
