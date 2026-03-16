/**
 * Middleware di autenticazione e autorizzazione
 *
 * Estrae i claims JWT dal token Cognito già validato da API Gateway.
 * API Gateway JWT Authorizer valida firma e scadenza prima di invocare Lambda,
 * quindi qui decodifichiamo solo il payload (no verifica firma necessaria).
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface CognitoClaims {
  sub: string;          // Cognito user ID
  email: string;
  'cognito:groups': string[];
  'cognito:username': string;
}

export type UserRole = 'admin' | 'viewer';

export interface AuthContext {
  userId: string;
  email: string;
  groups: string[];
  role: UserRole;
}

/**
 * Estrae e decodifica i claims JWT dall'evento Lambda.
 * API Gateway HTTP API v2 inietta i claims in requestContext.authorizer.jwt.claims
 */
export function getAuthContext(event: APIGatewayProxyEventV2): AuthContext {
  const claims = (event.requestContext as any)?.authorizer?.jwt?.claims;

  if (!claims) {
    throw new UnauthorizedError('Token non presente o non valido');
  }

  // cognito:groups può essere una stringa JSON array o undefined
  let groups: string[] = [];
  if (claims['cognito:groups']) {
    try {
      groups = JSON.parse(claims['cognito:groups']);
    } catch {
      groups = [claims['cognito:groups']];
    }
  }

  const role: UserRole = groups.includes('admin') ? 'admin' : 'viewer';

  return {
    userId: claims.sub,
    email: claims.email ?? '',
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
