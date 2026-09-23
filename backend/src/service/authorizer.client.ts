/**
 * Accesso all'authorizer dal backend applicativo.
 *
 * Gli account e i ruoli vivono in un servizio separato, con un database
 * proprio: quando servono qui (elenco utenti, elenco istruttori, gestione dei
 * ruoli) si passa da queste funzioni.
 *
 * Ogni chiamata riporta il token di chi ha fatto la richiesta invece di usare
 * credenziali di servizio: così è l'authorizer ad applicare i propri controlli
 * sull'identità reale di chi opera, e il backend non custodisce alcun segreto
 * che gli permetterebbe di leggere o modificare utenti per conto proprio.
 */

import { HttpError } from '../middleware/auth.js';

const AUTH_INTERNAL_URL = process.env.AUTH_INTERNAL_URL || 'http://localhost:3001';

/**
 * Account come lo espone l'authorizer: credenziali e stato, nessuna anagrafica.
 * Nome, cognome e telefono vivono sulla riga del socio, in questo database —
 * chi deve mostrarli passa da soci.service.sociPerAccount().
 */
export interface UtenteAuth {
  id: string;
  email: string;
  ruolo: 'socio' | 'istruttore';
  /** Privilegio di amministrare l'app, indipendente dal ruolo nel club. */
  admin: boolean;
  attivo: boolean;
  cambio_password_richiesto: boolean;
  ultimo_accesso: string | null;
  created_at: string;
}

/** Istruttore come lo espone l'authorizer: identificativo ed email. */
export interface IstruttoreAuth {
  id: string;
  email: string;
}

/**
 * Chiama l'authorizer inoltrando il token del chiamante e ripropaga i suoi
 * errori con lo stesso codice HTTP: un 403 dell'authorizer deve arrivare al
 * frontend come 403, non trasformarsi in un 500 generico che nasconde il
 * motivo del rifiuto.
 */
export async function chiamaAuthorizer<T>(
  percorso: string,
  tokenChiamante: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_INTERNAL_URL}${percorso}`, {
      ...options,
      headers: {
        Authorization: tokenChiamante,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch {
    // L'authorizer irraggiungibile è un guasto dell'infrastruttura, non un
    // errore della richiesta: va detto chiaramente invece di sembrare un
    // problema dei dati inviati.
    throw new HttpError(503, 'Servizio di autenticazione non raggiungibile');
  }

  if (!res.ok) {
    let messaggio = `Errore dal servizio di autenticazione (${res.status})`;
    try {
      const corpo = await res.json() as { error?: string };
      if (corpo.error) messaggio = corpo.error;
    } catch { /* corpo non JSON: resta il messaggio generico */ }
    throw new HttpError(res.status, messaggio);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Elenco degli istruttori attivi. Non è riservato agli admin: serve a chiunque
 * apra l'elenco incontri per leggere il nome di chi li ha tenuti — l'endpoint
 * dell'authorizer espone solo id, nome e cognome.
 */
export async function listaIstruttori(tokenChiamante: string): Promise<IstruttoreAuth[]> {
  return chiamaAuthorizer<IstruttoreAuth[]>('/utenti/istruttori', tokenChiamante);
}
