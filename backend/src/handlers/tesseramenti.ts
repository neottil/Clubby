/**
 * Handler: /api/tesseramenti e /api/tesseramenti/{socioId}.
 *
 * Quasi tutto è dell'admin. L'unica eccezione è lo **storico di un socio**, che
 * il socio stesso può leggere: sono i suoi rinnovi, le sue scadenze e le quote
 * che ha pagato. Il confronto è con la scheda socio collegata all'account, non
 * con il parametro: chiedere l'id di un altro non basta a leggerne lo storico.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  ForbiddenError,
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
import { getSocioByViewerId } from '../service/soci.service.js';
import { moduloAttivo } from '../util/moduli.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth    = getAuthContext(event);
    const method  = event.requestContext.http.method;
    const socioId = event.pathParameters?.id;

    // -----------------------------------------------------------
    // GET /api/tesseramenti/{socioId} — storico dei rinnovi di un socio
    //
    // Prima di requireAdmin: è l'unica rotta dell'area aperta oltre l'admin.
    // Il controllo non è "sei un socio" ma "sei QUEL socio".
    // -----------------------------------------------------------
    if (method === 'GET' && socioId) {
      if (!auth.isAdmin) {
        const proprio = await getSocioByViewerId(auth.userId);
        if (!proprio || proprio.id !== socioId) {
          throw new ForbiddenError('Puoi vedere solo i tuoi tesseramenti');
        }
      }
      return ok(await storicoTesseramenti(socioId, moduloAttivo('ricevute')));
    }

    // Da qui in giù è tutto riservato agli amministratori.
    requireAdmin(auth);

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
