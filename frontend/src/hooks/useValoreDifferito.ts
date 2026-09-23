import { useEffect, useState } from 'react';

/**
 * Il valore, aggiornato solo dopo una pausa di `ms` millisecondi. Per le
 * ricerche servite dal backend: senza, ogni tasto premuto farebbe una
 * richiesta.
 */
export function useValoreDifferito<T>(valore: T, ms = 300): T {
  const [differito, setDifferito] = useState(valore);
  useEffect(() => {
    const t = setTimeout(() => setDifferito(valore), ms);
    return () => clearTimeout(t);
  }, [valore, ms]);
  return differito;
}
