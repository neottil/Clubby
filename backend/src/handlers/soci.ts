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
} from '../middleware/auth.js';
import { ok, created, noContent, errorResponse } from '../middleware/response.js';
import {
  listSoci,
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
      if (auth.role === 'admin') {
        // Admin: restituisce tutti i soci
        const soci = await listSoci();
        return ok(soci);
      } else {
        // Viewer: restituisce solo il proprio socio
        const socio = await getSocioByViewerId(auth.userId);
        return ok(socio ? [socio] : []);
      }
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
    if (method === 'POST') {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
      const socio = await createSocio(body);
      return created(socio);
    }

    // -----------------------------------------------------------
    // PUT /api/soci/{id}
    // -----------------------------------------------------------
    if (method === 'PUT' && socioId) {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
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

    return errorResponse({ statusCode: 404, message: 'Route non trovata' });
  } catch (error) {
    return errorResponse(error);
  }
};
