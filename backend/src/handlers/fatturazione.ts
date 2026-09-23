/**
 * Handler: /api/fatturazione — solo admin.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, errorResponse } from '../middleware/response.js';
import { listFatturazione } from '../service/fatturazione.service.js';
import { intParam } from '../util/paginazione.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth = getAuthContext(event);
    requireAdmin(auth);

    // -----------------------------------------------------------
    // GET /api/fatturazione[?socio_id=&da=&a=&limit=&offset=]
    // Risposta paginata: { data, total, totale_importo, limit, offset }
    // -----------------------------------------------------------
    if (event.requestContext.http.method === 'GET') {
      const qs = event.queryStringParameters;
      const options = {
        socioId: qs?.socio_id,
        da: qs?.da,
        a: qs?.a,
        limit: intParam(qs?.limit),
        offset: intParam(qs?.offset),
      };
      const { rows, total, totaleImporto } = await listFatturazione(options);
      return ok({
        data: rows,
        total,
        totale_importo: totaleImporto,
        limit: options.limit ?? rows.length,
        offset: options.offset ?? 0,
      });
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
