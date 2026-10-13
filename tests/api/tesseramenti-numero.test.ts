/**
 * Numero di tessera e stato del tesseramento (spec 007): obbligatorio sui
 * rinnovi, un numero per un solo socio, correzione solo sul tesseramento in
 * corso, numero corrente nell'elenco soci, stato nello storico.
 *
 * I casi condividono lo stato che si costruiscono, nell'ordine in cui sono
 * scritti:
 *
 *   socio2        un tesseramento scaduto              N_test_S2
 *   istruttore2   un tesseramento in scadenza          N_test_I2
 *   socio1        due rinnovi attivi, il primo superato N_test_S1 → N_test_S1B
 *   senzaAccount  mai tesserato, fino all'ultimo caso
 */

import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, type Sessione } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

/** Riconoscibile come dato di prova, e lungo esattamente quanto il massimo. */
const TRENTA = 'N_test_' + 'X'.repeat(23);

describe('Numero di tessera', () => {
  let d: DatiTest;
  let admin: Sessione;
  // Il primo rinnovo di socio1, superato dal secondo, e il secondo.
  let socio1Primo: string;
  let socio1Secondo: string;
  let socio2Scaduto: string;
  let istruttore2InScadenza: string;

  const rinnova = (body: Record<string, unknown>) => api(admin, 'POST', '/api/tesseramenti', body);
  const correggi = (s: Sessione, id: string, numero_tessera: unknown) =>
    api(s, 'PATCH', `/api/tesseramenti/rinnovi/${id}`, { numero_tessera });
  const storico = async (socioId: string) => {
    const r = await api(admin, 'GET', `/api/tesseramenti/${socioId}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body as any[];
  };
  const sociDiProva = async () => {
    const r = await api(admin, 'GET', '/api/soci?q=_test&limit=50');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data as any[];
  };

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;

    const crea = async (body: Record<string, unknown>) => {
      const r = await rinnova(body);
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return r.body.id as string;
    };
    socio2Scaduto = await crea({ socio_id: d.soci.socio2, data_rinnovo: giorniFa(400), scadenza: giorniFa(35), numero_tessera: 'N_test_S2' });
    istruttore2InScadenza = await crea({ socio_id: d.soci.istruttore2, data_rinnovo: giorniFa(355), scadenza: giorniFa(-10), numero_tessera: 'N_test_I2' });
    socio1Primo = await crea({ socio_id: d.soci.socio1, data_rinnovo: giorniFa(0), scadenza: giorniFa(-100), numero_tessera: 'N_test_S1' });
  });
  after(() => pulisciDatiTest());

  describe('registrazione (R2–R4)', () => {
    it('rinnovo senza numero di tessera → 400', async () => {
      const r = await rinnova({ socio_id: d.soci.senzaAccount, scadenza: giorniFa(-365) });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('numero di soli spazi → 400', async () => {
      const r = await rinnova({ socio_id: d.soci.senzaAccount, scadenza: giorniFa(-365), numero_tessera: '   ' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('numero di 30 caratteri accettato, di 31 → 400', async () => {
      // Il caso accettato è più sotto ("ultimo caso"): senzaAccount deve
      // restare mai tesserato fino ad allora. Qui il rifiuto.
      const r = await rinnova({ socio_id: d.soci.senzaAccount, scadenza: giorniFa(-365), numero_tessera: 'N_test_' + 'X'.repeat(24) });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('numero già di un altro socio → 409 con il nome', async () => {
      const r = await rinnova({ socio_id: d.soci.senzaAccount, scadenza: giorniFa(-365), numero_tessera: 'N_test_S2' });
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.match(JSON.stringify(r.body), /romano_test/);
      // Rifiutato prima di scrivere: senzaAccount resta mai tesserato.
      assert.equal((await storico(d.soci.senzaAccount)).length, 0);
    });

    it('lo stesso socio riusa il numero nel rinnovo → 201', async () => {
      const r = await rinnova({ socio_id: d.soci.socio1, data_rinnovo: giorniFa(0), scadenza: giorniFa(-465), numero_tessera: 'N_test_S1' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      socio1Secondo = r.body.id;
    });

    it('il numero viene salvato senza spazi ai lati', async () => {
      const r = await correggi(admin, socio1Secondo, '  N_test_S1B  ');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.numero_tessera, 'N_test_S1B');
    });
  });

  describe('correzione (R6)', () => {
    it('correzione del numero del tesseramento in corso → 200', async () => {
      const r = await correggi(admin, istruttore2InScadenza, 'N_test_I2');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.numero_tessera, 'N_test_I2');
    });

    it('correzione di un tesseramento superato da un rinnovo → 409', async () => {
      const r = await correggi(admin, socio1Primo, 'N_test_altro');
      assert.equal(r.status, 409, JSON.stringify(r.body));
    });

    it('correzione di un tesseramento scaduto → 409', async () => {
      const r = await correggi(admin, socio2Scaduto, 'N_test_altro');
      assert.equal(r.status, 409, JSON.stringify(r.body));
    });

    it('id inesistente → 404', async () => {
      const r = await correggi(admin, randomUUID(), 'N_test_altro');
      assert.equal(r.status, 404, JSON.stringify(r.body));
    });

    it('socio che corregge → 403', async () => {
      const r = await correggi(d.sessioni.socio1, socio1Secondo, 'N_test_altro');
      assert.equal(r.status, 403, JSON.stringify(r.body));
    });

    it('correzione con numero di un altro socio → 409', async () => {
      const r = await correggi(admin, istruttore2InScadenza, 'N_test_S2');
      assert.equal(r.status, 409, JSON.stringify(r.body));
    });
  });

  describe('numero corrente ed elenco soci (R7, R8)', () => {
    it('il numero corrente è quello dell\'ultimo rinnovo', async () => {
      const socio1 = (await sociDiProva()).find(s => s.id === d.soci.socio1);
      assert.equal(socio1.numero_tessera, 'N_test_S1B');
    });

    it('socio mai tesserato → null', async () => {
      const senza = (await sociDiProva()).find(s => s.id === d.soci.senzaAccount);
      assert.equal(senza.numero_tessera, null);
    });

    it('elenco soci con numero_tessera', async () => {
      const soci = await sociDiProva();
      const numeri = Object.fromEntries(soci.map(s => [s.id, s.numero_tessera]));
      assert.equal(numeri[d.soci.socio2], 'N_test_S2', 'anche a tesseramento scaduto');
      assert.equal(numeri[d.soci.istruttore2], 'N_test_I2');
      assert.ok(soci.every(s => 'numero_tessera' in s));
    });

    it('ricerca per numero di tessera', async () => {
      const r = await api(admin, 'GET', '/api/soci?q=N_test_I2&limit=50');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.data.map((s: any) => s.id), [d.soci.istruttore2]);
    });
  });

  describe('storico (R9, R12)', () => {
    it('lo storico riporta numero_tessera', async () => {
      assert.deepEqual((await storico(d.soci.socio1)).map(t => t.numero_tessera), ['N_test_S1B', 'N_test_S1']);
    });

    it('il socio legge il proprio numero nello storico', async () => {
      const r = await api(d.sessioni.socio1, 'GET', `/api/tesseramenti/${d.soci.socio1}`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body[0].numero_tessera, 'N_test_S1B');
    });

    it('stato attivo, in_scadenza e scaduto nello storico', async () => {
      assert.equal((await storico(d.soci.socio1))[0].stato, 'attivo');
      assert.equal((await storico(d.soci.istruttore2))[0].stato, 'in_scadenza');
      assert.equal((await storico(d.soci.socio2))[0].stato, 'scaduto');
    });

    it('lo stato della prima riga coincide con quello in GET /api/tesseramenti', async () => {
      const r = await api(admin, 'GET', '/api/tesseramenti?q=_test&limit=50');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      for (const riga of r.body.data as any[]) {
        const prima = (await storico(riga.socio_id))[0];
        assert.equal(prima?.stato ?? 'mai', riga.stato, `stato di ${riga.cognome}`);
      }
    });
  });

  it('ultimo caso: numero di 30 caratteri accettato', async () => {
    const r = await rinnova({ socio_id: d.soci.senzaAccount, scadenza: giorniFa(-365), numero_tessera: TRENTA });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.numero_tessera, TRENTA);
  });
});
