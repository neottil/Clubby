/**
 * Metodo HTTP delle modifiche (spec 008).
 *
 * Le quattro modifiche parziali (soci, incontri, attività, impostazioni) si
 * fanno con PATCH; dalla fase 2 un PUT su di esse risponde 404, come ogni
 * metodo non previsto. Le abilitazioni degli istruttori restano PUT: il corpo
 * sostituisce l'intero insieme.
 *
 * Le impostazioni sono una riga sola per club, non un dato con il suffisso
 * _test: quelle toccate qui si rimettono com'erano anche se un assert fallisce.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { API_URL, api, giorniFa, type Sessione } from './helpers.ts';
import { ATTESE, preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Metodi HTTP delle modifiche', () => {
  let d: DatiTest;
  let admin: Sessione;

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
  });
  after(() => pulisciDatiTest());

  describe('soci', () => {
    it('PATCH su un socio cambia solo il campo inviato', async () => {
      const prima = (await api(admin, 'GET', `/api/soci/${d.soci.senzaAccount}`)).body;
      const r = await api(admin, 'PATCH', `/api/soci/${d.soci.senzaAccount}`, { note: 'nota da PATCH_test' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.note, 'nota da PATCH_test');
      assert.equal(r.body.nome, prima.nome);
      assert.equal(r.body.cognome, prima.cognome);
      assert.equal(r.body.telefono, prima.telefono);
    });

    it('PATCH su un socio da non admin → 403', async () => {
      const r = await api(d.sessioni.istruttore2, 'PATCH', `/api/soci/${d.soci.senzaAccount}`, { note: 'no' });
      assert.equal(r.status, 403);
    });

    it('PUT su un socio → 404 (fase 2)', async () => {
      const r = await api(admin, 'PUT', `/api/soci/${d.soci.senzaAccount}`, { note: 'nota da PUT_test' });
      assert.equal(r.status, 404);
    });
  });

  describe('incontri', () => {
    let creato: string | undefined;

    it('PATCH su un incontro cambia solo il campo inviato', async () => {
      const c = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', {
        socio_id: d.soci.socio1,
        data_incontro: giorniFa(1),
        attivita_id: d.attivita.educazione,
        costo: 30,
        note: 'Creato dai test API',
      });
      assert.equal(c.status, 201, JSON.stringify(c.body));
      creato = c.body.id;

      const r = await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${creato}`, { note: 'nota da PATCH_test' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.note, 'nota da PATCH_test');
      assert.equal(Number(r.body.costo), 30);
      assert.equal(r.body.attivita_id, d.attivita.educazione);
      assert.equal(r.body.istruttore_id, d.sessioni.istruttore2.id);

      assert.equal((await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${creato}`)).status, 204);
    });

    it('PUT su un incontro → 404 (fase 2)', async () => {
      const altrui = await api(admin, 'GET', `/api/incontri?istruttore_id=${admin.id}&limit=1`);
      const r = await api(admin, 'PUT', `/api/incontri/${altrui.body.data[0].id}`, { costo: 1 });
      assert.equal(r.status, 404);
    });

    it('PATCH di un istruttore su un incontro non suo → 403', async () => {
      const altrui = await api(admin, 'GET', `/api/incontri?istruttore_id=${admin.id}&limit=1`);
      const id = altrui.body.data[0].id;
      const r = await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${id}`, { costo: 1 });
      assert.equal(r.status, 403);
    });
  });

  describe('attività', () => {
    it('PATCH su un\'attività cambia solo il campo inviato', async () => {
      const prima = ((await api(admin, 'GET', '/api/attivita?tutte=1')).body as any[])
        .find(a => a.id === d.attivita.passeggiata);
      const r = await api(admin, 'PATCH', `/api/attivita/${d.attivita.passeggiata}`, { costo_default: 18 });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(Number(r.body.costo_default), 18);
      assert.equal(r.body.nome, prima.nome);
      assert.equal(r.body.attiva, prima.attiva);
    });

    it('PUT su un\'attività → 404 (fase 2)', async () => {
      const r = await api(admin, 'PUT', `/api/attivita/${d.attivita.passeggiata}`, { costo_default: 1 });
      assert.equal(r.status, 404);
    });
  });

  describe('impostazioni', () => {
    it('PATCH sulle impostazioni cambia solo la chiave inviata', async () => {
      const originali = (await api(admin, 'GET', '/api/impostazioni')).body;
      const pie = 'Piè di pagina da PATCH (prova_test).';
      try {
        const r = await api(admin, 'PATCH', '/api/impostazioni', { ricevuta_pie_pagina: pie });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.ricevuta_pie_pagina, pie);
        assert.equal(r.body.ricevuta_intestazione, originali.ricevuta_intestazione);
        assert.equal(r.body.quota_tesseramento, originali.quota_tesseramento);
        assert.equal(r.body.percentuale_ricarica, originali.percentuale_ricarica);
      } finally {
        await api(admin, 'PATCH', '/api/impostazioni', { ricevuta_pie_pagina: originali.ricevuta_pie_pagina ?? '' });
      }
    });

    it('PUT sulle impostazioni → 404 (fase 2)', async () => {
      const prima = (await api(admin, 'GET', '/api/impostazioni')).body;
      const r = await api(admin, 'PUT', '/api/impostazioni', { ricevuta_pie_pagina: 'da PUT (prova_test)' });
      assert.equal(r.status, 404);
      assert.deepEqual((await api(admin, 'GET', '/api/impostazioni')).body, prima);
    });
  });

  describe('abilitazioni degli istruttori', () => {
    it('le abilitazioni si sostituiscono ancora con PUT', async () => {
      const percorso = `/api/istruttori/${d.sessioni.istruttore2.id}/attivita`;
      const prima: string[] = (await api(admin, 'GET', percorso)).body.attivita_ids;
      assert.equal(prima.length, ATTESE.abilitazioniIstruttore2.length);
      try {
        const r = await api(admin, 'PUT', percorso, { attivita_ids: [d.attivita.educazione] });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual(r.body.attivita_ids, [d.attivita.educazione]);
      } finally {
        await api(admin, 'PUT', percorso, { attivita_ids: prima });
      }
    });
  });

  describe('CORS', () => {
    it('il preflight CORS ammette PATCH', async () => {
      const r = await fetch(`${API_URL}/api/soci/${d.soci.senzaAccount}`, {
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
