/**
 * Ricariche in modalità percentuale (spec 014, R16): il backend di questo file
 * è avviato con RECHARGE_MODE=percentage. L'admin scrive l'importo pagato; sul
 * voucher finisce il pagato più la percentuale configurata fra le
 * impostazioni, e in Ricevute la voce vale il pagato.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, saldo, type Sessione } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAdmin, creaSocio } from './fabbrica.ts';

usaAmbiente({ RECHARGE_MODE: 'percentage' });

describe('Ricariche in modalità percentuale', () => {
  async function prepara(percentuale: number) {
    const admin = await creaAdmin();
    if (percentuale !== 0) {
      const r = await api(admin, 'PATCH', '/api/impostazioni', { percentuale_ricarica: percentuale });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    const socio = await creaSocio(admin, 'socio1', { saldoIniziale: 100 });
    const ricarica = (body: Record<string, unknown>) =>
      api(admin, 'POST', `/api/voucher/${socio.voucherId}/movimenti`, body);
    return { admin, socio, ricarica };
  }

  const voceDi = async (admin: Sessione, socioId: string, movimentoId: string) => {
    const voci = (await api(admin, 'GET', `/api/documenti/voci?socio_id=${socioId}`)).body.data as any[];
    return voci.find(v => v.tipo === 'ricarica' && v.id === movimentoId);
  };

  it('la ricarica accredita il pagato più la percentuale, la voce in Ricevute vale il pagato', async () => {
    const { admin, socio, ricarica } = await prepara(10);
    const r = await ricarica({ importo: 50 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 55);
    assert.equal(Number(r.body.importo_pagato), 50);
    assert.equal(await saldo(admin, socio.id), 155);
    const voce = await voceDi(admin, socio.id, r.body.id);
    assert.ok(voce, 'la ricarica deve comparire fra le voci');
    assert.equal(Number(voce.importo), 50);
  });

  it('a percentuale 0 accredita il pagato (importo_pagato null)', async () => {
    const { admin, socio, ricarica } = await prepara(0);
    const r = await ricarica({ importo: 50 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 50);
    assert.equal(r.body.importo_pagato, null);
    assert.equal(await saldo(admin, socio.id), 150);
  });

  it('l\'accredito si arrotonda al centesimo', async () => {
    const { ricarica } = await prepara(15);
    // 33,33 + 15% = 38,3295: il saldo ha due decimali.
    const r = await ricarica({ importo: 33.33 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 38.33);
    assert.equal(Number(r.body.importo_pagato), 33.33);
  });

  it('un valore esplicito è rifiutato (400)', async () => {
    // Il valore si indica solo in modalità a tagli: qui lo decide la percentuale.
    const { admin, socio, ricarica } = await prepara(10);
    const r = await ricarica({ importo: 50, valore: 60 });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(await saldo(admin, socio.id), 100);
  });
});
