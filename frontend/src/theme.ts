/**
 * Palette colori dell'app, personalizzabile per tenant via variabili
 * d'ambiente Vite (opzionali: ognuna ha un default pari al colore
 * attualmente in uso, quindi l'app funziona identica a prima se non
 * imposti nulla).
 *
 * Default allineati ai colori del logo (frontend/public/logo.svg, "clubby"):
 * corallo #FF6B4A (badge, bottoni), carbone #2E2A26 (wordmark/accento persone),
 * oro #F5C36B (accento persone).
 *
 * Variabili:
 *   VITE_THEME_PRIMARY      = #FF6B4A   (bottoni, link attivi, evidenze)
 *   VITE_THEME_PRIMARY_TEXT = #ffffff   (testo sopra il colore primario)
 *   VITE_THEME_DANGER       = #dc2626   (importi negativi, azioni distruttive)
 *   VITE_THEME_SUCCESS      = #16a34a   (importi positivi, conferme)
 *   VITE_THEME_NAV_BG       = #2E2A26   (sfondo barra di navigazione)
 *   VITE_THEME_NAV_TEXT     = #F5C36B   (testo/voci di menu sulla barra di navigazione)
 */
function envColor(name: string, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export const theme = {
  primary:     envColor('VITE_THEME_PRIMARY', '#FF6B4A'),
  primaryText: envColor('VITE_THEME_PRIMARY_TEXT', '#ffffff'),
  danger:      envColor('VITE_THEME_DANGER', '#dc2626'),
  success:     envColor('VITE_THEME_SUCCESS', '#16a34a'),
  navBg:       envColor('VITE_THEME_NAV_BG', '#2E2A26'),
  navText:     envColor('VITE_THEME_NAV_TEXT', '#F5C36B'),
} as const;
