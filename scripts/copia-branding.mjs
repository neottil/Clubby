/**
 * Copia branding/ dentro i due moduli che ne hanno bisogno.
 *
 * La cartella dei loghi sta alla radice perché serve a DUE immagini: il
 * frontend la serve al browser, il backend ne prende il raster per disegnare
 * l'intestazione delle ricevute. Nessuno dei due la legge però da lì.
 *
 *   frontend/public/branding/   Vite copia in dist/ soltanto il contenuto di
 *                               frontend/public/: un file fuori di lì non
 *                               finirebbe da nessuna parte, e i loghi
 *                               diventerebbero immagini rotte in ogni pagina —
 *                               senza un errore, perché il controllo di
 *                               LOGO_FILE in deploy-frontend.yml guarda il
 *                               repository, non l'immagine.
 *
 *   backend/branding/           Nell'immagine il Dockerfile copia branding/ in
 *                               /app/branding, cioè accanto al processo, e
 *                               service/documenti/logo.ts la cerca lì. In
 *                               sviluppo il backend gira da backend/: senza
 *                               questa copia dovrebbe risalire di un livello,
 *                               e avrebbe due modi diversi di trovare la stessa
 *                               cartella a seconda di dove gira. Copiarla qui
 *                               tiene una regola sola — "branding/ accanto al
 *                               processo" — in sviluppo come in produzione.
 *
 * Girato da `prebuild` e `predev` di entrambi i moduli, quindi le copie sono
 * sempre aggiornate. Sono generate: stanno in .gitignore e non si modificano a
 * mano — l'originale è branding/ alla radice.
 *
 * node:fs invece di `cp -r`: deve funzionare sia in PowerShell su Windows sia
 * nel runner Linux della pipeline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sorgente = path.join(radice, 'branding');

const DESTINAZIONI = {
  frontend: path.join(radice, 'frontend', 'public', 'branding'),
  backend:  path.join(radice, 'backend', 'branding'),
};

// Il modulo da servire arriva come argomento, e ciascuno tocca SOLO la propria
// copia. Non è un dettaglio: `npm run dev` avvia i moduli in parallelo, quindi
// senza l'argomento i due `predev` girerebbero insieme sulle stesse cartelle —
// uno cancella mentre l'altro copia, e su Windows quella collisione è un EPERM
// che fa fallire l'avvio. Senza argomento si fanno entrambe, per l'uso a mano.
const scelta = process.argv[2];
if (scelta && !(scelta in DESTINAZIONI)) {
  console.error(`[branding] destinazione sconosciuta: ${scelta} (attese: ${Object.keys(DESTINAZIONI).join(', ')})`);
  process.exit(1);
}
const destinazioni = scelta ? [DESTINAZIONI[scelta]] : Object.values(DESTINAZIONI);

if (!fs.existsSync(sorgente)) {
  console.error(`[branding] cartella non trovata: ${sorgente}`);
  process.exit(1);
}

for (const destinazione of destinazioni) {
  // Ricreata da zero: senza, un logo tolto da branding/ resterebbe per sempre
  // nella copia e continuerebbe a essere servito.
  //
  // maxRetries: su Windows un file appena letto (l'antivirus, l'indicizzatore,
  // un dev server che lo sta servendo) può tenere l'handle aperto per qualche
  // decina di millisecondi e far fallire la rimozione con EPERM. Riprovare
  // costa niente e rende l'avvio deterministico.
  fs.rmSync(destinazione, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.cpSync(sorgente, destinazione, { recursive: true });

  const file = fs.readdirSync(destinazione).filter(f => f !== 'README.md');
  console.log(`[branding] ${file.length} file copiati in ${path.relative(radice, destinazione).replace(/\\/g, '/')}/`);
}
