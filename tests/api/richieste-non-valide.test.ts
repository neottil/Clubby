/**
 * Richieste malformate o su route inesistenti: devono essere rifiutate come
 * errori di chi chiama (400/404), senza effetti e senza passare per un 500.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authApi, CorpoGrezzo } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIncontro, creaSocio } from './fabbrica.ts';

usaAmbiente();

describe('Richieste non valide', () => {
  describe('corpo della richiesta', () => {
    it('il backend rifiuta un JSON malformato con 400', async () => {
      const admin = await creaAdmin();
      const r = await api(admin, 'POST', '/api/soci', new CorpoGrezzo('{"nome": '));
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'Corpo della richiesta non è JSON valido');
    });

    for (const testo of ['null', '42', '[]']) {
      it(`il backend rifiuta un corpo che non è un oggetto (${testo}) con 400`, async () => {
        const admin = await creaAdmin();
        const r = await api(admin, 'PATCH', '/api/impostazioni', new CorpoGrezzo(testo));
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
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1');
      const r = await api(admin, 'POST', `/api/soci/${socio.id}`, {
        nome: 'doppione_test', cognome: 'doppione_test',
      });
      assert.equal(r.status, 404);
      const soci = await api(admin, 'GET', '/api/soci');
      assert.deepEqual((soci.body as any[]).map(s => s.id), [socio.id]);
    });

    it('POST su un incontro esistente non crea un incontro nuovo', async () => {
      const admin = await creaAdmin();
      const educazione = await creaAttivita(admin, 'educazione');
      const socio = await creaSocio(admin, 'socio2', { ricarica: 100 });
      const incontro = await creaIncontro(admin, { socio: socio.id, attivita: educazione, istruttore: admin });
      const r = await api(admin, 'POST', `/api/incontri/${incontro.id}`, {
        socio_id: socio.id,
        data_incontro: '2020-01-01',
        attivita_id: educazione,
        costo: 1,
      });
      assert.equal(r.status, 404);
      const dopo = await api(admin, 'GET', `/api/incontri?socio_id=${socio.id}&limit=1`);
      assert.equal(dopo.body.total, 1);
    });

    it('GET /api/voucher/{id} non esiste', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1', { ricarica: 50 });
      assert.equal((await api(admin, 'GET', `/api/voucher/${socio.voucherId}`)).status, 404);
      const r = await api(admin, 'GET', `/api/voucher/${socio.id}`);
      assert.equal(r.status, 404);
    });

    it('le vecchie scorciatoie /promuovi e /retrocedi non esistono più', async () => {
      // Rimosse: facevano ciò che fa /api/admin/amministratore, al quale
      // entrambe delegavano. Il test resta a segnare che la rimozione è
      // voluta, e che nessuno le reintroduca per comodità.
      const admin = await creaAdmin();
      const socio1 = await creaAccount(admin, 'socio1');
      for (const rotta of ['promuovi', 'retrocedi']) {
        const r = await api(admin, 'POST', `/api/admin/${rotta}`, {
          utente_id: socio1.id,
        });
        assert.equal(r.status, 404, rotta);
      }

      // Il sostituto funziona, e il socio resta senza privilegio.
      const concesso = await api(admin, 'POST', '/api/admin/amministratore', {
        utente_id: socio1.id, admin: true,
      });
      assert.equal(concesso.status, 200, JSON.stringify(concesso.body));
      const tolto = await api(admin, 'POST', '/api/admin/amministratore', {
        utente_id: socio1.id, admin: false,
      });
      assert.equal(tolto.status, 200, JSON.stringify(tolto.body));
    });
  });
});
