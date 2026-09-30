/**
 * Importi in lettere, nella forma usata dalle ricevute: `centosessanta/00`.
 *
 * La conversione numero → parole la fa `n2words` (MIT, zero dipendenze): è
 * stata scelta al posto di un'API esterna perché una ricevuta si emette una
 * volta sola e non si annulla — mettere un servizio di terzi sul percorso di
 * un'operazione irreversibile significa non poterla completare quando quel
 * servizio è giù. E avrebbe comportato mandare fuori l'importo pagato da una
 * persona con nome e cognome, per convertire un numero in parole.
 *
 * Qui restano solo i centesimi, che nel modello del club si scrivono in cifre
 * dopo una barra.
 */

import { toCardinal } from 'n2words/it';

/**
 * `160` → `centosessanta/00`, `1234.5` → `milleduecentotrentaquattro/50`.
 *
 * L'importo viene arrotondato al centesimo prima di essere scomposto: senza,
 * un valore come 0.1 + 0.2 arrivato da un'aritmetica in virgola mobile
 * produrrebbe 30 centesimi scritti come `/29`.
 */
export function importoInLettere(importo: number): string {
  const centesimiTotali = Math.round(Math.abs(importo) * 100);
  const intero = Math.floor(centesimiTotali / 100);
  const centesimi = centesimiTotali % 100;

  const parole = toCardinal(intero);
  const segno = importo < 0 ? 'meno ' : '';

  return `${segno}${parole}/${String(centesimi).padStart(2, '0')}`;
}
