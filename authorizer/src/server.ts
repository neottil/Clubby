/**
 * Clubby Authorizer — servizio di autenticazione.
 *
 * Sostituisce Keycloak: registrazione, accesso, ruoli, gestione delle
 * password ed emissione dei token che il backend applicativo verifica tramite
 * l'endpoint JWKS pubblicato qui.
 *
 * Avvio locale:  npm run dev
 * Avvio prod:    npm start   (node dist/server.js dopo build)
 */

// Side-effect only, deve restare il PRIMO import (vedi env.ts): i moduli
// importati sotto leggono process.env a livello di modulo.
import './env.js';

import http from 'http';
import {
  registra, login, rinnova, logout, cambiaPassword, resetPasswordDaAdmin,
  listaUtenti, getUtente, cambiaRuolo, cambiaAttivo, creaAdminIniziale,
  pulisciTokenScaduti,
} from './service/utenti.service.js';
import { contestoDa, richiediAdmin, richiediPasswordDefinitiva } from './middleware/auth.js';
import { consumaTentativo, azzeraTentativi } from './middleware/rateLimit.js';
import { jwks } from './crypto/tokens.js';
import {
  ok, created, noContent, rispostaErrore, BadRequestError, type RisultatoRisposta,
} from './middleware/errors.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0'; // 0.0.0.0 necessario nei container

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Identifica il chiamante per il limitatore di tentativi. Dietro l'Ingress
 * l'indirizzo della connessione è quello del proxy, quindi si legge
 * X-Forwarded-For — di cui conta solo il primo elemento, l'unico che il
 * proxy garantisce (gli altri sono aggiungibili dal client).
 */
function clientIp(req: http.IncomingMessage): string {
  const inoltrato = req.headers['x-forwarded-for'];
  if (typeof inoltrato === 'string' && inoltrato.length > 0) {
    return inoltrato.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'sconosciuto';
}

function corpo(body: string): Record<string, unknown> {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new BadRequestError('Corpo della richiesta non è JSON valido');
  }
}

async function instrada(
  metodo: string,
  percorso: string,
  body: string,
  req: http.IncomingMessage
): Promise<RisultatoRisposta> {
  const auth = () => contestoDa(req.headers.authorization);
  const ip = clientIp(req);

  // -----------------------------------------------------------
  // Chiavi pubbliche — usate dal backend per verificare i token.
  // Deliberatamente senza autenticazione: contiene solo la parte pubblica.
  // -----------------------------------------------------------
  if (metodo === 'GET' && percorso === '/.well-known/jwks.json') {
    return {
      statusCode: 200,
      // Le chiavi cambiano solo a una rotazione: un po' di cache evita al
      // backend di richiederle a ogni verifica.
      headers: { 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify(await jwks()),
    };
  }

  // -----------------------------------------------------------
  // Registrazione e accesso
  // -----------------------------------------------------------
  if (metodo === 'POST' && percorso === '/auth/register') {
    consumaTentativo(`register:${ip}`);
    const dati = corpo(body);
    const sessione = await registra({
      email: dati.email as string,
      password: dati.password as string,
      nome: dati.nome as string,
      cognome: dati.cognome as string,
      telefono: dati.telefono as string | undefined,
    });
    azzeraTentativi(`register:${ip}`);
    return created(sessione);
  }

  if (metodo === 'POST' && percorso === '/auth/login') {
    // Il contatore è per IP e non per email: contare per email permetterebbe
    // di bloccare l'accesso a una persona bersagliandola di tentativi.
    consumaTentativo(`login:${ip}`);
    const dati = corpo(body);
    const sessione = await login(dati.email as string, dati.password as string);
    azzeraTentativi(`login:${ip}`);
    return ok(sessione);
  }

  if (metodo === 'POST' && percorso === '/auth/refresh') {
    const dati = corpo(body);
    return ok(await rinnova(dati.refresh_token as string));
  }

  if (metodo === 'POST' && percorso === '/auth/logout') {
    const dati = corpo(body);
    await logout(dati.refresh_token as string);
    return noContent();
  }

  // -----------------------------------------------------------
  // Utente corrente
  // -----------------------------------------------------------
  if (metodo === 'GET' && percorso === '/auth/me') {
    const contesto = await auth();
    return ok(await getUtente(contesto.utenteId));
  }

  if (metodo === 'POST' && percorso === '/auth/cambia-password') {
    const contesto = await auth();
    const dati = corpo(body);
    // Restituisce già la sessione nuova: il cambio revoca tutte le
    // precedenti, inclusa quella con cui è arrivata questa richiesta.
    return ok(await cambiaPassword(
      contesto.utenteId,
      dati.password_attuale as string,
      dati.password_nuova as string
    ));
  }

  // -----------------------------------------------------------
  // Amministrazione degli utenti
  // -----------------------------------------------------------
  if (percorso.startsWith('/admin/utenti')) {
    const contesto = await auth();
    richiediAdmin(contesto);
    richiediPasswordDefinitiva(contesto);

    if (metodo === 'GET' && percorso === '/admin/utenti') {
      return ok(await listaUtenti());
    }

    const ruoloMatch = percorso.match(/^\/admin\/utenti\/([^/]+)\/ruolo$/);
    if (metodo === 'POST' && ruoloMatch) {
      const dati = corpo(body);
      return ok(await cambiaRuolo(ruoloMatch[1], dati.ruolo as 'admin' | 'viewer', contesto.utenteId));
    }

    const attivoMatch = percorso.match(/^\/admin\/utenti\/([^/]+)\/attivo$/);
    if (metodo === 'POST' && attivoMatch) {
      const dati = corpo(body);
      return ok(await cambiaAttivo(attivoMatch[1], dati.attivo === true, contesto.utenteId));
    }

    const resetMatch = percorso.match(/^\/admin\/utenti\/([^/]+)\/reset-password$/);
    if (metodo === 'POST' && resetMatch) {
      return ok(await resetPasswordDaAdmin(resetMatch[1]));
    }
  }

  return { statusCode: 404, body: JSON.stringify({ error: 'Route non trovata' }) };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Health check — sonde Kubernetes, nessuna autenticazione
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const chunks: Buffer[] = [];
  await new Promise<void>(resolve => {
    req.on('data', c => chunks.push(c));
    req.on('end', resolve);
  });

  let risultato: RisultatoRisposta;
  try {
    risultato = await instrada(
      req.method ?? 'GET',
      url.pathname,
      Buffer.concat(chunks).toString(),
      req
    );
  } catch (error) {
    risultato = rispostaErrore(error);
  }

  res.writeHead(risultato.statusCode, {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
    ...risultato.headers,
  });
  res.end(risultato.body ?? '');
});

/**
 * Crea il primo amministratore all'avvio, se l'istanza è ancora vuota e le
 * credenziali sono state fornite. È il modo in cui nasce l'admin iniziale
 * senza che nessuna password resti scritta nel codice: le variabili le
 * fornisce il workflow Infra al primo deploy.
 */
async function avvioIniziale(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) return;

  try {
    const creato = await creaAdminIniziale(email, password);
    console.log(creato
      ? `[authorizer] Admin iniziale creato: ${email} (dovrà cambiare la password al primo accesso)`
      : '[authorizer] Utenti già presenti: admin iniziale non creato.');
  } catch (err) {
    console.error('[authorizer] Creazione admin iniziale fallita:', err);
  }
}

server.listen(PORT, HOST, async () => {
  console.log(`[authorizer] In ascolto su http://${HOST}:${PORT}`);
  console.log(`[authorizer] Issuer dei token: ${process.env.AUTH_ISSUER ?? 'http://localhost:3001'}`);
  console.log(`[authorizer] DB: ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 5432}/${process.env.DB_NAME ?? 'clubby_auth'}`);
  await avvioIniziale();
});

// I refresh token scaduti non servono più a nulla ma restano in tabella:
// una passata al giorno tiene la tabella proporzionata agli utenti attivi.
setInterval(() => {
  pulisciTokenScaduti()
    .then(n => { if (n > 0) console.log(`[authorizer] Rimossi ${n} refresh token scaduti.`); })
    .catch(err => console.error('[authorizer] Pulizia token fallita:', err));
}, 24 * 60 * 60 * 1000).unref();

// Graceful shutdown — in Kubernetes evita di perdere richieste al SIGTERM
process.on('SIGTERM', () => {
  console.log('[authorizer] SIGTERM ricevuto, chiusura...');
  server.close(() => {
    console.log('[authorizer] Chiuso.');
    process.exit(0);
  });
});
