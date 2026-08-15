/**
 * Chiamate all'authorizer (registrazione, accesso, sessione, password).
 *
 * Separato da api/client.ts perché punta a un servizio diverso e, soprattutto,
 * non deve passare per la gestione del 401 di quel modulo: qui un 401 è la
 * risposta normale a credenziali sbagliate, non una sessione scaduta da cui
 * disconnettere l'utente.
 */

import { config } from '../config';

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

async function chiama<T>(percorso: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${config.authBaseUrl}${percorso}`, { ...options, headers });
  } catch {
    // Distinguere l'irraggiungibilità da un rifiuto: "email o password non
    // corretti" davanti a un servizio spento manderebbe l'utente a cercare
    // l'errore nelle proprie credenziali.
    throw new AuthError(0, 'Servizio di autenticazione non raggiungibile. Riprova più tardi.');
  }

  if (!res.ok) {
    let messaggio = `Errore ${res.status}`;
    try {
      const dati = await res.json();
      messaggio = dati.error ?? messaggio;
    } catch { /* corpo non JSON */ }
    throw new AuthError(res.status, messaggio);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface UtenteAuth {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  ruolo: 'admin' | 'viewer';
  attivo: boolean;
  cambio_password_richiesto: boolean;
}

export interface Sessione {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  utente: UtenteAuth;
}

export interface DatiRegistrazione {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  password: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    chiama<Sessione>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  registra: (dati: DatiRegistrazione) =>
    chiama<Sessione>('/auth/register', { method: 'POST', body: JSON.stringify(dati) }),

  rinnova: (refreshToken: string) =>
    chiama<Sessione>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }),

  logout: (refreshToken: string) =>
    chiama<void>('/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) }),

  me: (token: string) => chiama<UtenteAuth>('/auth/me', {}, token),

  cambiaPassword: (token: string, passwordAttuale: string, passwordNuova: string) =>
    chiama<Sessione>('/auth/cambia-password', {
      method: 'POST',
      body: JSON.stringify({ password_attuale: passwordAttuale, password_nuova: passwordNuova }),
    }, token),
};
