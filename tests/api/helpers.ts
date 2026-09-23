/**
 * Chiamate HTTP ai servizi, per i test delle API.
 *
 * Variabili:
 *   API_URL   backend      (default http://localhost:3000)
 *   AUTH_URL  authorizer   (default http://localhost:3001)
 */

export const API_URL  = process.env.API_URL  ?? 'http://localhost:3000';
export const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3001';

export interface Risposta {
  status: number;
  body: any;
}

export interface Sessione {
  accessToken: string;
  refreshToken: string;
  /** Id dell'account (claim sub). */
  id: string;
  roles: string[];
}

/** Corpo da inviare così com'è, senza JSON.stringify: per provare corpi malformati. */
export class CorpoGrezzo {
  // Niente "constructor(public testo)": Node esegue questi file togliendo solo i
  // tipi, e le proprietà dichiarate nel costruttore non sono supportate.
  testo: string;
  constructor(testo: string) { this.testo = testo; }
}

async function chiama(base: string, method: string, path: string, token?: string, body?: unknown): Promise<Risposta> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined
        : body instanceof CorpoGrezzo ? body.testo
        : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`${base} non raggiungibile (${(e as Error).message}): avvia i servizi con npm run dev`);
  }

  const testo = await res.text();
  let parsed: unknown = undefined;
  try { parsed = testo ? JSON.parse(testo) : undefined; } catch { parsed = testo; }
  return { status: res.status, body: parsed };
}

/** Claim del token, senza verificarne la firma: la verifica è compito del backend. */
export function claims(token: string): { sub: string; email: string; roles: string[] } {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

/** Chiamata al backend. */
export function api(s: Sessione, method: string, path: string, body?: unknown): Promise<Risposta> {
  return chiama(API_URL, method, path, s.accessToken, body);
}

/** Chiamata all'authorizer; il token è facoltativo (login, registrazione, refresh). */
export function authApi(s: Sessione | undefined, method: string, path: string, body?: unknown): Promise<Risposta> {
  return chiama(AUTH_URL, method, path, s?.accessToken, body);
}

/**
 * Corpo della risposta se lo stato è quello atteso, altrimenti un errore che
 * dice cosa si stava facendo. Per la preparazione dei dati, dove un fallimento
 * non è il soggetto del test ma deve essere comunque leggibile.
 */
export function atteso(r: Risposta, stato: number | number[], cosa: string): any {
  const ammessi = Array.isArray(stato) ? stato : [stato];
  if (!ammessi.includes(r.status)) {
    throw new Error(`${cosa}: atteso HTTP ${ammessi.join('/')}, ricevuto ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body;
}

/** Saldo residuo del voucher di un socio, letto come admin. */
export async function saldo(admin: Sessione, socioId: string): Promise<number> {
  const r = await api(admin, 'GET', `/api/voucher?socio_id=${socioId}`);
  return Number(r.body[0].saldo_residuo);
}

/** Data di N giorni fa (YYYY-MM-DD, UTC). */
export function giorniFa(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
