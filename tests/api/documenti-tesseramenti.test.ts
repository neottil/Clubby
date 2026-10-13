/**
 * Ricevute, tesseramenti e impostazioni: accesso riservato, voci conteggiate
 * e totali, regole di rinnovo, ricariche.
 *
 * Il database può contenere altri dati: le voci si interrogano sempre
 * filtrando per un socio di prova.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, saldo, type Sessione } from './helpers.ts';
import { ATTESE, preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Ricevute e tesseramenti', () => {
  let d: DatiTest;
  let admin: Sessione;

  const vociDocumento = async (query: string) => {
    const r = await api(admin, 'GET', `/api/documenti/voci?${query}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const assertVoci = (body: any, total: number, importo: number) => {
    assert.equal(body.total, total, 'numero di voci');
    assert.equal(Number(body.totale_importo), importo, 'importo complessivo');
  };
  // Dalla spec 007 il numero di tessera è obbligatorio: uno per socio, che
  // lo riusa nei rinnovi. Le regole sul numero hanno un file a sé
  // (tesseramenti-numero.test.ts).
  const rinnova = (body: Record<string, unknown>) =>
    api(admin, 'POST', '/api/tesseramenti', { numero_tessera: `DT_test_${String(body.socio_id).slice(0, 8)}`, ...body });
  const voucherDi = async (socioId: string) => (await api(admin, 'GET', `/api/voucher?socio_id=${socioId}`)).body[0];

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
  });
  after(() => pulisciDatiTest());

  it('voci, tesseramenti e impostazioni sono riservati all\'admin (403)', async () => {
    for (const s of [d.sessioni.istruttore2, d.sessioni.socio1]) {
      // `/api/tesseramenti/{socioId}` NON è in questo elenco: dalla spec 004 il
      // socio legge il proprio storico. Qui si prova quello di senzaAccount,
      // che non è di nessuno dei due account del ciclo — il caso "il proprio"
      // ha un test suo ("un socio legge il proprio storico...").
      for (const path of ['/api/documenti/voci', '/api/tesseramenti', `/api/tesseramenti/${d.soci.senzaAccount}`, '/api/impostazioni']) {
        assert.equal((await api(s, 'GET', path)).status, 403, path);
      }
      assert.equal((await api(s, 'POST', '/api/tesseramenti', { socio_id: d.soci.socio1, scadenza: giorniFa(-365) })).status, 403);
      assert.equal((await api(s, 'PUT', '/api/impostazioni', { quota_tesseramento: 1 })).status, 403);
    }
  });

  describe('voci da documentare', () => {
    it('conta l\'acquisto e le ricariche dei voucher', async () => {
      const b = await vociDocumento(`socio_id=${d.soci.socio2}`);
      assertVoci(b, 2, ATTESE.ricaricheSocio2);
      assert.ok(b.data.every((v: any) => v.tipo === 'ricarica'));
    });

    it('non conta gli incontri pagati con il voucher', async () => {
      // socio1 ha tre incontri addebitati sul voucher: resta solo l'acquisto.
      assertVoci(await vociDocumento(`socio_id=${d.soci.socio1}`), 1, ATTESE.ricaricheSocio1);
    });

    it('non conta il saldo importato di un voucher', async () => {
      assertVoci(await vociDocumento(`socio_id=${d.soci.istruttore2}`), 0, 0);
    });

    it('un addebito manuale è rifiutato e non tocca saldo né voci (400)', async () => {
      // Gli addebiti nascono solo dagli incontri.
      const voucher = await voucherDi(d.soci.istruttore2);
      const prima = await saldo(admin, d.soci.istruttore2);
      const r = await api(admin, 'POST', `/api/voucher/${voucher.id}/movimenti`,
        { tipo: 'addebito', importo: -5, descrizione: 'Creato dai test API' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(await saldo(admin, d.soci.istruttore2), prima);
      assertVoci(await vociDocumento(`socio_id=${d.soci.istruttore2}`), 0, 0);
    });

    it('conta gli incontri non coperti da un voucher', async () => {
      const r = await api(admin, 'POST', '/api/incontri', {
        socio_id: d.soci.senzaAccount,
        data_incontro: giorniFa(3),
        attivita_id: d.attivita.educazione,
        istruttore_id: d.sessioni.istruttore1.id,
        costo: 30,
        note: 'Creato dai test API',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const b = await vociDocumento(`socio_id=${d.soci.senzaAccount}`);
      assertVoci(b, 1, 30);
      assert.equal(b.data[0].tipo, 'incontro');
      assert.equal(b.data[0].id, r.body.id);
    });
  });

  describe('tesseramenti', () => {
    it('il rinnovo registra la quota fra le voci', async () => {
      const r = await rinnova({ socio_id: d.soci.senzaAccount, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(Number(r.body.importo), 45);
      const b = await vociDocumento(`socio_id=${d.soci.senzaAccount}`);
      assertVoci(b, 2, 75);
      assert.ok(b.data.some((v: any) => v.tipo === 'tesseramento'));
    });

    it('i totali rispettano il filtro per periodo', async () => {
      // Tesseramento di oggi (45) e incontro di 3 giorni fa (30).
      assertVoci(await vociDocumento(`socio_id=${d.soci.senzaAccount}&da=${giorniFa(1)}`), 1, 45);
      assertVoci(await vociDocumento(`socio_id=${d.soci.senzaAccount}&a=${giorniFa(1)}`), 1, 30);
    });

    it('senza importo il rinnovo usa la quota configurata', async () => {
      const quota = Number((await api(admin, 'GET', '/api/impostazioni')).body.quota_tesseramento);
      const r = await rinnova({ socio_id: d.soci.socio1, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365) });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(Number(r.body.importo), quota);
    });

    it('il rinnovo non tocca il voucher', async () => {
      assert.equal(await saldo(admin, d.soci.socio1), ATTESE.saldoSocio1);
    });

    it('la nuova scadenza deve seguire quella attuale (400)', async () => {
      const r = await rinnova({ socio_id: d.soci.senzaAccount, data_rinnovo: giorniFa(0), scadenza: giorniFa(-300), importo: 45 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('la scadenza deve seguire la data del rinnovo (400)', async () => {
      const r = await rinnova({ socio_id: d.soci.socio2, data_rinnovo: giorniFa(0), scadenza: giorniFa(0) });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('una data inesistente è rifiutata (400)', async () => {
      const r = await rinnova({ socio_id: d.soci.socio2, scadenza: '2031-02-30' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('la situazione riporta l\'ultima scadenza di ogni socio', async () => {
      const secondo = await rinnova({ socio_id: d.soci.senzaAccount, data_rinnovo: giorniFa(0), scadenza: giorniFa(-730), importo: 45 });
      assert.equal(secondo.status, 201, JSON.stringify(secondo.body));

      const r = await api(admin, 'GET', '/api/tesseramenti');
      assert.equal(r.status, 200);
      const riga = (socioId: string) => (r.body as any[]).find(x => x.socio_id === socioId);
      assert.equal(String(riga(d.soci.senzaAccount).scadenza).slice(0, 10), giorniFa(-730));
      assert.equal(riga(d.soci.senzaAccount).rinnovi, 2);
      assert.equal(riga(d.soci.socio2).scadenza, null);
      assert.equal(riga(d.soci.socio2).rinnovi, 0);
    });

    it('lo storico elenca tutti i rinnovi, dal più recente', async () => {
      const r = await api(admin, 'GET', `/api/tesseramenti/${d.soci.senzaAccount}`);
      assert.equal(r.status, 200);
      assert.deepEqual((r.body as any[]).map(t => String(t.scadenza).slice(0, 10)), [giorniFa(-730), giorniFa(-365)]);
    });

    it('un socio legge il proprio storico, non quello di un altro', async () => {
      const socio = d.sessioni.socio1;

      // Il proprio: concesso. È l'unica rotta dell'area aperta oltre l'admin.
      const proprio = await api(socio, 'GET', `/api/tesseramenti/${d.soci.socio1}`);
      assert.equal(proprio.status, 200, JSON.stringify(proprio.body));
      assert.ok(Array.isArray(proprio.body));

      // Quello di un altro: 403 anche passando l'id giusto a mano. Il confronto
      // è con la scheda socio collegata all'account, non con il parametro.
      const altrui = await api(socio, 'GET', `/api/tesseramenti/${d.soci.senzaAccount}`);
      assert.equal(altrui.status, 403, JSON.stringify(altrui.body));

      // L'elenco di tutti resta dell'admin: un socio non lo vede.
      assert.equal((await api(socio, 'GET', '/api/tesseramenti')).status, 403);
    });

    it('lo storico porta la ricevuta della quota', async () => {
      // Il rinnovo se lo crea questo caso, su socio1: emettere su una quota di
      // senzaAccount toglierebbe una voce dai suoi conteggi, su cui un altro
      // test più sotto fa un'asserzione esatta.
      const rinnovo = await rinnova({
        socio_id: d.soci.socio1, data_rinnovo: giorniFa(0), scadenza: giorniFa(-1095), importo: 55,
      });
      assert.equal(rinnovo.status, 201, JSON.stringify(rinnovo.body));
      const quota = { id: rinnovo.body.id };

      const emesso = await api(admin, 'POST', '/api/documenti', {
        socio_id: d.soci.socio1,
        causale: 'quota_test',
        voci: [{ tipo: 'tesseramento', id: quota.id }],
      });
      assert.equal(emesso.status, 201, JSON.stringify(emesso.body));

      const storico = await api(admin, 'GET', `/api/tesseramenti/${d.soci.socio1}`);
      const riga = (storico.body as any[]).find(t => t.id === quota.id);
      assert.ok(riga, 'il rinnovo documentato deve essere nello storico');
      assert.equal(riga.documento_id, emesso.body.id);
      assert.equal(riga.documento_anno, emesso.body.anno);
      assert.equal(riga.documento_numero, emesso.body.numero);

      // Gli altri rinnovi restano senza: i tre campi sono null insieme.
      assert.ok(
        (storico.body as any[]).filter(t => t.id !== quota.id).every(
          t => t.documento_id === null && t.documento_anno === null && t.documento_numero === null
        ),
        'un rinnovo non documentato non ha ricevuta'
      );
    });
  });

  describe('impostazioni e voucher', () => {
    it('la quota non può essere negativa (400)', async () => {
      const r = await api(admin, 'PUT', '/api/impostazioni', { quota_tesseramento: -1 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('l\'admin salva la quota', async () => {
      // Si risalva il valore attuale: la quota è configurazione reale
      // dell'associazione, non un dato di prova da poter sporcare.
      const attuale = Number((await api(admin, 'GET', '/api/impostazioni')).body.quota_tesseramento);
      const r = await api(admin, 'PUT', '/api/impostazioni', { quota_tesseramento: attuale });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(Number(r.body.quota_tesseramento), attuale);
    });

    it('una ricarica deve avere un importo positivo (400)', async () => {
      const voucher = await voucherDi(d.soci.socio1);
      const r = await api(admin, 'POST', `/api/voucher/${voucher.id}/movimenti`, { tipo: 'ricarica', importo: -10 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('senza tipo, un importo negativo non diventa un addebito (400)', async () => {
      const voucher = await voucherDi(d.soci.socio1);
      const r = await api(admin, 'POST', `/api/voucher/${voucher.id}/movimenti`, { importo: -10 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('una ricarica con data la registra e la documenta in quella data', async () => {
      const voucher = await voucherDi(d.soci.socio2);
      const data = giorniFa(40);
      const r = await api(admin, 'POST', `/api/voucher/${voucher.id}/movimenti`,
        { importo: 12, data_movimento: data, descrizione: 'Creato dai test API' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(String(r.body.data_movimento).slice(0, 10), data);
      const b = await vociDocumento(`socio_id=${d.soci.socio2}&da=${data}&a=${data}`);
      assert.ok(b.data.some((v: any) => v.id === r.body.id && String(v.data).slice(0, 10) === data));
    });

    it('una data di ricarica inesistente è rifiutata (400)', async () => {
      const voucher = await voucherDi(d.soci.socio2);
      const r = await api(admin, 'POST', `/api/voucher/${voucher.id}/movimenti`,
        { importo: 12, data_movimento: '2026-02-30' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('un tipo sconosciuto è rifiutato (400)', async () => {
      const voucher = await voucherDi(d.soci.socio1);
      const r = await api(admin, 'POST', `/api/voucher/${voucher.id}/movimenti`, { tipo: 'incontro', importo: -10 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('attivare un voucher con un importo acquistato crea una ricarica documentabile', async () => {
      const r = await api(admin, 'POST', '/api/voucher', { socio_id: d.soci.senzaAccount, ricarica: 50 });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(Number(r.body.saldo_iniziale), 0);
      assert.equal(Number(r.body.saldo_residuo), 50);
      // L'incontro registrato prima del voucher resta pagato a parte:
      // incontro 30 + due quote da 45 + acquisto 50.
      assertVoci(await vociDocumento(`socio_id=${d.soci.senzaAccount}`), 4, 170);
    });
  });
});
