/**
 * Lettura del corpo JSON di una richiesta.
 *
 * Un corpo malformato è un errore di chi chiama, e va detto con un 400: con
 * JSON.parse diretto l'eccezione arrivava al gestore generico come 500, come
 * se il guasto fosse del server. Stesso messaggio dell'authorizer.
 */

import { BadRequestError, type RequestEvent } from '../middleware/auth.js';

// `any` come JSON.parse, che sostituisce: i campi li validano i service.
export function corpoJson(event: RequestEvent): any {
  if (!event.body) return {};

  let valore: unknown;
  try {
    valore = JSON.parse(event.body);
  } catch {
    throw new BadRequestError('Corpo della richiesta non è JSON valido');
  }

  // Un JSON valido ma non oggetto (null, un numero, un elenco) farebbe fallire
  // la lettura dei campi più avanti, di nuovo con un 500.
  if (valore === null || typeof valore !== 'object' || Array.isArray(valore)) {
    throw new BadRequestError('Il corpo della richiesta deve essere un oggetto JSON');
  }
  return valore;
}
