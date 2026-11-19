/**
 * Ricariche in modalità a tagli (spec 013): il backend di questo file è
 * avviato con RECHARGE_MODE=map (spec 014, prima era una seconda istanza
 * sulla porta 3002).
 *
 * Ogni caso parte da una tabella dei tagli vuota e crea solo i tagli che gli
 * servono: anche la modalità senza alcun taglio si prova davvero.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, saldo } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAdmin, creaSocio, creaTaglio } from './fabbrica.ts';

usaAmbiente({ RECHARGE_MODE: 'map' });

const TAGLIO_IMPORTO = 73.21;
const TAGLIO_VALORE = 80;

describe('Ricariche in modalità a tagli', () => {
  /** Admin e un socio con un voucher importato (in "map" non serve un taglio per crearlo). */
  async function prepara(conTaglio: boolean) {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1', { saldoIniziale: 100 });
    if (conTaglio) await creaTaglio(admin, TAGLIO_IMPORTO, TAGLIO_VALORE);
    const ricarica = (body: Record<string, unknown>) =>
      api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, body);
    return { admin, socio, ricarica };
  }

  it('importo e valore: il saldo sale del valore, la voce in Ricevute vale il pagato', async () => {
    const { admin, socio, ricarica } = await prepara(true);
    const r = await ricarica({ importo: 40, valore: 45 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 45);
    assert.equal(Number(r.body.importo_pagato), 40);
    assert.equal(await saldo(admin, socio.id), 145);

    // In Ricevute conta il denaro incassato, non il credito.
    const voci = (await api(admin, 'GET', `/api/documenti/voci?socio_id=${socio.id}&limit=200`)).body.data as any[];
    const voce = voci.find(v => v.tipo === 'ricarica' && v.id === r.body.id);
    assert.ok(voce, 'la ricarica deve comparire fra le voci');
    assert.equal(Number(voce.importo), 40);
  });

  it('con un valore esplicito il taglio non si applica', async () => {
    const { ricarica } = await prepara(true);
    const r = await ricarica({ importo: TAGLIO_IMPORTO, valore: TAGLIO_IMPORTO });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), TAGLIO_IMPORTO);
    assert.equal(r.body.importo_pagato, null, 'pagato e valore coincidono');
  });

  it('senza valore il taglio si applica come prima', async () => {
    const { ricarica } = await prepara(true);
    const r = await ricarica({ importo: TAGLIO_IMPORTO });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), TAGLIO_VALORE);
    assert.equal(Number(r.body.importo_pagato), TAGLIO_IMPORTO);
  });

  it('con un valore esplicito la ricarica passa a prescindere dai tagli', async () => {
    // Nessun taglio configurato (R7 della spec 013): con il valore esplicito
    // la ricarica si registra lo stesso.
    const { admin, socio, ricarica } = await prepara(false);
    assert.deepEqual((await api(admin, 'GET', '/api/ricarica-tagli')).body, []);
    const r = await ricarica({ importo: 12.34, valore: 12.34 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 12.34);
    assert.equal(await saldo(admin, socio.id), 112.34);
  });

  it('fuori taglio senza valore: 400', async () => {
    const { ricarica } = await prepara(true);
    const r = await ricarica({ importo: 37.13 });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, /valore da accreditare/);
  });

  it('rifiuta un valore inferiore al pagato o non positivo (400)', async () => {
    const { admin, socio, ricarica } = await prepara(true);
    const basso = await ricarica({ importo: 40, valore: 30 });
    assert.equal(basso.status, 400, JSON.stringify(basso.body));
    assert.match(basso.body.error, /inferiore/);
    for (const valore of [0, -5, 'tanti']) {
      const r = await ricarica({ importo: 40, valore });
      assert.equal(r.status, 400, `valore ${valore}: ${JSON.stringify(r.body)}`);
    }
    assert.equal(await saldo(admin, socio.id), 100);
  });
});

