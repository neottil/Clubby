/**
 * Ricevute libere (spec 013): intestate a chi non è socio, con righe scritte
 * dall'admin invece che scelte fra le voci da documentare.
 *
 * Stessa numerazione, stesse rotte e stesso PDF delle ricevute dei soci: i
 * casi qui provano che le due strade non si pestano i piedi, e che le libere
 * restano dell'admin.
 *
 * Ogni caso parte da un database vuoto: la numerazione riparte da 1, e le
 * impostazioni sono quelle iniziali (ambiente.ts le rimette prima di ogni caso).
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, giorniFa, scaricaBinario, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIstruttore, creaSocio } from './fabbrica.ts';
import { testoDelPdf } from './pdf.ts';

usaAmbiente();

const INTESTATARIO = 'Ospite Esterno ASD Altro Club_test';

/** Oggi nell'ora locale, come lo calcola il backend per la data del documento. */
function oggiLocale(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-11-15" → "15/11/2026", come la stampa il PDF. */
function dataItaliana(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

function assertPdf(base64: string, cosa: string) {
  assert.ok(base64, `${cosa}: manca il PDF`);
  assert.equal(Buffer.from(base64, 'base64').subarray(0, 4).toString(), '%PDF', `${cosa}: non è un PDF`);
}

describe('Documenti: ricevute libere', () => {
  let admin: Sessione;

  const corpo = (sovrascrivi: Record<string, unknown> = {}) => ({
    intestatario: INTESTATARIO,
    causale: 'iscrizione gara_test',
    righe: [{ data: giorniFa(2), descrizione: 'Iscrizione gara agility', importo: 15 }],
    ...sovrascrivi,
  });
  const anteprima = (body: unknown, s: Sessione = admin) => api(s, 'POST', '/api/documenti/anteprima', body);
  const emetti = (body: unknown, s: Sessione = admin) => api(s, 'POST', '/api/documenti', body);
  const totaleDocumenti = async () => (await api(admin, 'GET', '/api/documenti?limit=1')).body.total as number;

  // Ogni caso ha il suo admin, creato prima di lui sul database appena azzerato.
  beforeEach(async () => { admin = await creaAdmin(); });

  it('l\'anteprima di una ricevuta libera non crea documenti', async () => {
    const r = await anteprima(corpo());
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assertPdf(r.body.pdf_base64, 'anteprima');
    assert.equal(Number(r.body.importo), 15);
    assert.ok(r.body.importo_lettere, 'l\'importo in lettere deve esserci');
    assert.equal(await totaleDocumenti(), 0, 'l\'anteprima non deve scrivere');
  });

  it('la conferma emette una ricevuta libera con il PDF', async () => {
    const r = await emetti(corpo());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assertPdf(r.body.pdf_base64, 'emissione');
    assert.ok(r.body.id);
    // Database vuoto: è la prima ricevuta dell'anno.
    assert.equal(r.body.numero, 1);
    assert.equal(r.body.nome_file, `ricevuta_${r.body.anno}_1.pdf`);
    assert.equal(Number(r.body.importo), 15);
    assert.equal(await totaleDocumenti(), 1);
  });

  it('una ricevuta libera e una di socio emesse di seguito hanno numeri consecutivi', async () => {
    // Un incontro di un socio senza voucher: resta una voce a sé.
    const socio = (await creaSocio(admin, 'senzaAccount')).id;
    const educazione = await creaAttivita(admin, 'educazione');
    const incontro = await api(admin, 'POST', '/api/incontri', {
      socio_id: socio,
      data_incontro: giorniFa(5),
      attivita_id: educazione,
      costo: 17,
    });
    assert.equal(incontro.status, 201, JSON.stringify(incontro.body));

    const libera = await emetti(corpo());
    const diSocio = await emetti({
      socio_id: socio,
      causale: 'prova_test',
      voci: [{ tipo: 'incontro', id: incontro.body.id }],
    });
    assert.equal(libera.status, 201, JSON.stringify(libera.body));
    assert.equal(diSocio.status, 201, JSON.stringify(diSocio.body));
    assert.equal(diSocio.body.anno, libera.body.anno);
    // Una numerazione sola per tutte le ricevute, e parte da 1.
    assert.deepEqual([libera.body.numero, diSocio.body.numero], [1, 2]);
  });

  it('il totale è la somma delle righe, non quello inviato', async () => {
    const r = await anteprima(corpo({
      importo: 999,
      righe: [
        { descrizione: 'Iscrizione', importo: 10.5 },
        { descrizione: 'Pranzo', importo: 20.25 },
      ],
    }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 30.75);
  });

  it('rifiuta intestatario, causale o righe non valide', async () => {
    const riga = { descrizione: 'Iscrizione', importo: 10 };
    const casi: Array<[string, Record<string, unknown>]> = [
      ['intestatario assente', { intestatario: undefined }],
      ['intestatario vuoto', { intestatario: '   ' }],
      ['causale vuota', { causale: ' ' }],
      ['nessuna riga', { righe: [] }],
      ['righe non elenco', { righe: 'una' }],
      ['più di 50 righe', { righe: Array.from({ length: 51 }, () => riga) }],
      ['descrizione vuota', { righe: [{ ...riga, descrizione: ' ' }] }],
      ['importo zero', { righe: [{ ...riga, importo: 0 }] }],
      ['importo negativo', { righe: [{ ...riga, importo: -5 }] }],
      ['importo non numerico', { righe: [{ ...riga, importo: 'dieci' }] }],
      ['importo assente', { righe: [{ descrizione: 'Iscrizione' }] }],
      ['data inesistente', { righe: [{ ...riga, data: '2026-02-30' }] }],
      ['data in altro formato', { righe: [{ ...riga, data: '15/11/2026' }] }],
    ];
    for (const [cosa, sovrascrivi] of casi) {
      const body = corpo(sovrascrivi);
      // `undefined` nell'oggetto non arriva nel JSON: è il campo assente.
      const r = await anteprima(body);
      assert.equal(r.status, 400, `${cosa}: ${JSON.stringify(r.body)}`);
    }
  });

  it('una riga senza data vale oggi, una data futura è rifiutata', async () => {
    const futura = await anteprima(corpo({ righe: [{ data: giorniFa(-2), descrizione: 'X', importo: 5 }] }));
    assert.equal(futura.status, 400, JSON.stringify(futura.body));

    const r = await anteprima(corpo({ righe: [{ descrizione: 'Senza data esplicita', importo: 5 }] }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const testo = testoDelPdf(Buffer.from(r.body.pdf_base64, 'base64'));
    // La data compare due volte: nel titolo (data del documento) e nella riga.
    const occorrenze = testo.split(dataItaliana(oggiLocale())).length - 1;
    assert.ok(occorrenze >= 2, `la riga deve avere la data di oggi:\n${testo}`);
  });

  it('rifiuta un corpo con voci e righe insieme', async () => {
    const socio = (await creaSocio(admin, 'socio1')).id;
    const misto = await anteprima({ ...corpo(), socio_id: socio, voci: [] });
    assert.equal(misto.status, 400, JSON.stringify(misto.body));
    const vuoto = await anteprima({ causale: 'prova_test' });
    assert.equal(vuoto.status, 400, JSON.stringify(vuoto.body));
  });

  it('il PDF ha intestazione, piè di pagina, intestatario e righe', async () => {
    {
      const patch = await api(admin, 'PATCH', '/api/impostazioni', {
        ricevuta_intestazione: 'ASD INTESTAZIONE LIBERA_test\nVia delle Prove 1',
        ricevuta_pie_pagina: 'Piede della ricevuta libera_test',
      });
      assert.equal(patch.status, 200, JSON.stringify(patch.body));

      const r = await anteprima(corpo({
        causale: 'Gara sociale di autunno',
        righe: [
          { descrizione: 'Iscrizione categoria A', importo: 12 },
          { descrizione: 'Noleggio pettorina', importo: 3 },
        ],
      }));
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const testo = testoDelPdf(Buffer.from(r.body.pdf_base64, 'base64'));
      for (const atteso of [
        'ASD INTESTAZIONE LIBERA_test',
        'Via delle Prove 1',
        'Piede della ricevuta libera_test',
        INTESTATARIO,
        'Gara sociale di autunno',
        'Iscrizione categoria A',
        'Noleggio pettorina',
      ]) {
        assert.ok(testo.includes(atteso), `manca "${atteso}" nel PDF:\n${testo}`);
      }
    }
  });

  it('le righe sono conservate nell\'ordine inviato', async () => {
    const descrizioni = ['Prima riga ordine', 'Seconda riga ordine', 'Terza riga ordine'];
    const r = await emetti(corpo({
      righe: descrizioni.map((descrizione, i) => ({ descrizione, importo: i + 1 })),
    }));
    assert.equal(r.status, 201, JSON.stringify(r.body));

    // Dal PDF conservato, riscaricato: è ciò che resta della ricevuta.
    const pdf = await scaricaBinario(admin, `/api/documenti/${r.body.id}`);
    assert.equal(pdf.status, 200);
    const testo = testoDelPdf(pdf.byte);
    const posizioni = descrizioni.map(x => testo.indexOf(x));
    assert.ok(posizioni.every(p => p >= 0), `righe mancanti nel PDF:\n${testo}`);
    assert.deepEqual([...posizioni].sort((a, b) => a - b), posizioni, 'le righe devono restare in ordine');
  });

  it('istruttore e socio non emettono ricevute libere', async () => {
    const istruttore = await creaIstruttore(admin, 'istruttore2');
    const socio = await creaAccount(admin, 'socio1');
    for (const s of [istruttore, socio]) {
      assert.equal((await anteprima(corpo(), s)).status, 403);
      assert.equal((await emetti(corpo(), s)).status, 403);
    }
    assert.equal(await totaleDocumenti(), 0);
  });

  it('una ricevuta libera la scarica solo l\'admin', async () => {
    const r = await emetti(corpo());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await scaricaBinario(admin, `/api/documenti/${r.body.id}`)).status, 200);
    const socio = await creaAccount(admin, 'socio1');
    await creaSocio(admin, 'socio1', { account: socio });
    const istruttore = await creaIstruttore(admin, 'istruttore2');
    for (const s of [socio, istruttore]) {
      assert.equal((await scaricaBinario(s, `/api/documenti/${r.body.id}`)).status, 403);
    }
  });

  it('l\'elenco comprende le ricevute libere e il filtro per socio le esclude', async () => {
    const r = await emetti(corpo());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const socio = (await creaSocio(admin, 'socio1')).id;

    const tutte = (await api(admin, 'GET', '/api/documenti?limit=200')).body.data as any[];
    assert.deepEqual(tutte.map(x => x.id), [r.body.id], 'la ricevuta libera deve comparire nell\'elenco');
    const [libera] = tutte;
    assert.equal(libera.socio_id, null);
    assert.equal(libera.nome, null);
    assert.equal(libera.intestatario, INTESTATARIO);

    const diUnSocio = await api(admin, 'GET', `/api/documenti?socio_id=${socio}&limit=200`);
    assert.equal(diUnSocio.body.total, 0, 'filtrando per socio non deve comparire');
  });

  it('il filtro per periodo comprende le ricevute libere', async () => {
    const r = await emetti(corpo());
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const oggi = oggiLocale();

    const nelPeriodo = (await api(admin, 'GET', `/api/documenti?da=${oggi}&a=${oggi}&limit=200`)).body.data as any[];
    assert.deepEqual(nelPeriodo.map(x => x.id), [r.body.id]);

    const fuori = await api(admin, 'GET', `/api/documenti?da=${giorniFa(-3)}&limit=200`);
    assert.equal(fuori.body.total, 0);
  });

  it('le righe libere non compaiono fra le voci da documentare', async () => {
    const r = await emetti(corpo({ righe: [{ descrizione: 'Riga che non deve tornare', importo: 4 }] }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const voci = (await api(admin, 'GET', '/api/documenti/voci?includi_emesse=1&limit=200')).body.data as any[];
    assert.ok(!voci.some(v => v.descrizione === 'Riga che non deve tornare'));
  });
});
