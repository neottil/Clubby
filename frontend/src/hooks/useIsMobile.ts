import { useEffect, useState } from 'react';

/**
 * Larghezza sotto la quale l'interfaccia è considerata "mobile".
 *
 * Definita qui e non duplicata nei singoli file: la usano sia le media query
 * in CSS (Layout) sia i calcoli in JavaScript (useIsMobile), e se i due valori
 * divergessero il menu passerebbe a desktop a una larghezza diversa da quella
 * a cui le tabelle si compattano.
 */
export const MOBILE_BREAKPOINT = 640;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;

/**
 * true quando la finestra è sotto MOBILE_BREAKPOINT, aggiornato al ridimensionamento.
 *
 * Serve dove il valore non è esprimibile in CSS: gli stili di questo progetto
 * sono oggetti inline React, che non supportano le media query. Dove invece il
 * CSS basta (vedi il <style> in Layout) è preferibile la media query, che non
 * richiede un render aggiuntivo.
 *
 * Ascolta l'evento "change" di matchMedia invece di "resize" della finestra:
 * scatta solo quando si attraversa davvero la soglia, non a ogni pixel.
 *
 * NOTA per chi prova la pagina: l'emulazione mobile degli strumenti di
 * sviluppo cambia le dimensioni del viewport in modo silenzioso, senza
 * emettere né "change" né "resize". Il layout sembra quindi non reagire finché
 * non si ricarica la pagina. Ridimensionando davvero la finestra del browser
 * l'aggiornamento è immediato.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const sync = () => setIsMobile(mql.matches);
    mql.addEventListener('change', sync);
    // Riallinea lo stato: fra il primo render e questo effetto la finestra può
    // essere già cambiata (es. rotazione dello schermo durante il caricamento).
    sync();
    return () => mql.removeEventListener('change', sync);
  }, []);

  return isMobile;
}
