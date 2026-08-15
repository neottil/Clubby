/**
 * Handler: /api/incontri e /api/incontri/{id}
 * Ruoli: admin (tutti), viewer (solo incontri del proprio socio)
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  ForbiddenError,
} from '../middleware/auth.js';
import { ok, created, noContent, errorResponse } from '../middleware/response.js';
import {
  listIncontri,
  resocontoIncontri,
  getIncontroById,
  createIncontro,
  updateIncontro,
  deleteIncontro,
  type ListIncontriOptions,
} from '../service/incontri.service.js';
import { getSocioByViewerId } from '../service/soci.service.js';

/** Intero non negativo da query string, o undefined se assente/non valido. */
function intParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Opzioni di elenco lette dalla query string. `socio_id` non viene preso da
 * qui: lo decide il chiamante in base al ruolo (un viewer non deve poter
 * chiedere gli incontri di un altro socio passando un socio_id a mano).
 */
function listOptionsFromQuery(qs: Record<string, string> | undefined): ListIncontriOptions {
  return {
    q:        qs?.q,
    attivita: qs?.attivita,
    da:       qs?.da,
    a:        qs?.a,
    sort:     qs?.sort,
    dir:      qs?.dir === 'asc' ? 'asc' : 'desc',
    limit:    intParam(qs?.limit),
    offset:   intParam(qs?.offset),
  };
}

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth       = getAuthContext(event);
    const method     = event.requestContext.http.method;
    const incontroId = event.pathParameters?.id;
    const path       = event.requestContext.http.path;

    // Viewer: recupera il proprio socio per filtrare
    let viewerSocioId: string | null = null;
    if (auth.role === 'viewer') {
      const socio = await getSocioByViewerId(auth.userId);
      viewerSocioId = socio?.id ?? null;
    }

    // -----------------------------------------------------------
    // GET /api/incontri/resoconto?da=&a=
    // Deve stare prima di GET /{id}: la rotta dedicata in server.ts evita che
    // "resoconto" venga scambiato per l'id di un incontro.
    // -----------------------------------------------------------
    if (method === 'GET' && path.endsWith('/resoconto')) {
      requireAdmin(auth);
      const { da, a } = event.queryStringParameters ?? {};
      return ok(await resocontoIncontri(da, a));
    }

    // -----------------------------------------------------------
    // GET /api/incontri[?socio_id=&q=&attivita=&da=&a=&sort=&dir=&limit=&offset=]
    // Risposta paginata: { data, total, limit, offset }
    // -----------------------------------------------------------
    if (method === 'GET' && !incontroId) {
      const options = listOptionsFromQuery(event.queryStringParameters);

      if (auth.role === 'admin') {
        options.socioId = event.queryStringParameters?.socio_id;
      } else {
        // Nessun socio associato al viewer → nessun dato (mai "tutti gli
        // incontri"). Il filtro per socio è imposto qui e non preso dalla
        // query string: un viewer non deve poter leggere gli incontri altrui.
        if (!viewerSocioId) return ok({ data: [], total: 0, limit: 0, offset: 0 });
        options.socioId = viewerSocioId;
      }

      const { rows, total } = await listIncontri(options);
      return ok({
        data: rows,
        total,
        limit: options.limit ?? rows.length,
        offset: options.offset ?? 0,
      });
    }

    // -----------------------------------------------------------
    // GET /api/incontri/{id}
    // -----------------------------------------------------------
    if (method === 'GET' && incontroId) {
      const incontro = await getIncontroById(incontroId);
      if (auth.role === 'viewer' && incontro.socio_id !== viewerSocioId) {
        throw new ForbiddenError();
      }
      return ok(incontro);
    }

    // -----------------------------------------------------------
    // POST /api/incontri
    // -----------------------------------------------------------
    if (method === 'POST') {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
      const incontro = await createIncontro(body);
      return created(incontro);
    }

    // -----------------------------------------------------------
    // PUT /api/incontri/{id}
    // -----------------------------------------------------------
    if (method === 'PUT' && incontroId) {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
      const incontro = await updateIncontro(incontroId, body);
      return ok(incontro);
    }

    // -----------------------------------------------------------
    // DELETE /api/incontri/{id}
    // -----------------------------------------------------------
    if (method === 'DELETE' && incontroId) {
      requireAdmin(auth);
      await deleteIncontro(incontroId);
      return noContent();
    }

    return errorResponse({ statusCode: 404, message: 'Route non trovata' });
  } catch (error) {
    return errorResponse(error);
  }
};
