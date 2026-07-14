#!/usr/bin/env node
/**
 * Applica il logo del tenant prima della build: se la variabile d'ambiente
 * LOGO_FILE è impostata (es. "asd1.svg"), copia quel file da
 * frontend/branding/ sovrascrivendo frontend/public/logo.svg — Vite lo
 * include poi automaticamente nella build come asset statico servito da
 * /logo.svg (favicon + eventuale uso nell'header).
 *
 * Se LOGO_FILE non è impostata, non fa nulla: resta il logo di default già
 * committato in public/logo.svg.
 *
 * Eseguito automaticamente da npm come hook "prebuild"/"predev" (vedi
 * package.json), sia in locale che nella pipeline CI.
 */
import { existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logoFile = process.env.LOGO_FILE;

if (!logoFile) {
  console.log('[logo] LOGO_FILE non impostata: uso il logo di default in public/logo.svg');
  process.exit(0);
}

const source = resolve(__dirname, '../branding', logoFile);
const dest = resolve(__dirname, '../public/logo.svg');

if (!existsSync(source)) {
  console.error(`[logo] ERRORE: "${logoFile}" non trovato in frontend/branding/`);
  process.exit(1);
}

copyFileSync(source, dest);
console.log(`[logo] Copiato branding/${logoFile} -> public/logo.svg`);
