/**
 * Handler: /api/admin/*
 * Ruoli: solo admin
 *
 * Gli endpoint che riguardano gli account (elenco, ruoli, reset password)
 * sono inoltrati all'authorizer riportandone il token del chiamante; quelli
 * sull'associazione utente ↔ socio lavorano sul database applicativo.
 */

import { type RequestEvent, type ResponseResult, getAuthContext, requireAdmin, UnauthorizedError } from '../middleware/auth.js';
import { ok, noContent, errorResponse } from '../middleware/response.js';
import {
  listaUtenti,
  promuoviAdmin,
  retrocediAdmin,
  resetPasswordUtente,
  associaViewerASocio,
  disassociaViewerDaSocio,
} from '../service/admin.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth   = getAuthContext(event);
    requireAdmin(auth); // tutte le route admin richiedono ruolo admin

    const method  = event.requestContext.http.method;
    const path    = event.requestContext.http.path;
    const socioId = event.pathParameters?.socioId;

    // Il token grezzo serve per inoltrare le richieste all'authorizer a nome
    // dell'admin che ha chiamato. Il server lo ha già verificato prima di
    // arrivare qui: questo controllo copre solo il caso di un header perso.
    const tokenChiamante = event.headers?.authorization ?? event.headers?.Authorization;
    if (!tokenChiamante) throw new UnauthorizedError('Token mancante');

    // -----------------------------------------------------------
    // GET /api/admin/users — utenti registrati (dall'authorizer)
    // -----------------------------------------------------------
    if (method === 'GET' && path.endsWith('/users')) {
      return ok(await listaUtenti(tokenChiamante));
    }

    // -----------------------------------------------------------
    // POST /api/admin/associa-viewer   Body: { socio_id, utente_id }
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/associa-viewer')) {
      const body = JSON.parse(event.body ?? '{}');
      await associaViewerASocio(body.socio_id, body.utente_id, tokenChiamante);
      return ok({ message: 'Utente associato al socio' });
    }

    // -----------------------------------------------------------
    // DELETE /api/admin/associa-viewer/{socioId}
    // -----------------------------------------------------------
    if (method === 'DELETE' && socioId) {
      await disassociaViewerDaSocio(socioId);
      return noContent();
    }

    // -----------------------------------------------------------
    // POST /api/admin/promuovi   Body: { utente_id }
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/promuovi')) {
      const body = JSON.parse(event.body ?? '{}');
      await promuoviAdmin(body.utente_id, tokenChiamante);
      return ok({ message: 'Utente promosso ad admin' });
    }

    // -----------------------------------------------------------
    // POST /api/admin/retrocedi   Body: { utente_id }
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/retrocedi')) {
      const body = JSON.parse(event.body ?? '{}');
      await retrocediAdmin(body.utente_id, tokenChiamante);
      return ok({ message: 'Utente retrocesso a viewer' });
    }

    // -----------------------------------------------------------
    // POST /api/admin/reset-password   Body: { utente_id }
    // Restituisce la password temporanea generata: va consegnata
    // all'interessato: non viene inviata per email e non è più recuperabile.
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/reset-password')) {
      const body = JSON.parse(event.body ?? '{}');
      return ok(await resetPasswordUtente(body.utente_id, tokenChiamante));
    }

    return errorResponse({ statusCode: 404, message: 'Route non trovata' });
  } catch (error) {
    return errorResponse(error);
  }
};
