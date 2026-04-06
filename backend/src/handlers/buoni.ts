/**
 * Handler: /api/buoni, /api/buoni/{id}, /api/buoni/{id}/movimenti
 * Ruoli: admin (tutti), viewer (solo i propri buoni)
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  ForbiddenError,
} from '../middleware/auth.js';
import { ok, created, errorResponse } from '../middleware/response.js';
import {
  listBuoni,
  getBuonoById,
  createBuono,
  listMovimenti,
  createMovimento,
} from '../service/buoni.service.js';
import { getSocioByViewerId } from '../service/soci.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth    = getAuthContext(event);
    const method  = event.requestContext.http.method;
    const path    = event.requestContext.http.path;
    const buonoId = event.pathParameters?.id;

    // Viewer: recupera il proprio socio
    let viewerSocioId: string | null = null;
    if (auth.role === 'viewer') {
      const socio = await getSocioByViewerId(auth.userId);
      viewerSocioId = socio?.id ?? null;
    }

    // Routing su /movimenti
    const isMovimentiRoute = path.endsWith('/movimenti');

    // -----------------------------------------------------------
    // GET /api/buoni[?socio_id=...]
    // -----------------------------------------------------------
    if (method === 'GET' && !buonoId) {
      if (auth.role === 'admin') {
        const socioId = event.queryStringParameters?.socio_id;
        return ok(await listBuoni(socioId!));
      } else {
        return ok(await listBuoni(viewerSocioId!));
      }
    }

    // -----------------------------------------------------------
    // GET /api/buoni/{id}
    // -----------------------------------------------------------
    if (method === 'GET' && buonoId && !isMovimentiRoute) {
      const buono = await getBuonoById(buonoId);
      if (auth.role === 'viewer' && buono.socio_id !== viewerSocioId) {
        throw new ForbiddenError();
      }
      return ok(buono);
    }

    // -----------------------------------------------------------
    // POST /api/buoni
    // -----------------------------------------------------------
    if (method === 'POST' && !buonoId) {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
      return created(await createBuono(body));
    }

    // -----------------------------------------------------------
    // GET /api/buoni/{id}/movimenti
    // -----------------------------------------------------------
    if (method === 'GET' && buonoId && isMovimentiRoute) {
      const buono = await getBuonoById(buonoId);
      if (auth.role === 'viewer' && buono.socio_id !== viewerSocioId) {
        throw new ForbiddenError();
      }
      return ok(await listMovimenti(buonoId));
    }

    // -----------------------------------------------------------
    // POST /api/buoni/{id}/movimenti
    // -----------------------------------------------------------
    if (method === 'POST' && buonoId && isMovimentiRoute) {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
      return created(await createMovimento(buonoId, body));
    }

    return errorResponse({ statusCode: 404, message: 'Route non trovata' });
  } catch (error) {
    return errorResponse(error);
  }
};
