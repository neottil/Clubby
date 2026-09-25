/**
 * Handler: /api/voucher, /api/voucher/{id}/movimenti,
 *          /api/voucher/{id}/ultima-ricarica
 * Ruoli: admin (tutti), viewer (solo i propri vouchers)
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../middleware/auth.js';
import { ok, created, noContent, errorResponse } from '../middleware/response.js';
import { corpoJson } from '../util/corpo.js';
import {
  listVouchers,
  listVouchersPaginati,
  getVoucherById,
  createVoucher,
  listMovimenti,
  createMovimento,
  getUltimaRicarica,
} from '../service/vouchers.service.js';
import { getSocioByViewerId } from '../service/soci.service.js';
import { calcolaRicarica } from '../service/ricariche.service.js';
import { intParam, paginazioneRichiesta } from '../util/paginazione.js';
import { dataValida } from '../util/date.js';

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth    = getAuthContext(event);
    const method  = event.requestContext.http.method;
    const path    = event.requestContext.http.path;
    const voucherId = event.pathParameters?.id;

    // Socio associato a chi chiama: per il viewer è il confine di tutto ciò
    // che può vedere, per l'istruttore lo è dei soli movimenti (i saldi li
    // vede tutti, gli servono per sapere se un incontro è coperto).
    let viewerSocioId: string | null = null;
    if (!auth.isAdmin) {
      const socio = await getSocioByViewerId(auth.userId);
      viewerSocioId = socio?.id ?? null;
    }

    // Routing sulle sotto-risorse di un voucher
    const isMovimentiRoute = path.endsWith('/movimenti');
    const isUltimaRicaricaRoute = path.endsWith('/ultima-ricarica');

    // -----------------------------------------------------------
    // GET /api/voucher[?socio_id=...]
    // -----------------------------------------------------------
    if (method === 'GET' && !voucherId) {
      const qs = event.queryStringParameters;

      // Con limit/offset: elenco a pagine (tabella della pagina Voucher). Senza:
      // l'elenco completo, che serve per esempio a sapere quali soci hanno un
      // voucher quando si registra un incontro.
      if (paginazioneRichiesta(qs)) {
        const limit  = intParam(qs?.limit);
        const offset = intParam(qs?.offset);
        // Admin e istruttore vedono i voucher di tutti; un socio solo il
        // proprio, qualunque socio_id chieda.
        const vedeTutti = auth.isAdmin || auth.isIstruttore;
        if (!vedeTutti && !viewerSocioId) {
          return ok({ data: [], total: 0, limit: limit ?? 0, offset: offset ?? 0 });
        }
        const { rows, total } = await listVouchersPaginati({
          socioId: vedeTutti ? qs?.socio_id : viewerSocioId!,
          escludiSocioId: qs?.escludi_socio_id,
          q: qs?.q, sort: qs?.sort, dir: qs?.dir, limit, offset,
        });
        return ok({ data: rows, total, limit: limit ?? rows.length, offset: offset ?? 0 });
      }

      if (auth.isAdmin) {
        const socioId = event.queryStringParameters?.socio_id;
        return ok(await listVouchers(socioId));
      }
      if (auth.isIstruttore) {
        // I saldi di tutti i soci: registrando un incontro deve poter vedere
        // se il voucher lo copre. Sono importi, non dati personali.
        return ok(await listVouchers(event.queryStringParameters?.socio_id));
      }
      // Nessun socio associato al viewer → nessun dato (mai "tutti i vouchers")
      if (!viewerSocioId) return ok([]);
      return ok(await listVouchers(viewerSocioId));
    }

    // -----------------------------------------------------------
    // POST /api/voucher
    // -----------------------------------------------------------
    if (method === 'POST' && !voucherId) {
      requireAdmin(auth);
      const body = corpoJson(event);
      return created(await createVoucher(body));
    }

    // -----------------------------------------------------------
    // GET /api/voucher/{id}/movimenti
    // -----------------------------------------------------------
    if (method === 'GET' && voucherId && isMovimentiRoute) {
      const voucher = await getVoucherById(voucherId);
      // I movimenti sono lo storico contabile di un socio: li vedono l'admin e
      // l'interessato. Un istruttore si ferma al saldo.
      if (!auth.isAdmin && voucher.socio_id !== viewerSocioId) {
        throw new ForbiddenError();
      }
      const limit  = intParam(event.queryStringParameters?.limit);
      const offset = intParam(event.queryStringParameters?.offset);
      const { rows, total } = await listMovimenti(voucherId, { limit, offset });
      return ok({ data: rows, total, limit: limit ?? rows.length, offset: offset ?? 0 });
    }

    // -----------------------------------------------------------
    // GET /api/voucher/{id}/ultima-ricarica
    // -----------------------------------------------------------
    // Endpoint a sé perché è un dato che serve solo alla scheda del proprio
    // voucher: calcolarlo dentro gli elenchi significherebbe farlo per ogni
    // riga di ogni pagina senza che nessuno lo legga.
    if (method === 'GET' && voucherId && isUltimaRicaricaRoute) {
      const voucher = await getVoucherById(voucherId);
      // Stesso confine dei movimenti: è una riga dello storico contabile, non
      // un saldo. Un istruttore non la vede.
      if (!auth.isAdmin && voucher.socio_id !== viewerSocioId) {
        throw new ForbiddenError();
      }
      const ultima = await getUltimaRicarica(voucherId);
      // 204 e non null nel corpo: "nessuna ricarica" è uno stato normale di un
      // voucher appena creato, come per /api/auth/socio senza scheda.
      return ultima ? ok(ultima) : noContent();
    }

    // -----------------------------------------------------------
    // POST /api/voucher/{id}/movimenti
    // -----------------------------------------------------------
    if (method === 'POST' && voucherId && isMovimentiRoute) {
      requireAdmin(auth);
      const body = corpoJson(event);
      // Da qui si registrano solo ricariche. Gli addebiti nascono soltanto
      // dagli incontri (incontri.service), che ne tengono il riferimento e li
      // riallineano se l'incontro cambia: un addebito manuale sarebbe un
      // consumo di credito senza nulla che lo giustifichi. `tipo` è ancora
      // accettato, ma solo come 'ricarica', per non ignorare in silenzio chi
      // chiede altro.
      if (body.tipo !== undefined && body.tipo !== 'ricarica') {
        throw new BadRequestError('Si possono registrare solo ricariche: gli addebiti nascono dagli incontri');
      }
      // Data della ricarica: omessa = oggi. Controllata qui e non lasciata al
      // CAST del database, che per una data inesistente tornerebbe un 500.
      if (body.data_movimento !== undefined && body.data_movimento !== null && !dataValida(body.data_movimento)) {
        throw new BadRequestError('data_movimento deve essere una data valida nel formato YYYY-MM-DD');
      }
      // Quanto viene accreditato sul voucher lo decide il server a partire
      // dalla modalità dell'ambiente (RECHARGE_MODE) e dalla configurazione
      // salvata: dal client arriva solo quanto il socio paga. Se lo mandasse
      // lui, chi conosce l'API potrebbe accreditarsi il credito che preferisce.
      const { valore, importoPagato } = await calcolaRicarica(body.importo);

      // Whitelist esplicita: incontro_id è gestito solo internamente da
      // incontri.service, non deve poter essere impostato da qui.
      return created(await createMovimento(voucherId, {
        importo: valore,
        importo_pagato: importoPagato,
        descrizione: body.descrizione,
        tipo: 'ricarica',
        data_movimento: body.data_movimento ?? undefined,
      }));
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
