/**
 * Handler: /api/impostazioni — solo admin.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import { leggiImpostazioni, aggiornaImpostazioni } from '../service/impostazioni.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth   = getAuthContext(event);
    requireAdmin(auth);
    const method = event.requestContext.http.method;

    // GET /api/impostazioni
    if (method === 'GET') {
      return ok(await leggiImpostazioni());
    }

    // PUT /api/impostazioni
    // Body: { quota_tesseramento?, percentuale_ricarica?,
    //         ricevuta_intestazione?, ricevuta_pie_pagina? }
    //
    // Whitelist esplicita: un campo non previsto viene ignorato, non scritto.
    // Il rovescio è che una chiave nuova dimenticata qui viene scartata in
    // silenzio, e la risposta sembra comunque un successo — quindi ogni
    // impostazione aggiunta al servizio va aggiunta anche a questo elenco.
    if (method === 'PUT') {
      const body = corpoJson(event);
      return ok(await aggiornaImpostazioni({
        quota_tesseramento: body.quota_tesseramento,
        percentuale_ricarica: body.percentuale_ricarica,
        ricevuta_intestazione: body.ricevuta_intestazione,
        ricevuta_pie_pagina: body.ricevuta_pie_pagina,
      }));
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
