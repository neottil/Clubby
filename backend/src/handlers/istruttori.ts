/**
 * Handler: /api/istruttori e /api/istruttori/{id}/attivita
 *
 * L'elenco è leggibile da chiunque sia autenticato: l'elenco incontri mostra
 * chi ha tenuto ogni incontro, e senza i nomi resterebbero degli identificativi
 * illeggibili. Contiene solo id, nome e cognome.
 *
 * Le abilitazioni (quali attività ciascuno può svolgere) sono invece
 * modificabili solo da un admin: decidono che cosa un istruttore può
 * registrare.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import { listaIstruttori } from '../service/authorizer.client.js';
import { sociPerAccount } from '../service/soci.service.js';
import {
  abilitazioniDi,
  tutteLeAbilitazioni,
  impostaAbilitazioni,
} from '../service/attivita.service.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth   = getAuthContext(event);
    const method = event.requestContext.http.method;
    const path   = event.requestContext.http.path;
    const istruttoreId = event.pathParameters?.id;

    // Il token grezzo serve a interrogare l'authorizer a nome del chiamante.
    // Il server lo ha già verificato: questo controllo copre solo il caso di
    // un header perso lungo la catena.
    const tokenChiamante = event.headers?.authorization ?? event.headers?.Authorization;
    if (!tokenChiamante) throw new UnauthorizedError('Token mancante');

    // -----------------------------------------------------------
    // GET /api/istruttori
    // Per l'admin ogni istruttore porta con sé le proprie abilitazioni: il
    // pannello le mostra tutte insieme, e chiederle una per istruttore
    // significherebbe una richiesta per riga.
    // -----------------------------------------------------------
    if (method === 'GET' && !istruttoreId) {
      // L'authorizer sa quali account sono istruttori, ma non come si chiamano:
      // il nominativo sta sulla riga del socio, qui. Un istruttore non ancora
      // collegato a un socio resta senza nome, e l'interfaccia lo indica con la
      // sua email.
      const [account, sociCollegati] = await Promise.all([
        listaIstruttori(tokenChiamante),
        sociPerAccount(),
      ]);

      const istruttori = account.map(a => {
        const socio = sociCollegati.get(a.id);
        return {
          id: a.id,
          email: a.email,
          nome: socio?.nome ?? null,
          cognome: socio?.cognome ?? null,
        };
      });

      if (!auth.isAdmin) return ok(istruttori);

      const abilitazioni = await tutteLeAbilitazioni();
      return ok(istruttori.map(i => ({ ...i, attivita_ids: abilitazioni[i.id] ?? [] })));
    }

    // -----------------------------------------------------------
    // GET /api/istruttori/{id}/attivita
    // -----------------------------------------------------------
    if (method === 'GET' && istruttoreId && path.endsWith('/attivita')) {
      requireAdmin(auth);
      return ok({ attivita_ids: await abilitazioniDi(istruttoreId) });
    }

    // -----------------------------------------------------------
    // PUT /api/istruttori/{id}/attivita   Body: { attivita_ids: [...] }
    // Sostituisce l'intero insieme: il pannello invia lo stato completo delle
    // caselle, non le singole differenze.
    // -----------------------------------------------------------
    if (method === 'PUT' && istruttoreId && path.endsWith('/attivita')) {
      requireAdmin(auth);
      const body = corpoJson(event);
      if (!Array.isArray(body.attivita_ids)) {
        throw new BadRequestError('attivita_ids deve essere un elenco di id');
      }
      const ids = await impostaAbilitazioni(istruttoreId, body.attivita_ids.map(String));
      return ok({ attivita_ids: ids });
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
