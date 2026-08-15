/**
 * Amministrazione: ruoli degli utenti e associazione utente ↔ socio.
 *
 * I ruoli e gli account vivono nell'authorizer, non qui: questo servizio si
 * limita a inoltrargli le richieste. L'associazione utente ↔ socio invece è
 * dato applicativo e resta nel database dell'app (socio.id_viewer).
 *
 * Le chiamate all'authorizer riportano il token dell'admin che ha fatto la
 * richiesta, invece di usare credenziali di servizio: così l'authorizer
 * applica i propri controlli sull'identità reale di chi opera (compreso il
 * divieto di togliersi da soli il ruolo di admin), e il backend non custodisce
 * alcun segreto che gli permetterebbe di modificare utenti per conto proprio.
 */

import { BadRequestError, HttpError, NotFoundError } from '../middleware/auth.js';
import { associaViewer, disassociaViewer, getSocioById } from './soci.service.js';

const AUTH_INTERNAL_URL = process.env.AUTH_INTERNAL_URL || 'http://localhost:3001';

/** Utente come lo espone l'authorizer. */
export interface UtenteAuth {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  ruolo: 'admin' | 'viewer';
  attivo: boolean;
  cambio_password_richiesto: boolean;
  ultimo_accesso: string | null;
  created_at: string;
}

/**
 * Chiama l'authorizer inoltrando il token del chiamante e ripropaga i suoi
 * errori con lo stesso codice HTTP: un 403 dell'authorizer deve arrivare al
 * frontend come 403, non trasformarsi in un 500 generico che nasconde il
 * motivo del rifiuto.
 */
async function chiamaAuthorizer<T>(
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
  } catch (err) {
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

// ---------------------------------------------------------------
// Utenti registrati
// ---------------------------------------------------------------

export async function listaUtenti(tokenChiamante: string): Promise<UtenteAuth[]> {
  return chiamaAuthorizer<UtenteAuth[]>('/admin/utenti', tokenChiamante);
}

/**
 * Risolve un riferimento a utente — id oppure email — nel suo id.
 * L'interfaccia admin passa l'id, ma accettare anche l'email rende utilizzabili
 * a mano gli endpoint (e i file Bruno) senza dover prima cercare l'UUID.
 */
async function risolviUtenteId(riferimento: string, tokenChiamante: string): Promise<string> {
  if (!riferimento) throw new BadRequestError('Utente non specificato');
  if (!riferimento.includes('@')) return riferimento;

  const utenti = await listaUtenti(tokenChiamante);
  const trovato = utenti.find(u => u.email.toLowerCase() === riferimento.toLowerCase());
  if (!trovato) throw new NotFoundError(`Utente '${riferimento}' non trovato`);
  return trovato.id;
}

async function cambiaRuolo(
  riferimento: string,
  ruolo: 'admin' | 'viewer',
  tokenChiamante: string
): Promise<void> {
  const id = await risolviUtenteId(riferimento, tokenChiamante);
  await chiamaAuthorizer(`/admin/utenti/${id}/ruolo`, tokenChiamante, {
    method: 'POST',
    body: JSON.stringify({ ruolo }),
  });
}

export async function promuoviAdmin(riferimento: string, tokenChiamante: string): Promise<void> {
  await cambiaRuolo(riferimento, 'admin', tokenChiamante);
}

/**
 * Retrocede un admin a viewer. Il divieto di retrocedere sé stessi è
 * applicato dall'authorizer, che conosce l'identità reale del chiamante dal
 * token: replicarlo qui sarebbe un secondo punto da tenere allineato.
 */
export async function retrocediAdmin(riferimento: string, tokenChiamante: string): Promise<void> {
  await cambiaRuolo(riferimento, 'viewer', tokenChiamante);
}

/**
 * Azzera la password di un utente e restituisce quella temporanea generata.
 * Va consegnata all'interessato fuori dall'applicazione (non c'è invio di
 * email) e va sostituita al primo accesso.
 */
export async function resetPasswordUtente(
  riferimento: string,
  tokenChiamante: string
): Promise<{ password_temporanea: string }> {
  const id = await risolviUtenteId(riferimento, tokenChiamante);
  return chiamaAuthorizer<{ password_temporanea: string }>(
    `/admin/utenti/${id}/reset-password`,
    tokenChiamante,
    { method: 'POST' }
  );
}

// ---------------------------------------------------------------
// Associazione utente ↔ socio (dato applicativo, resta nel DB dell'app)
// ---------------------------------------------------------------

export async function associaViewerASocio(
  socioId: string,
  riferimentoUtente: string,
  tokenChiamante: string
): Promise<void> {
  const utenteId = await risolviUtenteId(riferimentoUtente, tokenChiamante);
  // Verifica che il socio esista prima di scrivere l'associazione
  await getSocioById(socioId);
  await associaViewer(socioId, utenteId);
}

export async function disassociaViewerDaSocio(socioId: string): Promise<void> {
  await getSocioById(socioId);
  await disassociaViewer(socioId);
}
