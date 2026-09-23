/**
 * Handler: /api/incontri e /api/incontri/{id}
 *
 * Permessi (ruolo nel club e privilegio admin sono indipendenti):
 *   admin       tutti gli incontri, senza restrizioni
 *   istruttore  come socio, gli incontri a cui ha partecipato (sola lettura);
 *               con ?ambito=istruttore, quelli che ha tenuto, che registra e
 *               modifica nelle sole attività a cui è abilitato
 *   socio       solo gli incontri a cui ha partecipato, in sola lettura
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  ForbiddenError,
  BadRequestError,
  type AuthContext,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, created, noContent, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import {
  listIncontri,
  getIncontroById,
  createIncontro,
  updateIncontro,
  deleteIncontro,
  type Incontro,
  type ListIncontriOptions,
} from '../service/incontri.service.js';
import { verificaAbilitazione } from '../service/attivita.service.js';
import { getSocioByViewerId } from '../service/soci.service.js';
import { intParam } from '../util/paginazione.js';

/**
 * Opzioni di elenco lette dalla query string. `socio_id` non viene preso da
 * qui: lo decide il chiamante in base al ruolo (un viewer non deve poter
 * chiedere gli incontri di un altro socio passando un socio_id a mano).
 */
function listOptionsFromQuery(qs: Record<string, string> | undefined): ListIncontriOptions {
  return {
    q:          qs?.q,
    attivitaId: qs?.attivita_id,
    da:         qs?.da,
    a:          qs?.a,
    sort:       qs?.sort,
    dir:        qs?.dir === 'asc' ? 'asc' : 'desc',
    limit:      intParam(qs?.limit),
    offset:     intParam(qs?.offset),
  };
}

/**
 * Un istruttore può intervenire solo sugli incontri che ha tenuto lui. Gli
 * incontri in cui compare come socio li vede (è il senso di "che lo
 * riguardano") ma non li modifica: quelli restano di chi li ha registrati.
 */
function richiediProprietaIstruttore(auth: AuthContext, incontro: Incontro): void {
  if (incontro.istruttore_id !== auth.userId) {
    throw new ForbiddenError('Puoi modificare solo gli incontri che hai tenuto');
  }
}

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth       = getAuthContext(event);
    const method     = event.requestContext.http.method;
    const incontroId = event.pathParameters?.id;
    const path       = event.requestContext.http.path;

    // Socio associato a chi chiama: delimita ciò che vede chi non è admin, ed è
    // il criterio degli incontri "a cui ha partecipato".
    const socio = await getSocioByViewerId(auth.userId);
    const socioProprio: string | null = socio?.id ?? null;

    // -----------------------------------------------------------
    // GET /api/incontri[?ambito=&socio_id=&istruttore_id=&q=&attivita_id=&da=&a=&sort=&dir=&limit=&offset=]
    // Risposta paginata: { data, total, totale_costo, limit, offset }
    //
    // `ambito` separa i due modi in cui un account compare in un incontro:
    //   socio       gli incontri a cui ha partecipato (pagina Incontri)
    //   istruttore  gli incontri che ha tenuto (pagina Resoconto)
    // Senza ambito, un admin riceve tutti gli incontri (vista di gestione) e
    // gli altri quelli come socio. Per chi non è admin il filtro è imposto qui
    // e mai preso da socio_id o istruttore_id della query string: altrimenti
    // basterebbe cambiarli a mano per leggere gli incontri di qualcun altro.
    // -----------------------------------------------------------
    if (method === 'GET' && !incontroId) {
      const options = listOptionsFromQuery(event.queryStringParameters);
      const ambito  = event.queryStringParameters?.ambito;
      const vuoto   = { data: [], total: 0, totale_costo: 0, limit: 0, offset: 0 };

      if (ambito === 'istruttore') {
        // Chi non è istruttore non tiene incontri: niente da restituire,
        // invece di ripiegare su un altro ambito.
        if (!auth.isIstruttore) return ok(vuoto);
        options.istruttoreId = auth.userId;
      } else if (auth.isAdmin && ambito !== 'socio') {
        options.socioId      = event.queryStringParameters?.socio_id;
        options.istruttoreId = event.queryStringParameters?.istruttore_id;
      } else {
        // Nessun socio associato → nessun dato (mai "tutti gli incontri").
        if (!socioProprio) return ok(vuoto);
        options.socioId = socioProprio;
      }

      const { rows, total, totaleCosto } = await listIncontri(options);
      return ok({
        data: rows,
        total,
        totale_costo: totaleCosto,
        limit: options.limit ?? rows.length,
        offset: options.offset ?? 0,
      });
    }

    // -----------------------------------------------------------
    // GET /api/incontri/{id}
    // -----------------------------------------------------------
    if (method === 'GET' && incontroId) {
      const incontro = await getIncontroById(incontroId);
      const puoVedere =
        auth.isAdmin ||
        (socioProprio !== null && incontro.socio_id === socioProprio) ||
        (auth.isIstruttore && incontro.istruttore_id === auth.userId);
      if (!puoVedere) throw new ForbiddenError();
      return ok(incontro);
    }

    // -----------------------------------------------------------
    // POST /api/incontri
    // -----------------------------------------------------------
    if (method === 'POST' && !incontroId) {
      if (!auth.isAdmin && !auth.isIstruttore) throw new ForbiddenError();
      const body = corpoJson(event);

      if (!auth.isAdmin) {
        // Un istruttore registra per sé: l'istruttore è chi scrive, non chi
        // dice il corpo della richiesta, altrimenti si potrebbero attribuire
        // incontri a un collega.
        body.istruttore_id = auth.userId;
        if (!body.attivita_id) throw new BadRequestError('attivita_id è obbligatoria');
        await verificaAbilitazione(auth.userId, body.attivita_id);
      }

      return created(await createIncontro(body));
    }

    // -----------------------------------------------------------
    // PUT /api/incontri/{id}
    // -----------------------------------------------------------
    if (method === 'PUT' && incontroId) {
      if (!auth.isAdmin && !auth.isIstruttore) throw new ForbiddenError();
      const body = corpoJson(event);

      if (!auth.isAdmin) {
        richiediProprietaIstruttore(auth, await getIncontroById(incontroId));
        // L'attribuzione non è cedibile: un istruttore che potesse riscrivere
        // istruttore_id si toglierebbe dalle mani un incontro (o lo
        // affibbierebbe a un altro) senza che nessun admin lo decida.
        delete body.istruttore_id;
        if (body.attivita_id) await verificaAbilitazione(auth.userId, body.attivita_id);
      }

      return ok(await updateIncontro(incontroId, body));
    }

    // -----------------------------------------------------------
    // DELETE /api/incontri/{id}
    // -----------------------------------------------------------
    if (method === 'DELETE' && incontroId) {
      if (!auth.isAdmin) {
        if (!auth.isIstruttore) throw new ForbiddenError();
        richiediProprietaIstruttore(auth, await getIncontroById(incontroId));
      }
      await deleteIncontro(incontroId);
      return noContent();
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
