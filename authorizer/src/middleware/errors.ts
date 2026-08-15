/**
 * Errori HTTP e helper di risposta, negli stessi termini del backend
 * applicativo così che i due servizi rispondano con la stessa forma
 * ({ error: "..." }) e il frontend abbia un solo modo di leggere gli errori.
 */

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Richiesta non valida') { super(400, message); this.name = 'BadRequestError'; }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Non autorizzato') { super(401, message); this.name = 'UnauthorizedError'; }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Accesso negato') { super(403, message); this.name = 'ForbiddenError'; }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Risorsa non trovata') { super(404, message); this.name = 'NotFoundError'; }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflitto') { super(409, message); this.name = 'ConflictError'; }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Troppi tentativi') { super(429, message); this.name = 'TooManyRequestsError'; }
}

export interface RisultatoRisposta {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

export function ok(data: unknown): RisultatoRisposta {
  return { statusCode: 200, body: JSON.stringify(data) };
}

export function created(data: unknown): RisultatoRisposta {
  return { statusCode: 201, body: JSON.stringify(data) };
}

export function noContent(): RisultatoRisposta {
  return { statusCode: 204 };
}

/**
 * Converte un errore in risposta HTTP. Gli errori non previsti diventano un
 * 500 con messaggio generico: il testo di un'eccezione interna può contenere
 * dettagli del database o della configurazione che non devono uscire.
 */
export function rispostaErrore(error: unknown): RisultatoRisposta {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, body: JSON.stringify({ error: error.message }) };
  }
  console.error('[authorizer] Errore non gestito:', error);
  return { statusCode: 500, body: JSON.stringify({ error: 'Errore interno' }) };
}
