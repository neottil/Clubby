/**
 * Versioni in esecuzione (spec 005, V0–V3): backend e authorizer le espongono
 * senza autenticazione, perché la pagina Info è raggiungibile anche prima
 * dell'accesso. Il valore è APP_VERSION oppure null, mai un ripiego inventato.
 * Il backend aggiunge `db`, il numero dell'ultima migrazione applicata (V8).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API_URL, AUTH_URL } from './helpers.ts';

/** Una versione è una stringa non vuota, oppure null se l'ambiente non la dichiara. */
function versioneValida(v: unknown): boolean {
  return v === null || (typeof v === 'string' && v.length > 0);
}

for (const [servizio, url] of [
  ['backend', `${API_URL}/api/version`],
  ['authorizer', `${AUTH_URL}/version`],
] as const) {
  describe(`Versione del ${servizio}`, () => {
    it('risponde 200 senza token, con una versione o null', async () => {
      const res = await fetch(url);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok('version' in body, 'manca il campo version');
      assert.ok(versioneValida(body.version), `versione non valida: ${JSON.stringify(body.version)}`);
    });

    it('ignora un token non valido invece di rifiutarlo', async () => {
      const res = await fetch(url, { headers: { Authorization: 'Bearer non-un-token' } });
      assert.equal(res.status, 200);
    });

    it('espone gli header CORS: la chiama il browser', async () => {
      const res = await fetch(url);
      assert.ok(res.headers.get('access-control-allow-origin'), 'manca Access-Control-Allow-Origin');
    });
  });
}

describe('Versione del database', () => {
  it('è il numero dell\'ultima migrazione presente nel repository', async () => {
    // Il database dei test è migrato con questi stessi file (compose in locale,
    // migra.sh in CI): se il numero non coincide, lo schema è indietro rispetto
    // al codice — che è esattamente ciò che questa versione deve far vedere.
    const cartella = fileURLToPath(new URL('../../backend/src/db/migrations/', import.meta.url));
    const numeri = readdirSync(cartella)
      .filter(f => f.endsWith('.sql'))
      .map(f => f.match(/^\d+/)?.[0])
      .filter((n): n is string => !!n)
      .sort();
    const attesa = numeri.length > 0 ? numeri[numeri.length - 1] : null;

    const body = await (await fetch(`${API_URL}/api/version`)).json();
    assert.ok('db' in body, 'manca il campo db');
    assert.equal(body.db, attesa);
  });
});
