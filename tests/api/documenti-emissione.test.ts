/**
 * Emissione delle ricevute: anteprima, conferma, numerazione, permessi, e che
 * cosa non si può più toccare dopo.
 *
 * Le voci vengono da tre tabelle diverse (ricariche di voucher, tesseramenti,
 * incontri non coperti da voucher) e sono identificate dalla coppia
 * (tipo, id): i test la esercitano su almeno due tipi, perché è il punto in cui
 * un riferimento polimorfico può sbagliare bersaglio.
 *
 * Ogni caso parte da un database vuoto: la numerazione riparte da 1, e le
 * impostazioni sono quelle iniziali (ambiente.ts le rimette prima di ogni caso).
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIstruttore, creaSocio, ricarica } from './fabbrica.ts';

usaAmbiente();

/** I primi byte di un PDF: `%PDF` in base64 comincia sempre con "JVBERi0". */
function assertPdf(base64: string, cosa: string) {
  assert.ok(base64, `${cosa}: manca il PDF`);
  const inizio = Buffer.from(base64, 'base64').subarray(0, 4).toString();
  assert.equal(inizio, '%PDF', `${cosa}: non è un PDF`);
}

describe('Documenti: emissione delle ricevute', () => {
  let admin: Sessione;

  const voci = async (query: string) => {
    const r = await api(admin, 'GET', `/api/documenti/voci?${query}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data as any[];
  };
  const corpo = (socioId: string, scelte: { tipo: string; id: string }[], causale = 'prova_test') =>
    ({ socio_id: socioId, causale, voci: scelte });
  const anteprima = (socioId: string, scelte: { tipo: string; id: string }[], causale?: string) =>
    api(admin, 'POST', '/api/documenti/anteprima', corpo(socioId, scelte, causale));
  const emetti = (socioId: string, scelte: { tipo: string; id: string }[], causale?: string) =>
    api(admin, 'POST', '/api/documenti', corpo(socioId, scelte, causale));
  const totaleDocumenti = async () => (await api(admin, 'GET', '/api/documenti?limit=1')).body.total as number;

  /** socio1 con due voci da documentare: l'acquisto del voucher (150) e una ricarica (50). */
  async function socioConDueRicariche(): Promise<string> {
    const socio = await creaSocio(admin, 'socio1', { ricarica: 150 });
    await ricarica(admin, socio.voucherId!, 50);
    return socio.id;
  }

  /**
   * Un incontro di un socio senza voucher: nessun addebito lo copre, e resta
   * una voce a sé.
   */
  async function incontroSenzaVoucher(socioId: string, costo: number, giorni = 3): Promise<string> {
    const educazione = await creaAttivita(admin, `educazione${costo}`);
    const creato = await api(admin, 'POST', '/api/incontri', {
      socio_id: socioId,
      data_incontro: giorniFa(giorni),
      attivita_id: educazione,
      costo,
    });
    assert.equal(creato.status, 201, JSON.stringify(creato.body));
    return creato.body.id;
  }

  beforeEach(async () => { admin = await creaAdmin(); });

  it('intestazione e piè di pagina delle ricevute si salvano davvero', async () => {
    // Caso nato da un difetto vero: l'handler di /api/impostazioni ha una
    // whitelist esplicita dei campi scrivibili, e una chiave nuova dimenticata
    // lì viene scartata in silenzio — la risposta resta 200 e sembra un
    // successo. Il round-trip è l'unico modo per accorgersene.
    const originali = (await api(admin, 'GET', '/api/impostazioni')).body;
    const intestazione = 'ASD DI PROVA_test\nVia Roma 1 — C.F. 00000000000';
    const pie = 'Operazione esente da imposta di bollo (prova_test).';

    const patch = await api(admin, 'PATCH', '/api/impostazioni', {
      ricevuta_intestazione: intestazione,
      ricevuta_pie_pagina: pie,
    });
    assert.equal(patch.status, 200, JSON.stringify(patch.body));
    assert.equal(patch.body.ricevuta_intestazione, intestazione);
    assert.equal(patch.body.ricevuta_pie_pagina, pie);

    const get = await api(admin, 'GET', '/api/impostazioni');
    assert.equal(get.body.ricevuta_intestazione, intestazione);
    assert.equal(get.body.ricevuta_pie_pagina, pie);

    // Le altre impostazioni non devono essere state toccate dalla scrittura.
    assert.equal(get.body.quota_tesseramento, originali.quota_tesseramento);
  });

  it('le voci nascono da registrare e senza documento', async () => {
    const socio = await socioConDueRicariche();
    const elenco = await voci(`socio_id=${socio}&limit=50`);
    assert.equal(elenco.length, 2, 'le due ricariche di socio1');
    assert.deepEqual(elenco.map(v => Number(v.importo)).sort((a, b) => a - b), [50, 150]);
    assert.ok(elenco.every(v => v.emessa_il === null), 'nessuna è già emessa');
    assert.ok(elenco.every(v => v.documento_id === null), 'nessuna ha un documento');
  });

  it('l\'anteprima produce un PDF e NON scrive niente', async () => {
    const socio = await socioConDueRicariche();
    const [prima] = await voci(`socio_id=${socio}&limit=1`);

    const r1 = await anteprima(socio, [{ tipo: prima.tipo, id: prima.id }]);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assertPdf(r1.body.pdf_base64, 'anteprima');
    // Database vuoto: la prima ricevuta dell'anno.
    assert.equal(r1.body.numero_provvisorio, 1);
    assert.ok(r1.body.importo_lettere, 'l\'importo in lettere deve esserci');

    // Due anteprime di fila non consumano numeri e non creano documenti: è la
    // proprietà che fa sparire del tutto la questione delle bozze.
    const r2 = await anteprima(socio, [{ tipo: prima.tipo, id: prima.id }]);
    assert.equal(r2.body.numero_provvisorio, 1);
    assert.equal(await totaleDocumenti(), 0, 'l\'anteprima non deve creare documenti');

    // La voce è ancora da registrare.
    const ancora = await voci(`socio_id=${socio}&limit=50`);
    assert.equal(ancora.length, 2);
    assert.ok(ancora.some(v => v.tipo === prima.tipo && v.id === prima.id));
  });

  it('anteprima ed emissione sono riservate all\'admin (403)', async () => {
    const socio = await socioConDueRicariche();
    const istruttore = await creaIstruttore(admin, 'istruttore2');
    const account = await creaAccount(admin, 'socio_conto');
    const [prima] = await voci(`socio_id=${socio}&limit=1`);
    const scelte = [{ tipo: prima.tipo, id: prima.id }];
    for (const s of [istruttore, account]) {
      for (const rotta of ['/api/documenti/anteprima', '/api/documenti']) {
        const r = await api(s, 'POST', rotta, corpo(socio, scelte));
        assert.equal(r.status, 403, `${rotta}: ${JSON.stringify(r.body)}`);
      }
      assert.equal((await api(s, 'GET', '/api/documenti')).status, 403);
    }
    assert.equal(await totaleDocumenti(), 0);
  });

  it('rifiuta corpi incompleti o di tipo sconosciuto (400)', async () => {
    const socio = await socioConDueRicariche();
    const [prima] = await voci(`socio_id=${socio}&limit=1`);
    assert.equal((await emetti(socio, [])).status, 400);
    assert.equal((await api(admin, 'POST', '/api/documenti', {})).status, 400);
    assert.equal((await emetti(socio, [{ tipo: 'inventato', id: prima.id }])).status, 400);
    assert.equal((await emetti(socio, [{ tipo: 'ricarica', id: '' }])).status, 400);
    // Causale vuota: è l'unico campo libero del documento, e senza non si sa
    // che cosa si stia certificando.
    assert.equal((await emetti(socio, [{ tipo: prima.tipo, id: prima.id }], '  ')).status, 400);
    assert.equal(await totaleDocumenti(), 0);
  });

  it('la conferma crea il documento, lega la voce e la toglie dall\'elenco', async () => {
    const socio = await socioConDueRicariche();
    const [scelta] = await voci(`socio_id=${socio}&limit=50`);

    const r = await emetti(socio, [{ tipo: scelta.tipo, id: scelta.id }], 'ricevuta_test');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assertPdf(r.body.pdf_base64, 'emissione');
    assert.equal(r.body.numero, 1);
    assert.equal(Number(r.body.importo), Number(scelta.importo));
    // Il nome del download è ricevuta_<anno>_<numero>.pdf: nessun dato della
    // persona finisce nel nome di un file che qualcuno salverà sul disco.
    assert.equal(r.body.nome_file, `ricevuta_${r.body.anno}_1.pdf`);

    // Sparita dall'elenco predefinito: resta l'altra ricarica.
    const dopo = await voci(`socio_id=${socio}&limit=50`);
    assert.equal(dopo.length, 1);
    assert.notEqual(dopo[0].id, scelta.id);

    // Torna col flag, con data di emissione E documento collegato.
    const conEmesse = await voci(`socio_id=${socio}&includi_emesse=1&limit=50`);
    assert.equal(conEmesse.length, 2);
    const ritrovata = conEmesse.find(v => v.tipo === scelta.tipo && v.id === scelta.id);
    assert.ok(ritrovata?.emessa_il, 'la data di emissione deve esserci');
    assert.equal(ritrovata?.documento_id, r.body.id, 'la voce punta al documento');
  });

  it('la numerazione cresce di uno per ogni documento dello stesso anno', async () => {
    const socio = (await creaSocio(admin, 'senzaAccount')).id;
    const ids = [await incontroSenzaVoucher(socio, 11, 10), await incontroSenzaVoucher(socio, 13, 10)];

    const uno = await emetti(socio, [{ tipo: 'incontro', id: ids[0] }]);
    const due = await emetti(socio, [{ tipo: 'incontro', id: ids[1] }]);
    assert.equal(uno.status, 201, JSON.stringify(uno.body));
    assert.equal(due.status, 201, JSON.stringify(due.body));
    assert.equal(due.body.anno, uno.body.anno);
    assert.deepEqual([uno.body.numero, due.body.numero], [1, 2]);
  });

  it('riemettere una voce già documentata fallisce con 409', async () => {
    const socio = await socioConDueRicariche();
    const [scelta] = await voci(`socio_id=${socio}&limit=50`);
    assert.equal((await emetti(socio, [{ tipo: scelta.tipo, id: scelta.id }])).status, 201);

    const r = await emetti(socio, [{ tipo: scelta.tipo, id: scelta.id }]);
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(await totaleDocumenti(), 1);
  });

  it('funziona anche su un tipo diverso (tesseramento)', async () => {
    const socio = (await creaSocio(admin, 'socio2', { ricarica: 40 })).id;
    const rinnovo = await api(admin, 'POST', '/api/tesseramenti', {
      socio_id: socio,
      scadenza: giorniFa(-365),
      importo: 25,
      numero_tessera: 'DE_test_1',
    });
    assert.equal(rinnovo.status, 201, JSON.stringify(rinnovo.body));

    const tesseramenti = (await voci(`socio_id=${socio}&limit=50`))
      .filter(v => v.tipo === 'tesseramento');
    assert.equal(tesseramenti.length, 1);
    assert.equal(Number(tesseramenti[0].importo), 25);

    const r = await emetti(socio, [{ tipo: 'tesseramento', id: tesseramenti[0].id }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 25);

    // Resta solo la ricarica: il bersaglio della coppia (tipo, id) era giusto.
    const restano = await voci(`socio_id=${socio}&limit=50`);
    assert.deepEqual(restano.map(v => v.tipo), ['ricarica']);
  });

  it('un incontro documentato non si elimina né si modifica', async () => {
    const socio = (await creaSocio(admin, 'senzaAccount')).id;
    const incontro = await incontroSenzaVoucher(socio, 20);

    const r = await emetti(socio, [{ tipo: 'incontro', id: incontro }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const eliminazione = await api(admin, 'DELETE', `/api/incontri/${incontro}`);
    assert.equal(eliminazione.status, 400, JSON.stringify(eliminazione.body));
    assert.match(eliminazione.body.error, /ricevuta/i);

    // Né si modifica: cambiarne il costo dopo l'emissione farebbe dire al
    // documento una cifra e al database un'altra.
    const modifica = await api(admin, 'PATCH', `/api/incontri/${incontro}`, { costo: 99 });
    assert.equal(modifica.status, 400, JSON.stringify(modifica.body));
    assert.match(modifica.body.error, /ricevuta/i);
    assert.equal(Number((await api(admin, 'GET', `/api/incontri/${incontro}`)).body.costo), 20);
  });

  it('un socio con voci documentate non si elimina', async () => {
    const socio = (await creaSocio(admin, 'senzaAccount')).id;
    const incontro = await incontroSenzaVoucher(socio, 20);
    assert.equal((await emetti(socio, [{ tipo: 'incontro', id: incontro }])).status, 201);

    const r = await api(admin, 'DELETE', `/api/soci/${socio}`);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    // Il messaggio deve dire quante e perché: è ciò che il frontend mostra.
    assert.match(r.body.error, /document/i);
    assert.equal((await api(admin, 'GET', `/api/soci/${socio}`)).status, 200);
  });
});
