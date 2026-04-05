/**
 * Middleware di autenticazione e autorizzazione
 *
 * Estrae i claims JWT dal token Keycloak.
 * In prod: API Gateway / Ingress JWT Authorizer valida firma e scadenza.
 * In locale: il server verifica via JWKS.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface KeycloakClaims {
  sub: string;
  preferred_username: string;
  email?: string;
  realm_access: { roles: string[] };
  iat: number;
  exp: number;
}

export type UserRole = 'admin' | 'viewer';

export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
  role: UserRole;
}

/** Minimal request event interface (compatible with API Gateway v2 shape) */
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
}

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'clubmanager';

const jwksUrl = new URL(
  `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`
);
const JWKS = createRemoteJWKSet(jwksUrl);

/**
 * Verify JWT via JWKS — used in local server mode.
 */
export async function verifyToken(token: string): Promise<KeycloakClaims> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
  });
  return payload as unknown as KeycloakClaims;
}

/**
 * Estrae e decodifica i claims JWT dall'evento.
 * API Gateway HTTP API v2 / Ingress inietta i claims in requestContext.authorizer.jwt.claims
 */
export function getAuthContext(event: RequestEvent): AuthContext {
  const claims = event.requestContext?.authorizer?.jwt?.claims;

  if (!claims) {
    throw new UnauthorizedError('Token non presente o non valido');
  }

  // realm_access may come as a JSON string from API Gateway
  let realmAccess: { roles: string[] } = { roles: [] };
  if (claims.realm_access) {
    realmAccess = typeof claims.realm_access === 'string'
      ? JSON.parse(claims.realm_access)
      : claims.realm_access;
  }

  const groups = realmAccess.roles ?? [];
  const role: UserRole = groups.includes('admin') ? 'admin' : 'viewer';

  return {
    userId: claims.sub,
    email: claims.email ?? claims.preferred_username ?? '',
    groups,
    role,
  };
}

/**
 * Verifica che l'utente sia admin, altrimenti lancia ForbiddenError
 */
export function requireAdmin(auth: AuthContext): void {
  if (auth.role !== 'admin') {
    throw new ForbiddenError('Accesso riservato agli amministratori');
  }
}

/**
 * Verifica che l'utente sia admin OPPURE che stia accedendo
 * ai propri dati (viewer può vedere solo il proprio socio)
 */
export function requireAdminOrSelf(auth: AuthContext, viewerId: string | null): void {
  if (auth.role === 'admin') return;
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
