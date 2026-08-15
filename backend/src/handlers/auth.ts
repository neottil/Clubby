/**
 * Handler: POST /api/auth/register
 * Ruoli: qualsiasi JWT valido (registrazione autonoma post-login)
 *
 * Dopo la registrazione o il primo accesso sull'authorizer, il frontend
 * chiama questo endpoint per creare il record socio corrispondente e legarlo
 * all'account (socio.id_viewer = `sub` del token).
 *
 * Il ruolo non viene toccato qui: gli account nascono già come viewer
 * nell'authorizer, che è l'unico proprietario dei ruoli.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  BadRequestError,
} from '../middleware/auth.js';
import { ok, created, errorResponse } from '../middleware/response.js';
import { getSocioByViewerId, createSocio } from '../service/soci.service.js';
import { associaViewer } from '../service/soci.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth = getAuthContext(event);
    const method = event.requestContext.http.method;

    // Solo POST è supportato
    if (method !== 'POST') {
      return errorResponse({ statusCode: 404, message: 'Route non trovata' });
    }

    // Controlla se esiste già un socio associato a questo utente (idempotente)
    const existing = await getSocioByViewerId(auth.userId);
    if (existing) {
      return ok(existing);
    }

    // Parsing body
    const body = JSON.parse(event.body ?? '{}');
    if (!body.nome?.trim() || !body.cognome?.trim()) {
      throw new BadRequestError('nome e cognome sono obbligatori');
    }

    const email = body.email?.trim() || auth.email || null;

    // 1. Crea il record socio nel DB
    const socio = await createSocio({
      nome: body.nome.trim(),
      cognome: body.cognome.trim(),
      email,
      telefono: body.telefono?.trim() || undefined,
    });

    // 2. Lega il socio all'account (imposta id_viewer col `sub` del token)
    const socioConViewer = await associaViewer(socio.id, auth.userId);

    return created(socioConViewer);
  } catch (error) {
    return errorResponse(error);
  }
};
