/**
 * Ruolo nel club e privilegio admin, come arrivano nel token.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authApi } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin } from './fabbrica.ts';

usaAmbiente();

describe('Ruoli nel token', () => {
  it('istruttore1 è istruttore e admin', async () => {
    const istruttore1 = await creaAdmin('istruttore1', 'istruttore');
    assert.deepEqual([...istruttore1.roles].sort(), ['admin', 'istruttore']);
  });

  it('istruttore2 è istruttore, senza privilegio admin', async () => {
    const admin = await creaAdmin();
    const istruttore2 = await creaAccount(admin, 'istruttore2', 'istruttore');
    assert.deepEqual(istruttore2.roles, ['istruttore']);
  });

  it('socio1 e socio2 sono soci', async () => {
    const admin = await creaAdmin();
    const socio1 = await creaAccount(admin, 'socio1');
    const socio2 = await creaAccount(admin, 'socio2');
    assert.deepEqual(socio1.roles, ['socio']);
    assert.deepEqual(socio2.roles, ['socio']);
  });

  it('/auth/me riporta ruolo e privilegio come campi distinti', async () => {
    const istruttore1 = await creaAdmin('istruttore1', 'istruttore');
    const istruttore2 = await creaAccount(istruttore1, 'istruttore2', 'istruttore');

    const me = await authApi(istruttore1, 'GET', '/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.ruolo, 'istruttore');
    assert.equal(me.body.admin, true);

    const altro = await authApi(istruttore2, 'GET', '/auth/me');
    assert.equal(altro.body.ruolo, 'istruttore');
    assert.equal(altro.body.admin, false);
  });
});
