/**
 * Handler: /api/soci e /api/soci/{id}
 * Ruoli: admin (tutti), viewer (solo il proprio socio)
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  requireAdminOrSelf,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, created, noContent, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import { intParam, paginazioneRichiesta } from '../util/paginazione.js';
import {
  listSoci,
  listSociRidotto,
  listSociPaginati,
  getSocioById,
  getSocioByViewerId,
  createSocio,
  updateSocio,
  deleteSocio,
} from '../service/soci.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth    = getAuthContext(event);
    const method  = event.requestContext.http.method;
    const path    = event.requestContext.http.path;
    const socioId = event.pathParameters?.id;

    // -----------------------------------------------------------
    // GET /api/soci
    // -----------------------------------------------------------
    if (method === 'GET' && !socioId) {
      const qs = event.queryStringParameters;

      // Con limit/offset: elenco a pagine, filtrato e ordinato dal database,
      // nella forma di incontri e fatturazione. Senza: l'elenco completo, che
      // serve ai menu di scelta dei soci.
      if (paginazioneRichiesta(qs)) {
        const limit  = intParam(qs?.limit);
        const offset = intParam(qs?.offset);
        const pagina = (rows: unknown[], total: number) =>
          ok({ data: rows, total, limit: limit ?? rows.length, offset: offset ?? 0 });

        if (auth.isAdmin || auth.isIstruttore) {
          const { rows, total } = await listSociPaginati({
            q: qs?.q, sort: qs?.sort, dir: qs?.dir, limit, offset,
            // Le schede libere interessano solo a chi fa i collegamenti.
            senzaAccount: auth.isAdmin && qs?.senza_account === '1',
            ridotto: !auth.isAdmin,
          });
          return pagina(rows, total);
        }
        const socio = await getSocioByViewerId(auth.userId);
        return pagina(socio ? [socio] : [], socio ? 1 : 0);
      }

      if (auth.isAdmin) {
        // Admin: restituisce tutti i soci
        const soci = await listSoci();
        return ok(soci);
      }
      if (auth.isIstruttore) {
        // Istruttore: tutti i soci, ma solo il nominativo — gli serve per
        // scegliere chi ha partecipato all'incontro, non per consultarne
        // recapiti e anagrafica.
        return ok(await listSociRidotto());
      }
      // Viewer: restituisce solo il proprio socio
      const socio = await getSocioByViewerId(auth.userId);
      return ok(socio ? [socio] : []);
    }

    // -----------------------------------------------------------
    // GET /api/soci/{id}
    // -----------------------------------------------------------
    if (method === 'GET' && socioId) {
      const socio = await getSocioById(socioId);
      requireAdminOrSelf(auth, socio.id_viewer);
      return ok(socio);
    }

    // -----------------------------------------------------------
    // POST /api/soci
    // -----------------------------------------------------------
    if (method === 'POST' && !socioId) {
      requireAdmin(auth);
      const body = corpoJson(event);
      const socio = await createSocio(body);
      return created(socio);
    }

    // -----------------------------------------------------------
    // PUT /api/soci/{id}
    // -----------------------------------------------------------
    if (method === 'PUT' && socioId) {
      requireAdmin(auth);
      const body = corpoJson(event);
      const socio = await updateSocio(socioId, body);
      return ok(socio);
    }

    // -----------------------------------------------------------
    // DELETE /api/soci/{id}
    // -----------------------------------------------------------
    if (method === 'DELETE' && socioId) {
      requireAdmin(auth);
      await deleteSocio(socioId);
      return noContent();
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
