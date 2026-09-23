/**
 * Handler: GET /api/auth/socio
 * Ruoli: qualsiasi token valido
 *
 * Dice a chi chiama qual è la sua scheda socio, se ne ha una. Sola lettura:
 * non crea nulla e non collega nulla.
 *
 * Il collegamento fra account e socio è **sempre** un'operazione manuale di un
 * amministratore. C'è stato un aggancio automatico basato sull'email, ed è
 * stato tolto: l'indirizzo di un socio lo digita un admin e nessuno lo
 * verifica, quindi chi ne conoscesse uno poteva registrarsi con quello ed
 * ereditare voucher e incontri di un altro. E due schede che condividono un
 * indirizzo — due fratelli iscritti con l'email del genitore, tutt'altro che
 * raro — rendevano l'abbinamento un'ipotesi, non un fatto.
 *
 * Il frontend la usa per sapere se mostrare l'avviso "account non ancora
 * collegato".
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, noContent, errorResponse } from '../middleware/response.js';
import { getSocioByViewerId } from '../service/soci.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth = getAuthContext(event);

    if (event.requestContext.http.method !== 'GET') {
      return errorResponse(new NotFoundError('Route non trovata'));
    }

    const socio = await getSocioByViewerId(auth.userId);
    // 204 e non un errore: non avere ancora una scheda collegata è uno stato
    // normale, in attesa che un admin faccia l'abbinamento.
    return socio ? ok(socio) : noContent();
  } catch (error) {
    return errorResponse(error);
  }
};
