/**
 * Moduli opzionali dell'applicazione.
 *
 * Tesseramento e Fatturazione non servono a tutti i club: chi non li usa non
 * deve vederne né le pagine né le API. Si attivano per ambiente, con una
 * variabile ciascuno.
 *
 *   ENABLE_MODULE_TESSERAMENTO   /api/tesseramenti, quota nel pannello Admin
 *   ENABLE_MODULE_FATTURAZIONE   /api/fatturazione
 *
 * Attivi SOLO con il valore esatto "true": una variabile mancante, vuota o
 * scritta male lascia il modulo spento. È la scelta prudente per una
 * funzionalità che un club potrebbe non aver acquistato — il contrario
 * l'avrebbe accesa per distrazione.
 *
 * Lo schema del database resta completo in ogni caso: un modulo si accende e
 * si spegne senza migrazioni, e riaccendendolo si ritrova tutto lo storico.
 *
 * Il frontend nasconde le stesse sezioni leggendo i corrispondenti flag da
 * /config.json (vedi frontend/src/config.ts): quello è per non mostrare voci
 * di menu inutili, questo è il controllo vero.
 */

export type Modulo = 'tesseramento' | 'fatturazione';

const VARIABILE: Record<Modulo, string> = {
  tesseramento: 'ENABLE_MODULE_TESSERAMENTO',
  fatturazione: 'ENABLE_MODULE_FATTURAZIONE',
};

/**
 * Letto a ogni chiamata e non una volta sola all'avvio: i test cambiano le
 * variabili d'ambiente fra un caso e l'altro, e un valore memorizzato al
 * caricamento del modulo li renderebbe dipendenti dall'ordine di esecuzione.
 */
export function moduloAttivo(modulo: Modulo): boolean {
  return process.env[VARIABILE[modulo]] === 'true';
}
