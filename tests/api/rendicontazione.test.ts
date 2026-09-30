/**
 * Rendicontazione degli incontri all'istruttore.
 *
 * Il club riconosce all'istruttore una percentuale sugli incontri tenuti: qui
 * si verifica che si possa segnare quali sono già stati conteggiati, che il
 * segno non sia reversibile e che non lasci cancellare ciò su cui si è pagato.
 *
 * Gli incontri rendicontati da questi test sono quelli di prova, rimossi dalla
 * pulizia finale insieme a tutto il resto: non serve "srendicontarli".
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, type Risposta, type Sessione } from './helpers.ts';
import { ATTESE, preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Rendicontazione', () => {
  let d: DatiTest;
  let admin: Sessione;

  const incontriDi = async (s: Sessione, query = ''): Promise<Risposta> => {
    const r = await api(s, 'GET', `/api/incontri${query ? `?${query}` : ''}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r;
  };
  /** Gli incontri tenuti da istruttore2, i più pochi: tre. */
  const tenutiDaIstruttore2 = async (query = '') =>
    (await incontriDi(d.sessioni.istruttore2, `ambito=istruttore&limit=50${query}`)).body.data;

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
  });
  after(() => pulisciDatiTest());

  it('un incontro nasce non rendicontato', async () => {
    const incontri = await tenutiDaIstruttore2();
    assert.equal(incontri.length, ATTESE.tenutiIstruttore2.total);
    assert.ok(incontri.every((i: any) => i.rendicontato_il === null), 'nessuno è già rendicontato');
  });

  it('solo l\'admin rendiconta (403 per istruttore e socio)', async () => {
    const incontri = await tenutiDaIstruttore2();
    for (const s of [d.sessioni.istruttore2, d.sessioni.socio1]) {
      const r = await api(s, 'POST', '/api/incontri/rendiconta', { ids: [incontri[0].id] });
      assert.equal(r.status, 403, JSON.stringify(r.body));
    }
  });

  it('rifiuta una richiesta senza incontri (400)', async () => {
    assert.equal((await api(admin, 'POST', '/api/incontri/rendiconta', { ids: [] })).status, 400);
    assert.equal((await api(admin, 'POST', '/api/incontri/rendiconta', {})).status, 400);
    assert.equal((await api(admin, 'POST', '/api/incontri/rendiconta', { ids: [42] })).status, 400);
  });

  it('rendiconta gli incontri scelti, e la seconda volta non li conta più', async () => {
    const incontri = await tenutiDaIstruttore2();
    const ids = incontri.slice(0, 2).map((i: any) => i.id);

    const r = await api(admin, 'POST', '/api/incontri/rendiconta', { ids });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { richiesti: 2, rendicontati: 2 });

    // Ripetuta: nessuno viene toccato di nuovo. È il caso di due admin che
    // lavorano sullo stesso periodo, e la differenza è ciò che l'interfaccia
    // riporta invece di far credere che siano stati aggiornati tutti.
    const ripetuta = await api(admin, 'POST', '/api/incontri/rendiconta', { ids });
    assert.deepEqual(ripetuta.body, { richiesti: 2, rendicontati: 0 });

    const dopo = await tenutiDaIstruttore2();
    const rendicontati = dopo.filter((i: any) => i.rendicontato_il !== null);
    assert.equal(rendicontati.length, 2);
    assert.deepEqual(new Set(rendicontati.map((i: any) => i.id)), new Set(ids));
  });

  it('l\'elenco li contiene ancora, salvo chiederli espressamente esclusi', async () => {
    // Senza il parametro non cambia niente: la rendicontazione riguarda il
    // compenso dell'istruttore e non deve nascondere nulla altrove.
    const tutti = await tenutiDaIstruttore2();
    assert.equal(tutti.length, ATTESE.tenutiIstruttore2.total);

    const daFare = await tenutiDaIstruttore2('&solo_da_rendicontare=1');
    assert.equal(daFare.length, ATTESE.tenutiIstruttore2.total - 2);
    assert.ok(daFare.every((i: any) => i.rendicontato_il === null));

    // Anche i totali seguono il filtro: sono calcolati sullo stesso insieme.
    const r = await incontriDi(d.sessioni.istruttore2, 'ambito=istruttore&solo_da_rendicontare=1&limit=50');
    assert.equal(r.body.total, ATTESE.tenutiIstruttore2.total - 2);
  });

  it('un incontro rendicontato non si elimina, e il perché è nel messaggio', async () => {
    const rendicontato = (await tenutiDaIstruttore2()).find((i: any) => i.rendicontato_il !== null);
    assert.ok(rendicontato, 'serve un incontro rendicontato');

    for (const s of [admin, d.sessioni.istruttore2]) {
      const r = await api(s, 'DELETE', `/api/incontri/${rendicontato.id}`);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.match(r.body.error, /rendicontato/i);
    }

    // Esiste ancora.
    assert.equal((await api(admin, 'GET', `/api/incontri/${rendicontato.id}`)).status, 200);
  });

  it('un incontro rendicontato non si modifica, nemmeno nelle note', async () => {
    const rendicontato = (await tenutiDaIstruttore2()).find((i: any) => i.rendicontato_il !== null);
    assert.ok(rendicontato, 'serve un incontro rendicontato');

    // Il costo è il caso evidente; la data lo farebbe uscire dal periodo in
    // cui è stato conteggiato, e anche una nota passa dallo stesso endpoint.
    for (const modifica of [{ costo: 999 }, { data_incontro: '2020-01-01' }, { note: 'cambiata' }]) {
      const r = await api(admin, 'PUT', `/api/incontri/${rendicontato.id}`, modifica);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.match(r.body.error, /rendicontato/i);
    }

    // Nulla è cambiato.
    const dopo = await api(admin, 'GET', `/api/incontri/${rendicontato.id}`);
    assert.equal(Number(dopo.body.costo), Number(rendicontato.costo));
  });

  it('un incontro non rendicontato si modifica e si elimina normalmente', async () => {
    const creato = await api(admin, 'POST', '/api/incontri', {
      socio_id: d.soci.socio1,
      data_incontro: '2026-01-15',
      attivita_id: d.attivita.educazione,
      costo: 10,
    });
    assert.equal(creato.status, 201, JSON.stringify(creato.body));
    assert.equal((await api(admin, 'PUT', `/api/incontri/${creato.body.id}`, { costo: 15 })).status, 200);
    assert.equal((await api(admin, 'DELETE', `/api/incontri/${creato.body.id}`)).status, 204);
  });
});
