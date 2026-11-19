/**
 * Modulo Ricevute acceso, Tesseramento spento (spec 014, R17 e R17-bis): un
 * club che emette ricevute ma non gestisce i tesseramenti con Clubby.
 *
 * Il backend di questo file è avviato con ENABLE_MODULE_TESSERAMENTO=false.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, scaricaBinario } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAdmin, creaSocio } from './fabbrica.ts';
import { rotteTesseramento, tutte404 } from './moduli.ts';

usaAmbiente({ ENABLE_MODULE_TESSERAMENTO: 'false', ENABLE_MODULE_RICEVUTE: 'true' });

describe('Solo il modulo Ricevute', () => {
  it('le rotte dei tesseramenti rispondono 404', async () => {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1');
    await tutte404(admin, rotteTesseramento(socio.id));
  });

  it('l\'elenco dei soci non ha il numero di tessera', async () => {
    const admin = await creaAdmin();
    await creaSocio(admin, 'socio1');
    await creaSocio(admin, 'socio2');
    for (const percorso of ['/api/soci', '/api/soci?limit=10']) {
      const r = await api(admin, 'GET', percorso);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const righe = (Array.isArray(r.body) ? r.body : r.body.data) as any[];
      assert.equal(righe.length, 2);
      for (const s of righe) assert.ok(!('numero_tessera' in s), `${percorso}: c'è numero_tessera`);
    }
  });

  it('una ricevuta di una ricarica si emette e si scarica', async () => {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1', { ricarica: 50 });
    const voci = await api(admin, 'GET', `/api/documenti/voci?socio_id=${socio.id}`);
    assert.equal(voci.status, 200, JSON.stringify(voci.body));
    assert.equal(voci.body.data.length, 1);
    const voce = voci.body.data[0];
    assert.equal(voce.tipo, 'ricarica');

    const emessa = await api(admin, 'POST', '/api/documenti', {
      socio_id: socio.id, causale: 'prova_test', voci: [{ tipo: voce.tipo, id: voce.id }],
    });
    assert.equal(emessa.status, 201, JSON.stringify(emessa.body));
    assert.equal(emessa.body.numero, 1);

    const pdf = await scaricaBinario(admin, `/api/documenti/${emessa.body.id}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.byte.subarray(0, 4).toString(), '%PDF');
  });
});
