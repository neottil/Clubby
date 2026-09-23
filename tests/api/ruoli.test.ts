/**
 * Ruolo nel club e privilegio admin, come arrivano nel token.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authApi } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Ruoli nel token', () => {
  let d: DatiTest;
  before(async () => { d = await preparaDati(); });
  after(() => pulisciDatiTest());

  it('istruttore1 è istruttore e admin', () => {
    assert.deepEqual([...d.sessioni.istruttore1.roles].sort(), ['admin', 'istruttore']);
  });

  it('istruttore2 è istruttore, senza privilegio admin', () => {
    assert.deepEqual(d.sessioni.istruttore2.roles, ['istruttore']);
  });

  it('socio1 e socio2 sono soci', () => {
    assert.deepEqual(d.sessioni.socio1.roles, ['socio']);
    assert.deepEqual(d.sessioni.socio2.roles, ['socio']);
  });

  it('/auth/me riporta ruolo e privilegio come campi distinti', async () => {
    const me = await authApi(d.sessioni.istruttore1, 'GET', '/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.ruolo, 'istruttore');
    assert.equal(me.body.admin, true);

    const altro = await authApi(d.sessioni.istruttore2, 'GET', '/auth/me');
    assert.equal(altro.body.ruolo, 'istruttore');
    assert.equal(altro.body.admin, false);
  });
});
