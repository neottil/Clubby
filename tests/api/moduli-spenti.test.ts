/**
 * Moduli spenti: il backend di questo file è avviato con
 * ENABLE_MODULE_RICEVUTE e ENABLE_MODULE_TESSERAMENTO a false (spec 014; prima
 * era una seconda istanza sulla porta 3002).
 *
 * Una rotta di un modulo spento risponde 404 e non 403: un 403 direbbe a chi
 * non ha quel modulo che c'è qualcosa da comprare. Finora si verificava a mano
 * (spec 003, R13); la spec 013 aggiunge il corpo delle ricevute libere, la
 * 014 tutte le rotte di ciascun modulo (vedi moduli.ts).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAdmin, creaSocio } from './fabbrica.ts';
import { rotteRicevute, rotteTesseramento, tutte404 } from './moduli.ts';

usaAmbiente({ ENABLE_MODULE_TESSERAMENTO: 'false', ENABLE_MODULE_RICEVUTE: 'false' });

describe('Moduli spenti', () => {
  it('a modulo Ricevute spento le rotte dei documenti rispondono 404', async () => {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1', { ricarica: 50 });
    await tutte404(admin, rotteRicevute(socio.id));
  });

  it('a modulo Tesseramento spento le rotte dei tesseramenti rispondono 404', async () => {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1');
    await tutte404(admin, rotteTesseramento(socio.id));
  });

  it('il resto dell\'API risponde normalmente', async () => {
    // I 404 qui sopra vengono dai moduli e non da un servizio sbagliato: le
    // rotte fuori dai moduli rispondono, anche in scrittura.
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1', { ricarica: 50 });
    const r = await api(admin, 'GET', `/api/soci/${socio.id}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const movimento = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, { importo: 20 });
    assert.equal(movimento.status, 201, JSON.stringify(movimento.body));
  });
});
