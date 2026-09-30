/**
 * Middleware di autenticazione e autorizzazione.
 *
 * I token sono emessi dall'authorizer (servizio in authorizer/) e verificati
 * qui con la sua chiave pubblica, scaricata da /.well-known/jwks.json. Il
 * backend può quindi verificare i token ma non emetterli: la chiave privata
 * non esce mai dall'authorizer.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface TokenClaims {
  sub: string;
  email: string;
  nome: string;
  cognome: string;
  roles: string[];
  /** True finché l'utente non ha sostituito una password temporanea. */
  cambio_password_richiesto?: boolean;
  iat: number;
  exp: number;
}

/**
 * Chi sta chiamando. Ruolo nel club e privilegio di amministrazione sono due
 * cose indipendenti:
 *   isIstruttore  tiene incontri (altrimenti è un socio)
 *   isAdmin       amministra l'applicazione, qualunque sia il suo ruolo
 * Quando "admin" era un ruolo alternativo, chi amministrava non poteva
 * risultare istruttore di nessun incontro.
 */
export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
  isIstruttore: boolean;
}

/** Minimal request event interface */
export interface RequestEvent {
  version?: string;
  routeKey?: string;
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  pathParameters?: Record<string, string>;
  body?: string;
  requestContext: {
    http: { method: string; path: string };
    authorizer?: { jwt?: { claims?: any } };
  };
}

/** Minimal response interface */
export interface ResponseResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  /**
   * `body` contiene byte codificati in base64, non testo.
   *
   * Serve alle risposte binarie (oggi solo i PDF delle ricevute): `body` è
   * tipizzato `string`, e un Buffer convertito in stringa UTF-8 arriverebbe
   * corrotto. Il server decodifica prima di scrivere sulla risposta.
   *
   * È additivo: chi non lo passa si comporta esattamente come prima.
   */
  isBase64Encoded?: boolean;
}

/**
 * Emittente atteso dei token: è l'URL *pubblico* dell'authorizer, quello che
 * l'authorizer stesso scrive nel claim `iss`. Confrontarlo è ciò che impedisce
 * a un token emesso da un'altra istanza (per esempio quella di sviluppo) di
 * essere accettato qui.
 */
const AUTH_ISSUER = process.env.AUTH_ISSUER || 'http://localhost:3001';

/**
 * URL da cui scaricare le chiavi pubbliche. Distinto dall'issuer perché in
 * cluster il backend raggiunge l'authorizer sul Service interno, mentre
 * l'issuer resta il nome pubblico scritto nei token.
 */
const AUTH_INTERNAL_URL = process.env.AUTH_INTERNAL_URL || AUTH_ISSUER;

const JWKS = createRemoteJWKSet(new URL(`${AUTH_INTERNAL_URL}/.well-known/jwks.json`));

/** Verifica firma, scadenza ed emittente del token. */
export async function verifyToken(token: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, JWKS, { issuer: AUTH_ISSUER });
  return payload as unknown as TokenClaims;
}

/**
 * Estrae e decodifica i claims JWT dall'evento.
 * Il server inietta i claims in requestContext.authorizer.jwt.claims dopo la verifica JWKS
 */
export function getAuthContext(event: RequestEvent): AuthContext {
  const claims = event.requestContext?.authorizer?.jwt?.claims;

  if (!claims) {
    throw new UnauthorizedError('Token non presente o non valido');
  }

  const groups: string[] = Array.isArray(claims.roles) ? claims.roles : [];
  // Ciò che non è riconosciuto non concede nulla: un token senza ruoli noti
  // vale come un socio senza privilegi.
  return {
    userId: claims.sub,
    email: claims.email ?? '',
    groups,
    isAdmin: groups.includes('admin'),
    isIstruttore: groups.includes('istruttore'),
  };
}

/**
 * Verifica che l'utente sia admin, altrimenti lancia ForbiddenError
 */
export function requireAdmin(auth: AuthContext): void {
  if (!auth.isAdmin) {
    throw new ForbiddenError('Accesso riservato agli amministratori');
  }
}

/**
 * Verifica che l'utente sia admin OPPURE che stia accedendo
 * ai propri dati (viewer può vedere solo il proprio socio)
 */
export function requireAdminOrSelf(auth: AuthContext, viewerId: string | null): void {
  if (auth.isAdmin) return;
  if (auth.userId === viewerId) return;
  throw new ForbiddenError('Non hai i permessi per accedere a questa risorsa');
}

// ---------------------------------------------------------------
// Classi di errore HTTP
// ---------------------------------------------------------------

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Non autorizzato') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Accesso negato') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Risorsa non trovata') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Richiesta non valida') {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflitto') {
    super(409, message);
    this.name = 'ConflictError';
  }
}
