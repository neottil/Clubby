/**
 * Handler: GET /api/version
 * Ruoli: qualsiasi JWT valido
 *
 * Espone la versione del backend attualmente in esecuzione. APP_VERSION è
 * popolata nel ConfigMap (backend/k8s/configmap.yaml) dal workflow di deploy
 * con il TAG DELL'IMMAGINE effettivamente deployata (tag di data, es.
 * "main-20260728_1553", da Build & Deploy; versione reale "X.Y.Z" da Promote).
 *
 * È un endpoint e non una variabile compilata nel bundle del frontend proprio
 * perché backend e frontend si deployano in modo indipendente: solo chiedendola
 * a runtime al backend la pagina Info mostra la versione di ciò che sta
 * davvero girando, e non quella nota all'ultima build del frontend.
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
