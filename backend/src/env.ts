/**
 * Carica backend/.env in process.env, se presente (locale senza env injection
 * da container). In produzione le variabili sono iniettate dal runtime e
 * questo file è un no-op silenzioso (nessun .env presente nell'immagine).
 *
 * IMPORTANTE: va importato come PRIMO import in server.ts (side-effect only,
 * `import './env.js'`), non in mezzo ad altri import. In ES modules tutti gli
 * import di un file vengono valutati, nell'ordine in cui compaiono, prima di
 * qualunque codice top-level dello stesso file — quindi un loader di .env
 * scritto come codice "in cima al file" ma DOPO altri import statement
 * girerebbe comunque dopo di essi, troppo tardi per moduli (come
 * service/admin.service.ts) che leggono process.env a livello di modulo.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    // Non sovrascrive variabili già iniettate dal container runtime
    if (!(key in process.env)) process.env[key] = val;
  }
  console.log(`[env] Loaded from ${envPath}`);
}
