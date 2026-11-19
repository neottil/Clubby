/**
 * Un RECHARGE_MODE che non è fra quelli previsti (spec 014, R16): il backend
 * ripiega su "free" invece di fallire, e lo si verifica avviandolo così.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, saldo } from './helpers.ts';
import { usaAmbiente } from './ambiente.ts';
import { creaAdmin, creaSocio, creaTaglio } from './fabbrica.ts';

usaAmbiente({ RECHARGE_MODE: 'altro' });

describe('Modalità di ricarica sconosciuta', () => {
  it('un RECHARGE_MODE sconosciuto vale free', async () => {
    const admin = await creaAdmin();
    // Percentuale e un taglio da 50 configurati: in "free" nessuno dei due si applica.
    await api(admin, 'PATCH', '/api/impostazioni', { percentuale_ricarica: 10 });
    await creaTaglio(admin, 50, 70);
    const socio = await creaSocio(admin, 'socio1', { saldoIniziale: 100 });
    const movimenti = `/api/voucher/${socio.voucherId}/movimenti`;

    const r = await api(admin, 'POST', movimenti, { importo: 50 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number(r.body.importo), 50);
    assert.equal(r.body.importo_pagato, null);

    const conValore = await api(admin, 'POST', movimenti, { importo: 10, valore: 12 });
    assert.equal(conValore.status, 400, JSON.stringify(conValore.body));
    assert.equal(await saldo(admin, socio.id), 150);
  });
});
