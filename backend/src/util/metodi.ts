/**
 * Metodo HTTP delle modifiche parziali (spec 008).
 *
 * Una modifica parziale è `PATCH`: `PUT` vuol dire sostituire la risorsa, e
 * questi endpoint cambiano solo i campi inviati. In fase 1 `PUT` resta come
 * alias deprecato, perché backend e frontend si deployano separatamente e una
 * pagina aperta con il codice vecchio deve poter ancora salvare. La riga di log
 * dice quando nessun client lo usa più: la fase 2 è togliere il ramo `PUT`
 * da questa funzione, e a quel punto `PUT` risponde 404 come ogni metodo non
 * previsto.
 */

import type { RequestEvent } from '../middleware/auth.js';

export function modificaParziale(event: RequestEvent): boolean {
  const { method, path } = event.requestContext.http;
  if (method === 'PATCH') return true;
  if (method === 'PUT') {
    console.warn(`[deprecato] PUT ${path}: usare PATCH`);
    return true;
  }
  return false;
}
