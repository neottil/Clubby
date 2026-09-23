/**
 * Palette colori dell'app, personalizzabile per club.
 *
 * I valori arrivano dalla configurazione letta all'avvio (config.ts, campo
 * "tema" di /config.json); ognuno è opzionale e ha come default il colore del
 * logo Clubby.
 *
 * I colori si calcolano una volta, quando questo modulo viene valutato, e da
 * qui li leggono anche gli stili definiti a livello di modulo (styles/ui.ts e
 * le pagine). Per questo main.tsx importa l'applicazione solo dopo aver
 * caricato la configurazione.
 *
 * Default allineati ai colori del logo (frontend/public/logo.svg, "clubby"):
 * corallo #FF6B4A (badge, bottoni), carbone #2E2A26 (wordmark/accento persone),
 * oro #F5C36B (accento persone).
 */
import { config } from './config';

function colore(valore: string | undefined, predefinito: string): string {
  return typeof valore === 'string' && valore.trim() ? valore.trim() : predefinito;
}

export const theme = {
  primary:     colore(config.tema.primary, '#FF6B4A'),     // bottoni, link attivi, evidenze
  primaryText: colore(config.tema.primaryText, '#ffffff'), // testo sopra il colore primario
  danger:      colore(config.tema.danger, '#dc2626'),      // importi negativi, azioni distruttive
  success:     colore(config.tema.success, '#16a34a'),     // importi positivi, conferme
  navBg:       colore(config.tema.navBg, '#2E2A26'),       // sfondo della barra di navigazione
  navText:     colore(config.tema.navText, '#F5C36B'),     // testo della barra di navigazione
} as const;
