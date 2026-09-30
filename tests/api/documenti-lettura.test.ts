/**
 * Lettura delle ricevute: elenco, download e chi può scaricarle.
 *
 * Il caso che conta è l'ultimo: `GET /api/documenti/:id` è l'UNICA rotta
 * dell'area aperta oltre l'admin, e l'unica in cui un errore di permessi
 * mostrerebbe a una persona la ricevuta di un'altra. Va provata in tutti e tre
 * i casi — admin, intestatario, estraneo — perché un controllo sbagliato ne
 * supera comunque due su tre.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { API_URL, api, giorniFa, type Sessione } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Documenti: lettura e download', () => {
  let d: DatiTest;
  let admin: Sessione;
  let documentoId = '';
  let nomeFile = '';
  let ricaricaId = '';
  let incontroId = '';

  /** Scarica il PDF grezzo: `api()` presume JSON, qui il corpo è binario. */
  const scaricaPdf = async (s: Sessione | undefined, id: string) => {
    const res = await fetch(`${API_URL}/api/documenti/${id}`, {
      headers: s ? { Authorization: `Bearer ${s.accessToken}` } : {},
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, tipo: res.headers.get('content-type') ?? '', buf };
  };

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;

    // Una ricevuta vera su una RICARICA di socio1, così si può controllare
    // anche la colonna nei suoi movimenti.
    const elenco = await api(admin, 'GET', `/api/documenti/voci?socio_id=${d.soci.socio1}&limit=50`);
    const ricarica = (elenco.body.data as any[]).find(v => v.tipo === 'ricarica');
    assert.ok(ricarica, 'serve una ricarica da documentare per socio1');
    ricaricaId = ricarica.id;

    const emesso = await api(admin, 'POST', '/api/documenti', {
      socio_id: d.soci.socio1,
      causale: 'lettura_test',
      voci: [{ tipo: 'ricarica', id: ricarica.id }],
    });
    assert.equal(emesso.status, 201, JSON.stringify(emesso.body));
    documentoId = emesso.body.id;
    nomeFile = emesso.body.nome_file;
  });
  after(() => pulisciDatiTest());

  it('l\'elenco è paginato e non contiene i byte del PDF', async () => {
    const r = await api(admin, 'GET', '/api/documenti?limit=25');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.total >= 1);
    const mio = (r.body.data as any[]).find(x => x.id === documentoId);
    assert.ok(mio, 'la ricevuta emessa deve comparire');
    assert.ok(mio.numero >= 1 && mio.anno >= 2000);
    assert.equal(mio.causale, 'lettura_test');
    // Un elenco che trascinasse i PDF scaricherebbe megabyte per mostrare
    // cinque colonne di testo.
    assert.ok(!('contenuto' in mio), 'l\'elenco non deve portare i byte');
    assert.ok(!('pdf_base64' in mio));
  });

  it('l\'elenco si filtra per socio', async () => {
    const suoi = await api(admin, 'GET', `/api/documenti?socio_id=${d.soci.socio1}&limit=50`);
    assert.ok((suoi.body.data as any[]).every(x => x.socio_id === d.soci.socio1));

    const altrui = await api(admin, 'GET', `/api/documenti?socio_id=${d.soci.socio2}&limit=50`);
    assert.ok(!(altrui.body.data as any[]).some(x => x.id === documentoId));
  });

  it('l\'admin scarica il PDF', async () => {
    const r = await scaricaPdf(admin, documentoId);
    assert.equal(r.status, 200);
    assert.match(r.tipo, /application\/pdf/);
    // Byte veri, non una stringa base64 finita in UTF-8: è il punto in cui il
    // percorso binario del server si rompe silenziosamente se sbagliato.
    assert.equal(r.buf.subarray(0, 4).toString(), '%PDF');
    assert.ok(r.buf.length > 500, 'un PDF di una pagina pesa più di mezzo kB');
    assert.ok(nomeFile.length > 0);
  });

  it('il socio intestatario scarica la PROPRIA ricevuta', async () => {
    const r = await scaricaPdf(d.sessioni.socio1, documentoId);
    assert.equal(r.status, 200, 'l\'intestatario deve poterla riaprire');
    assert.equal(r.buf.subarray(0, 4).toString(), '%PDF');
  });

  it('un altro socio NON scarica la ricevuta altrui (403)', async () => {
    const r = await scaricaPdf(d.sessioni.socio2, documentoId);
    assert.equal(r.status, 403, 'la ricevuta di un altro non si apre');
  });

  it('senza token non si scarica niente (401)', async () => {
    const r = await scaricaPdf(undefined, documentoId);
    assert.equal(r.status, 401);
  });

  it('un id inesistente risponde 404', async () => {
    const r = await scaricaPdf(admin, '00000000-0000-0000-0000-000000000000');
    assert.equal(r.status, 404);
  });

  it('il movimento documentato espone l\'id della ricevuta, gli altri no', async () => {
    const voucher = await api(admin, 'GET', `/api/voucher?socio_id=${d.soci.socio1}&limit=1`);
    const voucherId = (voucher.body.data as any[])[0].id;

    const movimenti = await api(admin, 'GET', `/api/voucher/${voucherId}/movimenti?limit=50`);
    assert.equal(movimenti.status, 200, JSON.stringify(movimenti.body));

    const righe = movimenti.body.data as any[];
    const documentata = righe.find(m => m.id === ricaricaId);
    assert.ok(documentata, 'la ricarica documentata deve essere fra i movimenti');
    assert.equal(documentata.documento_id, documentoId);

    // Anno e numero arrivano insieme all'id: sono il codice che la tabella
    // mostra al posto di un'icona, e il nome con cui il PDF viene scaricato.
    // Senza, il frontend saprebbe che una ricevuta c'è ma non quale.
    const emessa = (await api(admin, 'GET', `/api/documenti?limit=50`)).body.data as any[];
    const documento = emessa.find(x => x.id === documentoId);
    assert.equal(documentata.documento_anno, documento.anno);
    assert.equal(documentata.documento_numero, documento.numero);

    // Gli addebiti non sono voci registrabili: non possono avere una ricevuta.
    // Né id né codice: i tre campi sono null insieme o valorizzati insieme.
    assert.ok(
      righe.filter(m => m.tipo === 'addebito').every(
        m => m.documento_id === null && m.documento_anno === null && m.documento_numero === null
      ),
      'un addebito non ha mai un documento'
    );
  });

  it('un incontro documentato espone la ricevuta a chi ne è intestatario', async () => {
    // Serve un incontro NON coperto da voucher, altrimenti non è documentabile:
    // senzaAccount è l'unico socio della fixture senza voucher.
    const creato = await api(admin, 'POST', '/api/incontri', {
      socio_id: d.soci.senzaAccount,
      data_incontro: giorniFa(2),
      attivita_id: d.attivita.educazione,
      istruttore_id: d.sessioni.istruttore2.id,
      costo: 30,
    });
    assert.equal(creato.status, 201, JSON.stringify(creato.body));
    incontroId = creato.body.id;

    const emesso = await api(admin, 'POST', '/api/documenti', {
      socio_id: d.soci.senzaAccount,
      causale: 'incontro_test',
      voci: [{ tipo: 'incontro', id: incontroId }],
    });
    assert.equal(emesso.status, 201, JSON.stringify(emesso.body));

    // L'admin è intestatario per definizione: vede i tre campi.
    const elenco = await api(admin, 'GET', `/api/incontri?socio_id=${d.soci.senzaAccount}&limit=50`);
    const riga = (elenco.body.data as any[]).find(i => i.id === incontroId);
    assert.ok(riga, 'l\'incontro deve essere nell\'elenco');
    assert.equal(riga.documento_id, emesso.body.id);
    assert.equal(riga.documento_anno, emesso.body.anno);
    assert.equal(riga.documento_numero, emesso.body.numero);
    // Lo stesso nome file che il backend ha deciso all'emissione.
    assert.equal(
      emesso.body.nome_file,
      `ricevuta_${riga.documento_anno}_${riga.documento_numero}.pdf`
    );
  });

  it('un istruttore non vede la ricevuta degli incontri che ha solo tenuto', async () => {
    const istruttore = d.sessioni.istruttore2;

    // Resoconto: gli incontri TENUTI, che sono di altri soci. Il codice della
    // ricevuta direbbe all'istruttore che esiste un documento intestato a
    // qualcun altro, e con quale numero.
    const resoconto = await api(istruttore, 'GET', '/api/incontri?ambito=istruttore&limit=50');
    assert.equal(resoconto.status, 200, JSON.stringify(resoconto.body));
    const tenuto = (resoconto.body.data as any[]).find(i => i.id === incontroId);
    assert.ok(tenuto, 'l\'incontro tenuto deve comparire nel suo resoconto');
    assert.equal(tenuto.documento_id, undefined, 'il campo non deve proprio esserci');
    assert.equal(tenuto.documento_anno, undefined);
    assert.equal(tenuto.documento_numero, undefined);

    // Stessa regola sul singolo incontro: può leggerlo, ma senza la ricevuta.
    const singolo = await api(istruttore, 'GET', `/api/incontri/${incontroId}`);
    assert.equal(singolo.status, 200, JSON.stringify(singolo.body));
    assert.equal(singolo.body.documento_id, undefined);

    // Come socio, invece, il ramo è acceso: i campi ci sono (a null, perché i
    // suoi incontri sono coperti dal voucher e non si documentano da soli).
    const suoi = await api(istruttore, 'GET', '/api/incontri?ambito=socio&limit=50');
    const mio = (suoi.body.data as any[])[0];
    assert.ok(mio, 'istruttore2 ha incontri come socia');
    assert.ok('documento_id' in mio, 'nella vista da socio il campo deve esserci');
    assert.equal(mio.documento_id, null);
  });

  it('un socio non legge gli incontri di un altro passando socio_id', async () => {
    // Il filtro per chi non è admin è imposto dal backend: chiedere il socio
    // altrui non allarga l'elenco, quindi nemmeno la sua ricevuta.
    const r = await api(d.sessioni.socio1, 'GET', `/api/incontri?socio_id=${d.soci.senzaAccount}&limit=50`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(
      (r.body.data as any[]).every(i => i.socio_id === d.soci.socio1),
      'un socio riceve solo i propri incontri'
    );
  });

  it('la voce documentata espone anche anno e numero della ricevuta', async () => {
    const elenco = await api(
      admin,
      'GET',
      `/api/documenti/voci?socio_id=${d.soci.socio1}&includi_emesse=1&limit=50`
    );
    assert.equal(elenco.status, 200, JSON.stringify(elenco.body));

    const voce = (elenco.body.data as any[]).find(v => v.id === ricaricaId);
    assert.ok(voce, 'la voce documentata deve tornare con includi_emesse=1');
    assert.equal(voce.documento_id, documentoId);
    assert.ok(voce.documento_anno >= 2000, 'anno della ricevuta');
    assert.ok(voce.documento_numero >= 1, 'numero della ricevuta');
    // Il nome del file che il frontend costruisce da questi due numeri deve
    // coincidere con quello deciso dal backend all'emissione.
    assert.equal(nomeFile, `ricevuta_${voce.documento_anno}_${voce.documento_numero}.pdf`);
  });
});
