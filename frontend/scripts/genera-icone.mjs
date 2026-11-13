/**
 * Genera le icone dell'app installata (spec 012) dai loghi dei club.
 *
 * Chi aggiunge un club mette in branding/ solo il logo, come prima: le PNG
 * nelle misure che chiedono Android e iOS si ricavano da lì, in build. Prepararle
 * a mano in quattro misure per ogni club sarebbe un passaggio che prima o poi
 * qualcuno salta, e l'app di quel club si installerebbe con un'icona rotta.
 *
 * Per ogni logo in frontend/public/branding/ (la copia fatta da
 * copia-branding.mjs, che quindi deve girare prima) e per il logo di default
 * frontend/public/logo.svg scrive in frontend/public/branding/icone/:
 *
 *   <nome>-192.png           icona del manifest
 *   <nome>-512.png           icona del manifest, e schermata di avvio Android
 *   <nome>-maskable-512.png  icona "maskable": Android la ritaglia a cerchio o
 *                            a goccia, quindi il logo sta nella zona sicura
 *                            centrale con un margine intorno
 *   <nome>-180.png           apple-touch-icon per iOS, su fondo pieno: iOS
 *                            riempie di nero la trasparenza
 *
 * <nome> è il nome del file senza estensione: deploy-frontend.yml lo ricava
 * allo stesso modo da LOGO_FILE per scrivere il manifest, e config.ts per
 * l'icona di iOS. Se un club ha sia romaasd.svg sia romaasd.png si parte
 * dall'SVG, che a 512 px resta nitido.
 *
 * Le icone stanno dentro la copia generata (in .gitignore) e si rifanno a ogni
 * avvio: non si modificano a mano.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cartellaLoghi = path.join(frontend, 'public', 'branding');
const destinazione = path.join(cartellaLoghi, 'icone');
const logoPredefinito = path.join(frontend, 'public', 'logo.svg');

/** Fondo delle icone che non ammettono trasparenza (maskable e iOS). */
const FONDO = '#ffffff';

/** Formati da cui si sa partire, in ordine di preferenza a parità di nome. */
const ESTENSIONI = ['.svg', '.png', '.jpg', '.jpeg'];

/**
 * Il logo come immagine quadrata di `lato` px, trasparente intorno se non è
 * quadrato. `density` alta: un SVG si rasterizza alla sua misura nominale, che
 * per un logo pensato per 40 px darebbe un 512 sgranato.
 */
function logo(sorgente, lato) {
  return sharp(sorgente, { density: 600 })
    .resize(lato, lato, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Il logo ridotto a `quota` del lato, centrato su un fondo pieno. */
async function suFondo(sorgente, lato, quota) {
  const interno = Math.round(lato * quota);
  return sharp({ create: { width: lato, height: lato, channels: 4, background: FONDO } })
    .composite([{ input: await logo(sorgente, interno), gravity: 'center' }])
    .png()
    .toBuffer();
}

async function generaIcone(sorgente, nome) {
  const scrivi = (suffisso, dati) => fs.writeFileSync(path.join(destinazione, `${nome}-${suffisso}.png`), dati);
  scrivi('192', await logo(sorgente, 192));
  scrivi('512', await logo(sorgente, 512));
  // Zona sicura delle maskable: un cerchio di diametro 80% del lato. Al 70% il
  // logo ci sta dentro anche se è quadrato fino agli angoli.
  scrivi('maskable-512', await suFondo(sorgente, 512, 0.7));
  scrivi('180', await suFondo(sorgente, 180, 0.85));
}

/** Un logo per nome: l'SVG se c'è, altrimenti il primo raster. */
function loghiDaGenerare() {
  const perNome = new Map();
  if (fs.existsSync(cartellaLoghi)) {
    for (const file of fs.readdirSync(cartellaLoghi)) {
      const estensione = path.extname(file).toLowerCase();
      if (!ESTENSIONI.includes(estensione)) continue;
      const nome = path.basename(file, path.extname(file));
      const giaScelto = perNome.get(nome);
      if (!giaScelto || ESTENSIONI.indexOf(estensione) < ESTENSIONI.indexOf(path.extname(giaScelto).toLowerCase())) {
        perNome.set(nome, path.join(cartellaLoghi, file));
      }
    }
  }
  return perNome;
}

fs.rmSync(destinazione, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
fs.mkdirSync(destinazione, { recursive: true });

// Prima quello di default: un logo di club che si chiamasse "logo" lo
// sovrascriverebbe, ed è giusto così, perché è quello che il club mostra.
await generaIcone(logoPredefinito, 'logo');
const loghi = loghiDaGenerare();
for (const [nome, sorgente] of loghi) {
  await generaIcone(sorgente, nome);
}

console.log(`[icone] icone generate per ${loghi.size + 1} loghi in public/branding/icone/`);
