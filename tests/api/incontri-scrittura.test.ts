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

  // Spec 010: il saldo negativo non blocca più. La conferma la chiede
  // l'interfaccia; il backend registra l'incontro e il suo addebito.
  let suNegativo: string | undefined;

  it('un incontro su un voucher già negativo viene creato con il suo addebito (201)', async () => {
    const lettore = d.sessioni.istruttore1;
    assert.equal(await saldo(lettore, d.soci.socio2), ATTESE.saldoSocio2);
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', nuovo(d.soci.socio2, 'educazione', 30));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    suNegativo = r.body.id;
    assert.equal(await saldo(lettore, d.soci.socio2), ATTESE.saldoSocio2 - 30);
  });

  it('si modifica il costo di un incontro su un voucher già negativo e l\'addebito si riallinea', async () => {
    assert.ok(suNegativo, 'incontro di prova non creato');
    const r = await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${suNegativo}`, { costo: 40 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio2), ATTESE.saldoSocio2 - 40);
    // Si rimette il saldo com'era: i test che seguono partono dalle ATTESE.
    assert.equal((await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${suNegativo}`)).status, 204);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio2), ATTESE.saldoSocio2);
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
    const r = await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${creato}`, { costo: 20 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), ATTESE.saldoSocio1 - 20);
  });

  it('un istruttore non modifica né elimina incontri tenuti da altri (403)', async () => {
    const altrui = await api(d.sessioni.istruttore1, 'GET', `/api/incontri?istruttore_id=${d.sessioni.istruttore1.id}&limit=1`);
    const id = altrui.body.data[0].id;
    assert.equal((await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${id}`, { costo: 1 })).status, 403);
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

  // Incontro di gruppo (spec 010): nessuna API apposita, il frontend chiama la
  // creazione una volta per socio. Qui si fa lo stesso.
  describe('incontro di gruppo', () => {
    const gruppo: { socio: string; id: string }[] = [];

    it('tre creazioni con gli stessi dati comuni e note diverse danno tre incontri, ciascuno con il proprio addebito e la propria nota', async () => {
      const lettore = d.sessioni.istruttore1;
      const soci = [d.soci.socio1, d.soci.socio2, d.soci.istruttore2];
      const prima = await Promise.all(soci.map(s => saldo(lettore, s)));
      const data = giorniFa(2);

      for (const [n, socio] of soci.entries()) {
        const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri',
          nuovo(socio, 'educazione', 30, { data_incontro: data, note: `Nota del socio ${n + 1}` }));
        assert.equal(r.status, 201, JSON.stringify(r.body));
        gruppo.push({ socio, id: r.body.id });
      }

      for (const [n, { socio, id }] of gruppo.entries()) {
        const r = await api(d.sessioni.istruttore2, 'GET', `/api/incontri/${id}`);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.socio_id, socio);
        assert.equal(r.body.istruttore_id, d.sessioni.istruttore2.id);
        assert.equal(Number(r.body.costo), 30);
        assert.equal(r.body.note, `Nota del socio ${n + 1}`);
        assert.equal(await saldo(lettore, socio), prima[n] - 30);
      }
    });

    it('eliminando uno degli incontri di gruppo gli altri e i loro addebiti restano', async () => {
      assert.equal(gruppo.length, 3, 'incontri di gruppo non creati');
      const lettore = d.sessioni.istruttore1;
      const [tolto, ...restanti] = gruppo;
      const saldiRestanti = await Promise.all(restanti.map(g => saldo(lettore, g.socio)));

      assert.equal((await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${tolto.id}`)).status, 204);

      for (const [n, g] of restanti.entries()) {
        assert.equal((await api(d.sessioni.istruttore2, 'GET', `/api/incontri/${g.id}`)).status, 200);
        assert.equal(await saldo(lettore, g.socio), saldiRestanti[n]);
      }
      for (const g of restanti) {
        assert.equal((await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${g.id}`)).status, 204);
      }
    });
  });
});
