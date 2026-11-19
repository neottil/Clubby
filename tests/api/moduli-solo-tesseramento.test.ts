/**
 * Modulo Tesseramento acceso, Ricevute spento (spec 014, R17 e R17-bis): un
 * club che tessera i soci ma non emette ricevute con Clubby.
 *
 * Il backend di questo file è avviato con ENABLE_MODULE_RICEVUTE=false. Oltre
 * ai 404 delle rotte dei documenti, conta ciò che il modulo spento NON deve
 * lasciare dietro di sé: i campi della ricevuta in incontri e storico dei
 * tesseramenti, che a modulo spento non devono comparire affatto.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAdmin, creaAttivita, creaIncontro, creaSocio, creaTesseramento } from './fabbrica.ts';
import { rotteRicevute, tutte404 } from './moduli.ts';

usaAmbiente({ ENABLE_MODULE_TESSERAMENTO: 'true', ENABLE_MODULE_RICEVUTE: 'false' });

const CAMPI_RICEVUTA = ['documento_id', 'documento_anno', 'documento_numero'];

describe('Solo il modulo Tesseramento', () => {
  it('le rotte dei documenti rispondono 404', async () => {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1', { ricarica: 50 });
    await tutte404(admin, rotteRicevute(socio.id));
  });

  it('un tesseramento si registra e compare nello storico', async () => {
    const admin = await creaAdmin();
    const socio = await creaSocio(admin, 'socio1');
    const t = await creaTesseramento(admin, socio.id, 'N_test_1');
    const storico = await api(admin, 'GET', `/api/tesseramenti/${socio.id}`);
    assert.equal(storico.status, 200, JSON.stringify(storico.body));
    assert.deepEqual(storico.body.map((r: any) => r.id), [t.id]);
    const situazione = await api(admin, 'GET', '/api/tesseramenti?limit=10');
    assert.equal(situazione.status, 200, JSON.stringify(situazione.body));
    assert.equal(situazione.body.data[0].stato, 'attivo');
  });

  it('incontri e storico dei tesseramenti non hanno i campi della ricevuta', async () => {
    const admin = await creaAdmin();
    const educazione = await creaAttivita(admin, 'educazione');
    // Senza voucher: un incontro così sarebbe da documentare, e a modulo
    // acceso porterebbe i campi della ricevuta anche vuoti.
    const socio = await creaSocio(admin, 'socio1');
    await creaIncontro(admin, { socio: socio.id, attivita: educazione, istruttore: admin });
    await creaTesseramento(admin, socio.id, 'N_test_1');

    const incontri = await api(admin, 'GET', `/api/incontri?socio_id=${socio.id}`);
    assert.equal(incontri.status, 200, JSON.stringify(incontri.body));
    assert.equal(incontri.body.data.length, 1);
    const storico = await api(admin, 'GET', `/api/tesseramenti/${socio.id}`);
    assert.equal(storico.body.length, 1);
    for (const [cosa, riga] of [['incontro', incontri.body.data[0]], ['tesseramento', storico.body[0]]]) {
      for (const campo of CAMPI_RICEVUTA) assert.ok(!(campo in riga), `${cosa}: c'è ${campo}`);
    }
  });
});
