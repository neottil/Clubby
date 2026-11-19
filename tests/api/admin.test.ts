/**
 * Pannello admin: accesso riservato, privilegio admin e ruolo nel club.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, authApi, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { accedi, creaAccount, creaAdmin, creaSocio } from './fabbrica.ts';

usaAmbiente();

describe('Amministrazione', () => {
  const utente = async (admin: Sessione, id: string) => {
    const r = await api(admin, 'GET', '/api/admin/users');
    return (r.body as any[]).find(u => u.id === id);
  };

  it('chi non è admin non accede alle API di amministrazione (403)', async () => {
    const admin = await creaAdmin();
    const istruttore = await creaAccount(admin, 'istruttore2', 'istruttore');
    const socio = await creaAccount(admin, 'socio1');
    assert.equal((await api(istruttore, 'GET', '/api/admin/users')).status, 403);
    const r = await api(socio, 'POST', '/api/admin/amministratore', { utente_id: socio.id, admin: true });
    assert.equal(r.status, 403);
  });

  it('l\'elenco utenti riporta ruolo e privilegio admin', async () => {
    const admin = await creaAdmin('istruttore1', 'istruttore');
    const socio = await creaAccount(admin, 'socio1');
    const istr1 = await utente(admin, admin.id);
    assert.equal(istr1.ruolo, 'istruttore');
    assert.equal(istr1.admin, true);
    const socio1 = await utente(admin, socio.id);
    assert.equal(socio1.ruolo, 'socio');
    assert.equal(socio1.admin, false);
  });

  it('un admin non può togliersi il privilegio (400)', async () => {
    const admin = await creaAdmin();
    const r = await api(admin, 'POST', '/api/admin/amministratore', { utente_id: admin.id, admin: false });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal((await utente(admin, admin.id)).admin, true);
  });

  it('"admin" non è un ruolo assegnabile (400)', async () => {
    const admin = await creaAdmin();
    const socio = await creaAccount(admin, 'socio1');
    const r = await api(admin, 'POST', '/api/admin/ruolo', { utente_id: socio.id, ruolo: 'admin' });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('concedere il privilegio chiude le sessioni e lo porta nel token', async () => {
    const admin = await creaAdmin();
    const socio = await creaAccount(admin, 'socio1');
    const r = await api(admin, 'POST', '/api/admin/amministratore', { utente_id: socio.id, admin: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const rinnovo = await authApi(undefined, 'POST', '/auth/refresh', { refresh_token: socio.refreshToken });
    assert.equal(rinnovo.status, 401, 'la sessione precedente deve essere revocata');

    const nuova = await accedi(socio);
    assert.deepEqual([...nuova.roles].sort(), ['admin', 'socio']);
    assert.equal((await api(nuova, 'GET', '/api/admin/users')).status, 200);
  });

  it('togliere il privilegio lo rimuove dal token, lasciando il ruolo', async () => {
    const admin = await creaAdmin();
    const socio = await creaAccount(admin, 'socio1');
    await api(admin, 'POST', '/api/admin/amministratore', { utente_id: socio.id, admin: true });
    assert.deepEqual([...(await accedi(socio)).roles].sort(), ['admin', 'socio']);

    const r = await api(admin, 'POST', '/api/admin/amministratore', { utente_id: socio.id, admin: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await accedi(socio)).roles, ['socio']);
  });

  it('disattivare un account non lo scollega dal socio', async () => {
    const admin = await creaAdmin();
    const account = await creaAccount(admin, 'socio2');
    await creaSocio(admin, 'socio2', { account });
    const prima = await utente(admin, account.id);
    assert.ok(prima.socio_id, 'socio2 deve partire collegato');

    const r = await api(admin, 'POST', '/api/admin/attivo', { utente_id: account.id, attivo: false });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    const dopo = await utente(admin, account.id);
    assert.equal(dopo.attivo, false);
    assert.equal(dopo.socio_id, prima.socio_id);
    // Le sessioni sono chiuse: il rinnovo con il vecchio refresh token fallisce.
    const rinnovo = await authApi(undefined, 'POST', '/auth/refresh', { refresh_token: account.refreshToken });
    assert.equal(rinnovo.status, 401);

    const riattiva = await api(admin, 'POST', '/api/admin/attivo', { utente_id: account.id, attivo: true });
    assert.equal(riattiva.status, 200, JSON.stringify(riattiva.body));
    assert.equal((await utente(admin, account.id)).socio_id, prima.socio_id);
  });

  it('scollegare un account non lo disattiva', async () => {
    const admin = await creaAdmin();
    const account = await creaAccount(admin, 'socio2');
    const socio = await creaSocio(admin, 'socio2', { account });
    const r = await api(admin, 'DELETE', `/api/admin/associa-viewer/${socio.id}`);
    assert.equal(r.status, 204, JSON.stringify(r.body));

    const dopo = await utente(admin, account.id);
    assert.equal(dopo.socio_id, null);
    assert.equal(dopo.attivo, true);
    assert.deepEqual((await accedi(account)).roles, ['socio']);
  });

  it('il ruolo nel club si cambia indipendentemente dal privilegio', async () => {
    const admin = await creaAdmin();
    const socio = await creaAccount(admin, 'socio1');
    const r = await api(admin, 'POST', '/api/admin/ruolo', { utente_id: socio.id, ruolo: 'istruttore' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual((await accedi(socio)).roles, ['istruttore']);
  });
});
