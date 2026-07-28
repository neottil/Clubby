/**
 * Handler: GET /api/version
 * Ruoli: qualsiasi JWT valido
 *
 * Espone la versione del backend attualmente in esecuzione. APP_VERSION è
 * popolata nel ConfigMap (backend/k8s/configmap.yaml) dal workflow Build &
 * Deploy, a partire da backend/package.json — non hardcodata nell'immagine.
 */

import { type RequestEvent, type ResponseResult } from '../middleware/auth.js';
import { ok, errorResponse } from '../middleware/response.js';

export const handler = async (_event: RequestEvent): Promise<ResponseResult> => {
  try {
    return ok({ version: process.env.APP_VERSION ?? 'dev' });
  } catch (error) {
    return errorResponse(error);
  }
};
