/**
 * Handler: /api/admin/*
 * Ruoli: solo admin
 *
 * Gli endpoint che riguardano gli account (elenco, ruoli, reset password)
 * sono inoltrati all'authorizer riportandone il token del chiamante; quelli
 * sull'associazione utente ↔ socio lavorano sul database applicativo.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  UnauthorizedError,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, noContent, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import { intParam, paginazioneRichiesta } from '../util/paginazione.js';
import {
  listaUtenti,
  listaUtentiPaginata,
  impostaRuolo,
  impostaAdmin,
  cambiaAttivoUtente,
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
      const qs = event.queryStringParameters;
      // Con limit/offset: pagina della card Utenti - Soci, con il numero di
      // account da collegare. Senza: l'elenco completo.
      if (paginazioneRichiesta(qs)) {
        const limit  = intParam(qs?.limit);
        const offset = intParam(qs?.offset);
        const { rows, total, da_collegare } = await listaUtentiPaginata(tokenChiamante, { q: qs?.q, limit, offset });
        return ok({ data: rows, total, da_collegare, limit: limit ?? rows.length, offset: offset ?? 0 });
      }
      return ok(await listaUtenti(tokenChiamante));
    }

    // -----------------------------------------------------------
    // POST /api/admin/associa-viewer   Body: { socio_id, utente_id }
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/associa-viewer')) {
      const body = corpoJson(event);
      await associaViewerASocio(body.socio_id, body.utente_id, tokenChiamante);
      return ok({ message: 'Utente associato al socio' });
    }

    // -----------------------------------------------------------
    // DELETE /api/admin/associa-viewer/{socioId}
    // Solo scollegamento: lo stato dell'account non viene toccato.
    // -----------------------------------------------------------
    if (method === 'DELETE' && socioId) {
      await disassociaViewerDaSocio(socioId);
      return noContent();
    }

    // -----------------------------------------------------------
    // POST /api/admin/attivo   Body: { utente_id, attivo }
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/attivo')) {
      const body = corpoJson(event);
      await cambiaAttivoUtente(body.utente_id, body.attivo === true, tokenChiamante);
      return ok({ message: body.attivo === true ? 'Account riattivato' : 'Account disattivato' });
    }

    // -----------------------------------------------------------
    // POST /api/admin/amministratore   Body: { utente_id, admin }
    // Concede o toglie il privilegio di amministrare l'app, indipendente dal
    // ruolo nel club.
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/amministratore')) {
      const body = corpoJson(event);
      await impostaAdmin(body.utente_id, body.admin === true, tokenChiamante);
      return ok({ message: body.admin === true ? 'Privilegio di amministratore concesso' : 'Privilegio di amministratore rimosso' });
    }

    // -----------------------------------------------------------
    // POST /api/admin/ruolo   Body: { utente_id, ruolo }
    // Assegna il ruolo nel club: socio o istruttore. Il privilegio di
    // amministrazione e indipendente e si cambia con /amministratore.
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/ruolo')) {
      const body = corpoJson(event);
      await impostaRuolo(body.utente_id, body.ruolo, tokenChiamante);
      return ok({ message: `Ruolo impostato a ${body.ruolo}` });
    }

    // -----------------------------------------------------------
    // POST /api/admin/reset-password   Body: { utente_id }
    // Restituisce la password temporanea generata: va consegnata
    // all'interessato: non viene inviata per email e non è più recuperabile.
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/reset-password')) {
      const body = corpoJson(event);
      return ok(await resetPasswordUtente(body.utente_id, tokenChiamante));
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
