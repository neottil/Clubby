/**
 * Chi vede quali incontri: pagina Incontri (come socio), Resoconto (come
 * istruttore) e Resoconti dell'admin (per istruttore o per socio), con i totali.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, type Risposta, type Sessione } from './helpers.ts';
import { ATTESE, preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

async function elenco(s: Sessione, query = ''): Promise<Risposta> {
  const r = await api(s, 'GET', `/api/incontri${query ? `?${query}` : ''}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}

function assertTotali(r: Risposta, attesi: { total: number; costo: number }): void {
  assert.equal(r.body.total, attesi.total, 'numero di incontri');
  assert.equal(Number(r.body.totale_costo), attesi.costo, 'costo complessivo');
}

describe('Incontri: lettura', () => {
  let d: DatiTest;
  before(async () => { d = await preparaDati(); });
  after(() => pulisciDatiTest());

  describe('pagina Incontri', () => {
    it('l\'admin, senza ambito, vede gli incontri di tutti', async () => {
      // Il database può contenere altri incontri oltre a quelli di prova: la
      // ricerca li restringe ai soci di prova, i cui cognomi finiscono in _test.
      const r = await elenco(d.sessioni.istruttore1, 'q=_test');
      assertTotali(r, { total: ATTESE.incontriTotali, costo: ATTESE.costoTotale });
      const soci = new Set(r.body.data.map((i: any) => i.socio_id));
      assert.deepEqual(soci, new Set([d.soci.socio1, d.soci.socio2, d.soci.istruttore2]));
    });

    it('un istruttore vede solo quelli a cui ha partecipato come socio', async () => {
      const r = await elenco(d.sessioni.istruttore2);
      assertTotali(r, ATTESE.comeSocioIstruttore2);
      assert.ok(r.body.data.every((i: any) => i.socio_id === d.soci.istruttore2));
    });

    it('ogni socio vede solo i propri', async () => {
      const r1 = await elenco(d.sessioni.socio1);
      assertTotali(r1, ATTESE.comeSocioSocio1);
      assert.ok(r1.body.data.every((i: any) => i.socio_id === d.soci.socio1));
      assertTotali(await elenco(d.sessioni.socio2), ATTESE.comeSocioSocio2);
    });

    it('la ricerca trova nome e cognome in qualunque ordine, anche parziali', async () => {
      // socio1 è "paolo_test ferrari_test": cognome prima, nome troncato.
      const r = await elenco(d.sessioni.istruttore1, `q=${encodeURIComponent('ferrari_test pao')}`);
      assert.equal(r.body.total, ATTESE.comeSocioSocio1.total);
      assert.ok(r.body.data.every((i: any) => i.socio_id === d.soci.socio1));
      // Ogni parola deve comparire: una che non c'è esclude tutto.
      const nessuno = await elenco(d.sessioni.istruttore1, `q=${encodeURIComponent('ferrari_test inesistente')}`);
      assert.equal(nessuno.body.total, 0);
    });

    it('un socio non legge gli incontri altrui passando socio_id', async () => {
      const r = await elenco(d.sessioni.socio1, `socio_id=${d.soci.socio2}`);
      assertTotali(r, ATTESE.comeSocioSocio1);
      assert.ok(r.body.data.every((i: any) => i.socio_id === d.soci.socio1));
    });
  });

  describe('Resoconto dell\'istruttore', () => {
    it('istruttore1 (anche admin) vede gli incontri che ha tenuto', async () => {
      const r = await elenco(d.sessioni.istruttore1, 'ambito=istruttore');
      assertTotali(r, ATTESE.tenutiIstruttore1);
      assert.ok(r.body.data.every((i: any) => i.istruttore_id === d.sessioni.istruttore1.id));
    });

    it('istruttore2 vede gli incontri che ha tenuto', async () => {
      assertTotali(await elenco(d.sessioni.istruttore2, 'ambito=istruttore'), ATTESE.tenutiIstruttore2);
    });

    it('un istruttore non legge il resoconto di un collega passando istruttore_id', async () => {
      const r = await elenco(d.sessioni.istruttore2, `ambito=istruttore&istruttore_id=${d.sessioni.istruttore1.id}`);
      assertTotali(r, ATTESE.tenutiIstruttore2);
    });

    it('un socio non ha incontri tenuti', async () => {
      assertTotali(await elenco(d.sessioni.socio1, 'ambito=istruttore'), { total: 0, costo: 0 });
    });

    it('i totali rispettano il filtro per periodo', async () => {
      // Negli ultimi 25 giorni istruttore1 ha tenuto: mantrailing 25 (22 gg fa),
      // k9 35 (6 gg fa) con socio1, passeggiata 15 (12 gg fa) con istruttore2.
      const r = await elenco(d.sessioni.istruttore1, `ambito=istruttore&da=${giorniFa(25)}`);
      assertTotali(r, { total: 3, costo: 75 });
    });
  });

  describe('Resoconti dell\'admin', () => {
    it('per istruttore', async () => {
      const admin = d.sessioni.istruttore1;
      assertTotali(await elenco(admin, `istruttore_id=${d.sessioni.istruttore2.id}`), ATTESE.tenutiIstruttore2);
      assertTotali(await elenco(admin, `istruttore_id=${d.sessioni.istruttore1.id}`), ATTESE.tenutiIstruttore1);
    });

    it('per socio', async () => {
      const admin = d.sessioni.istruttore1;
      assertTotali(await elenco(admin, `socio_id=${d.soci.istruttore2}`), ATTESE.comeSocioIstruttore2);
      assertTotali(await elenco(admin, `socio_id=${d.soci.socio1}`), ATTESE.comeSocioSocio1);
    });

    it('per socio e periodo', async () => {
      const admin = d.sessioni.istruttore1;
      // socio1 negli ultimi 25 giorni: mantrailing 25 e k9 35; prima, educazione 30.
      assertTotali(await elenco(admin, `socio_id=${d.soci.socio1}&da=${giorniFa(25)}`), { total: 2, costo: 60 });
      assertTotali(await elenco(admin, `socio_id=${d.soci.socio1}&a=${giorniFa(25)}`), { total: 1, costo: 30 });
    });

    it('i totali coprono l\'intero risultato, non la sola pagina', async () => {
      const r = await elenco(d.sessioni.istruttore1, `istruttore_id=${d.sessioni.istruttore1.id}&limit=2`);
      assert.equal(r.body.data.length, 2);
      assertTotali(r, ATTESE.tenutiIstruttore1);
    });
  });
});
