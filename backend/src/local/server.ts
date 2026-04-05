/**
 * Server HTTP locale per sviluppo (NON usato in produzione Lambda).
 * Usa http module nativo per evitare dipendenze aggiuntive.
 * Mappa le request HTTP alle stesse Lambda handler di produzione.
 *
 * Carica automaticamente backend/.env se presente.
 * Avvio: npx tsx src/local/server.ts
 */

// Carica .env dalla root del backend (se esiste) prima di tutto il resto
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
  console.log(`Loaded env from ${envPath}`);
}

import http from 'http';
import { handler as sociHandler } from '../handlers/soci.js';
import { handler as incontriHandler } from '../handlers/incontri.js';
import { handler as buoniHandler } from '../handlers/buoni.js';
import { handler as adminHandler } from '../handlers/admin.js';

const PORT = process.env.PORT ?? 3000;

// Costruisce un APIGatewayProxyEventV2 fake dall'HTTP request
async function buildEvent(req: http.IncomingMessage, body: string, pathParams: Record<string, string> = {}): Promise<any> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { queryStringParameters[k] = v; });

  // Simula un utente admin in locale (nessun JWT reale)
  const mockClaims = {
    sub: 'local-admin-sub',
    email: 'admin@clubmanager.local',
    'cognito:groups': '["admin"]',
  };

  return {
    version: '2.0',
    routeKey: `${req.method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers: req.headers as Record<string, string>,
    queryStringParameters,
    pathParameters: pathParams,
    body: body || undefined,
    requestContext: {
      http: {
        method: req.method ?? 'GET',
        path:   url.pathname,
      },
      authorizer: {
        jwt: { claims: mockClaims },
      },
    },
  };
}

// Routing
function route(path: string, method: string): { handler: Function; params: Record<string, string> } | null {
  const patterns = [
    { pattern: /^\/api\/soci\/([^/]+)$/, handler: sociHandler, param: 'id' },
    { pattern: /^\/api\/soci$/,          handler: sociHandler, param: null },
    { pattern: /^\/api\/incontri\/([^/]+)$/, handler: incontriHandler, param: 'id' },
    { pattern: /^\/api\/incontri$/,          handler: incontriHandler, param: null },
    { pattern: /^\/api\/buoni\/([^/]+)\/movimenti$/, handler: buoniHandler, param: 'id' },
    { pattern: /^\/api\/buoni\/([^/]+)$/,    handler: buoniHandler, param: 'id' },
    { pattern: /^\/api\/buoni$/,             handler: buoniHandler, param: null },
    { pattern: /^\/api\/admin/,              handler: adminHandler, param: null },
  ];

  for (const { pattern, handler, param } of patterns) {
    const match = path.match(pattern);
    if (match) {
      return { handler, params: param ? { [param]: match[1] } : {} };
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Leggi body
  const bodyChunks: Buffer[] = [];
  await new Promise<void>(resolve => {
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', resolve);
  });
  const body = Buffer.concat(bodyChunks).toString();

  const match = route(url.pathname, req.method ?? 'GET');

  if (!match) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const event = await buildEvent(req, body, match.params);
    const result = await match.handler(event) as any;

    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...result.headers };
    res.writeHead(result.statusCode ?? 200, headers);
    res.end(result.body ?? '');
  } catch (err: any) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`ClubManager local server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET/POST   /api/soci');
  console.log('  GET/PUT/DELETE /api/soci/:id');
  console.log('  GET/POST   /api/incontri');
  console.log('  GET/PUT/DELETE /api/incontri/:id');
  console.log('  GET/POST   /api/buoni');
  console.log('  GET        /api/buoni/:id');
  console.log('  GET/POST   /api/buoni/:id/movimenti');
  console.log('  GET/POST/DELETE /api/admin/*');
});
