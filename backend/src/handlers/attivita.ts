/**
 * Handler: /api/attivita e /api/attivita/{id}
 *
 * Lettura: chiunque sia autenticato — il listino serve a leggere gli incontri
 * e a comporre i menu di scelta. Un istruttore riceve però solo le attività a
 * cui è abilitato: è l'elenco che il suo form deve proporre, e riceverne di
 * più vorrebbe dire proporgli scelte che il salvataggio poi rifiuta.
 *
 * Scrittura: solo admin.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, created, noContent, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import { modificaParziale } from '../util/metodi.js';
import {
  listAttivita,
  attivitaDiIstruttore,
  createAttivita,
  updateAttivita,
  deleteAttivita,
} from '../service/attivita.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth       = getAuthContext(event);
    const method     = event.requestContext.http.method;
    const attivitaId = event.pathParameters?.id;

    // -----------------------------------------------------------
    // GET /api/attivita[?tutte=1]
    // -----------------------------------------------------------
    if (method === 'GET' && !attivitaId) {
      if (!auth.isAdmin && auth.isIstruttore) {
        return ok(await attivitaDiIstruttore(auth.userId));
      }
      // Le attività disattivate servono all'admin per gestirle e a chiunque
      // per leggere uno storico che le contiene; nei menu di scelta si chiede
      // invece il solo elenco attivo.
      const tutte = auth.isAdmin && event.queryStringParameters?.tutte === '1';
      return ok(await listAttivita(!tutte));
    }

    // -----------------------------------------------------------
    // POST /api/attivita
    // -----------------------------------------------------------
    if (method === 'POST' && !attivitaId) {
      requireAdmin(auth);
      const body = corpoJson(event);
      return created(await createAttivita(body));
    }

    // -----------------------------------------------------------
    // PATCH /api/attivita/{id}   (PUT: alias deprecato, vedi util/metodi.ts)
    // -----------------------------------------------------------
    if (attivitaId && modificaParziale(event)) {
      requireAdmin(auth);
      const body = corpoJson(event);
      return ok(await updateAttivita(attivitaId, body));
    }

    // -----------------------------------------------------------
    // DELETE /api/attivita/{id}
    // -----------------------------------------------------------
    if (method === 'DELETE' && attivitaId) {
      requireAdmin(auth);
      await deleteAttivita(attivitaId);
      return noContent();
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
