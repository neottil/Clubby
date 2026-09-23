/**
 * Listino attività ed elenco soci: cosa arriva a ciascun ruolo.
 *
 * Il database può contenere attività e soci reali oltre a quelli di prova:
 * dove l'elenco non è ristretto a chi chiede, si verifica la presenza (o
 * l'assenza) dei record di prova invece di contare le righe.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helpers.ts';
import { ACCOUNT, ATTESE, preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

const nomi = (righe: any[]) => righe.map(a => a.nome as string);

describe('Attività e soci', () => {
  let d: DatiTest;
  before(async () => { d = await preparaDati(); });
  after(() => pulisciDatiTest());

  describe('attività', () => {
    it('un istruttore riceve le sole attività a cui è abilitato', async () => {
      const r = await api(d.sessioni.istruttore2, 'GET', '/api/attivita');
      assert.equal(r.status, 200);
      assert.deepEqual(nomi(r.body).sort(), ATTESE.abilitazioniIstruttore2);
    });

    it('tutte=1 non allarga il listino di chi non è admin', async () => {
      const r = await api(d.sessioni.istruttore2, 'GET', '/api/attivita?tutte=1');
      assert.deepEqual(nomi(r.body).sort(), ATTESE.abilitazioniIstruttore2);
    });

    it('un socio riceve le attività attive', async () => {
      const r = await api(d.sessioni.socio1, 'GET', '/api/attivita');
      assert.ok((r.body as any[]).every(a => a.attiva));
      for (const nome of ATTESE.attivitaAttive) assert.ok(nomi(r.body).includes(nome), nome);
      assert.ok(!nomi(r.body).includes(ATTESE.attivitaDisattivata));
    });

    it('l\'admin riceve anche le disattivate con tutte=1', async () => {
      const attive = await api(d.sessioni.istruttore1, 'GET', '/api/attivita');
      assert.ok(!nomi(attive.body).includes(ATTESE.attivitaDisattivata));
      const tutte = await api(d.sessioni.istruttore1, 'GET', '/api/attivita?tutte=1');
      assert.ok(nomi(tutte.body).includes(ATTESE.attivitaDisattivata));
    });
  });

  describe('soci', () => {
    it('l\'admin vede tutti i soci con i recapiti', async () => {
      const r = await api(d.sessioni.istruttore1, 'GET', '/api/soci');
      assert.equal(r.status, 200);
      for (const id of Object.values(d.soci)) {
        const socio = (r.body as any[]).find(s => s.id === id);
        assert.ok(socio?.email && socio.telefono, `socio ${id} con i recapiti`);
      }
    });

    it('un istruttore vede tutti i soci, ma solo il nominativo', async () => {
      const r = await api(d.sessioni.istruttore2, 'GET', '/api/soci');
      assert.equal(r.status, 200);
      for (const id of Object.values(d.soci)) {
        assert.ok((r.body as any[]).some(s => s.id === id), `socio ${id} presente`);
      }
      for (const socio of r.body as any[]) {
        assert.ok(socio.cognome && socio.nome);
        assert.equal(socio.email, undefined);
        assert.equal(socio.telefono, undefined);
      }
    });

    it('un socio vede solo la propria scheda', async () => {
      const r = await api(d.sessioni.socio1, 'GET', '/api/soci');
      assert.equal(r.status, 200);
      assert.equal(r.body.length, 1);
      assert.equal(r.body[0].email, ACCOUNT.socio1);
    });
  });
});
