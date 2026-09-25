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

    // PUT /api/impostazioni   Body: { quota_tesseramento?, percentuale_ricarica? }
    // Whitelist esplicita: un campo non previsto viene ignorato, non scritto.
    if (method === 'PUT') {
      const body = corpoJson(event);
      return ok(await aggiornaImpostazioni({
        quota_tesseramento: body.quota_tesseramento,
        percentuale_ricarica: body.percentuale_ricarica,
      }));
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
