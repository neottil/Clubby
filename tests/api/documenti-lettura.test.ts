/**
 * Lettura delle ricevute: elenco, download e chi può scaricarle.
 *
 * Il caso che conta è il download: `GET /api/documenti/:id` è l'UNICA rotta
 * dell'area aperta oltre l'admin, e l'unica in cui un errore di permessi
 * mostrerebbe a una persona la ricevuta di un'altra. Va provata in tutti e tre
 * i casi — admin, intestatario, estraneo — perché un controllo sbagliato ne
 * supera comunque due su tre.
 *
 * Ogni caso parte da un database vuoto ed emette la propria ricevuta (vedi
 * `scenario`): è sempre la n. 1 dell'anno.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, servizi, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAccount, creaAdmin, creaAttivita, creaIncontro, creaIstruttore, creaSocio } from './fabbrica.ts';

usaAmbiente();

/** Scarica il PDF grezzo: `api()` presume JSON, qui il corpo è binario. */
async function scaricaPdf(s: Sessione | undefined, id: string) {
  const res = await fetch(`${servizi.api}/api/documenti/${id}`, {
    headers: s ? { Authorization: `Bearer ${s.accessToken}` } : {},
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, tipo: res.headers.get('content-type') ?? '', buf };
}

/**
 * Un admin, socio1 (voucher da 150, con un incontro da 30 che lo addebita) e
 * socio2 (voucher da 40), entrambi con il proprio account. La ricevuta n. 1
 * documenta l'acquisto del voucher di socio1, una RICARICA, così si può
 * controllare anche la colonna nei suoi movimenti.
 */
async function scenario() {
  const admin = await creaAdmin('istruttore1');
  const socio1 = await creaAccount(admin, 'socio1');
  const socio2 = await creaAccount(admin, 'socio2');
  const schedaSocio1 = await creaSocio(admin, 'socio1', { account: socio1, ricarica: 150 });
  const schedaSocio2 = await creaSocio(admin, 'socio2', { account: socio2, ricarica: 40 });
  const educazione = await creaAttivita(admin, 'educazione', 30);
  await creaIncontro(admin, { socio: schedaSocio1.id, attivita: educazione, istruttore: admin, giorni: 4 });

  const elenco = await api(admin, 'GET', `/api/documenti/voci?socio_id=${schedaSocio1.id}&limit=50`);
  assert.equal(elenco.body.data.length, 1, 'l\'acquisto del voucher è l\'unica voce di socio1');
  const [ricarica] = elenco.body.data;
  assert.equal(ricarica.tipo, 'ricarica');

  const emesso = await api(admin, 'POST', '/api/documenti', {
    socio_id: schedaSocio1.id,
    causale: 'lettura_test',
    voci: [{ tipo: 'ricarica', id: ricarica.id }],
  });
  assert.equal(emesso.status, 201, JSON.stringify(emesso.body));
  return {
    admin,
    educazione,
    sessioni: { socio1, socio2 },
    soci: { socio1: schedaSocio1.id, socio2: schedaSocio2.id },
    voucherSocio1: schedaSocio1.voucherId!,
    ricaricaId: ricarica.id as string,
    documento: emesso.body as { id: string; anno: number; numero: number; nome_file: string },
  };
}

/**
 * Lo scenario, più: istruttore2 abilitato a educazione; un socio senza
 * account e senza voucher, con un incontro tenuto da istruttore2 e
 * documentato dalla ricevuta n. 2 (un incontro coperto da voucher non è
 * documentabile); istruttore2 anche socia, con un incontro coperto dal suo
 * voucher e quindi senza ricevuta.
 */
async function conIncontroDocumentato() {
  const d = await scenario();
  const istruttore2 = await creaIstruttore(d.admin, 'istruttore2', [d.educazione]);
  const senzaAccount = (await creaSocio(d.admin, 'senzaAccount')).id;
  const incontro = await creaIncontro(d.admin,
    { socio: senzaAccount, attivita: d.educazione, istruttore: istruttore2, giorni: 2 });
  const emesso = await api(d.admin, 'POST', '/api/documenti', {
    socio_id: senzaAccount,
    causale: 'incontro_test',
    voci: [{ tipo: 'incontro', id: incontro.id }],
  });
  assert.equal(emesso.status, 201, JSON.stringify(emesso.body));

  const comeSocia = (await creaSocio(d.admin, 'istruttore2', { account: istruttore2, saldoIniziale: 100 })).id;
  await creaIncontro(d.admin, { socio: comeSocia, attivita: d.educazione, istruttore: d.admin, giorni: 1 });
  return { ...d, istruttore2, senzaAccount, incontroId: incontro.id as string, ricevutaIncontro: emesso.body };
}

describe('Documenti: lettura e download', () => {
  it('l\'elenco è paginato e non contiene i byte del PDF', async () => {
    const d = await scenario();
    const r = await api(d.admin, 'GET', '/api/documenti?limit=25');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.total, 1);
    const [mio] = r.body.data as any[];
    assert.equal(mio.id, d.documento.id, 'la ricevuta emessa deve comparire');
    assert.equal(mio.numero, 1);
    assert.equal(mio.anno, d.documento.anno);
    assert.equal(mio.causale, 'lettura_test');
    // Un elenco che trascinasse i PDF scaricherebbe megabyte per mostrare
    // cinque colonne di testo.
    assert.ok(!('contenuto' in mio), 'l\'elenco non deve portare i byte');
    assert.ok(!('pdf_base64' in mio));
  });

  it('l\'elenco si filtra per socio', async () => {
    const d = await scenario();
    const suoi = await api(d.admin, 'GET', `/api/documenti?socio_id=${d.soci.socio1}&limit=50`);
    assert.deepEqual((suoi.body.data as any[]).map(x => x.id), [d.documento.id]);

    const altrui = await api(d.admin, 'GET', `/api/documenti?socio_id=${d.soci.socio2}&limit=50`);
    assert.equal(altrui.body.total, 0);
  });

  it('l\'admin scarica il PDF', async () => {
    const d = await scenario();
    const r = await scaricaPdf(d.admin, d.documento.id);
    assert.equal(r.status, 200);
    assert.match(r.tipo, /application\/pdf/);
    // Byte veri, non una stringa base64 finita in UTF-8: è il punto in cui il
    // percorso binario del server si rompe silenziosamente se sbagliato.
    assert.equal(r.buf.subarray(0, 4).toString(), '%PDF');
    assert.ok(r.buf.length > 500, 'un PDF di una pagina pesa più di mezzo kB');
    assert.equal(d.documento.nome_file, `ricevuta_${d.documento.anno}_1.pdf`);
  });

  it('il socio intestatario scarica la PROPRIA ricevuta', async () => {
    const d = await scenario();
    const r = await scaricaPdf(d.sessioni.socio1, d.documento.id);
    assert.equal(r.status, 200, 'l\'intestatario deve poterla riaprire');
    assert.equal(r.buf.subarray(0, 4).toString(), '%PDF');
  });

  it('un altro socio NON scarica la ricevuta altrui (403)', async () => {
    const d = await scenario();
    const r = await scaricaPdf(d.sessioni.socio2, d.documento.id);
    assert.equal(r.status, 403, 'la ricevuta di un altro non si apre');
  });

  it('senza token non si scarica niente (401)', async () => {
    const d = await scenario();
    const r = await scaricaPdf(undefined, d.documento.id);
    assert.equal(r.status, 401);
  });

  it('un id inesistente risponde 404', async () => {
    const admin = await creaAdmin();
    const r = await scaricaPdf(admin, '00000000-0000-0000-0000-000000000000');
    assert.equal(r.status, 404);
  });

  it('il movimento documentato espone l\'id della ricevuta, gli altri no', async () => {
    const d = await scenario();
    const movimenti = await api(d.admin, 'GET', `/api/voucher/${d.voucherSocio1}/movimenti?limit=50`);
    assert.equal(movimenti.status, 200, JSON.stringify(movimenti.body));

    // L'acquisto del voucher e l'addebito dell'incontro.
    const righe = movimenti.body.data as any[];
    assert.deepEqual(righe.map(m => m.tipo).sort(), ['addebito', 'ricarica']);
    const documentata = righe.find(m => m.id === d.ricaricaId);
    assert.ok(documentata, 'la ricarica documentata deve essere fra i movimenti');
    assert.equal(documentata.documento_id, d.documento.id);

    // Anno e numero arrivano insieme all'id: sono il codice che la tabella
    // mostra al posto di un'icona, e il nome con cui il PDF viene scaricato.
    // Senza, il frontend saprebbe che una ricevuta c'è ma non quale.
    assert.equal(documentata.documento_anno, d.documento.anno);
    assert.equal(documentata.documento_numero, 1);

    // Gli addebiti non sono voci registrabili: non possono avere una ricevuta.
    // Né id né codice: i tre campi sono null insieme o valorizzati insieme.
    const addebito = righe.find(m => m.tipo === 'addebito');
    assert.equal(addebito.documento_id, null, 'un addebito non ha mai un documento');
    assert.equal(addebito.documento_anno, null);
    assert.equal(addebito.documento_numero, null);
  });

  it('un incontro documentato espone la ricevuta a chi ne è intestatario', async () => {
    const d = await conIncontroDocumentato();

    // L'admin è intestatario per definizione: vede i tre campi.
    const elenco = await api(d.admin, 'GET', `/api/incontri?socio_id=${d.senzaAccount}&limit=50`);
    assert.equal(elenco.body.total, 1);
    const [riga] = elenco.body.data as any[];
    assert.equal(riga.id, d.incontroId);
    assert.equal(riga.documento_id, d.ricevutaIncontro.id);
    assert.equal(riga.documento_anno, d.ricevutaIncontro.anno);
    assert.equal(riga.documento_numero, 2);
    // Lo stesso nome file che il backend ha deciso all'emissione.
    assert.equal(
      d.ricevutaIncontro.nome_file,
      `ricevuta_${riga.documento_anno}_${riga.documento_numero}.pdf`
    );
  });

  it('un istruttore non vede la ricevuta degli incontri che ha solo tenuto', async () => {
    const d = await conIncontroDocumentato();
    const istruttore = d.istruttore2;

    // Resoconto: gli incontri TENUTI, che sono di altri soci. Il codice della
    // ricevuta direbbe all'istruttore che esiste un documento intestato a
    // qualcun altro, e con quale numero.
    const resoconto = await api(istruttore, 'GET', '/api/incontri?ambito=istruttore&limit=50');
    assert.equal(resoconto.status, 200, JSON.stringify(resoconto.body));
    assert.equal(resoconto.body.total, 1);
    const [tenuto] = resoconto.body.data as any[];
    assert.equal(tenuto.id, d.incontroId, 'l\'incontro tenuto deve comparire nel suo resoconto');
    assert.equal(tenuto.documento_id, undefined, 'il campo non deve proprio esserci');
    assert.equal(tenuto.documento_anno, undefined);
    assert.equal(tenuto.documento_numero, undefined);

    // Stessa regola sul singolo incontro: può leggerlo, ma senza la ricevuta.
    const singolo = await api(istruttore, 'GET', `/api/incontri/${d.incontroId}`);
    assert.equal(singolo.status, 200, JSON.stringify(singolo.body));
    assert.equal(singolo.body.documento_id, undefined);

    // Come socio, invece, il ramo è acceso: i campi ci sono (a null, perché i
    // suoi incontri sono coperti dal voucher e non si documentano da soli).
    const suoi = await api(istruttore, 'GET', '/api/incontri?ambito=socio&limit=50');
    assert.equal(suoi.body.total, 1, 'istruttore2 ha un incontro come socia');
    const [mio] = suoi.body.data as any[];
    assert.ok('documento_id' in mio, 'nella vista da socio il campo deve esserci');
    assert.equal(mio.documento_id, null);
  });

  it('un socio non legge gli incontri di un altro passando socio_id', async () => {
    // Il filtro per chi non è admin è imposto dal backend: chiedere il socio
    // altrui non allarga l'elenco, quindi nemmeno la sua ricevuta.
    const d = await conIncontroDocumentato();
    const r = await api(d.sessioni.socio1, 'GET', `/api/incontri?socio_id=${d.senzaAccount}&limit=50`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.total, 1, 'il solo incontro di socio1');
    assert.equal(r.body.data[0].socio_id, d.soci.socio1, 'un socio riceve solo i propri incontri');
  });

  it('la voce documentata espone anche anno e numero della ricevuta', async () => {
    const d = await scenario();
    const elenco = await api(
      d.admin,
      'GET',
      `/api/documenti/voci?socio_id=${d.soci.socio1}&includi_emesse=1&limit=50`
    );
    assert.equal(elenco.status, 200, JSON.stringify(elenco.body));

    const voce = (elenco.body.data as any[]).find(v => v.id === d.ricaricaId);
    assert.ok(voce, 'la voce documentata deve tornare con includi_emesse=1');
    assert.equal(voce.documento_id, d.documento.id);
    assert.equal(voce.documento_anno, d.documento.anno, 'anno della ricevuta');
    assert.equal(voce.documento_numero, 1, 'numero della ricevuta');
    // Il nome del file che il frontend costruisce da questi due numeri deve
    // coincidere con quello deciso dal backend all'emissione.
    assert.equal(d.documento.nome_file, `ricevuta_${voce.documento_anno}_${voce.documento_numero}.pdf`);
  });
});
