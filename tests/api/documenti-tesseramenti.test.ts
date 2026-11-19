/**
 * Ricevute, tesseramenti e impostazioni: accesso riservato, voci conteggiate
 * e totali, regole di rinnovo, ricariche.
 *
 * Ogni caso parte da un database vuoto: voci e totali sono esattamente quelli
 * dei movimenti, degli incontri e dei rinnovi che il caso crea.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, saldo, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIncontro, creaSocio, ricarica } from './fabbrica.ts';

usaAmbiente();

describe('Ricevute e tesseramenti', () => {
  const vociDocumento = async (admin: Sessione, query: string) => {
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
  const rinnova = (admin: Sessione, body: Record<string, unknown>) =>
    api(admin, 'POST', '/api/tesseramenti', { numero_tessera: `DT_test_${String(body.socio_id).slice(0, 8)}`, ...body });
  const rinnovato = async (admin: Sessione, body: Record<string, unknown>) => {
    const r = await rinnova(admin, body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };

  it('voci, tesseramenti e impostazioni sono riservati all\'admin (403)', async () => {
    const admin = await creaAdmin();
    const istruttore = await creaAccount(admin, 'istruttore2', 'istruttore');
    const account = await creaAccount(admin, 'socio1');
    const socio1 = await creaSocio(admin, 'socio1', { account });
    const altro = await creaSocio(admin, 'senzaAccount');
    for (const s of [istruttore, account]) {
      // `/api/tesseramenti/{socioId}` NON è in questo elenco con il proprio
      // id: dalla spec 004 il socio legge il proprio storico. Qui si prova
      // quello di un'altra scheda; il caso "il proprio" ha un test suo.
      for (const path of ['/api/documenti/voci', '/api/tesseramenti', `/api/tesseramenti/${altro.id}`, '/api/impostazioni']) {
        assert.equal((await api(s, 'GET', path)).status, 403, path);
      }
      assert.equal((await api(s, 'POST', '/api/tesseramenti', { socio_id: socio1.id, scadenza: giorniFa(-365) })).status, 403);
      assert.equal((await api(s, 'PATCH', '/api/impostazioni', { quota_tesseramento: 1 })).status, 403);
    }
  });

  describe('voci da documentare', () => {
    it('conta l\'acquisto e le ricariche dei voucher', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio2', { ricarica: 40 });
      await ricarica(admin, socio.voucherId!, 30);
      const b = await vociDocumento(admin, `socio_id=${socio.id}`);
      assertVoci(b, 2, 70);
      assert.ok(b.data.every((v: any) => v.tipo === 'ricarica'));
    });

    it('non conta gli incontri pagati con il voucher', async () => {
      const admin = await creaAdmin();
      const educazione = await creaAttivita(admin, 'educazione');
      const socio = await creaSocio(admin, 'socio1', { ricarica: 150 });
      for (const giorni of [50, 22, 6]) {
        await creaIncontro(admin, { socio: socio.id, attivita: educazione, istruttore: admin, costo: 30, giorni });
      }
      // Tre incontri addebitati sul voucher: resta solo l'acquisto.
      assertVoci(await vociDocumento(admin, `socio_id=${socio.id}`), 1, 150);
    });

    it('non conta il saldo importato di un voucher', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'istruttore2', { saldoIniziale: 100 });
      assertVoci(await vociDocumento(admin, `socio_id=${socio.id}`), 0, 0);
    });

    it('un addebito manuale è rifiutato e non tocca saldo né voci (400)', async () => {
      // Gli addebiti nascono solo dagli incontri.
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'istruttore2', { saldoIniziale: 100 });
      const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`,
        { tipo: 'addebito', importo: -5, descrizione: 'Creato dai test API' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(await saldo(admin, socio.id), 100);
      assertVoci(await vociDocumento(admin, `socio_id=${socio.id}`), 0, 0);
    });

    it('conta gli incontri non coperti da un voucher', async () => {
      const admin = await creaAdmin();
      const educazione = await creaAttivita(admin, 'educazione');
      const socio = await creaSocio(admin, 'senzaAccount');
      const incontro = await creaIncontro(admin, { socio: socio.id, attivita: educazione, istruttore: admin, costo: 30, giorni: 3 });
      const b = await vociDocumento(admin, `socio_id=${socio.id}`);
      assertVoci(b, 1, 30);
      assert.equal(b.data[0].tipo, 'incontro');
      assert.equal(b.data[0].id, incontro.id);
    });
  });

  describe('tesseramenti', () => {
    /** Un socio senza voucher con un incontro di 3 giorni fa (30), da pagare a parte. */
    async function socioConIncontro() {
      const admin = await creaAdmin();
      const educazione = await creaAttivita(admin, 'educazione');
      const socio = await creaSocio(admin, 'senzaAccount');
      await creaIncontro(admin, { socio: socio.id, attivita: educazione, istruttore: admin, costo: 30, giorni: 3 });
      return { admin, socio: socio.id };
    }

    it('il rinnovo registra la quota fra le voci', async () => {
      const { admin, socio } = await socioConIncontro();
      const t = await rinnovato(admin, { socio_id: socio, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      assert.equal(Number(t.importo), 45);
      const b = await vociDocumento(admin, `socio_id=${socio}`);
      assertVoci(b, 2, 75);
      assert.ok(b.data.some((v: any) => v.tipo === 'tesseramento' && v.id === t.id));
    });

    it('i totali rispettano il filtro per periodo', async () => {
      // Tesseramento di oggi (45) e incontro di 3 giorni fa (30).
      const { admin, socio } = await socioConIncontro();
      await rinnovato(admin, { socio_id: socio, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      assertVoci(await vociDocumento(admin, `socio_id=${socio}&da=${giorniFa(1)}`), 1, 45);
      assertVoci(await vociDocumento(admin, `socio_id=${socio}&a=${giorniFa(1)}`), 1, 30);
    });

    it('senza importo il rinnovo usa la quota configurata', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1');
      assert.equal((await api(admin, 'PATCH', '/api/impostazioni', { quota_tesseramento: 35 })).status, 200);
      const t = await rinnovato(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365) });
      assert.equal(Number(t.importo), 35);
    });

    it('il rinnovo non tocca il voucher', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1', { ricarica: 60 });
      await rinnovato(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      assert.equal(await saldo(admin, socio.id), 60);
    });

    it('la nuova scadenza deve seguire quella attuale (400)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'senzaAccount');
      await rinnovato(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      const r = await rinnova(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-300), importo: 45 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('la scadenza deve seguire la data del rinnovo (400)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio2');
      const r = await rinnova(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(0) });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('una data inesistente è rifiutata (400)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio2');
      const r = await rinnova(admin, { socio_id: socio.id, scadenza: '2031-02-30' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('la situazione riporta l\'ultima scadenza di ogni socio', async () => {
      const admin = await creaAdmin();
      const tesserato = await creaSocio(admin, 'senzaAccount');
      const mai = await creaSocio(admin, 'socio2');
      await rinnovato(admin, { socio_id: tesserato.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      await rinnovato(admin, { socio_id: tesserato.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-730), importo: 45 });

      const r = await api(admin, 'GET', '/api/tesseramenti');
      assert.equal(r.status, 200);
      assert.equal((r.body as any[]).length, 2);
      const riga = (socioId: string) => (r.body as any[]).find(x => x.socio_id === socioId);
      assert.equal(String(riga(tesserato.id).scadenza).slice(0, 10), giorniFa(-730));
      assert.equal(riga(tesserato.id).rinnovi, 2);
      assert.equal(riga(mai.id).scadenza, null);
      assert.equal(riga(mai.id).rinnovi, 0);
    });

    it('lo storico elenca tutti i rinnovi, dal più recente', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'senzaAccount');
      await rinnovato(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      await rinnovato(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-730), importo: 45 });
      const r = await api(admin, 'GET', `/api/tesseramenti/${socio.id}`);
      assert.equal(r.status, 200);
      assert.deepEqual((r.body as any[]).map(t => String(t.scadenza).slice(0, 10)), [giorniFa(-730), giorniFa(-365)]);
    });

    it('un socio legge il proprio storico, non quello di un altro', async () => {
      const admin = await creaAdmin();
      const account = await creaAccount(admin, 'socio1');
      const proprioSocio = await creaSocio(admin, 'socio1', { account });
      const altro = await creaSocio(admin, 'senzaAccount');
      await rinnovato(admin, { socio_id: proprioSocio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });

      // Il proprio: concesso. È l'unica rotta dell'area aperta oltre l'admin.
      const proprio = await api(account, 'GET', `/api/tesseramenti/${proprioSocio.id}`);
      assert.equal(proprio.status, 200, JSON.stringify(proprio.body));
      assert.equal(proprio.body.length, 1);

      // Quello di un altro: 403 anche passando l'id giusto a mano. Il confronto
      // è con la scheda socio collegata all'account, non con il parametro.
      const altrui = await api(account, 'GET', `/api/tesseramenti/${altro.id}`);
      assert.equal(altrui.status, 403, JSON.stringify(altrui.body));

      // L'elenco di tutti resta dell'admin: un socio non lo vede.
      assert.equal((await api(account, 'GET', '/api/tesseramenti')).status, 403);
    });

    it('lo storico porta la ricevuta della quota', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1');
      await rinnovato(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-365), importo: 45 });
      const quota = await rinnovato(admin, { socio_id: socio.id, data_rinnovo: giorniFa(0), scadenza: giorniFa(-1095), importo: 55 });

      const emesso = await api(admin, 'POST', '/api/documenti', {
        socio_id: socio.id,
        causale: 'quota_test',
        voci: [{ tipo: 'tesseramento', id: quota.id }],
      });
      assert.equal(emesso.status, 201, JSON.stringify(emesso.body));

      const storico = await api(admin, 'GET', `/api/tesseramenti/${socio.id}`);
      assert.equal(storico.body.length, 2);
      const riga = (storico.body as any[]).find(t => t.id === quota.id);
      assert.ok(riga, 'il rinnovo documentato deve essere nello storico');
      assert.equal(riga.documento_id, emesso.body.id);
      assert.equal(riga.documento_anno, emesso.body.anno);
      assert.equal(riga.documento_numero, emesso.body.numero);

      // L'altro rinnovo resta senza: i tre campi sono null insieme.
      const altro = (storico.body as any[]).find(t => t.id !== quota.id);
      assert.deepEqual([altro.documento_id, altro.documento_anno, altro.documento_numero], [null, null, null],
        'un rinnovo non documentato non ha ricevuta');
    });
  });

  describe('impostazioni e voucher', () => {
    it('la quota non può essere negativa (400)', async () => {
      const admin = await creaAdmin();
      const r = await api(admin, 'PATCH', '/api/impostazioni', { quota_tesseramento: -1 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(Number((await api(admin, 'GET', '/api/impostazioni')).body.quota_tesseramento), 0);
    });

    it('l\'admin salva la quota', async () => {
      const admin = await creaAdmin();
      const r = await api(admin, 'PATCH', '/api/impostazioni', { quota_tesseramento: 42.5 });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(Number(r.body.quota_tesseramento), 42.5);
      assert.equal(Number((await api(admin, 'GET', '/api/impostazioni')).body.quota_tesseramento), 42.5);
    });

    it('una ricarica deve avere un importo positivo (400)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1', { ricarica: 60 });
      const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, { tipo: 'ricarica', importo: -10 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('senza tipo, un importo negativo non diventa un addebito (400)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1', { ricarica: 60 });
      const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, { importo: -10 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(await saldo(admin, socio.id), 60);
    });

    it('una ricarica con data la registra e la documenta in quella data', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio2', { ricarica: 40 });
      const data = giorniFa(40);
      const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`,
        { importo: 12, data_movimento: data, descrizione: 'Creato dai test API' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(String(r.body.data_movimento).slice(0, 10), data);
      const b = await vociDocumento(admin, `socio_id=${socio.id}&da=${data}&a=${data}`);
      assert.equal(b.data.length, 1);
      assert.equal(b.data[0].id, r.body.id);
      assert.equal(String(b.data[0].data).slice(0, 10), data);
    });

    it('una data di ricarica inesistente è rifiutata (400)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio2', { ricarica: 40 });
      const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`,
        { importo: 12, data_movimento: '2026-02-30' });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('un tipo sconosciuto è rifiutato (400)', async () => {
      const admin = await creaAdmin();
      const socio = await creaSocio(admin, 'socio1', { ricarica: 60 });
      const r = await api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, { tipo: 'incontro', importo: -10 });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });

    it('attivare un voucher con un importo acquistato crea una ricarica documentabile', async () => {
      const admin = await creaAdmin();
      const educazione = await creaAttivita(admin, 'educazione');
      const socio = await creaSocio(admin, 'senzaAccount');
      // Un incontro registrato prima del voucher resta pagato a parte.
      await creaIncontro(admin, { socio: socio.id, attivita: educazione, istruttore: admin, costo: 30, giorni: 3 });
      const r = await api(admin, 'POST', '/api/voucher', { socio_id: socio.id, ricarica: 50 });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(Number(r.body.saldo_iniziale), 0);
      assert.equal(Number(r.body.saldo_residuo), 50);
      // Incontro 30 + acquisto 50.
      const b = await vociDocumento(admin, `socio_id=${socio.id}`);
      assertVoci(b, 2, 80);
      assert.ok(b.data.some((v: any) => v.tipo === 'ricarica' && Number(v.importo) === 50));
    });
  });
});
