/**
 * Handler: POST /api/auth/register
 * Ruoli: qualsiasi JWT valido (registrazione autonoma post-login)
 *
 * Dopo il primo login PKCE su Keycloak, il frontend chiama questo endpoint
 * per creare il record socio nel DB e assegnare il ruolo 'viewer'.
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
import { assegnaRuoloViewer } from '../service/admin.service.js';

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
    });

    // 2. Associa il viewer al socio (imposta id_viewer)
    const socioConViewer = await associaViewer(socio.id, auth.userId);

    // 3. Assegna ruolo 'viewer' in Keycloak
    await assegnaRuoloViewer(auth.userId);

    return created(socioConViewer);
  } catch (error) {
    return errorResponse(error);
  }
};
