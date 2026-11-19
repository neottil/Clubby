/**
 * Le rotte dei moduli opzionali, per i file che avviano il backend con un
 * modulo spento (spec 014, R17-bis): a modulo spento devono rispondere 404
 * TUTTE, non solo una. Un 404 e non un 403, perché un 403 direbbe a chi non ha
 * quel modulo che c'è qualcosa da comprare.
 *
 * L'elenco segue `ROUTES` in backend/src/server.ts: una rotta nuova di un
 * modulo va aggiunta qui.
 */

import assert from 'node:assert/strict';
import { api, type Sessione } from './helpers.ts';

type Richiesta = [metodo: string, percorso: string, corpo?: unknown];

const NESSUNO = '00000000-0000-0000-0000-000000000000';

export function rotteRicevute(socioId: string): Richiesta[] {
  const libera = {
    intestatario: 'Ospite_test',
    causale: 'prova_test',
    righe: [{ descrizione: 'Iscrizione', importo: 10 }],
  };
  return [
    ['GET', '/api/documenti'],
    ['GET', '/api/documenti/voci'],
    ['GET', `/api/documenti/${NESSUNO}`],
    ['POST', '/api/documenti/anteprima', libera],
    ['POST', '/api/documenti', libera],
    ['POST', '/api/documenti/anteprima', { socio_id: socioId, causale: 'prova_test', voci: [] }],
    ['POST', '/api/documenti', { socio_id: socioId, causale: 'prova_test', voci: [] }],
  ];
}

export function rotteTesseramento(socioId: string): Richiesta[] {
  return [
    ['GET', '/api/tesseramenti'],
    ['POST', '/api/tesseramenti', { socio_id: socioId, scadenza: '2099-12-31', numero_tessera: 'N_test_1' }],
    ['GET', `/api/tesseramenti/${socioId}`],
    ['PATCH', `/api/tesseramenti/rinnovi/${NESSUNO}`, { numero_tessera: 'N_test_2' }],
  ];
}

/** Ogni richiesta risponde 404, chiamata da un admin (che altrimenti avrebbe accesso). */
export async function tutte404(admin: Sessione, richieste: Richiesta[]): Promise<void> {
  for (const [metodo, percorso, corpo] of richieste) {
    const r = await api(admin, metodo, percorso, corpo);
    assert.equal(r.status, 404, `${metodo} ${percorso}: ${JSON.stringify(r.body)}`);
  }
}
