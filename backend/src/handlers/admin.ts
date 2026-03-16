/**
 * Lambda handler: /api/admin/*
 * Ruoli: solo admin
 */

import { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { getAuthContext, requireAdmin } from '../middleware/auth.js';
import { ok, noContent, errorResponse } from '../middleware/response.js';
import {
  listCognitoUsers,
  promuoviAdmin,
  associaViewerASocio,
  disassociaViewerDaSocio,
} from '../service/admin.service.js';

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const auth   = getAuthContext(event);
    requireAdmin(auth); // tutte le route admin richiedono ruolo admin

    const method  = event.requestContext.http.method;
    const path    = event.requestContext.http.path;
    const socioId = event.pathParameters?.socioId;

    // -----------------------------------------------------------
    // GET /api/admin/users  - Lista utenti Cognito
    // -----------------------------------------------------------
    if (method === 'GET' && path.endsWith('/users')) {
      const users = await listCognitoUsers();
      return ok(users);
    }

    // -----------------------------------------------------------
    // POST /api/admin/associa-viewer
    // Body: { socio_id, cognito_username }
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/associa-viewer')) {
      const body = JSON.parse(event.body ?? '{}');
      await associaViewerASocio(body.socio_id, body.cognito_username);
      return ok({ message: 'Viewer associato con successo' });
    }

    // -----------------------------------------------------------
    // DELETE /api/admin/associa-viewer/{socioId}
    // -----------------------------------------------------------
    if (method === 'DELETE' && socioId) {
      await disassociaViewerDaSocio(socioId);
      return noContent();
    }

    // -----------------------------------------------------------
    // POST /api/admin/promuovi
    // Body: { cognito_username }
    // -----------------------------------------------------------
    if (method === 'POST' && path.endsWith('/promuovi')) {
      const body = JSON.parse(event.body ?? '{}');
      await promuoviAdmin(body.cognito_username);
      return ok({ message: `Utente ${body.cognito_username} promosso ad admin` });
    }

    return errorResponse({ statusCode: 404, message: 'Route non trovata' });
  } catch (error) {
    return errorResponse(error);
  }
};
