/**
 * Chi registra, modifica ed elimina incontri, e l'effetto sul voucher.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, saldo } from './helpers.ts';
import { ATTESE, preparaDati, pulisciDatiTest, type DatiTest, type NomeAttivita } from './dati.ts';

describe('Incontri: scrittura', () => {
  let d: DatiTest;
  let creato: string | undefined;

  const nuovo = (socioId: string, attivita: NomeAttivita, costo: number, extra: Record<string, unknown> = {}) => ({
    socio_id: socioId,
    data_incontro: giorniFa(1),
    attivita_id: d.attivita[attivita],
    costo,
    note: 'Creato dai test API',
    ...extra,
  });

  before(async () => { d = await preparaDati(); });
  after(() => pulisciDatiTest());

  it('un socio non può registrare incontri (403)', async () => {
    const r = await api(d.sessioni.socio1, 'POST', '/api/incontri', nuovo(d.soci.socio1, 'educazione', 30));
    assert.equal(r.status, 403);
  });

  it('un istruttore non registra attività a cui non è abilitato (400)', async () => {
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', nuovo(d.soci.socio1, 'k9', 35));
    assert.equal(r.status, 400, JSON.stringify(r.body));
  });

  it('nessun nuovo addebito su un voucher già negativo (400)', async () => {
    const admin = d.sessioni.istruttore1;
    assert.equal(await saldo(admin, d.soci.socio2), ATTESE.saldoSocio2);
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', nuovo(d.soci.socio2, 'educazione', 30));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(await saldo(admin, d.soci.socio2), ATTESE.saldoSocio2);
  });

  it('un istruttore registra per sé, qualunque istruttore_id indichi', async () => {
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri',
      nuovo(d.soci.socio1, 'educazione', 30, { istruttore_id: d.sessioni.istruttore1.id }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    creato = r.body.id;
    assert.equal(r.body.istruttore_id, d.sessioni.istruttore2.id);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), ATTESE.saldoSocio1 - 30);
  });

  it('modificando il costo si riallinea l\'addebito', async () => {
    assert.ok(creato, 'incontro di prova non creato');
    const r = await api(d.sessioni.istruttore2, 'PUT', `/api/incontri/${creato}`, { costo: 20 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), ATTESE.saldoSocio1 - 20);
  });

  it('un istruttore non modifica né elimina incontri tenuti da altri (403)', async () => {
    const altrui = await api(d.sessioni.istruttore1, 'GET', `/api/incontri?istruttore_id=${d.sessioni.istruttore1.id}&limit=1`);
    const id = altrui.body.data[0].id;
    assert.equal((await api(d.sessioni.istruttore2, 'PUT', `/api/incontri/${id}`, { costo: 1 })).status, 403);
    assert.equal((await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${id}`)).status, 403);
  });

  it('il dettaglio è visibile al socio interessato, non agli altri', async () => {
    assert.ok(creato, 'incontro di prova non creato');
    assert.equal((await api(d.sessioni.socio1, 'GET', `/api/incontri/${creato}`)).status, 200);
    assert.equal((await api(d.sessioni.socio2, 'GET', `/api/incontri/${creato}`)).status, 403);
  });

  it('eliminando l\'incontro si elimina anche l\'addebito (204)', async () => {
    assert.ok(creato, 'incontro di prova non creato');
    const r = await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${creato}`);
    assert.equal(r.status, 204);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), ATTESE.saldoSocio1);
  });
});
