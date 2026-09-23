import { useState } from 'react';

export type Direzione = 'asc' | 'desc';

/**
 * Ordinamento di un elenco paginato: solo lo stato (colonna e direzione), da
 * passare al backend. Non ordina nulla in locale, perché con i dati a pagine
 * riordinare l'array caricato ordinerebbe solo la parte visibile. Per gli
 * elenchi caricati per intero c'è useTableSort.
 *
 * `direzione(chiave)` è nella forma attesa da IntestazioneOrdinabile.
 */
export function useOrdinamento(chiaveIniziale: string, direzioneIniziale: Direzione = 'asc') {
  const [sortKey, setSortKey] = useState(chiaveIniziale);
  const [sortDir, setSortDir] = useState<Direzione>(direzioneIniziale);

  const toggleSort = (chiave: string) => {
    if (sortKey === chiave) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(chiave); setSortDir('asc'); }
  };
  const direzione = (chiave: string) => (sortKey === chiave ? sortDir : null);

  return { sortKey, sortDir, toggleSort, direzione };
}
