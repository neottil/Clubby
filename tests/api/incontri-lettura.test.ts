/**
 * Chi vede quali incontri: pagina Incontri (come socio), Resoconto (come
 * istruttore) e Resoconti dell'admin (per istruttore o per socio), con i totali.
 *
 * Ogni caso crea lo stesso piccolo club (vedi `scenario`) su un database vuoto:
 * i totali attesi sono esattamente quelli degli otto incontri che registra.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, type Risposta, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIncontro, creaIstruttore, creaSocio } from './fabbrica.ts';

usaAmbiente();

async function elenco(s: Sessione, query = ''): Promise<Risposta> {
  const r = await api(s, 'GET', `/api/incontri${query ? `?${query}` : ''}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r;
}

function assertTotali(r: Risposta, attesi: { total: number; costo: number }): void {
  assert.equal(r.body.total, attesi.total, 'numero di incontri');
  assert.equal(Number(r.body.totale_costo), attesi.costo, 'costo complessivo');
}

/** Totali degli incontri registrati da `scenario`. */
const TOTALI = {
  tutti: { total: 8, costo: 215 },
  // Incontri tenuti come istruttore.
  tenutiIstruttore1: { total: 5, costo: 140 },
  tenutiIstruttore2: { total: 3, costo: 75 },
  // Incontri a cui l'account ha partecipato come socio.
  comeSocioIstruttore2: { total: 2, costo: 50 },
  comeSocioSocio1: { total: 3, costo: 90 },
  comeSocioSocio2: { total: 3, costo: 75 },
};

/**
 * istruttore1 (admin), istruttore2 e due soci, ciascuno con la propria scheda;
 * istruttore2 è anche socia del club. Otto incontri:
 *   - socio1, tenuti da istruttore1: educazione 30 (50 gg fa), mantrailing 25 (22), k9 35 (6);
 *   - socio2, tenuti da istruttore2: educazione 30 (45), dogdance 20 (26), mantrailing 25 (4);
 *   - istruttore2 come socia, tenuti da istruttore1: k9 35 (30), passeggiata 15 (12).
 */
async function scenario() {
  const istruttore1 = await creaAdmin('istruttore1');
  const attivita = {
    educazione: await creaAttivita(istruttore1, 'educazione', 30),
    mantrailing: await creaAttivita(istruttore1, 'mantrailing', 25),
    k9: await creaAttivita(istruttore1, 'k9', 35),
    dogdance: await creaAttivita(istruttore1, 'dogdance', 20),
    passeggiata: await creaAttivita(istruttore1, 'passeggiata', 15),
  };
  const istruttore2 = await creaIstruttore(istruttore1, 'istruttore2',
    [attivita.educazione, attivita.dogdance, attivita.mantrailing]);
  const socio1 = await creaAccount(istruttore1, 'socio1');
  const socio2 = await creaAccount(istruttore1, 'socio2');
  const soci = {
    istruttore2: (await creaSocio(istruttore1, 'istruttore2', { nome: 'chiara', cognome: 'conti', account: istruttore2, saldoIniziale: 100 })).id,
    socio1: (await creaSocio(istruttore1, 'socio1', { nome: 'paolo', cognome: 'ferrari', account: socio1, ricarica: 150 })).id,
    socio2: (await creaSocio(istruttore1, 'socio2', { nome: 'sara', cognome: 'romano', account: socio2, ricarica: 70 })).id,
  };

  const incontri: [string, Sessione, string, number, number][] = [
    [soci.socio1, istruttore1, attivita.educazione, 30, 50],
    [soci.socio1, istruttore1, attivita.mantrailing, 25, 22],
    [soci.socio1, istruttore1, attivita.k9, 35, 6],
    [soci.socio2, istruttore2, attivita.educazione, 30, 45],
    [soci.socio2, istruttore2, attivita.dogdance, 20, 26],
    [soci.socio2, istruttore2, attivita.mantrailing, 25, 4],
    [soci.istruttore2, istruttore1, attivita.k9, 35, 30],
    [soci.istruttore2, istruttore1, attivita.passeggiata, 15, 12],
  ];
  for (const [socio, istruttore, att, costo, giorni] of incontri) {
    await creaIncontro(istruttore1, { socio, istruttore, attivita: att, costo, giorni });
  }
  return { sessioni: { istruttore1, istruttore2, socio1, socio2 }, soci };
}

describe('Incontri: lettura', () => {
  describe('pagina Incontri', () => {
    it('l\'admin, senza ambito, vede gli incontri di tutti', async () => {
      const d = await scenario();
      const r = await elenco(d.sessioni.istruttore1);
      assertTotali(r, TOTALI.tutti);
      const soci = new Set(r.body.data.map((i: any) => i.socio_id));
      assert.deepEqual(soci, new Set([d.soci.socio1, d.soci.socio2, d.soci.istruttore2]));
    });

    it('un istruttore vede solo quelli a cui ha partecipato come socio', async () => {
      const d = await scenario();
      const r = await elenco(d.sessioni.istruttore2);
      assertTotali(r, TOTALI.comeSocioIstruttore2);
      assert.ok(r.body.data.every((i: any) => i.socio_id === d.soci.istruttore2));
    });

    it('ogni socio vede solo i propri', async () => {
      const d = await scenario();
      const r1 = await elenco(d.sessioni.socio1);
      assertTotali(r1, TOTALI.comeSocioSocio1);
      assert.ok(r1.body.data.every((i: any) => i.socio_id === d.soci.socio1));
      assertTotali(await elenco(d.sessioni.socio2), TOTALI.comeSocioSocio2);
    });

    it('la ricerca trova nome e cognome in qualunque ordine, anche parziali', async () => {
      // socio1 è "paolo_test ferrari_test": cognome prima, nome troncato.
      const d = await scenario();
      const r = await elenco(d.sessioni.istruttore1, `q=${encodeURIComponent('ferrari_test pao')}`);
      assert.equal(r.body.total, TOTALI.comeSocioSocio1.total);
      assert.ok(r.body.data.every((i: any) => i.socio_id === d.soci.socio1));
      // Ogni parola deve comparire: una che non c'è esclude tutto.
      const nessuno = await elenco(d.sessioni.istruttore1, `q=${encodeURIComponent('ferrari_test inesistente')}`);
      assert.equal(nessuno.body.total, 0);
    });

    it('la ricerca confronta a inizio parola, non in mezzo', async () => {
      // Gli incontri cercano anche sul nome dell'attività, e "duc" compare
      // dentro "educazione_test": con il confronto per sottostringa questa
      // ricerca restituiva gli incontri di soci che con "duc" non c'entrano.
      const d = await scenario();
      const dentro = await elenco(d.sessioni.istruttore1, `q=${encodeURIComponent('_test duc')}`);
      assert.equal(dentro.body.total, 0, 'un frammento interno non deve fare match');

      // Lo stesso prefisso a inizio parola invece sì: l'attività si cerca.
      // Gli incontri di educazione sono due: socio1 (50 gg fa) e socio2 (45).
      const inizio = await elenco(d.sessioni.istruttore1, `q=${encodeURIComponent('_test educ')}`);
      assert.equal(inizio.body.total, 2, 'a inizio parola la ricerca per attività funziona');
      assert.ok(inizio.body.data.every((i: any) => /^educazione/i.test(i.attivita)));
    });

    it('un socio non legge gli incontri altrui passando socio_id', async () => {
      const d = await scenario();
      const r = await elenco(d.sessioni.socio1, `socio_id=${d.soci.socio2}`);
      assertTotali(r, TOTALI.comeSocioSocio1);
      assert.ok(r.body.data.every((i: any) => i.socio_id === d.soci.socio1));
    });
  });

  describe('Resoconto dell\'istruttore', () => {
    it('istruttore1 (anche admin) vede gli incontri che ha tenuto', async () => {
      const d = await scenario();
      const r = await elenco(d.sessioni.istruttore1, 'ambito=istruttore');
      assertTotali(r, TOTALI.tenutiIstruttore1);
      assert.ok(r.body.data.every((i: any) => i.istruttore_id === d.sessioni.istruttore1.id));
    });

    it('istruttore2 vede gli incontri che ha tenuto', async () => {
      const d = await scenario();
      assertTotali(await elenco(d.sessioni.istruttore2, 'ambito=istruttore'), TOTALI.tenutiIstruttore2);
    });

    it('un istruttore non legge il resoconto di un collega passando istruttore_id', async () => {
      const d = await scenario();
      const r = await elenco(d.sessioni.istruttore2, `ambito=istruttore&istruttore_id=${d.sessioni.istruttore1.id}`);
      assertTotali(r, TOTALI.tenutiIstruttore2);
    });

    it('un socio non ha incontri tenuti', async () => {
      const d = await scenario();
      assertTotali(await elenco(d.sessioni.socio1, 'ambito=istruttore'), { total: 0, costo: 0 });
    });

    it('i totali rispettano il filtro per periodo', async () => {
      // Negli ultimi 25 giorni istruttore1 ha tenuto: mantrailing 25 (22 gg fa),
      // k9 35 (6 gg fa) con socio1, passeggiata 15 (12 gg fa) con istruttore2.
      const d = await scenario();
      const r = await elenco(d.sessioni.istruttore1, `ambito=istruttore&da=${giorniFa(25)}`);
      assertTotali(r, { total: 3, costo: 75 });
    });
  });

  describe('Resoconti dell\'admin', () => {
    it('per istruttore', async () => {
      const d = await scenario();
      const admin = d.sessioni.istruttore1;
      assertTotali(await elenco(admin, `istruttore_id=${d.sessioni.istruttore2.id}`), TOTALI.tenutiIstruttore2);
      assertTotali(await elenco(admin, `istruttore_id=${d.sessioni.istruttore1.id}`), TOTALI.tenutiIstruttore1);
    });

    it('per socio', async () => {
      const d = await scenario();
      const admin = d.sessioni.istruttore1;
      assertTotali(await elenco(admin, `socio_id=${d.soci.istruttore2}`), TOTALI.comeSocioIstruttore2);
      assertTotali(await elenco(admin, `socio_id=${d.soci.socio1}`), TOTALI.comeSocioSocio1);
    });

    it('per socio e periodo', async () => {
      const d = await scenario();
      const admin = d.sessioni.istruttore1;
      // socio1 negli ultimi 25 giorni: mantrailing 25 e k9 35; prima, educazione 30.
      assertTotali(await elenco(admin, `socio_id=${d.soci.socio1}&da=${giorniFa(25)}`), { total: 2, costo: 60 });
      assertTotali(await elenco(admin, `socio_id=${d.soci.socio1}&a=${giorniFa(25)}`), { total: 1, costo: 30 });
    });

    it('i totali coprono l\'intero risultato, non la sola pagina', async () => {
      const d = await scenario();
      const r = await elenco(d.sessioni.istruttore1, `istruttore_id=${d.sessioni.istruttore1.id}&limit=2`);
      assert.equal(r.body.data.length, 2);
      assertTotali(r, TOTALI.tenutiIstruttore1);
    });
  });
});
