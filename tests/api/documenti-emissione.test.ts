/**
 * Emissione delle ricevute: anteprima, conferma, numerazione, permessi, e che
 * cosa non si può più toccare dopo.
 *
 * Le voci vengono da tre tabelle diverse (ricariche di voucher, tesseramenti,
 * incontri non coperti da voucher) e sono identificate dalla coppia
 * (tipo, id): i test la esercitano su almeno due tipi, perché è il punto in cui
 * un riferimento polimorfico può sbagliare bersaglio.
 *
 * Le righe scritte qui riguardano voci di prova, che la pulizia finale rimuove.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, type Sessione } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

/** I primi byte di un PDF: `%PDF` in base64 comincia sempre con "JVBERi0". */
function assertPdf(base64: string, cosa: string) {
  assert.ok(base64, `${cosa}: manca il PDF`);
  const inizio = Buffer.from(base64, 'base64').subarray(0, 4).toString();
  assert.equal(inizio, '%PDF', `${cosa}: non è un PDF`);
}

describe('Documenti: emissione delle ricevute', () => {
  let d: DatiTest;
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

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
  });
  after(() => pulisciDatiTest());

  it('intestazione e piè di pagina delle ricevute si salvano davvero', async () => {
    // Caso nato da un difetto vero: l'handler di /api/impostazioni ha una
    // whitelist esplicita dei campi scrivibili, e una chiave nuova dimenticata
    // lì viene scartata in silenzio — la risposta resta 200 e sembra un
    // successo. Il round-trip è l'unico modo per accorgersene.
    //
    // Le impostazioni sono UNA riga per club, non un dato di prova
    // riconoscibile dal suffisso _test: questo caso le sovrascrive davvero.
    // Vanno quindi rimesse com'erano anche se un assert fallisce, altrimenti
    // la suite lascia al club un'intestazione che non ha mai scritto.
    const originali = (await api(admin, 'GET', '/api/impostazioni')).body;
    const intestazione = 'ASD DI PROVA_test\nVia Roma 1 — C.F. 00000000000';
    const pie = 'Operazione esente da imposta di bollo (prova_test).';

    try {
      const put = await api(admin, 'PUT', '/api/impostazioni', {
        ricevuta_intestazione: intestazione,
        ricevuta_pie_pagina: pie,
      });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      assert.equal(put.body.ricevuta_intestazione, intestazione);
      assert.equal(put.body.ricevuta_pie_pagina, pie);

      const get = await api(admin, 'GET', '/api/impostazioni');
      assert.equal(get.body.ricevuta_intestazione, intestazione);
      assert.equal(get.body.ricevuta_pie_pagina, pie);

      // Le altre impostazioni non devono essere state toccate dalla scrittura.
      assert.ok(get.body.quota_tesseramento !== undefined);
    } finally {
      await api(admin, 'PUT', '/api/impostazioni', {
        ricevuta_intestazione: originali.ricevuta_intestazione ?? '',
        ricevuta_pie_pagina: originali.ricevuta_pie_pagina ?? '',
      });
    }
  });

  it('le voci nascono da registrare e senza documento', async () => {
    const elenco = await voci(`socio_id=${d.soci.socio1}&limit=50`);
    assert.ok(elenco.length > 0, 'socio1 ha voci da documentare');
    assert.ok(elenco.every(v => v.emessa_il === null), 'nessuna è già emessa');
    assert.ok(elenco.every(v => v.documento_id === null), 'nessuna ha un documento');
  });

  it('l\'anteprima produce un PDF e NON scrive niente', async () => {
    const [prima] = await voci(`socio_id=${d.soci.socio1}&limit=1`);
    const quantiPrima = (await api(admin, 'GET', '/api/documenti?limit=1')).body.total;

    const r1 = await anteprima(d.soci.socio1, [{ tipo: prima.tipo, id: prima.id }]);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assertPdf(r1.body.pdf_base64, 'anteprima');
    assert.ok(r1.body.numero_provvisorio >= 1);
    assert.ok(r1.body.importo_lettere, 'l\'importo in lettere deve esserci');

    // Due anteprime di fila non consumano numeri e non creano documenti: è la
    // proprietà che fa sparire del tutto la questione delle bozze.
    const r2 = await anteprima(d.soci.socio1, [{ tipo: prima.tipo, id: prima.id }]);
    assert.equal(r2.body.numero_provvisorio, r1.body.numero_provvisorio);

    const quantiDopo = (await api(admin, 'GET', '/api/documenti?limit=1')).body.total;
    assert.equal(quantiDopo, quantiPrima, 'l\'anteprima non deve creare documenti');

    // La voce è ancora da registrare.
    const ancora = await voci(`socio_id=${d.soci.socio1}&limit=50`);
    assert.ok(ancora.some(v => v.tipo === prima.tipo && v.id === prima.id));
  });

  it('anteprima ed emissione sono riservate all\'admin (403)', async () => {
    const [prima] = await voci(`socio_id=${d.soci.socio1}&limit=1`);
    const scelte = [{ tipo: prima.tipo, id: prima.id }];
    for (const s of [d.sessioni.istruttore2, d.sessioni.socio1]) {
      for (const rotta of ['/api/documenti/anteprima', '/api/documenti']) {
        const r = await api(s, 'POST', rotta, corpo(d.soci.socio1, scelte));
        assert.equal(r.status, 403, `${rotta}: ${JSON.stringify(r.body)}`);
      }
      assert.equal((await api(s, 'GET', '/api/documenti')).status, 403);
    }
  });

  it('rifiuta corpi incompleti o di tipo sconosciuto (400)', async () => {
    const [prima] = await voci(`socio_id=${d.soci.socio1}&limit=1`);
    assert.equal((await emetti(d.soci.socio1, [])).status, 400);
    assert.equal((await api(admin, 'POST', '/api/documenti', {})).status, 400);
    assert.equal((await emetti(d.soci.socio1, [{ tipo: 'inventato', id: prima.id }])).status, 400);
    assert.equal((await emetti(d.soci.socio1, [{ tipo: 'ricarica', id: '' }])).status, 400);
    // Causale vuota: è l'unico campo libero del documento, e senza non si sa
    // che cosa si stia certificando.
    assert.equal((await emetti(d.soci.socio1, [{ tipo: prima.tipo, id: prima.id }], '  ')).status, 400);
  });

  it('la conferma crea il documento, lega la voce e la toglie dall\'elenco', async () => {
    const prima = await voci(`socio_id=${d.soci.socio1}&limit=50`);
    const scelta = prima[0];

    const r = await emetti(d.soci.socio1, [{ tipo: scelta.tipo, id: scelta.id }], 'ricevuta_test');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assertPdf(r.body.pdf_base64, 'emissione');
    assert.ok(r.body.numero >= 1);
    assert.equal(Number(r.body.importo), Number(scelta.importo));
    // Il nome del download è ricevuta_<anno>_<numero>.pdf: nessun dato della
    // persona finisce nel nome di un file che qualcuno salverà sul disco.
    assert.equal(r.body.nome_file, `ricevuta_${r.body.anno}_${r.body.numero}.pdf`);

    // Sparita dall'elenco predefinito.
    const dopo = await voci(`socio_id=${d.soci.socio1}&limit=50`);
    assert.equal(dopo.length, prima.length - 1);

    // Torna col flag, con data di emissione E documento collegato.
    const conEmesse = await voci(`socio_id=${d.soci.socio1}&includi_emesse=1&limit=50`);
    const ritrovata = conEmesse.find(v => v.tipo === scelta.tipo && v.id === scelta.id);
    assert.ok(ritrovata?.emessa_il, 'la data di emissione deve esserci');
    assert.equal(ritrovata?.documento_id, r.body.id, 'la voce punta al documento');
  });

  it('la numerazione cresce di uno per ogni documento dello stesso anno', async () => {
    // Voci create qui e non prese dall'elenco: i casi precedenti ne hanno già
    // consumate, e un test che dipende da quante ne restano si rompe appena
    // se ne aggiunge un altro sopra.
    //
    // senzaAccount non ha un voucher, quindi i suoi incontri non vengono
    // coperti da un addebito e restano voci a sé.
    const ids: string[] = [];
    for (const costo of [11, 13]) {
      const creato = await api(admin, 'POST', '/api/incontri', {
        socio_id: d.soci.senzaAccount,
        data_incontro: giorniFa(10),
        attivita_id: d.attivita.educazione,
        costo,
      });
      assert.equal(creato.status, 201, JSON.stringify(creato.body));
      ids.push(creato.body.id);
    }

    const uno = await emetti(d.soci.senzaAccount, [{ tipo: 'incontro', id: ids[0] }]);
    const due = await emetti(d.soci.senzaAccount, [{ tipo: 'incontro', id: ids[1] }]);
    assert.equal(uno.status, 201, JSON.stringify(uno.body));
    assert.equal(due.status, 201, JSON.stringify(due.body));
    assert.equal(due.body.anno, uno.body.anno);
    assert.equal(due.body.numero, uno.body.numero + 1);
  });

  it('riemettere una voce già documentata fallisce con 409', async () => {
    // Una voce già documentata dai casi precedenti.
    const emesse = (await voci(`socio_id=${d.soci.socio1}&includi_emesse=1&limit=50`))
      .filter(v => v.emessa_il);
    assert.ok(emesse.length > 0, 'serve una voce già emessa');

    const r = await emetti(d.soci.socio1, [{ tipo: emesse[0].tipo, id: emesse[0].id }]);
    assert.equal(r.status, 409, JSON.stringify(r.body));
  });

  it('funziona anche su un tipo diverso (tesseramento)', async () => {
    const rinnovo = await api(admin, 'POST', '/api/tesseramenti', {
      socio_id: d.soci.socio2,
      scadenza: giorniFa(-365),
      importo: 25,
    });
    assert.equal(rinnovo.status, 201, JSON.stringify(rinnovo.body));

    const tesseramenti = (await voci(`socio_id=${d.soci.socio2}&limit=50`))
      .filter(v => v.tipo === 'tesseramento');
    assert.equal(tesseramenti.length, 1);

    const r = await emetti(d.soci.socio2, [{ tipo: 'tesseramento', id: tesseramenti[0].id }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const restano = (await voci(`socio_id=${d.soci.socio2}&limit=50`))
      .filter(v => v.tipo === 'tesseramento');
    assert.equal(restano.length, 0);
  });

  it('un incontro documentato non si elimina né si modifica', async () => {
    // Un incontro senza voucher a coprirlo: socio senzaAccount non ne ha uno,
    // quindi il suo incontro finisce fra le voci come riga a sé.
    const creato = await api(admin, 'POST', '/api/incontri', {
      socio_id: d.soci.senzaAccount,
      data_incontro: giorniFa(3),
      attivita_id: d.attivita.educazione,
      costo: 20,
    });
    assert.equal(creato.status, 201, JSON.stringify(creato.body));

    const r = await emetti(d.soci.senzaAccount, [{ tipo: 'incontro', id: creato.body.id }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));

    const eliminazione = await api(admin, 'DELETE', `/api/incontri/${creato.body.id}`);
    assert.equal(eliminazione.status, 400, JSON.stringify(eliminazione.body));
    assert.match(eliminazione.body.error, /ricevuta/i);

    // Né si modifica: cambiarne il costo dopo l'emissione farebbe dire al
    // documento una cifra e al database un'altra.
    const modifica = await api(admin, 'PUT', `/api/incontri/${creato.body.id}`, { costo: 99 });
    assert.equal(modifica.status, 400, JSON.stringify(modifica.body));
    assert.match(modifica.body.error, /ricevuta/i);
  });

  it('un socio con voci documentate non si elimina', async () => {
    const r = await api(admin, 'DELETE', `/api/soci/${d.soci.senzaAccount}`);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    // Il messaggio deve dire quante e perché: è ciò che il frontend mostra.
    assert.match(r.body.error, /document/i);
    assert.equal((await api(admin, 'GET', `/api/soci/${d.soci.senzaAccount}`)).status, 200);
  });
});
