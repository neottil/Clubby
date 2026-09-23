/**
 * Handler: /api/tesseramenti e /api/tesseramenti/{socioId} — solo admin.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, created, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import { intParam, paginazioneRichiesta } from '../util/paginazione.js';
import {
  listSituazioneTesseramenti,
  listTesseramentiPaginati,
  storicoTesseramenti,
  rinnovaTesseramento,
} from '../service/tesseramenti.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth    = getAuthContext(event);
    requireAdmin(auth);
    const method  = event.requestContext.http.method;
    const socioId = event.pathParameters?.id;

    // -----------------------------------------------------------
    // GET /api/tesseramenti — ogni socio con la sua ultima scadenza
    // -----------------------------------------------------------
    if (method === 'GET' && !socioId) {
      const qs = event.queryStringParameters;
      // Con limit/offset: pagina con stato, filtri e conteggi per stato. Senza:
      // l'elenco completo, come prima.
      if (paginazioneRichiesta(qs)) {
        const limit  = intParam(qs?.limit);
        const offset = intParam(qs?.offset);
        const { rows, total, conteggi } = await listTesseramentiPaginati({
          q: qs?.q, stato: qs?.stato, sort: qs?.sort, dir: qs?.dir, limit, offset,
        });
        return ok({ data: rows, total, conteggi, limit: limit ?? rows.length, offset: offset ?? 0 });
      }
      return ok(await listSituazioneTesseramenti());
    }

    // -----------------------------------------------------------
    // GET /api/tesseramenti/{socioId} — storico dei rinnovi di un socio
    // -----------------------------------------------------------
    if (method === 'GET' && socioId) {
      return ok(await storicoTesseramenti(socioId));
    }

    // -----------------------------------------------------------
    // POST /api/tesseramenti   Body: { socio_id, scadenza, data_rinnovo?, importo? }
    // -----------------------------------------------------------
    if (method === 'POST' && !socioId) {
      const body = corpoJson(event);
      return created(await rinnovaTesseramento({
        socio_id: body.socio_id,
        scadenza: body.scadenza,
        data_rinnovo: body.data_rinnovo,
        importo: body.importo,
      }));
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
