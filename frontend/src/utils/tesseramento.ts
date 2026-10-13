import type { StatoTesseramento } from '../api/client';

/**
 * Etichetta e colori di ogni stato del tesseramento. Lo stato lo calcola il
 * backend (attivo, in scadenza entro 30 giorni, scaduto, mai tesserato); qui
 * c'è solo come mostrarlo, in un posto solo: l'admin in Tesseramenti e il
 * socio nella card La tua tessera devono vedere la stessa cosa.
 */
export const STATI_TESSERAMENTO: Record<StatoTesseramento, { etichetta: string; colore: string; sfondo: string }> = {
  attivo:      { etichetta: 'Attivo',        colore: '#166534', sfondo: '#f0fdf4' },
  in_scadenza: { etichetta: 'In scadenza',   colore: '#92400e', sfondo: '#fffbeb' },
  scaduto:     { etichetta: 'Scaduto',       colore: '#991b1b', sfondo: '#fef2f2' },
  mai:         { etichetta: 'Mai tesserato', colore: '#4b5563', sfondo: '#f3f4f6' },
};

/** Lunghezza massima del numero di tessera, come la colonna del database. */
export const LUNGHEZZA_NUMERO_TESSERA = 30;
