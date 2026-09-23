/**
 * Elenchi paginati di soci, voucher, tesseramenti e account: forma della
 * risposta, blocchi successivi, ricerca, ordinamento e permessi.
 *
 * Il database può contenere altri dati: dove l'elenco non è ristretto a chi
 * chiede, la ricerca "_test" lo limita ai record di prova.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, type Sessione } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

/** Soci di prova: tutti hanno il cognome che finisce in "_test". */
const SOCI_DI_PROVA = 5;
/** Voucher di prova: istruttore2, socio1 e socio2. */
const VOUCHER_DI_PROVA = 3;

describe('Elenchi paginati', () => {
  let d: DatiTest;
  let admin: Sessione;

  const pagina = async (s: Sessione, path: string) => {
    const r = await api(s, 'GET', path);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body.data), 'data è un elenco');
    assert.equal(typeof r.body.total, 'number');
    return r.body;
  };

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
  });
  after(() => pulisciDatiTest());

  describe('soci', () => {
    it('restituisce blocchi successivi senza ripetizioni', async () => {
      const primo   = await pagina(admin, '/api/soci?q=_test&limit=2&offset=0');
      const secondo = await pagina(admin, '/api/soci?q=_test&limit=2&offset=2');
      assert.equal(primo.total, SOCI_DI_PROVA);
      assert.equal(primo.data.length, 2);
      assert.equal(secondo.data.length, 2);
      const ids = [...primo.data, ...secondo.data].map((s: any) => s.id);
      assert.equal(new Set(ids).size, 4);
    });

    it('ordina per cognome, nelle due direzioni', async () => {
      const cognomi = async (dir: string) =>
        (await pagina(admin, `/api/soci?q=_test&sort=cognome&dir=${dir}&limit=50`)).data.map((s: any) => s.cognome);
      const asc = await cognomi('asc');
      assert.deepEqual(asc, [...asc].sort((a, b) => a.localeCompare(b)));
      assert.deepEqual(await cognomi('desc'), [...asc].reverse());
    });

    it('senza_account restituisce le sole schede libere', async () => {
      const b = await pagina(admin, '/api/soci?q=_test&senza_account=1&limit=50');
      assert.deepEqual(b.data.map((s: any) => s.id), [d.soci.senzaAccount]);
    });

    it('un istruttore riceve il solo nominativo e non cerca sull\'email', async () => {
      const b = await pagina(d.sessioni.istruttore2, '/api/soci?q=_test&limit=50');
      assert.equal(b.total, SOCI_DI_PROVA);
      assert.ok(b.data.every((s: any) => s.email === undefined && s.telefono === undefined));
      // Le email di prova sono sul dominio clubby.test, che non compare nei nomi.
      assert.equal((await pagina(d.sessioni.istruttore2, '/api/soci?q=clubby.test&limit=50')).total, 0);
    });

    it('un socio riceve solo la propria scheda', async () => {
      const b = await pagina(d.sessioni.socio1, '/api/soci?limit=50');
      assert.equal(b.total, 1);
      assert.equal(b.data[0].id, d.soci.socio1);
    });
  });

  describe('voucher', () => {
    it('ogni riga porta saldo e nominativo del socio', async () => {
      const b = await pagina(admin, '/api/voucher?q=_test&limit=50');
      assert.equal(b.total, VOUCHER_DI_PROVA);
      assert.ok(b.data.every((v: any) => v.cognome && v.saldo_residuo !== undefined));
    });

    it('escludi_socio_id toglie il voucher di quel socio', async () => {
      const b = await pagina(admin, `/api/voucher?q=_test&escludi_socio_id=${d.soci.istruttore2}&limit=50`);
      assert.equal(b.total, VOUCHER_DI_PROVA - 1);
      assert.ok(b.data.every((v: any) => v.socio_id !== d.soci.istruttore2));
    });

    it('ordina per saldo residuo', async () => {
      const saldi = (await pagina(admin, '/api/voucher?q=_test&sort=saldo_residuo&dir=asc&limit=50'))
        .data.map((v: any) => Number(v.saldo_residuo));
      assert.deepEqual(saldi, [...saldi].sort((a, b) => a - b));
    });

    it('un istruttore vede i saldi di tutti, un socio solo il proprio', async () => {
      assert.equal((await pagina(d.sessioni.istruttore2, '/api/voucher?q=_test&limit=50')).total, VOUCHER_DI_PROVA);
      const proprio = await pagina(d.sessioni.socio1, `/api/voucher?socio_id=${d.soci.socio2}&limit=50`);
      assert.equal(proprio.total, 1);
      assert.equal(proprio.data[0].socio_id, d.soci.socio1);
    });
  });

  describe('tesseramenti', () => {
    it('restituisce stato e conteggi per stato', async () => {
      const b = await pagina(admin, '/api/tesseramenti?q=_test&limit=50');
      assert.equal(b.total, SOCI_DI_PROVA);
      assert.ok(b.data.every((t: any) => ['attivo', 'in_scadenza', 'scaduto', 'mai'].includes(t.stato)));
      for (const stato of ['attivo', 'in_scadenza', 'scaduto', 'mai']) {
        assert.equal(typeof b.conteggi[stato], 'number', stato);
      }
    });

    it('filtra per stato', async () => {
      const b = await pagina(admin, '/api/tesseramenti?q=_test&stato=mai&limit=50');
      assert.ok(b.total > 0);
      assert.ok(b.data.every((t: any) => t.stato === 'mai' && t.scadenza === null));
    });

    it('uno stato sconosciuto è rifiutato (400)', async () => {
      const r = await api(admin, 'GET', '/api/tesseramenti?stato=boh&limit=10');
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });
  });

  describe('account', () => {
    it('pagina gli account con il numero dei da collegare', async () => {
      const b = await pagina(admin, '/api/admin/users?limit=1');
      assert.equal(b.data.length, 1);
      assert.ok(b.total >= 4);
      assert.equal(typeof b.da_collegare, 'number');
    });

    it('in cima gli account non collegati', async () => {
      const righe = (await pagina(admin, '/api/admin/users?limit=200')).data;
      const primoCollegato = righe.findIndex((u: any) => u.socio_id);
      if (primoCollegato >= 0) assert.ok(righe.slice(primoCollegato).every((u: any) => u.socio_id));
    });

    it('riservato agli admin (403)', async () => {
      assert.equal((await api(d.sessioni.istruttore2, 'GET', '/api/admin/users?limit=10')).status, 403);
    });
  });

  it('senza limit/offset gli elenchi restano completi', async () => {
    for (const path of ['/api/soci', '/api/voucher', '/api/tesseramenti', '/api/admin/users']) {
      const r = await api(admin, 'GET', path);
      assert.equal(r.status, 200, path);
      assert.ok(Array.isArray(r.body), `${path} restituisce un elenco`);
    }
  });
});
