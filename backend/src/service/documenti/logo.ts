/**
 * Risoluzione del logo da stampare sulla ricevuta.
 *
 * Il logo è lo stesso che il frontend mostra in testa a ogni pagina: sta in
 * `branding/` nel repository, finisce dentro l'immagine del backend
 * (vedi backend/Dockerfile) ed è scelto per ambiente dalla Variable
 * `LOGO_FILE` — la stessa che legge il deploy del frontend.
 *
 * Averlo da lì e non caricato dall'interfaccia evita l'unico problema che
 * conta: due copie, una nel database e una nel repository, che col tempo
 * divergono e mostrano un logo sulla pagina e un altro sulle ricevute.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * `branding/` accanto al processo, una regola sola ovunque.
 *
 * Nell'immagine il backend gira da `/app` e il Dockerfile ci copia dentro
 * `branding/`. In sviluppo gira da `backend/`, dove la stessa cartella arriva
 * da `scripts/copia-branding.mjs` (`predev`/`prebuild`), come già accade per
 * `frontend/public/branding/`. L'originale, e l'unico da modificare, resta
 * `branding/` alla radice.
 *
 * `BRANDING_DIR` resta la scorciatoia per chi vuole imporre un percorso.
 */
const CARTELLA = process.env.BRANDING_DIR ?? path.resolve(process.cwd(), 'branding');

/** pdfkit incorpora solo questi: SVG non è un formato che sappia disegnare. */
const RASTER = ['.png', '.jpg', '.jpeg'];

/**
 * Il percorso del raster da usare, o `null` se non ce n'è uno utilizzabile.
 *
 * `LOGO_FILE` nomina di norma un SVG, perché è quello che serve al browser:
 * qui si cerca l'omonimo raster. Se invece è già un PNG o un JPEG, si usa
 * quello.
 *
 * Restituire `null` è un esito normale, non un errore: la ricevuta si emette
 * comunque, senza logo. A garantire che il raster ci sia pensa il job
 * `valida-branding` della pipeline, che a modulo attivo blocca il rilascio se
 * un SVG non ha il gemello.
 */
export function percorsoLogo(): string | null {
  const nome = process.env.LOGO_FILE;
  if (!nome) return null;

  // Difesa minima contro un valore malformato: il nome arriva da una Variable
  // d'ambiente, non da una richiesta, ma un "../" lì dentro farebbe leggere
  // file fuori dalla cartella.
  const base = path.basename(nome);
  const estensione = path.extname(base).toLowerCase();

  const candidati = RASTER.includes(estensione)
    ? [base]
    : RASTER.map(ext => base.slice(0, base.length - estensione.length) + ext);

  for (const candidato of candidati) {
    const completo = path.join(CARTELLA, candidato);
    if (fs.existsSync(completo)) return completo;
  }

  console.warn(
    `[documenti] LOGO_FILE="${nome}": nessun PNG/JPEG corrispondente in ${CARTELLA}. ` +
    'Le ricevute verranno emesse senza logo.'
  );
  return null;
}
