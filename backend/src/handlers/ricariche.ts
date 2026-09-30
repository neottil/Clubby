/**
 * Handler: /api/ricarica-tagli — solo admin.
 *
 * I tagli preconfigurati usati quando RECHARGE_MODE vale "map": ogni riga dice
 * quanto paga il socio e quanto gli viene accreditato sul voucher.
 *
 * Le route esistono in tutte le modalità, anche in "free": la tabella c'è
 * comunque (il database è uno solo per tutti gli ambienti) e la pagina Impostazioni
 * mostra la card Ricariche sempre, spiegando come attivarla. Nasconderle
 * renderebbe la configurazione impossibile da preparare prima di accendere la
 * modalità.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, created, noContent, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import { listTagli, creaTaglio, eliminaTaglio } from '../service/ricariche.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth = getAuthContext(event);
    requireAdmin(auth);

    const method = event.requestContext.http.method;
    const id     = event.pathParameters?.id;

    // GET /api/ricarica-tagli
    if (method === 'GET' && !id) {
      return ok(await listTagli());
    }

    // POST /api/ricarica-tagli   Body: { importo, valore }
    if (method === 'POST' && !id) {
      const body = corpoJson(event);
      return created(await creaTaglio({ importo: body.importo, valore: body.valore }));
    }

    // DELETE /api/ricarica-tagli/{id}
    // I movimenti già registrati non cambiano: hanno il proprio valore scritto
    // sulla riga, non un riferimento al taglio.
    if (method === 'DELETE' && id) {
      await eliminaTaglio(id);
      return noContent();
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
