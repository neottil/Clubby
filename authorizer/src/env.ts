/**
 * Carica authorizer/.env in process.env, se presente (locale, senza env
 * injection da container). In produzione le variabili sono iniettate dal
 * runtime e questo file è un no-op silenzioso.
 *
 * IMPORTANTE: va importato come PRIMO import in server.ts (side-effect only,
 * `import './env.js'`). In ES modules tutti gli import di un file vengono
 * valutati prima di qualunque codice top-level dello stesso file, quindi un
 * loader scritto "in cima al file" ma dopo altri import girerebbe comunque
 * troppo tardi per i moduli che leggono process.env a livello di modulo.
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');

/*
 * Il parsing è di dotenv e non scritto a mano: virgolette esterne, "\n" nei
 * valori fra doppi apici, commenti in linea e valori su più righe hanno
 * altrimenti un trattamento diverso da quello che Vite (che usa dotenv) applica
 * ai .env del frontend, e lo stesso file letto dai due moduli darebbe valori
 * diversi.
 *
 * `path` esplicito: il default di dotenv è process.cwd()/.env, che cambia a
 * seconda di dove viene lanciato il processo — `npm run dev` parte dalla
 * cartella del modulo, `node dist/server.js` può partire dalla radice del repo.
 *
 * `override` lasciato al default (false): ciò che è già in process.env vince
 * sul file. È il comportamento indispensabile in Kubernetes, dove le variabili
 * arrivano da ConfigMap e Secret.
 */
if (existsSync(envPath)) {
  config({ path: envPath, quiet: true });
  console.log(`[env] Loaded from ${envPath}`);
}
