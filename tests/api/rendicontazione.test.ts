/**
 * Rendicontazione degli incontri all'istruttore.
 *
 * Il club riconosce all'istruttore una percentuale sugli incontri tenuti: qui
 * si verifica che si possa segnare quali sono già stati conteggiati, che il
 * segno non sia reversibile e che non lasci cancellare ciò su cui si è pagato.
 *
 * Ogni caso parte da un database vuoto con tre incontri tenuti da istruttore2
 * (vedi `scenario`), e rendiconta da sé quelli che gli servono.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, type Risposta, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIncontro, creaIstruttore, creaSocio } from './fabbrica.ts';

usaAmbiente();

const incontriDi = async (s: Sessione, query = ''): Promise<Risposta> => {
  const r = await api(s, 'GET', `/api/incontri${query ? `?${query}` : ''}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
};

/**
 * Un admin, istruttore2 abilitato a educazione, socio1 (con account) e tre
 * incontri di educazione tenuti da istruttore2 per socio1: 30, 25 e 20.
 */
async function scenario() {
  const admin = await creaAdmin('istruttore1');
  const educazione = await creaAttivita(admin, 'educazione', 30);
  const istruttore2 = await creaIstruttore(admin, 'istruttore2', [educazione]);
  const socio1 = await creaAccount(admin, 'socio1');
  const socio = (await creaSocio(admin, 'socio1', { account: socio1, ricarica: 100 })).id;
  const ids: string[] = [];
  for (const [costo, giorni] of [[30, 10], [25, 5], [20, 1]]) {
    ids.push((await creaIncontro(admin, { socio, attivita: educazione, istruttore: istruttore2, costo, giorni })).id);
  }
  /** Gli incontri tenuti da istruttore2, come li vede lui. */
  const tenuti = async (query = '') =>
    (await incontriDi(istruttore2, `ambito=istruttore&limit=50${query}`)).body.data;
  return { admin, istruttore2, socio1, socio, educazione, ids, tenuti };
}

/** Lo scenario con i primi due incontri già rendicontati. */
async function conRendicontati() {
  const d = await scenario();
  const r = await api(d.admin, 'POST', '/api/incontri/rendiconta', { ids: d.ids.slice(0, 2) });
  assert.deepEqual(r.body, { richiesti: 2, rendicontati: 2 });
  return d;
}

describe('Rendicontazione', () => {
  it('un incontro nasce non rendicontato', async () => {
    const d = await scenario();
    const incontri = await d.tenuti();
    assert.equal(incontri.length, 3);
    assert.ok(incontri.every((i: any) => i.rendicontato_il === null), 'nessuno è già rendicontato');
  });

  it('solo l\'admin rendiconta (403 per istruttore e socio)', async () => {
    const d = await scenario();
    for (const s of [d.istruttore2, d.socio1]) {
      const r = await api(s, 'POST', '/api/incontri/rendiconta', { ids: [d.ids[0]] });
      assert.equal(r.status, 403, JSON.stringify(r.body));
    }
    assert.ok((await d.tenuti()).every((i: any) => i.rendicontato_il === null));
  });

  it('rifiuta una richiesta senza incontri (400)', async () => {
    const admin = await creaAdmin();
    assert.equal((await api(admin, 'POST', '/api/incontri/rendiconta', { ids: [] })).status, 400);
    assert.equal((await api(admin, 'POST', '/api/incontri/rendiconta', {})).status, 400);
    assert.equal((await api(admin, 'POST', '/api/incontri/rendiconta', { ids: [42] })).status, 400);
  });

  it('rendiconta gli incontri scelti, e la seconda volta non li conta più', async () => {
    const d = await scenario();
    const ids = d.ids.slice(0, 2);

    const r = await api(d.admin, 'POST', '/api/incontri/rendiconta', { ids });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { richiesti: 2, rendicontati: 2 });

    // Ripetuta: nessuno viene toccato di nuovo. È il caso di due admin che
    // lavorano sullo stesso periodo, e la differenza è ciò che l'interfaccia
    // riporta invece di far credere che siano stati aggiornati tutti.
    const ripetuta = await api(d.admin, 'POST', '/api/incontri/rendiconta', { ids });
    assert.deepEqual(ripetuta.body, { richiesti: 2, rendicontati: 0 });

    const rendicontati = (await d.tenuti()).filter((i: any) => i.rendicontato_il !== null);
    assert.equal(rendicontati.length, 2);
    assert.deepEqual(new Set(rendicontati.map((i: any) => i.id)), new Set(ids));
  });

  it('l\'elenco li contiene ancora, salvo chiederli espressamente esclusi', async () => {
    const d = await conRendicontati();
    // Senza il parametro non cambia niente: la rendicontazione riguarda il
    // compenso dell'istruttore e non deve nascondere nulla altrove.
    assert.equal((await d.tenuti()).length, 3);

    const daFare = await d.tenuti('&solo_da_rendicontare=1');
    assert.deepEqual(daFare.map((i: any) => i.id), [d.ids[2]]);
    assert.ok(daFare.every((i: any) => i.rendicontato_il === null));

    // Anche i totali seguono il filtro: sono calcolati sullo stesso insieme.
    const r = await incontriDi(d.istruttore2, 'ambito=istruttore&solo_da_rendicontare=1&limit=50');
    assert.equal(r.body.total, 1);
    assert.equal(Number(r.body.totale_costo), 20);
  });

  it('un incontro rendicontato non si elimina, e il perché è nel messaggio', async () => {
    const d = await conRendicontati();
    const rendicontato = d.ids[0];

    for (const s of [d.admin, d.istruttore2]) {
      const r = await api(s, 'DELETE', `/api/incontri/${rendicontato}`);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.match(r.body.error, /rendicontato/i);
    }

    // Esiste ancora.
    assert.equal((await api(d.admin, 'GET', `/api/incontri/${rendicontato}`)).status, 200);
  });

  it('un incontro rendicontato non si modifica, nemmeno nelle note', async () => {
    const d = await conRendicontati();
    const rendicontato = d.ids[0];

    // Il costo è il caso evidente; la data lo farebbe uscire dal periodo in
    // cui è stato conteggiato, e anche una nota passa dallo stesso endpoint.
    for (const modifica of [{ costo: 999 }, { data_incontro: '2020-01-01' }, { note: 'cambiata' }]) {
      const r = await api(d.admin, 'PATCH', `/api/incontri/${rendicontato}`, modifica);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.match(r.body.error, /rendicontato/i);
    }

    // Nulla è cambiato.
    const dopo = await api(d.admin, 'GET', `/api/incontri/${rendicontato}`);
    assert.equal(Number(dopo.body.costo), 30);
    assert.equal(dopo.body.note, 'Creato dai test API');
  });

  it('un incontro non rendicontato si modifica e si elimina normalmente', async () => {
    const d = await conRendicontati();
    const libero = d.ids[2];
    assert.equal((await api(d.admin, 'PATCH', `/api/incontri/${libero}`, { costo: 15 })).status, 200);
    assert.equal((await api(d.admin, 'DELETE', `/api/incontri/${libero}`)).status, 204);
  });
});
