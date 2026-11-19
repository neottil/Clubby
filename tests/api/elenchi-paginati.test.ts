/**
 * Elenchi paginati di soci, voucher, tesseramenti e account: forma della
 * risposta, blocchi successivi, ricerca, ordinamento e permessi.
 *
 * Ogni caso parte da un database vuoto e confronta totali e conteggi esatti
 * con i record che crea.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaSocio, creaTesseramento, registra } from './fabbrica.ts';

usaAmbiente();

describe('Elenchi paginati', () => {
  const pagina = async (s: Sessione, path: string) => {
    const r = await api(s, 'GET', path);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body.data), 'data è un elenco');
    assert.equal(typeof r.body.total, 'number');
    return r.body;
  };

  /**
   * Cinque schede: l'admin, istruttore2, socio1 e socio2 collegate al proprio
   * account, senzaAccount libera. Tre voucher: istruttore2 importato (100),
   * socio1 (150) e socio2 (40).
   */
  async function scenario() {
    const admin = await creaAdmin('istruttore1');
    const istruttore2 = await creaAccount(admin, 'istruttore2', 'istruttore');
    const socio1 = await creaAccount(admin, 'socio1');
    const socio2 = await creaAccount(admin, 'socio2');
    const soci = {
      istruttore1: (await creaSocio(admin, 'istruttore1', { nome: 'mario', cognome: 'rossi', account: admin })).id,
      istruttore2: (await creaSocio(admin, 'istruttore2', { nome: 'chiara', cognome: 'conti', account: istruttore2, saldoIniziale: 100 })).id,
      socio1: (await creaSocio(admin, 'socio1', { nome: 'paolo', cognome: 'ferrari', account: socio1, ricarica: 150 })).id,
      socio2: (await creaSocio(admin, 'socio2', { nome: 'sara', cognome: 'romano', account: socio2, ricarica: 40 })).id,
      senzaAccount: (await creaSocio(admin, 'senzaAccount', { nome: 'giorgio', cognome: 'ricci' })).id,
    };
    return { admin, sessioni: { istruttore2, socio1, socio2 }, soci };
  }

  describe('soci', () => {
    it('restituisce blocchi successivi senza ripetizioni', async () => {
      const { admin } = await scenario();
      const primo   = await pagina(admin, '/api/soci?limit=2&offset=0');
      const secondo = await pagina(admin, '/api/soci?limit=2&offset=2');
      const terzo   = await pagina(admin, '/api/soci?limit=2&offset=4');
      assert.equal(primo.total, 5);
      assert.deepEqual([primo.data.length, secondo.data.length, terzo.data.length], [2, 2, 1]);
      const ids = [...primo.data, ...secondo.data, ...terzo.data].map((s: any) => s.id);
      assert.equal(new Set(ids).size, 5);
    });

    it('ordina per cognome, nelle due direzioni', async () => {
      const { admin } = await scenario();
      const cognomi = async (dir: string) =>
        (await pagina(admin, `/api/soci?sort=cognome&dir=${dir}&limit=50`)).data.map((s: any) => s.cognome);
      const asc = ['conti_test', 'ferrari_test', 'ricci_test', 'romano_test', 'rossi_test'];
      assert.deepEqual(await cognomi('asc'), asc);
      assert.deepEqual(await cognomi('desc'), [...asc].reverse());
    });

    it('ordinamento per numero_tessera', async () => {
      // Due soci tesserati, gli altri tre senza numero.
      const { admin, soci } = await scenario();
      await creaTesseramento(admin, soci.socio1, 'EP_test_B');
      await creaTesseramento(admin, soci.socio2, 'EP_test_A');
      const numeri = async (dir: string) =>
        (await pagina(admin, `/api/soci?sort=numero_tessera&dir=${dir}&limit=50`)).data.map((s: any) => s.numero_tessera);
      // Senza numero in fondo, nelle due direzioni.
      assert.deepEqual(await numeri('asc'), ['EP_test_A', 'EP_test_B', null, null, null]);
      assert.deepEqual(await numeri('desc'), ['EP_test_B', 'EP_test_A', null, null, null]);
    });

    it('senza_account restituisce le sole schede libere', async () => {
      const { admin, soci } = await scenario();
      const b = await pagina(admin, '/api/soci?senza_account=1&limit=50');
      assert.deepEqual(b.data.map((s: any) => s.id), [soci.senzaAccount]);
    });

    it('un istruttore riceve il solo nominativo e non cerca sull\'email', async () => {
      const { sessioni } = await scenario();
      const b = await pagina(sessioni.istruttore2, '/api/soci?q=_test&limit=50');
      assert.equal(b.total, 5);
      assert.ok(b.data.every((s: any) => s.email === undefined && s.telefono === undefined));
      // Le email di prova sono sul dominio clubby.test, che non compare nei nomi.
      assert.equal((await pagina(sessioni.istruttore2, '/api/soci?q=clubby.test&limit=50')).total, 0);
    });

    it('un socio riceve solo la propria scheda', async () => {
      const { sessioni, soci } = await scenario();
      const b = await pagina(sessioni.socio1, '/api/soci?limit=50');
      assert.equal(b.total, 1);
      assert.equal(b.data[0].id, soci.socio1);
    });
  });

  describe('voucher', () => {
    it('ogni riga porta saldo e nominativo del socio', async () => {
      const { admin } = await scenario();
      const b = await pagina(admin, '/api/voucher?limit=50');
      assert.equal(b.total, 3);
      assert.ok(b.data.every((v: any) => v.cognome && v.saldo_residuo !== undefined));
    });

    it('escludi_socio_id toglie il voucher di quel socio', async () => {
      const { admin, soci } = await scenario();
      const b = await pagina(admin, `/api/voucher?escludi_socio_id=${soci.istruttore2}&limit=50`);
      assert.equal(b.total, 2);
      assert.ok(b.data.every((v: any) => v.socio_id !== soci.istruttore2));
    });

    it('ordina per saldo residuo', async () => {
      const { admin } = await scenario();
      const saldi = async (dir: string) => (await pagina(admin, `/api/voucher?sort=saldo_residuo&dir=${dir}&limit=50`))
        .data.map((v: any) => Number(v.saldo_residuo));
      assert.deepEqual(await saldi('asc'), [40, 100, 150]);
      assert.deepEqual(await saldi('desc'), [150, 100, 40]);
    });

    it('un istruttore vede i saldi di tutti, un socio solo il proprio', async () => {
      const { sessioni, soci } = await scenario();
      assert.equal((await pagina(sessioni.istruttore2, '/api/voucher?limit=50')).total, 3);
      const proprio = await pagina(sessioni.socio1, `/api/voucher?socio_id=${soci.socio2}&limit=50`);
      assert.equal(proprio.total, 1);
      assert.equal(proprio.data[0].socio_id, soci.socio1);
    });
  });

  describe('tesseramenti', () => {
    /** Un tesseramento per stato, e due soci mai tesserati. */
    async function conStati() {
      const s = await scenario();
      await creaTesseramento(s.admin, s.soci.socio1, 'EP_test_1');
      await creaTesseramento(s.admin, s.soci.istruttore2, 'EP_test_2', { rinnovo: 355, scadenza: -10 });
      await creaTesseramento(s.admin, s.soci.socio2, 'EP_test_3', { rinnovo: 400, scadenza: 35 });
      return s;
    }

    it('restituisce stato e conteggi per stato', async () => {
      const { admin } = await conStati();
      const b = await pagina(admin, '/api/tesseramenti?limit=50');
      assert.equal(b.total, 5);
      assert.ok(b.data.every((t: any) => ['attivo', 'in_scadenza', 'scaduto', 'mai'].includes(t.stato)));
      assert.deepEqual(
        { attivo: b.conteggi.attivo, in_scadenza: b.conteggi.in_scadenza, scaduto: b.conteggi.scaduto, mai: b.conteggi.mai },
        { attivo: 1, in_scadenza: 1, scaduto: 1, mai: 2 },
      );
    });

    it('filtra per stato', async () => {
      const { admin, soci } = await conStati();
      const b = await pagina(admin, '/api/tesseramenti?stato=mai&limit=50');
      assert.equal(b.total, 2);
      assert.deepEqual(b.data.map((t: any) => t.socio_id).sort(), [soci.istruttore1, soci.senzaAccount].sort());
      assert.ok(b.data.every((t: any) => t.stato === 'mai' && t.scadenza === null));
      const scaduti = await pagina(admin, '/api/tesseramenti?stato=scaduto&limit=50');
      assert.deepEqual(scaduti.data.map((t: any) => t.socio_id), [soci.socio2]);
    });

    it('uno stato sconosciuto è rifiutato (400)', async () => {
      const admin = await creaAdmin();
      const r = await api(admin, 'GET', '/api/tesseramenti?stato=boh&limit=10');
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });
  });

  describe('account', () => {
    it('pagina gli account con il numero dei da collegare', async () => {
      // Quattro account collegati a una scheda, più due appena registrati.
      const { admin } = await scenario();
      await registra('nuovo1');
      await registra('nuovo2');
      const b = await pagina(admin, '/api/admin/users?limit=1');
      assert.equal(b.data.length, 1);
      assert.equal(b.total, 6);
      assert.equal(b.da_collegare, 2);
    });

    it('in cima gli account non collegati', async () => {
      const { admin } = await scenario();
      const nuovo = await registra('nuovo1');
      const righe = (await pagina(admin, '/api/admin/users?limit=200')).data;
      assert.equal(righe.length, 5);
      assert.equal(righe[0].id, nuovo.id);
      assert.equal(righe[0].socio_id, null);
      assert.ok(righe.slice(1).every((u: any) => u.socio_id));
    });

    it('riservato agli admin (403)', async () => {
      const admin = await creaAdmin();
      const istruttore = await creaAccount(admin, 'istruttore2', 'istruttore');
      assert.equal((await api(istruttore, 'GET', '/api/admin/users?limit=10')).status, 403);
    });
  });

  it('senza limit/offset gli elenchi restano completi', async () => {
    const { admin } = await scenario();
    const attesi: Record<string, number> = { '/api/soci': 5, '/api/voucher': 3, '/api/tesseramenti': 5, '/api/admin/users': 4 };
    for (const [path, quanti] of Object.entries(attesi)) {
      const r = await api(admin, 'GET', path);
      assert.equal(r.status, 200, path);
      assert.ok(Array.isArray(r.body), `${path} restituisce un elenco`);
      assert.equal(r.body.length, quanti, path);
    }
  });
});
