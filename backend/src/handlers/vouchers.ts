/**
 * Handler: /api/voucher, /api/voucher/{id}/movimenti
 * Ruoli: admin (tutti), viewer (solo i propri vouchers)
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
  listVouchers,
  getVoucherById,
  createVoucher,
  listMovimenti,
  createMovimento,
} from '../service/vouchers.service.js';
import { getSocioByViewerId } from '../service/soci.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth    = getAuthContext(event);
    const method  = event.requestContext.http.method;
    const path    = event.requestContext.http.path;
    const voucherId = event.pathParameters?.id;

    // Viewer: recupera il proprio socio
    let viewerSocioId: string | null = null;
    if (auth.role === 'viewer') {
      const socio = await getSocioByViewerId(auth.userId);
      viewerSocioId = socio?.id ?? null;
    }

    // Routing su /movimenti
    const isMovimentiRoute = path.endsWith('/movimenti');

    // -----------------------------------------------------------
    // GET /api/voucher[?socio_id=...]
    // -----------------------------------------------------------
    if (method === 'GET' && !voucherId) {
      if (auth.role === 'admin') {
        const socioId = event.queryStringParameters?.socio_id;
        return ok(await listVouchers(socioId));
      } else {
        // Nessun socio associato al viewer → nessun dato (mai "tutti i vouchers")
        if (!viewerSocioId) return ok([]);
        return ok(await listVouchers(viewerSocioId));
      }
    }

    // -----------------------------------------------------------
    // POST /api/voucher
    // -----------------------------------------------------------
    if (method === 'POST' && !voucherId) {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
      return created(await createVoucher(body));
    }

    // -----------------------------------------------------------
    // GET /api/voucher/{id}/movimenti
    // -----------------------------------------------------------
    if (method === 'GET' && voucherId && isMovimentiRoute) {
      const voucher = await getVoucherById(voucherId);
      if (auth.role === 'viewer' && voucher.socio_id !== viewerSocioId) {
        throw new ForbiddenError();
      }
      return ok(await listMovimenti(voucherId));
    }

    // -----------------------------------------------------------
    // POST /api/voucher/{id}/movimenti
    // -----------------------------------------------------------
    if (method === 'POST' && voucherId && isMovimentiRoute) {
      requireAdmin(auth);
      const body = JSON.parse(event.body ?? '{}');
      // Whitelist esplicita: incontro_id è gestito solo internamente da
      // incontri.service (movimento generato automaticamente), non deve
      // poter essere impostato tramite questo endpoint pubblico.
      return created(await createMovimento(voucherId, {
        importo: body.importo,
        descrizione: body.descrizione,
      }));
    }

    return errorResponse({ statusCode: 404, message: 'Route non trovata' });
  } catch (error) {
    return errorResponse(error);
  }
};
