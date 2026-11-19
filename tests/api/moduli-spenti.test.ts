/**
 * Moduli spenti, sulla seconda istanza del backend, avviata con
 * ENABLE_MODULE_RICEVUTE e ENABLE_MODULE_TESSERAMENTO a false (vedi
 * helpers.ts, API_URL_VARIANTI).
 *
 * Una rotta di un modulo spento risponde 404 e non 403: un 403 direbbe a chi
 * non ha quel modulo che c'è qualcosa da comprare. Finora si verificava a mano
 * (spec 003, R13); la spec 013 aggiunge il corpo delle ricevute libere.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiVarianti, type Sessione } from './helpers.ts';
import { preparaDati, pulisciDatiTest, type DatiTest } from './dati.ts';

describe('Moduli spenti', () => {
  let d: DatiTest;
  let admin: Sessione;

  before(async () => {
    d = await preparaDati();
    admin = d.sessioni.istruttore1;
  });
  after(() => pulisciDatiTest());

  it('a modulo Ricevute spento le rotte dei documenti rispondono 404', async () => {
    const libera = {
      intestatario: 'Ospite_test',
      causale: 'prova_test',
      righe: [{ descrizione: 'Iscrizione', importo: 10 }],
    };
    const richieste: Array<[string, string, unknown?]> = [
      ['GET', '/api/documenti'],
      ['GET', '/api/documenti/voci'],
      ['GET', '/api/documenti/00000000-0000-0000-0000-000000000000'],
      ['POST', '/api/documenti/anteprima', libera],
      ['POST', '/api/documenti', libera],
      ['POST', '/api/documenti/anteprima', { socio_id: d.soci.socio1, causale: 'prova_test', voci: [] }],
    ];
    for (const [metodo, percorso, corpo] of richieste) {
      const r = await apiVarianti(admin, metodo, percorso, corpo);
      assert.equal(r.status, 404, `${metodo} ${percorso}: ${JSON.stringify(r.body)}`);
    }
  });

  it('a modulo Tesseramento spento le rotte dei tesseramenti rispondono 404', async () => {
    for (const percorso of ['/api/tesseramenti', `/api/tesseramenti/${d.soci.socio1}`]) {
      const r = await apiVarianti(admin, 'GET', percorso);
      assert.equal(r.status, 404, `${percorso}: ${JSON.stringify(r.body)}`);
    }
  });

  it('il resto dell\'API risponde normalmente', async () => {
    // Sanità: la seconda istanza è viva e parla con lo stesso database, quindi
    // i 404 qui sopra vengono dai moduli e non da un servizio sbagliato.
    const r = await apiVarianti(admin, 'GET', `/api/soci/${d.soci.socio1}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
});
