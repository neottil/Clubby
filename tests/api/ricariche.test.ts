/**
 * Tagli di ricarica e separazione fra importo pagato e valore accreditato.
 *
 * La MODALITÀ (RECHARGE_MODE) si legge all'avvio del backend: questo file lo
 * avvia in "free", dove pagato e accreditato coincidono e importo_pagato resta
 * null, e verifica anche ciò che vale in qualunque modalità — la gestione dei
 * tagli, riservata all'admin. Le altre modalità hanno un file ciascuno
 * (ricariche-map, ricariche-percentuale, ricariche-modalita-sconosciuta).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, saldo } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaSocio, creaTaglio } from './fabbrica.ts';

usaAmbiente({ RECHARGE_MODE: 'free' });

describe('Ricariche', () => {
  it('i tagli sono riservati all\'admin (403)', async () => {
    const admin = await creaAdmin();
    const istruttore = await creaAccount(admin, 'istruttore2', 'istruttore');
    const socio = await creaAccount(admin, 'socio1');
    for (const s of [istruttore, socio]) {
      assert.equal((await api(s, 'GET', '/api/ricarica-tagli')).status, 403);
      assert.equal((await api(s, 'POST', '/api/ricarica-tagli', { importo: 10, valore: 11 })).status, 403);
    }
  });

  it('un taglio si crea e compare nell\'elenco, ordinato per importo', async () => {
    const admin = await creaAdmin();
    // Creati in ordine sparso di proposito: l'ordinamento è del database.
    await creaTaglio(admin, 100, 110);
    await creaTaglio(admin, 50, 55);

    const r = await api(admin, 'GET', '/api/ricarica-tagli');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((t: any) => Number(t.importo)), [50, 100]);
    assert.deepEqual(r.body.map((t: any) => Number(t.valore)), [55, 110]);
  });

  it('rifiuta un secondo taglio con lo stesso importo (400)', async () => {
    const admin = await creaAdmin();
    await creaTaglio(admin, 100, 110);
    const r = await api(admin, 'POST', '/api/ricarica-tagli', { importo: 100, valore: 120 });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('rifiuta un valore inferiore all\'importo e importi non positivi (400)', async () => {
    const admin = await creaAdmin();
    const taglio = (importo: number, valore?: number) =>
      api(admin, 'POST', '/api/ricarica-tagli', valore === undefined ? { importo } : { importo, valore });
    assert.equal((await taglio(80, 70)).status, 400);
    assert.equal((await taglio(0, 10)).status, 400);
    assert.equal((await taglio(-10, 10)).status, 400);
    assert.equal((await taglio(30)).status, 400);
    assert.deepEqual((await api(admin, 'GET', '/api/ricarica-tagli')).body, []);
  });

  it('un taglio si elimina, e un id inesistente dà 404', async () => {
    const admin = await creaAdmin();
    const id = await creaTaglio(admin, 999, 999);
    assert.equal((await api(admin, 'DELETE', `/api/ricarica-tagli/${id}`)).status, 204);
    assert.equal((await api(admin, 'DELETE', `/api/ricarica-tagli/${id}`)).status, 404);
    assert.deepEqual((await api(admin, 'GET', '/api/ricarica-tagli')).body, []);
  });

  it('la percentuale di ricarica si configura fra le impostazioni, 0-100', async () => {
    const admin = await creaAdmin();
    const r = await api(admin, 'PATCH', '/api/impostazioni', { percentuale_ricarica: 12.5 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(Number(r.body.percentuale_ricarica), 12.5);
    assert.equal((await api(admin, 'PATCH', '/api/impostazioni', { percentuale_ricarica: 101 })).status, 400);
    assert.equal((await api(admin, 'PATCH', '/api/impostazioni', { percentuale_ricarica: -1 })).status, 400);
    assert.equal(Number((await api(admin, 'GET', '/api/impostazioni')).body.percentuale_ricarica), 12.5);
  });

  it('in modalità free pagato e accreditato coincidono (importo_pagato null)', async () => {
    const admin = await creaAdmin();
    // Anche con una percentuale configurata: in "free" non si applica.
    await api(admin, 'PATCH', '/api/impostazioni', { percentuale_ricarica: 10 });
    const socio = await creaSocio(admin, 'socio1', { ricarica: 150 });

    const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, { importo: 40 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 40);
    assert.equal(r.body.importo_pagato, null, 'senza extra la colonna resta vuota');
    assert.equal(await saldo(admin, socio.id), 190);
  });

  it('in modalità free un valore esplicito è rifiutato (400)', async () => {
    // Il valore si indica solo con "Altro importo…" della modalità a tagli
    // (spec 013): qui lo decide la configurazione, e ignorarlo in silenzio
    // farebbe credere a chi lo manda di averlo impostato.
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1', { ricarica: 150 });
    const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, { importo: 10, valore: 12 });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(await saldo(admin, socio.id), 150);
  });

  it('l\'ultima ricarica riporta data e importo, 204 se non ce ne sono', async () => {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1', { ricarica: 150 });
    await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, { importo: 40 });
    const r = await api(admin, 'GET', `/api/voucher/${socio.voucherId}/ultima-ricarica`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 40);
    assert.ok(r.body.data_movimento, 'la data deve esserci');

    // Un voucher importato ha un saldo iniziale ma nessuna ricarica, che è
    // esattamente il caso da distinguere.
    const importato = await creaSocio(admin, 'istruttore2', { saldoIniziale: 100 });
    assert.equal((await api(admin, 'GET', `/api/voucher/${importato.voucherId}/ultima-ricarica`)).status, 204);
  });
});
