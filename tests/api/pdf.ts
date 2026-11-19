/**
 * Il testo dentro un PDF prodotto dal backend, per verificare che ci sia ciò
 * che deve esserci (spec 013). Non dice dove sta: l'impaginazione resta un
 * controllo a occhio.
 *
 * Nessuna libreria: `pdfkit` comprime ogni pagina con Flate, che `zlib` di Node
 * decomprime, e scrive il testo dei font standard come stringhe esadecimali in
 * codifica WinAnsi dentro i comandi `TJ`, spezzate dove inserisce la crenatura.
 * Ricomporre i pezzi esadecimali di ogni `TJ` restituisce la riga.
 */

import { inflateSync } from 'node:zlib';

const winAnsi = new TextDecoder('windows-1252');

/** Una riga per ogni comando di testo, nell'ordine in cui compaiono. */
export function testoDelPdf(pdf: Buffer): string {
  const sorgente = pdf.toString('latin1');
  const righe: string[] = [];

  for (const stream of sorgente.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenuto: string;
    try {
      contenuto = inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
    } catch {
      continue; // immagini e font: non sono testo, o non sono compressi così
    }
    for (const comando of contenuto.matchAll(/\[(.*?)\]\s*TJ/g)) {
      const esadecimale = [...comando[1].matchAll(/<([0-9a-fA-F]*)>/g)].map(h => h[1]).join('');
      righe.push(winAnsi.decode(Buffer.from(esadecimale, 'hex')));
    }
  }
  return righe.join('\n');
}
