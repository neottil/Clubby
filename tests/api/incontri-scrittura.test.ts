/**
 * Chi registra, modifica ed elimina incontri, e l'effetto sul voucher.
 *
 * Ogni caso parte da un database vuoto e crea il proprio incontro: nessun caso
 * dipende da quello che ha lasciato il precedente.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, saldo } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIncontro, creaIstruttore, creaSocio } from './fabbrica.ts';

usaAmbiente();

/**
 * istruttore1 (admin), istruttore2 abilitato alla sola educazione, socio1 con
 * un voucher da 150 e socio2 con uno da 40. Due attività: educazione 30 e k9 35.
 */
async function scenario() {
  const istruttore1 = await creaAdmin('istruttore1');
  const attivita = {
    educazione: await creaAttivita(istruttore1, 'educazione', 30),
    k9: await creaAttivita(istruttore1, 'k9', 35),
  };
  const istruttore2 = await creaIstruttore(istruttore1, 'istruttore2', [attivita.educazione]);
  const socio1 = await creaAccount(istruttore1, 'socio1');
  const socio2 = await creaAccount(istruttore1, 'socio2');
  const soci = {
    socio1: (await creaSocio(istruttore1, 'socio1', { account: socio1, ricarica: 150 })).id,
    socio2: (await creaSocio(istruttore1, 'socio2', { account: socio2, ricarica: 40 })).id,
  };
  return { sessioni: { istruttore1, istruttore2, socio1, socio2 }, soci, attivita };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

/** Il corpo di un nuovo incontro di ieri. */
const nuovo = (socioId: string, attivitaId: string, costo: number, extra: Record<string, unknown> = {}) => ({
  socio_id: socioId,
  data_incontro: giorniFa(1),
  attivita_id: attivitaId,
  costo,
  note: 'Creato dai test API',
  ...extra,
});

/** Un incontro di educazione da 30 per socio1, registrato da istruttore2. */
async function incontroDiIstruttore2(d: Scenario): Promise<string> {
  const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', nuovo(d.soci.socio1, d.attivita.educazione, 30));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

describe('Incontri: scrittura', () => {
  it('un socio non può registrare incontri (403)', async () => {
    const d = await scenario();
    const r = await api(d.sessioni.socio1, 'POST', '/api/incontri', nuovo(d.soci.socio1, d.attivita.educazione, 30));
    assert.equal(r.status, 403);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 150);
  });

  it('un istruttore non registra attività a cui non è abilitato (400)', async () => {
    const d = await scenario();
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', nuovo(d.soci.socio1, d.attivita.k9, 35));
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 150);
  });

  // Spec 010: il saldo negativo non blocca più. La conferma la chiede
  // l'interfaccia; il backend registra l'incontro e il suo addebito.
  /** socio2 (voucher da 40) con un incontro da 45 già registrato: saldo -5. */
  async function suVoucherNegativo() {
    const d = await scenario();
    await creaIncontro(d.sessioni.istruttore1,
      { socio: d.soci.socio2, attivita: d.attivita.k9, istruttore: d.sessioni.istruttore1, costo: 45, giorni: 3 });
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio2), -5);
    return d;
  }

  it('un incontro su un voucher già negativo viene creato con il suo addebito (201)', async () => {
    const d = await suVoucherNegativo();
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', nuovo(d.soci.socio2, d.attivita.educazione, 30));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio2), -35);
  });

  it('si modifica il costo di un incontro su un voucher già negativo e l\'addebito si riallinea', async () => {
    const d = await suVoucherNegativo();
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri', nuovo(d.soci.socio2, d.attivita.educazione, 30));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const modificato = await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${r.body.id}`, { costo: 40 });
    assert.equal(modificato.status, 200, JSON.stringify(modificato.body));
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio2), -45);
  });

  it('un istruttore registra per sé, qualunque istruttore_id indichi', async () => {
    const d = await scenario();
    const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri',
      nuovo(d.soci.socio1, d.attivita.educazione, 30, { istruttore_id: d.sessioni.istruttore1.id }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.istruttore_id, d.sessioni.istruttore2.id);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 120);
  });

  it('modificando il costo si riallinea l\'addebito', async () => {
    const d = await scenario();
    const id = await incontroDiIstruttore2(d);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 120);
    const r = await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${id}`, { costo: 20 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 130);
  });

  it('un istruttore non modifica né elimina incontri tenuti da altri (403)', async () => {
    const d = await scenario();
    const altrui = await creaIncontro(d.sessioni.istruttore1,
      { socio: d.soci.socio1, attivita: d.attivita.educazione, istruttore: d.sessioni.istruttore1 });
    assert.equal((await api(d.sessioni.istruttore2, 'PATCH', `/api/incontri/${altrui.id}`, { costo: 1 })).status, 403);
    assert.equal((await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${altrui.id}`)).status, 403);
    // Né il costo né l'addebito sono cambiati.
    const letto = await api(d.sessioni.istruttore1, 'GET', `/api/incontri/${altrui.id}`);
    assert.equal(Number(letto.body.costo), 30);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 120);
  });

  it('il dettaglio è visibile al socio interessato, non agli altri', async () => {
    const d = await scenario();
    const id = await incontroDiIstruttore2(d);
    assert.equal((await api(d.sessioni.socio1, 'GET', `/api/incontri/${id}`)).status, 200);
    assert.equal((await api(d.sessioni.socio2, 'GET', `/api/incontri/${id}`)).status, 403);
  });

  it('eliminando l\'incontro si elimina anche l\'addebito (204)', async () => {
    const d = await scenario();
    const id = await incontroDiIstruttore2(d);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 120);
    const r = await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${id}`);
    assert.equal(r.status, 204);
    assert.equal(await saldo(d.sessioni.istruttore1, d.soci.socio1), 150);
    assert.equal((await api(d.sessioni.istruttore1, 'GET', `/api/incontri/${id}`)).status, 404);
  });

  // Incontro di gruppo (spec 010): nessuna API apposita, il frontend chiama la
  // creazione una volta per socio. Qui si fa lo stesso.
  describe('incontro di gruppo', () => {
    /**
     * Tre soci (socio1 150, socio2 40, socio3 60) e un incontro di gruppo di
     * educazione da 30, registrato da istruttore2 con una nota per socio.
     */
    async function gruppo() {
      const d = await scenario();
      const socio3 = (await creaSocio(d.sessioni.istruttore1, 'socio3', { ricarica: 60 })).id;
      const soci = [d.soci.socio1, d.soci.socio2, socio3];
      const data = giorniFa(2);
      const incontri: { socio: string; id: string }[] = [];
      for (const [n, socio] of soci.entries()) {
        const r = await api(d.sessioni.istruttore2, 'POST', '/api/incontri',
          nuovo(socio, d.attivita.educazione, 30, { data_incontro: data, note: `Nota del socio ${n + 1}` }));
        assert.equal(r.status, 201, JSON.stringify(r.body));
        incontri.push({ socio, id: r.body.id });
      }
      return { d, incontri };
    }

    it('tre creazioni con gli stessi dati comuni e note diverse danno tre incontri, ciascuno con il proprio addebito e la propria nota', async () => {
      const { d, incontri } = await gruppo();
      const saldiAttesi = [120, 10, 30];
      for (const [n, { socio, id }] of incontri.entries()) {
        const r = await api(d.sessioni.istruttore2, 'GET', `/api/incontri/${id}`);
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.socio_id, socio);
        assert.equal(r.body.istruttore_id, d.sessioni.istruttore2.id);
        assert.equal(Number(r.body.costo), 30);
        assert.equal(r.body.note, `Nota del socio ${n + 1}`);
        assert.equal(await saldo(d.sessioni.istruttore1, socio), saldiAttesi[n]);
      }
    });

    it('eliminando uno degli incontri di gruppo gli altri e i loro addebiti restano', async () => {
      const { d, incontri } = await gruppo();
      const [tolto, ...restanti] = incontri;

      assert.equal((await api(d.sessioni.istruttore2, 'DELETE', `/api/incontri/${tolto.id}`)).status, 204);

      assert.equal(await saldo(d.sessioni.istruttore1, tolto.socio), 150);
      const saldiRestanti = [10, 30];
      for (const [n, g] of restanti.entries()) {
        assert.equal((await api(d.sessioni.istruttore2, 'GET', `/api/incontri/${g.id}`)).status, 200);
        assert.equal(await saldo(d.sessioni.istruttore1, g.socio), saldiRestanti[n]);
      }
    });
  });
});
