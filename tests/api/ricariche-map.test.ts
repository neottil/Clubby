/**
 * Ricariche in modalità a tagli (spec 013), sulla seconda istanza del backend,
 * avviata con RECHARGE_MODE=map (vedi helpers.ts, API_URL_VARIANTI).
 *
 * I dati li crea l'istanza principale, in "free": stesso database, stessi
 * token. Qui si registrano soltanto le ricariche, ed è l'unica cosa che cambia
 * fra le due istanze.
 *
 * Il taglio di prova ha un importo improbabile, per non scontrarsi con quelli
 * che il club può avere davvero configurato, e si elimina alla fine.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, apiVarianti, saldo, type Sessione } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

const TAGLIO_IMPORTO = 73.21;
const TAGLIO_VALORE = 80;

describe('Ricariche in modalità a tagli', () => {
  let d: DatiTest;
  let admin: Sessione;
  let voucherId: string;
  const tagliCreati: string[] = [];

  const ricarica = (body: Record<string, unknown>) =>
    apiVarianti(admin, 'POST', `/api/voucher/${voucherId}/movimenti`, body);

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
    voucherId = (await api(admin, 'GET', `/api/voucher?socio_id=${d.soci.socio1}`)).body[0].id;
    const taglio = await api(admin, 'POST', '/api/ricarica-tagli', { importo: TAGLIO_IMPORTO, valore: TAGLIO_VALORE });
    assert.equal(taglio.status, 201, JSON.stringify(taglio.body));
    tagliCreati.push(taglio.body.id);
  });

  after(async () => {
    for (const id of tagliCreati) await api(admin, 'DELETE', `/api/ricarica-tagli/${id}`);
    await pulisciDatiTest();
  });

  it('importo e valore: il saldo sale del valore, la voce in Ricevute vale il pagato', async () => {
    const prima = await saldo(admin, d.soci.socio1);
    const r = await ricarica({ importo: 40, valore: 45 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 45);
    assert.equal(Number(r.body.importo_pagato), 40);
    assert.equal(await saldo(admin, d.soci.socio1), prima + 45);

    // In Ricevute conta il denaro incassato, non il credito.
    const voci = (await api(admin, 'GET', `/api/documenti/voci?socio_id=${d.soci.socio1}&limit=200`)).body.data as any[];
    const voce = voci.find(v => v.tipo === 'ricarica' && v.id === r.body.id);
    assert.ok(voce, 'la ricarica deve comparire fra le voci');
    assert.equal(Number(voce.importo), 40);
  });

  it('con un valore esplicito il taglio non si applica', async () => {
    const r = await ricarica({ importo: TAGLIO_IMPORTO, valore: TAGLIO_IMPORTO });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), TAGLIO_IMPORTO);
    assert.equal(r.body.importo_pagato, null, 'pagato e valore coincidono');
  });

  it('senza valore il taglio si applica come prima', async () => {
    const r = await ricarica({ importo: TAGLIO_IMPORTO });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), TAGLIO_VALORE);
    assert.equal(Number(r.body.importo_pagato), TAGLIO_IMPORTO);
  });

  it('con un valore esplicito la ricarica passa a prescindere dai tagli', async () => {
    // Un importo che nessun taglio ha: lato API il valore esplicito non legge
    // i tagli, quindi vale anche a tabella vuota — che qui non si può imporre,
    // il database è quello dell'utente.
    const r = await ricarica({ importo: 12.34, valore: 12.34 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 12.34);
  });

  it('fuori taglio senza valore: 400', async () => {
    const r = await ricarica({ importo: 37.13 });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(r.body.error, /valore da accreditare/);
  });

  it('rifiuta un valore inferiore al pagato o non positivo (400)', async () => {
    const basso = await ricarica({ importo: 40, valore: 30 });
    assert.equal(basso.status, 400, JSON.stringify(basso.body));
    assert.match(basso.body.error, /inferiore/);
    for (const valore of [0, -5, 'tanti']) {
      const r = await ricarica({ importo: 40, valore });
      assert.equal(r.status, 400, `valore ${valore}: ${JSON.stringify(r.body)}`);
    }
  });
});
