/**
 * Elimina i dati lasciati da un'esecuzione dei test interrotta.
 * Uso: npm run test:api:pulizia
 */

import { pulisciDatiTest } from './dati.ts';

await pulisciDatiTest();
console.log('Dati dei test eliminati.');
