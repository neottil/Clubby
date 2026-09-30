/**
 * Tagli di ricarica e separazione fra importo pagato e valore accreditato.
 *
 * La MODALITÀ (RECHARGE_MODE) è una variabile d'ambiente del server, che un
 * test non può cambiare a server avviato: qui si verifica ciò che vale in
 * qualunque modalità — la gestione dei tagli, riservata all'admin — e il
 * comportamento della modalità con cui gira l'ambiente di sviluppo ("free"),
 * dove pagato e accreditato coincidono e importo_pagato resta null.
 *
 * I tagli creati qui vengono rimossi alla fine: sono configurazione del club,
 * non dati di prova legati a un socio, quindi la pulizia generale non li vede.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, saldo, type Sessione } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Ricariche', () => {
  let d: DatiTest;
  let admin: Sessione;
  const creati: string[] = [];

  const creaTaglio = async (importo: number, valore: number) => {
    const r = await api(admin, 'POST', '/api/ricarica-tagli', { importo, valore });
    if (r.status === 201) creati.push(r.body.id);
    return r;
  };
  const voucherDi = async (socioId: string) =>
    (await api(admin, 'GET', `/api/voucher?socio_id=${socioId}`)).body[0];

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
  });

  after(async () => {
    for (const id of creati) await api(admin, 'DELETE', `/api/ricarica-tagli/${id}`);
    await pulisciDatiTest();
  });

  it('i tagli sono riservati all\'admin (403)', async () => {
    for (const s of [d.sessioni.istruttore2, d.sessioni.socio1]) {
      assert.equal((await api(s, 'GET', '/api/ricarica-tagli')).status, 403);
      assert.equal((await api(s, 'POST', '/api/ricarica-tagli', { importo: 10, valore: 11 })).status, 403);
    }
  });

  // Importi volutamente strani: l'importo di un taglio è unico, e valori
  // "tondi" si scontrerebbero con quelli che il club può avere davvero
  // configurato sul database in cui girano i test.
  const IMPORTO_A = 1007;
  const IMPORTO_B = 1003;

  it('un taglio si crea e compare nell\'elenco, ordinato per importo', async () => {
    // Creati in ordine sparso di proposito: l'ordinamento è del database.
    assert.equal((await creaTaglio(IMPORTO_A, IMPORTO_A + 10)).status, 201);
    assert.equal((await creaTaglio(IMPORTO_B, IMPORTO_B + 5)).status, 201);

    const r = await api(admin, 'GET', '/api/ricarica-tagli');
    assert.equal(r.status, 200);
    const nostri = r.body.filter((t: any) => creati.includes(t.id));
    assert.deepEqual(nostri.map((t: any) => Number(t.importo)), [IMPORTO_B, IMPORTO_A]);
    assert.deepEqual(nostri.map((t: any) => Number(t.valore)), [IMPORTO_B + 5, IMPORTO_A + 10]);
  });

  it('rifiuta un secondo taglio con lo stesso importo (400)', async () => {
    const r = await creaTaglio(IMPORTO_A, IMPORTO_A + 20);
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('rifiuta un valore inferiore all\'importo e importi non positivi (400)', async () => {
    assert.equal((await creaTaglio(80, 70)).status, 400);
    assert.equal((await creaTaglio(0, 10)).status, 400);
    assert.equal((await creaTaglio(-10, 10)).status, 400);
    assert.equal((await api(admin, 'POST', '/api/ricarica-tagli', { importo: 30 })).status, 400);
  });

  it('un taglio si elimina, e un id inesistente dà 404', async () => {
    const r = await creaTaglio(999, 999);
    assert.equal(r.status, 201);
    const id = r.body.id;
    assert.equal((await api(admin, 'DELETE', `/api/ricarica-tagli/${id}`)).status, 204);
    assert.equal((await api(admin, 'DELETE', `/api/ricarica-tagli/${id}`)).status, 404);
    creati.splice(creati.indexOf(id), 1);
  });

  it('la percentuale di ricarica si configura fra le impostazioni, 0-100', async () => {
    const r = await api(admin, 'PUT', '/api/impostazioni', { percentuale_ricarica: 12.5 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(Number(r.body.percentuale_ricarica), 12.5);
    assert.equal((await api(admin, 'PUT', '/api/impostazioni', { percentuale_ricarica: 101 })).status, 400);
    assert.equal((await api(admin, 'PUT', '/api/impostazioni', { percentuale_ricarica: -1 })).status, 400);
    // Ripristino: la percentuale è configurazione condivisa, non dato di prova.
    await api(admin, 'PUT', '/api/impostazioni', { percentuale_ricarica: 0 });
  });

  it('in modalità free pagato e accreditato coincidono (importo_pagato null)', async () => {
    const socio = d.soci.socio1;
    const voucher = await voucherDi(socio);
    const prima = await saldo(admin, socio);

    const r = await api(admin, 'POST', `/api/voucher/${voucher.id}/movimenti`, { importo: 40 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 40);
    assert.equal(r.body.importo_pagato, null, 'senza extra la colonna resta vuota');
    assert.equal(await saldo(admin, socio), prima + 40);
  });

  it('l\'ultima ricarica riporta data e importo, 204 se non ce ne sono', async () => {
    const voucher = await voucherDi(d.soci.socio1);
    const r = await api(admin, 'GET', `/api/voucher/${voucher.id}/ultima-ricarica`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 40);
    assert.ok(r.body.data_movimento, 'la data deve esserci');

    // Il voucher di istruttore2 è quello importato: ha un saldo iniziale ma
    // nessuna ricarica, che è esattamente il caso da distinguere.
    const senzaRicariche = await voucherDi(d.soci.istruttore2);
    assert.equal((await api(admin, 'GET', `/api/voucher/${senzaRicariche.id}/ultima-ricarica`)).status, 204);
  });
});
