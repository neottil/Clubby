/**
 * Listino attività ed elenco soci: cosa arriva a ciascun ruolo.
 *
 * Ogni caso parte da un database vuoto: gli elenchi contengono esattamente i
 * record creati dal caso, e si confrontano per intero.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIstruttore, creaSocio, email } from './fabbrica.ts';

usaAmbiente();

const nomi = (righe: any[]) => righe.map(a => a.nome as string).sort();

/** Un listino con due attività attive, una disattivata, e un istruttore abilitato a una sola. */
async function listino() {
  const admin = await creaAdmin();
  const educazione = await creaAttivita(admin, 'educazione');
  await creaAttivita(admin, 'mantrailing');
  await creaAttivita(admin, 'agility', 30, false);
  const istruttore = await creaIstruttore(admin, 'istruttore2', [educazione]);
  return { admin, istruttore };
}

/** Due soci, uno con l'account collegato. */
async function soci() {
  const admin = await creaAdmin();
  const istruttore = await creaIstruttore(admin, 'istruttore2');
  const account = await creaAccount(admin, 'socio1');
  const socio1 = await creaSocio(admin, 'socio1', { account });
  const socio2 = await creaSocio(admin, 'socio2');
  return { admin, istruttore, account, ids: [socio1.id, socio2.id] };
}

describe('Attività e soci', () => {
  describe('attività', () => {
    it('un istruttore riceve le sole attività a cui è abilitato', async () => {
      const { istruttore } = await listino();
      const r = await api(istruttore, 'GET', '/api/attivita');
      assert.equal(r.status, 200);
      assert.deepEqual(nomi(r.body), ['educazione_test']);
    });

    it('tutte=1 non allarga il listino di chi non è admin', async () => {
      const { istruttore } = await listino();
      const r = await api(istruttore, 'GET', '/api/attivita?tutte=1');
      assert.deepEqual(nomi(r.body), ['educazione_test']);
    });

    it('un socio riceve le attività attive', async () => {
      const { admin } = await listino();
      const socio = await creaAccount(admin, 'socio1');
      const r = await api(socio, 'GET', '/api/attivita');
      assert.ok((r.body as any[]).every(a => a.attiva));
      assert.deepEqual(nomi(r.body), ['educazione_test', 'mantrailing_test']);
    });

    it('l\'admin riceve anche le disattivate con tutte=1', async () => {
      const { admin } = await listino();
      const attive = await api(admin, 'GET', '/api/attivita');
      assert.deepEqual(nomi(attive.body), ['educazione_test', 'mantrailing_test']);
      const tutte = await api(admin, 'GET', '/api/attivita?tutte=1');
      assert.deepEqual(nomi(tutte.body), ['agility_test', 'educazione_test', 'mantrailing_test']);
    });
  });

  describe('soci', () => {
    it('l\'admin vede tutti i soci con i recapiti', async () => {
      const { admin, ids } = await soci();
      const r = await api(admin, 'GET', '/api/soci');
      assert.equal(r.status, 200);
      assert.deepEqual((r.body as any[]).map(s => s.id).sort(), [...ids].sort());
      for (const socio of r.body as any[]) {
        assert.ok(socio.email && socio.telefono, `socio ${socio.id} con i recapiti`);
      }
    });

    it('un istruttore vede tutti i soci, ma solo il nominativo', async () => {
      const { istruttore, ids } = await soci();
      const r = await api(istruttore, 'GET', '/api/soci');
      assert.equal(r.status, 200);
      assert.deepEqual((r.body as any[]).map(s => s.id).sort(), [...ids].sort());
      for (const socio of r.body as any[]) {
        assert.ok(socio.cognome && socio.nome);
        assert.equal(socio.email, undefined);
        assert.equal(socio.telefono, undefined);
      }
    });

    it('un socio vede solo la propria scheda', async () => {
      const { account } = await soci();
      const r = await api(account, 'GET', '/api/soci');
      assert.equal(r.status, 200);
      assert.equal(r.body.length, 1);
      assert.equal(r.body[0].email, email('socio1'));
    });
  });
});
