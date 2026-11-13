/**
 * Installazione dell'app sulla schermata Home (spec 012).
 *
 * Due mondi diversi:
 * - Chrome e gli altri browser Chromium (Android, ma anche desktop) annunciano
 *   che l'app si può installare con l'evento `beforeinstallprompt`, e l'app
 *   può aprire la loro finestra di installazione: è la voce "Installa l'app"
 *   del menu.
 * - Safari su iPhone e iPad non ha né l'evento né un modo di chiedere
 *   l'installazione da codice: si fa a mano da Condividi › Aggiungi alla
 *   schermata Home, e l'app può solo spiegarlo (components/AvvisiApp.tsx).
 *   La stessa voce "Installa l'app" del menu, qui, riapre quella spiegazione.
 *
 * Stato a livello di modulo e non in un context React: l'evento arriva quando
 * vuole il browser, anche prima che React sia montato, e va catturato subito
 * (main.tsx chiama ascoltaInstallazione per prima cosa).
 */

import { useSyncExternalStore } from 'react';

/** L'evento non è nei tipi del DOM: esiste solo nei browser Chromium. */
interface EventoInstallazione extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let eventoInAttesa: EventoInstallazione | null = null;
const ascoltatori = new Set<() => void>();
const notifica = () => ascoltatori.forEach(a => a());

/** Da chiamare una volta all'avvio, prima di qualunque altra cosa. */
export function ascoltaInstallazione(): void {
  window.addEventListener('beforeinstallprompt', e => {
    // Niente preventDefault: il browser continua a proporre l'installazione
    // per conto suo, e la voce di menu è un modo in più, non un sostituto.
    eventoInAttesa = e as EventoInstallazione;
    notifica();
  });
  window.addEventListener('appinstalled', () => {
    eventoInAttesa = null;
    notifica();
  });
}

function iscrivi(ascoltatore: () => void): () => void {
  ascoltatori.add(ascoltatore);
  return () => { ascoltatori.delete(ascoltatore); };
}

/** True quando il browser permette di installare l'app da un pulsante. */
export function useInstallabile(): boolean {
  return useSyncExternalStore(iscrivi, () => eventoInAttesa !== null);
}

/**
 * Apre la finestra di installazione del browser. L'evento vale una volta sola:
 * dopo, accettato o no, la voce sparisce finché il browser non ne manda un
 * altro (di solito alla prossima apertura, se l'utente ha rifiutato).
 */
export async function installa(): Promise<void> {
  const evento = eventoInAttesa;
  if (!evento) return;
  eventoInAttesa = null;
  notifica();
  await evento.prompt();
}

/**
 * Istruzioni iOS chieste dal menu. Nello stesso store dell'evento perché il
 * menu (Layout) e l'avviso (AvvisiApp) sono montati in due punti diversi
 * dell'albero, e l'avviso deve poter tornare anche dopo essere stato chiuso.
 */
let istruzioniIosRichieste = false;

export function mostraIstruzioniIos(): void {
  istruzioniIosRichieste = true;
  notifica();
}

export function nascondiIstruzioniIos(): void {
  istruzioniIosRichieste = false;
  notifica();
}

export function useIstruzioniIosRichieste(): boolean {
  return useSyncExternalStore(iscrivi, () => istruzioniIosRichieste);
}

/** L'app è aperta come app installata, non in una scheda del browser. */
export function inAppInstallata(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    // Safari su iOS non supporta sempre la media query: ha la sua proprietà.
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone o iPad, compresi gli iPad recenti che si presentano come Mac. */
export function suIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Safari su iOS, non Chrome, Firefox o Edge per iOS: le istruzioni parlano del
 * pulsante Condividi di Safari, che negli altri browser sta altrove.
 */
export function suSafariIos(): boolean {
  return suIos() && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
}
