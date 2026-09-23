/**
 * Pannello admin: accesso riservato, privilegio admin e ruolo nel club.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authApi } from './helpers.ts';
import { ACCOUNT, accedi, preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Amministrazione', () => {
  let d: DatiTest;

  const utente = async (email: string) => {
    const r = await api(d.sessioni.istruttore1, 'GET', '/api/admin/users');
    return (r.body as any[]).find(u => u.email === email);
  };

  before(async () => { d = await preparaDati(); });
  after(() => pulisciDatiTest());

  it('chi non è admin non accede alle API di amministrazione (403)', async () => {
    assert.equal((await api(d.sessioni.istruttore2, 'GET', '/api/admin/users')).status, 403);
    const r = await api(d.sessioni.socio1, 'POST', '/api/admin/amministratore', { utente_id: ACCOUNT.socio1, admin: true });
    assert.equal(r.status, 403);
  });

  it('l\'elenco utenti riporta ruolo e privilegio admin', async () => {
    const istr1 = await utente(ACCOUNT.istruttore1);
    assert.equal(istr1.ruolo, 'istruttore');
    assert.equal(istr1.admin, true);
    const socio1 = await utente(ACCOUNT.socio1);
    assert.equal(socio1.ruolo, 'socio');
    assert.equal(socio1.admin, false);
  });

  it('un admin non può togliersi il privilegio (400)', async () => {
    const r = await api(d.sessioni.istruttore1, 'POST', '/api/admin/amministratore',
      { utente_id: d.sessioni.istruttore1.id, admin: false });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal((await utente(ACCOUNT.istruttore1)).admin, true);
  });

  it('"admin" non è un ruolo assegnabile (400)', async () => {
    const r = await api(d.sessioni.istruttore1, 'POST', '/api/admin/ruolo', { utente_id: ACCOUNT.socio1, ruolo: 'admin' });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('concedere il privilegio chiude le sessioni e lo porta nel token', async () => {
    const r = await api(d.sessioni.istruttore1, 'POST', '/api/admin/amministratore', { utente_id: ACCOUNT.socio1, admin: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const rinnovo = await authApi(undefined, 'POST', '/auth/refresh', { refresh_token: d.sessioni.socio1.refreshToken });
    assert.equal(rinnovo.status, 401, 'la sessione precedente deve essere revocata');

    const nuova = await accedi('socio1');
    assert.deepEqual([...nuova.roles].sort(), ['admin', 'socio']);
    assert.equal((await api(nuova, 'GET', '/api/admin/users')).status, 200);
  });

  it('togliere il privilegio lo rimuove dal token, lasciando il ruolo', async () => {
    const r = await api(d.sessioni.istruttore1, 'POST', '/api/admin/amministratore', { utente_id: ACCOUNT.socio1, admin: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await accedi('socio1')).roles, ['socio']);
  });

  it('disattivare un account non lo scollega dal socio', async () => {
    const prima = await utente(ACCOUNT.socio2);
    assert.ok(prima.socio_id, 'socio2 deve partire collegato');

    const r = await api(d.sessioni.istruttore1, 'POST', '/api/admin/attivo', { utente_id: ACCOUNT.socio2, attivo: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const dopo = await utente(ACCOUNT.socio2);
    assert.equal(dopo.attivo, false);
    assert.equal(dopo.socio_id, prima.socio_id);
    // Le sessioni sono chiuse: il rinnovo con il vecchio refresh token fallisce.
    const rinnovo = await authApi(undefined, 'POST', '/auth/refresh', { refresh_token: d.sessioni.socio2.refreshToken });
    assert.equal(rinnovo.status, 401);

    const riattiva = await api(d.sessioni.istruttore1, 'POST', '/api/admin/attivo', { utente_id: ACCOUNT.socio2, attivo: true });
    assert.equal(riattiva.status, 200, JSON.stringify(riattiva.body));
    assert.equal((await utente(ACCOUNT.socio2)).socio_id, prima.socio_id);
  });

  it('scollegare un account non lo disattiva', async () => {
    const prima = await utente(ACCOUNT.socio2);
    const r = await api(d.sessioni.istruttore1, 'DELETE', `/api/admin/associa-viewer/${prima.socio_id}`);
    assert.equal(r.status, 204, JSON.stringify(r.body));

    const dopo = await utente(ACCOUNT.socio2);
    assert.equal(dopo.socio_id, null);
    assert.equal(dopo.attivo, true);
    assert.deepEqual((await accedi('socio2')).roles, ['socio']);
  });

  it('il ruolo nel club si cambia indipendentemente dal privilegio', async () => {
    const r = await api(d.sessioni.istruttore1, 'POST', '/api/admin/ruolo', { utente_id: ACCOUNT.socio1, ruolo: 'istruttore' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await accedi('socio1')).roles, ['istruttore']);
  });
});
