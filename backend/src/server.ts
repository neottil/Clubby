/**
 * Server HTTP — usato sia in sviluppo locale che in produzione (container Docker/Kubernetes).
 *
 * Carica automaticamente .env se presente (utile in locale senza docker-compose env injection).
 * In produzione le variabili d'ambiente vengono iniettate dal container runtime.
 *
 * Avvio locale:  npm run dev      (tsx con hot reload)
 * Avvio prod:    npm start        (node dist/server.js dopo build)
 */

// Side-effect only, deve restare il PRIMO import: in ES modules tutti gli
// import vengono valutati, nell'ordine in cui compaiono, prima di qualunque
// altro codice del file — inclusi i moduli importati più sotto (es.
// handlers/admin.js → service/admin.service.js) che leggono process.env a
// livello di modulo. Se il loader di .env non è il primo import, quei moduli
// vedono le variabili come undefined. Vedi env.ts per i dettagli.
import './env.js';

import http from 'http';
import { verifyToken, type RequestEvent } from './middleware/auth.js';
import { handler as sociHandler } from './handlers/soci.js';
import { handler as incontriHandler } from './handlers/incontri.js';
import { handler as attivitaHandler } from './handlers/attivita.js';
import { handler as istruttoriHandler } from './handlers/istruttori.js';
import { handler as vouchersHandler } from './handlers/vouchers.js';
import { handler as tesseramentiHandler } from './handlers/tesseramenti.js';
import { handler as fatturazioneHandler } from './handlers/fatturazione.js';
import { handler as impostazioniHandler } from './handlers/impostazioni.js';
import { handler as adminHandler } from './handlers/admin.js';
import { handler as ricaricheHandler } from './handlers/ricariche.js';
import { handler as authHandler } from './handlers/auth.js';
import { handler as versionHandler } from './handlers/version.js';
import { moduloAttivo, type Modulo } from './util/moduli.js';
import { modalitaRicarica } from './util/ricariche.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0'; // 0.0.0.0 necessario nei container

// ---------------------------------------------------------------------------
// Routing — mappa path → handler + parametri estratti
// ---------------------------------------------------------------------------
interface RouteMatch {
  handler: (event: RequestEvent) => Promise<unknown>;
  params: Record<string, string>;
}

// `modulo`: la route esiste solo se quel modulo opzionale è attivo (vedi
// util/moduli.ts). Spento, risponde 404 come qualunque percorso inesistente:
// un 403 direbbe a chi non ha acquistato il modulo che c'è qualcosa da
// acquistare, e non è il server a doverlo annunciare.
const ROUTES: Array<{
  pattern: RegExp;
  handler: (event: RequestEvent) => Promise<unknown>;
  param: string | null;
  modulo?: Modulo;
}> = [
  { pattern: /^\/api\/auth\/socio$/,                 handler: authHandler,      param: null },
  { pattern: /^\/api\/version$/,                     handler: versionHandler,   param: null },
  { pattern: /^\/api\/soci\/([^/]+)$/,               handler: sociHandler,      param: 'id' },
  { pattern: /^\/api\/soci$/,                        handler: sociHandler,      param: null },
  { pattern: /^\/api\/attivita\/([^/]+)$/,           handler: attivitaHandler,  param: 'id' },
  { pattern: /^\/api\/attivita$/,                    handler: attivitaHandler,  param: null },
  { pattern: /^\/api\/istruttori\/([^/]+)\/attivita$/, handler: istruttoriHandler, param: 'id' },
  { pattern: /^\/api\/istruttori$/,                  handler: istruttoriHandler, param: null },
  { pattern: /^\/api\/incontri\/([^/]+)$/,           handler: incontriHandler,  param: 'id' },
  { pattern: /^\/api\/incontri$/,                    handler: incontriHandler,  param: null },
  { pattern: /^\/api\/voucher\/([^/]+)\/movimenti$/, handler: vouchersHandler,  param: 'id' },
  { pattern: /^\/api\/voucher\/([^/]+)\/ultima-ricarica$/, handler: vouchersHandler, param: 'id' },
  { pattern: /^\/api\/voucher$/,                     handler: vouchersHandler,  param: null },
  { pattern: /^\/api\/ricarica-tagli\/([^/]+)$/,     handler: ricaricheHandler, param: 'id' },
  { pattern: /^\/api\/ricarica-tagli$/,              handler: ricaricheHandler, param: null },
  { pattern: /^\/api\/tesseramenti\/([^/]+)$/,       handler: tesseramentiHandler, param: 'id', modulo: 'tesseramento' },
  { pattern: /^\/api\/tesseramenti$/,                handler: tesseramentiHandler, param: null, modulo: 'tesseramento' },
  { pattern: /^\/api\/fatturazione$/,                handler: fatturazioneHandler, param: null, modulo: 'fatturazione' },
  { pattern: /^\/api\/impostazioni$/,                handler: impostazioniHandler, param: null },
  { pattern: /^\/api\/admin\/associa-viewer\/([^/]+)$/, handler: adminHandler,   param: 'socioId' },
  { pattern: /^\/api\/admin/,                          handler: adminHandler,   param: null },
];

function route(pathname: string): RouteMatch | null {
  for (const { pattern, handler, param, modulo } of ROUTES) {
    if (modulo && !moduloAttivo(modulo)) continue;
    const match = pathname.match(pattern);
    if (match) {
      return { handler, params: param ? { [param]: match[1] } : {} };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Costruisce il RequestEvent dalla request HTTP nativa
// ---------------------------------------------------------------------------
function buildEvent(
  req: http.IncomingMessage,
  body: string,
  params: Record<string, string>,
  claims: Record<string, unknown>,
): RequestEvent {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { queryStringParameters[k] = v; });

  return {
    version: '2.0',
    routeKey: `${req.method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers: req.headers as Record<string, string>,
    queryStringParameters,
    pathParameters: params,
    body: body || undefined,
    requestContext: {
      http: {
        method: req.method ?? 'GET',
        path: url.pathname,
      },
      authorizer: {
        jwt: { claims },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Health check — usato da Docker/Kubernetes liveness probe (no auth richiesta)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Leggi body
  const bodyChunks: Buffer[] = [];
  await new Promise<void>(resolve => {
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', resolve);
  });
  const body = Buffer.concat(bodyChunks).toString();

  // Routing
  const matched = route(url.pathname);
  if (!matched) {
    res.writeHead(404, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Autenticazione JWT — firma verificata con la chiave pubblica
  // dell'authorizer, scaricata dal suo endpoint JWKS (vedi middleware/auth.ts)
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Token mancante' }));
    return;
  }

  let claims: Record<string, unknown>;
  try {
    claims = await verifyToken(authHeader.slice(7)) as unknown as Record<string, unknown>;
  } catch {
    res.writeHead(401, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: 'Token non valido o scaduto' }));
    return;
  }

  // Esegui handler
  try {
    const event = buildEvent(req, body, matched.params, claims);
    const result = await matched.handler(event) as { statusCode: number; headers?: Record<string, string>; body?: string };
    res.writeHead(result.statusCode ?? 200, {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...result.headers,
    });
    res.end(result.body ?? '');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Errore interno';
    console.error('[server] Unhandled error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json', ...CORS_HEADERS });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] Clubby API listening on http://${HOST}:${PORT}`);
  console.log(`[server] Authorizer: ${process.env.AUTH_INTERNAL_URL ?? process.env.AUTH_ISSUER ?? 'http://localhost:3001'}`);
  console.log(`[server] DB: ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 5432}/${process.env.DB_NAME ?? 'clubby'}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);
  // Un modulo spento fa rispondere 404 alle sue route: senza questa riga, la
  // causa sarebbe indistinguibile da un errore di routing.
  const moduli = (['tesseramento', 'fatturazione'] as const)
    .map(m => `${m}=${moduloAttivo(m) ? 'attivo' : 'spento'}`).join(', ');
  console.log(`[server] Moduli opzionali: ${moduli}`);
  console.log(`[server] Modalità di ricarica: ${modalitaRicarica()}`);
});

// Graceful shutdown — necessario in Kubernetes per evitare richieste perse al SIGTERM
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, closing...');
  server.close(() => {
    console.log('[server] Closed.');
    process.exit(0);
  });
});
