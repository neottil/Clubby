/**
 * Richieste malformate o su route inesistenti: devono essere rifiutate come
 * errori di chi chiama (400/404), senza effetti e senza passare per un 500.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authApi, CorpoGrezzo } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Richieste non valide', () => {
  let d: DatiTest;
  before(async () => { d = await preparaDati(); });
  after(() => pulisciDatiTest());

  describe('corpo della richiesta', () => {
    it('il backend rifiuta un JSON malformato con 400', async () => {
      const r = await api(d.sessioni.istruttore1, 'POST', '/api/soci', new CorpoGrezzo('{"nome": '));
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'Corpo della richiesta non è JSON valido');
    });

    for (const testo of ['null', '42', '[]']) {
      it(`il backend rifiuta un corpo che non è un oggetto (${testo}) con 400`, async () => {
        const r = await api(d.sessioni.istruttore1, 'PUT', '/api/impostazioni', new CorpoGrezzo(testo));
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'Il corpo della richiesta deve essere un oggetto JSON');
      });
    }

    it('l\'authorizer rifiuta un JSON malformato con 400', async () => {
      const r = await authApi(undefined, 'POST', '/auth/refresh', new CorpoGrezzo('{'));
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'Corpo della richiesta non è JSON valido');
    });

    it('l\'authorizer rifiuta un corpo null con 400', async () => {
      const r = await authApi(undefined, 'POST', '/auth/refresh', new CorpoGrezzo('null'));
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'Il corpo della richiesta deve essere un oggetto JSON');
    });
  });

  describe('route', () => {
    it('POST su un socio esistente non crea un socio nuovo', async () => {
      const r = await api(d.sessioni.istruttore1, 'POST', `/api/soci/${d.soci.socio1}`, {
        nome: 'doppione_test', cognome: 'doppione_test',
      });
      assert.equal(r.status, 404);
      const soci = await api(d.sessioni.istruttore1, 'GET', '/api/soci');
      assert.ok(!(soci.body as any[]).some(s => s.nome === 'doppione_test'));
    });

    it('POST su un incontro esistente non crea un incontro nuovo', async () => {
      const prima = await api(d.sessioni.istruttore1, 'GET', `/api/incontri?socio_id=${d.soci.socio2}&limit=1`);
      const r = await api(d.sessioni.istruttore1, 'POST', `/api/incontri/${d.soci.socio2}`, {
        socio_id: d.soci.socio2,
        data_incontro: '2020-01-01',
        attivita_id: d.attivita.educazione,
        costo: 1,
      });
      assert.equal(r.status, 404);
      const dopo = await api(d.sessioni.istruttore1, 'GET', `/api/incontri?socio_id=${d.soci.socio2}&limit=1`);
      assert.equal(dopo.body.total, prima.body.total);
    });

    it('GET /api/voucher/{id} non esiste', async () => {
      const r = await api(d.sessioni.istruttore1, 'GET', `/api/voucher/${d.soci.socio1}`);
      assert.equal(r.status, 404);
    });

    it('le vecchie scorciatoie /promuovi e /retrocedi non esistono più', async () => {
      // Rimosse: facevano ciò che fa /api/admin/amministratore, al quale
      // entrambe delegavano. Il test resta a segnare che la rimozione è
      // voluta, e che nessuno le reintroduca per comodità.
      for (const rotta of ['promuovi', 'retrocedi']) {
        const r = await api(d.sessioni.istruttore1, 'POST', `/api/admin/${rotta}`, {
          utente_id: d.sessioni.socio1.id,
        });
        assert.equal(r.status, 404, rotta);
      }

      // Il sostituto funziona, e il socio resta senza privilegio.
      const concesso = await api(d.sessioni.istruttore1, 'POST', '/api/admin/amministratore', {
        utente_id: d.sessioni.socio1.id, admin: true,
      });
      assert.equal(concesso.status, 200, JSON.stringify(concesso.body));
      const tolto = await api(d.sessioni.istruttore1, 'POST', '/api/admin/amministratore', {
        utente_id: d.sessioni.socio1.id, admin: false,
      });
      assert.equal(tolto.status, 200, JSON.stringify(tolto.body));
    });
  });
});
