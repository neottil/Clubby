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
  getIncontroById,
  createIncontro,
  updateIncontro,
  deleteIncontro,
} from '../service/incontri.service.js';
import { getSocioByViewerId } from '../service/soci.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth       = getAuthContext(event);
    const method     = event.requestContext.http.method;
    const incontroId = event.pathParameters?.id;

    // Viewer: recupera il proprio socio per filtrare
    let viewerSocioId: string | null = null;
    if (auth.role === 'viewer') {
      const socio = await getSocioByViewerId(auth.userId);
      viewerSocioId = socio?.id ?? null;
    }

    // -----------------------------------------------------------
    // GET /api/incontri[?socio_id=...]
    // -----------------------------------------------------------
    if (method === 'GET' && !incontroId) {
      if (auth.role === 'admin') {
        const socioId = event.queryStringParameters?.socio_id;
        const incontri = await listIncontri(socioId);
        return ok(incontri);
      } else {
        // Viewer: solo i propri incontri
        const incontri = await listIncontri(viewerSocioId ?? undefined);
        return ok(incontri);
      }
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
