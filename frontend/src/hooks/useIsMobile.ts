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

/**
 * Larghezza oltre la quale due riquadri di un form stanno affiancati invece
 * che uno sotto l'altro (form dell'incontro di gruppo, spec 010). Più larga di
 * MOBILE_BREAKPOINT di proposito: fra 640 e 768 px due colonne ci starebbero,
 * ma con campi troppo stretti per scriverci.
 */
export const MD_BREAKPOINT = 768;

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
  return useMediaQuery(QUERY);
}

/** true quando la finestra è più larga di MD_BREAKPOINT (stesso meccanismo di useIsMobile). */
export function useSopraMd(): boolean {
  return useMediaQuery(`(min-width: ${MD_BREAKPOINT + 1}px)`);
}

function useMediaQuery(query: string): boolean {
  const [corrisponde, setCorrisponde] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setCorrisponde(mql.matches);
    mql.addEventListener('change', sync);
    // Riallinea lo stato: fra il primo render e questo effetto la finestra può
    // essere già cambiata (es. rotazione dello schermo durante il caricamento).
    sync();
    return () => mql.removeEventListener('change', sync);
  }, [query]);

  return corrisponde;
}
