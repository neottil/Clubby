/**
 * GET /api/version — pubblica, nessuna autenticazione.
 *
 * Espone la versione del backend attualmente in esecuzione. APP_VERSION è
 * popolata nel ConfigMap (backend/k8s/configmap.yaml) dal workflow di deploy
 * con il TAG DELL'IMMAGINE effettivamente deployata (tag di data, es.
 * "main-20260728_1553", da Build & Deploy; versione reale "X.Y.Z" da Promote).
 *
 * È un endpoint e non una variabile compilata nel bundle del frontend proprio
 * perché backend e frontend si deployano in modo indipendente: solo chiedendola
 * a runtime al backend la pagina Info mostra la versione di ciò che sta
 * davvero girando, e non quella nota all'ultima build del frontend.
 *
 * Pubblica perché la pagina Info è raggiungibile anche senza accesso: serve
 * soprattutto quando l'accesso non funziona. Per questo è servita da
 * server.ts prima del controllo del token, accanto a /health, e non sta nella
 * tabella delle route.
 *
 * null se APP_VERSION manca: un valore di ripiego ("dev") farebbe sembrare
 * configurato un ambiente che non lo è, e la pagina Info non potrebbe mai
 * dire "non disponibile".
 *
 * `db` è la versione dello schema (vedi service/versione.service.ts): sta qui
 * perché il database dell'applicazione è del backend, e chi vuole sapere cosa
 * gira la chiede con una chiamata sola.
 */

import { versioneDatabase } from '../service/versione.service.js';

export async function versioneInEsecuzione(): Promise<{ version: string | null; db: string | null }> {
  return {
    version: process.env.APP_VERSION || null,
    db: await versioneDatabase(),
  };
}
