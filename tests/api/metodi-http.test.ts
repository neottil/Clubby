/**
 * Metodo HTTP delle modifiche (spec 008).
 *
 * Le quattro modifiche parziali (soci, incontri, attività, impostazioni) si
 * fanno con PATCH; dalla fase 2 un PUT su di esse risponde 404, come ogni
 * metodo non previsto. Le abilitazioni degli istruttori restano PUT: il corpo
 * sostituisce l'intero insieme.
 *
 * Ogni caso parte da un database vuoto e crea il record che modifica; le
 * impostazioni tornano quelle iniziali prima di ogni caso (ambiente.ts).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, servizi } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAdmin, creaAttivita, creaIncontro, creaIstruttore, creaSocio } from './fabbrica.ts';

usaAmbiente();

describe('Metodi HTTP delle modifiche', () => {
  describe('soci', () => {
    it('PATCH su un socio cambia solo il campo inviato', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1');
      const prima = (await api(admin, 'GET', `/api/soci/${socio.id}`)).body;
      const r = await api(admin, 'PATCH', `/api/soci/${socio.id}`, { note: 'nota da PATCH_test' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.note, 'nota da PATCH_test');
      assert.equal(r.body.nome, prima.nome);
      assert.equal(r.body.cognome, prima.cognome);
      assert.equal(r.body.telefono, prima.telefono);
    });

    it('PATCH su un socio da non admin → 403', async () => {
      const admin = await creaAdmin();
      const istruttore = await creaIstruttore(admin, 'istruttore2');
      const socio = await creaSocio(admin, 'socio1');
      const r = await api(istruttore, 'PATCH', `/api/soci/${socio.id}`, { note: 'no' });
      assert.equal(r.status, 403);
      assert.equal((await api(admin, 'GET', `/api/soci/${socio.id}`)).body.note, 'Creato dai test API');
    });

    it('PUT su un socio → 404 (fase 2)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1');
      const r = await api(admin, 'PUT', `/api/soci/${socio.id}`, { note: 'nota da PUT_test' });
      assert.equal(r.status, 404);
      assert.equal((await api(admin, 'GET', `/api/soci/${socio.id}`)).body.note, 'Creato dai test API');
    });
  });

  describe('incontri', () => {
    /** Un admin, istruttore2 abilitato a educazione e socio1 con un voucher da 100. */
    async function scenario() {
      const admin = await creaAdmin('istruttore1');
      const educazione = await creaAttivita(admin, 'educazione', 30);
      const istruttore2 = await creaIstruttore(admin, 'istruttore2', [educazione]);
      const socio1 = (await creaSocio(admin, 'socio1', { ricarica: 100 })).id;
      return { admin, istruttore2, socio1, educazione };
    }

    it('PATCH su un incontro cambia solo il campo inviato', async () => {
      const d = await scenario();
      const c = await api(d.istruttore2, 'POST', '/api/incontri', {
        socio_id: d.socio1,
        data_incontro: giorniFa(1),
        attivita_id: d.educazione,
        costo: 30,
        note: 'Creato dai test API',
      });
      assert.equal(c.status, 201, JSON.stringify(c.body));

      const r = await api(d.istruttore2, 'PATCH', `/api/incontri/${c.body.id}`, { note: 'nota da PATCH_test' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.note, 'nota da PATCH_test');
      assert.equal(Number(r.body.costo), 30);
      assert.equal(r.body.attivita_id, d.educazione);
      assert.equal(r.body.istruttore_id, d.istruttore2.id);
    });

    it('PUT su un incontro → 404 (fase 2)', async () => {
      const d = await scenario();
      const incontro = await creaIncontro(d.admin, { socio: d.socio1, attivita: d.educazione, istruttore: d.admin });
      const r = await api(d.admin, 'PUT', `/api/incontri/${incontro.id}`, { costo: 1 });
      assert.equal(r.status, 404);
      assert.equal(Number((await api(d.admin, 'GET', `/api/incontri/${incontro.id}`)).body.costo), 30);
    });

    it('PATCH di un istruttore su un incontro non suo → 403', async () => {
      const d = await scenario();
      const altrui = await creaIncontro(d.admin, { socio: d.socio1, attivita: d.educazione, istruttore: d.admin });
      const r = await api(d.istruttore2, 'PATCH', `/api/incontri/${altrui.id}`, { costo: 1 });
      assert.equal(r.status, 403);
      assert.equal(Number((await api(d.admin, 'GET', `/api/incontri/${altrui.id}`)).body.costo), 30);
    });
  });

  describe('attività', () => {
    it('PATCH su un\'attività cambia solo il campo inviato', async () => {
      const admin = await creaAdmin();
      const passeggiata = await creaAttivita(admin, 'passeggiata', 15);
      const r = await api(admin, 'PATCH', `/api/attivita/${passeggiata}`, { costo_default: 18 });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(Number(r.body.costo_default), 18);
      assert.equal(r.body.nome, 'passeggiata_test');
      assert.equal(r.body.attiva, true);
    });

    it('PUT su un\'attività → 404 (fase 2)', async () => {
      const admin = await creaAdmin();
      const passeggiata = await creaAttivita(admin, 'passeggiata', 15);
      const r = await api(admin, 'PUT', `/api/attivita/${passeggiata}`, { costo_default: 1 });
      assert.equal(r.status, 404);
      const dopo = ((await api(admin, 'GET', '/api/attivita?tutte=1')).body as any[]).find(a => a.id === passeggiata);
      assert.equal(Number(dopo.costo_default), 15);
    });
  });

  describe('impostazioni', () => {
    it('PATCH sulle impostazioni cambia solo la chiave inviata', async () => {
      const admin = await creaAdmin();
      const originali = (await api(admin, 'GET', '/api/impostazioni')).body;
      const pie = 'Piè di pagina da PATCH (prova_test).';
      const r = await api(admin, 'PATCH', '/api/impostazioni', { ricevuta_pie_pagina: pie });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.ricevuta_pie_pagina, pie);
      assert.equal(r.body.ricevuta_intestazione, originali.ricevuta_intestazione);
      assert.equal(r.body.quota_tesseramento, originali.quota_tesseramento);
      assert.equal(r.body.percentuale_ricarica, originali.percentuale_ricarica);
    });

    it('PUT sulle impostazioni → 404 (fase 2)', async () => {
      const admin = await creaAdmin();
      const prima = (await api(admin, 'GET', '/api/impostazioni')).body;
      const r = await api(admin, 'PUT', '/api/impostazioni', { ricevuta_pie_pagina: 'da PUT (prova_test)' });
      assert.equal(r.status, 404);
      assert.deepEqual((await api(admin, 'GET', '/api/impostazioni')).body, prima);
    });
  });

  describe('abilitazioni degli istruttori', () => {
    it('le abilitazioni si sostituiscono ancora con PUT', async () => {
      const admin = await creaAdmin();
      const educazione = await creaAttivita(admin, 'educazione');
      const dogdance = await creaAttivita(admin, 'dogdance');
      const istruttore2 = await creaIstruttore(admin, 'istruttore2', [educazione, dogdance]);
      const percorso = `/api/istruttori/${istruttore2.id}/attivita`;
      assert.equal((await api(admin, 'GET', percorso)).body.attivita_ids.length, 2);
      const r = await api(admin, 'PUT', percorso, { attivita_ids: [educazione] });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.attivita_ids, [educazione]);
      assert.deepEqual((await api(admin, 'GET', percorso)).body.attivita_ids, [educazione]);
    });
  });

  describe('CORS', () => {
    it('il preflight CORS ammette PATCH', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1');
      const r = await fetch(`${servizi.api}/api/soci/${socio.id}`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'PATCH',
          'Access-Control-Request-Headers': 'authorization, content-type',
        },
      });
      assert.equal(r.status, 204);
      const metodi = (r.headers.get('access-control-allow-methods') ?? '').split(',').map(m => m.trim());
      assert.ok(metodi.includes('PATCH'), `metodi ammessi: ${metodi.join(', ')}`);
    });
  });
});
