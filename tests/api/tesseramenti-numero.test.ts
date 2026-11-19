/**
 * Numero di tessera e stato del tesseramento (spec 007): obbligatorio sui
 * rinnovi, un numero per un solo socio, correzione solo sul tesseramento in
 * corso, numero corrente nell'elenco soci, stato nello storico.
 *
 * Ogni caso si costruisce i tesseramenti che gli servono, fra questi:
 *
 *   socio2        un tesseramento scaduto              N_test_S2
 *   istruttore2   un tesseramento in scadenza          N_test_I2
 *   socio1        due rinnovi attivi, il primo superato N_test_S1 → N_test_S1B
 *   senzaAccount  mai tesserato
 */

import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaSocio, creaTesseramento, type Utente } from './fabbrica.ts';

usaAmbiente();

/** Riconoscibile come dato di prova, e lungo esattamente quanto il massimo. */
const TRENTA = 'N_test_' + 'X'.repeat(23);

describe('Numero di tessera', () => {
  const rinnova = (admin: Sessione, body: Record<string, unknown>) => api(admin, 'POST', '/api/tesseramenti', body);
  const correggi = (s: Sessione, id: string, numero_tessera: unknown) =>
    api(s, 'PATCH', `/api/tesseramenti/rinnovi/${id}`, { numero_tessera });
  const storico = async (admin: Sessione, socioId: string) => {
    const r = await api(admin, 'GET', `/api/tesseramenti/${socioId}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body as any[];
  };
  const elencoSoci = async (admin: Sessione) => {
    const r = await api(admin, 'GET', '/api/soci?limit=50');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data as any[];
  };

  /** I soci dello scenario, senza tesseramenti. */
  async function soci(admin: Utente) {
    return {
      socio1: (await creaSocio(admin, 'socio1', { nome: 'paolo', cognome: 'ferrari' })).id,
      socio2: (await creaSocio(admin, 'socio2', { nome: 'sara', cognome: 'romano' })).id,
      istruttore2: (await creaSocio(admin, 'istruttore2', { nome: 'chiara', cognome: 'conti' })).id,
      senzaAccount: (await creaSocio(admin, 'senzaAccount', { nome: 'giorgio', cognome: 'ricci' })).id,
    };
  }

  const scaduto = (admin: Sessione, socio: string) =>
    creaTesseramento(admin, socio, 'N_test_S2', { rinnovo: 400, scadenza: 35 });
  const inScadenza = (admin: Sessione, socio: string) =>
    creaTesseramento(admin, socio, 'N_test_I2', { rinnovo: 355, scadenza: -10 });
  /** I due rinnovi di socio1: il primo, poi il secondo con lo stesso numero, corretto in N_test_S1B. */
  async function dueRinnovi(admin: Sessione, socio: string) {
    const primo = await creaTesseramento(admin, socio, 'N_test_S1', { rinnovo: 0, scadenza: -100 });
    const secondo = await creaTesseramento(admin, socio, 'N_test_S1', { rinnovo: 0, scadenza: -465 });
    assert.equal((await correggi(admin, secondo.id, 'N_test_S1B')).status, 200);
    return { primo: primo.id as string, secondo: secondo.id as string };
  }

  describe('registrazione (R2–R4)', () => {
    it('rinnovo senza numero di tessera → 400', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const r = await rinnova(admin, { socio_id: s.senzaAccount, scadenza: giorniFa(-365) });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal((await storico(admin, s.senzaAccount)).length, 0);
    });

    it('numero di soli spazi → 400', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const r = await rinnova(admin, { socio_id: s.senzaAccount, scadenza: giorniFa(-365), numero_tessera: '   ' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('numero di 30 caratteri accettato, di 31 → 400', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const r = await rinnova(admin, { socio_id: s.senzaAccount, scadenza: giorniFa(-365), numero_tessera: 'N_test_' + 'X'.repeat(24) });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      const ok = await rinnova(admin, { socio_id: s.senzaAccount, scadenza: giorniFa(-365), numero_tessera: TRENTA });
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
    });

    it('numero già di un altro socio → 409 con il nome', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await scaduto(admin, s.socio2);
      const r = await rinnova(admin, { socio_id: s.senzaAccount, scadenza: giorniFa(-365), numero_tessera: 'N_test_S2' });
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.match(JSON.stringify(r.body), /romano_test/);
      // Rifiutato prima di scrivere: senzaAccount resta mai tesserato.
      assert.equal((await storico(admin, s.senzaAccount)).length, 0);
    });

    it('lo stesso socio riusa il numero nel rinnovo → 201', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await creaTesseramento(admin, s.socio1, 'N_test_S1', { rinnovo: 0, scadenza: -100 });
      const r = await rinnova(admin, { socio_id: s.socio1, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), numero_tessera: 'N_test_S1' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal((await storico(admin, s.socio1)).length, 2);
    });

    it('il numero viene salvato senza spazi ai lati', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const t = await creaTesseramento(admin, s.socio1, 'N_test_S1');
      const r = await correggi(admin, t.id, '  N_test_S1B  ');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.numero_tessera, 'N_test_S1B');
    });
  });

  describe('correzione (R6)', () => {
    it('correzione del numero del tesseramento in corso → 200', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const t = await inScadenza(admin, s.istruttore2);
      const r = await correggi(admin, t.id, 'N_test_I2bis');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.numero_tessera, 'N_test_I2bis');
    });

    it('correzione di un tesseramento superato da un rinnovo → 409', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const { primo } = await dueRinnovi(admin, s.socio1);
      const r = await correggi(admin, primo, 'N_test_altro');
      assert.equal(r.status, 409, JSON.stringify(r.body));
    });

    it('correzione di un tesseramento scaduto → 409', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const t = await scaduto(admin, s.socio2);
      const r = await correggi(admin, t.id, 'N_test_altro');
      assert.equal(r.status, 409, JSON.stringify(r.body));
    });

    it('id inesistente → 404', async () => {
      const admin = await creaAdmin();
      const r = await correggi(admin, randomUUID(), 'N_test_altro');
      assert.equal(r.status, 404, JSON.stringify(r.body));
    });

    it('socio che corregge → 403', async () => {
      const admin = await creaAdmin();
      const account = await creaAccount(admin, 'socio1');
      const socio = await creaSocio(admin, 'socio1', { account });
      const t = await creaTesseramento(admin, socio.id, 'N_test_S1');
      const r = await correggi(account, t.id, 'N_test_altro');
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal((await storico(admin, socio.id))[0].numero_tessera, 'N_test_S1');
    });

    it('correzione con numero di un altro socio → 409', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await scaduto(admin, s.socio2);
      const t = await inScadenza(admin, s.istruttore2);
      const r = await correggi(admin, t.id, 'N_test_S2');
      assert.equal(r.status, 409, JSON.stringify(r.body));
    });
  });

  describe('numero corrente ed elenco soci (R7, R8)', () => {
    it('il numero corrente è quello dell\'ultimo rinnovo', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await dueRinnovi(admin, s.socio1);
      const socio1 = (await elencoSoci(admin)).find(x => x.id === s.socio1);
      assert.equal(socio1.numero_tessera, 'N_test_S1B');
    });

    it('socio mai tesserato → null', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      const senza = (await elencoSoci(admin)).find(x => x.id === s.senzaAccount);
      assert.equal(senza.numero_tessera, null);
    });

    it('elenco soci con numero_tessera', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await scaduto(admin, s.socio2);
      await inScadenza(admin, s.istruttore2);
      const elenco = await elencoSoci(admin);
      assert.equal(elenco.length, 4);
      const numeri = Object.fromEntries(elenco.map(x => [x.id, x.numero_tessera]));
      assert.equal(numeri[s.socio2], 'N_test_S2', 'anche a tesseramento scaduto');
      assert.equal(numeri[s.istruttore2], 'N_test_I2');
      assert.ok(elenco.every(x => 'numero_tessera' in x));
    });

    it('ricerca per numero di tessera', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await scaduto(admin, s.socio2);
      await inScadenza(admin, s.istruttore2);
      const r = await api(admin, 'GET', '/api/soci?q=N_test_I2&limit=50');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.data.map((x: any) => x.id), [s.istruttore2]);
    });
  });

  describe('storico (R9, R12)', () => {
    it('lo storico riporta numero_tessera', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await dueRinnovi(admin, s.socio1);
      assert.deepEqual((await storico(admin, s.socio1)).map(t => t.numero_tessera), ['N_test_S1B', 'N_test_S1']);
    });

    it('il socio legge il proprio numero nello storico', async () => {
      const admin = await creaAdmin();
      const account = await creaAccount(admin, 'socio1');
      const socio = await creaSocio(admin, 'socio1', { account });
      await dueRinnovi(admin, socio.id);
      const r = await api(account, 'GET', `/api/tesseramenti/${socio.id}`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body[0].numero_tessera, 'N_test_S1B');
    });

    it('stato attivo, in_scadenza e scaduto nello storico', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await dueRinnovi(admin, s.socio1);
      await inScadenza(admin, s.istruttore2);
      await scaduto(admin, s.socio2);
      assert.equal((await storico(admin, s.socio1))[0].stato, 'attivo');
      assert.equal((await storico(admin, s.istruttore2))[0].stato, 'in_scadenza');
      assert.equal((await storico(admin, s.socio2))[0].stato, 'scaduto');
    });

    it('lo stato della prima riga coincide con quello in GET /api/tesseramenti', async () => {
      const admin = await creaAdmin();
      const s = await soci(admin);
      await dueRinnovi(admin, s.socio1);
      await inScadenza(admin, s.istruttore2);
      await scaduto(admin, s.socio2);
      const r = await api(admin, 'GET', '/api/tesseramenti?limit=50');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.data.length, 4, 'una riga per socio, anche per chi non è mai stato tesserato');
      for (const riga of r.body.data as any[]) {
        const prima = (await storico(admin, riga.socio_id))[0];
        assert.equal(prima?.stato ?? 'mai', riga.stato, `stato di ${riga.cognome}`);
      }
    });
  });

  it('ultimo caso: numero di 30 caratteri accettato', async () => {
    const admin = await creaAdmin();
    const s = await soci(admin);
    const r = await rinnova(admin, { socio_id: s.senzaAccount, scadenza: giorniFa(-365), numero_tessera: TRENTA });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.numero_tessera, TRENTA);
  });
});
