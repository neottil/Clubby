/**
 * Formati di visualizzazione condivisi: importi e date di calendario.
 */

/**
 * Importo in euro con due decimali, es. "€ 12.50". Accetta anche i DECIMAL che
 * Postgres serializza come stringa.
 */
export function euro(valore: number | string | null | undefined): string {
  return `€ ${Number(valore ?? 0).toFixed(2)}`;
}

/**
 * La parte "YYYY-MM-DD" di una data, che dal backend può arrivare anche come
 * ISO completa; stringa vuota se assente.
 */
export function dataIso(valore: string | null | undefined): string {
  return valore ? String(valore).split('T')[0] : '';
}

/**
 * Oggi come data di calendario locale, "YYYY-MM-DD". Non toISOString(), che è
 * in UTC: fra mezzanotte e le due di notte in Italia darebbe il giorno prima.
 */
export function oggiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-07-14" → "14-07-2026". */
export function dataItaliana(valore: string | null | undefined): string {
  const iso = dataIso(valore);
  if (!iso) return '';
  const [anno, mese, giorno] = iso.split('-');
  return `${giorno}-${mese}-${anno}`;
}
