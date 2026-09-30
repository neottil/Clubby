/**
 * Handler: /api/documenti — voci da registrare ed emissione delle ricevute.
 *
 * Tutto riservato all'admin, con **una sola eccezione**: il download di una
 * ricevuta, che spetta anche al socio intestatario. Serve alla colonna nei
 * suoi movimenti, che senza sarebbe un'icona che non apre niente.
 */

import {
  type RequestEvent,
  type ResponseResult,
  getAuthContext,
  requireAdmin,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from '../middleware/auth.js';
import { ok, created, errorResponse } from '../middleware/response.js';
import {
  listVoci,
  type RiferimentoVoce,
  type TipoVoce,
} from '../service/documenti/voci.service.js';
import {
  anteprimaDocumento,
  emettiDocumento,
  listDocumenti,
  getDocumentoConPdf,
} from '../service/documenti/documenti.service.js';
import { getSocioByViewerId } from '../service/soci.service.js';
import { corpoJson } from '../util/corpo.js';
import { intParam } from '../util/paginazione.js';

const TIPI_VOCE: TipoVoce[] = ['ricarica', 'tesseramento', 'incontro'];

/** Risposta con un PDF allegato: base64 in uscita, byte sul filo. */
function pdfResponse(pdf: Buffer, nomeFile: string): ResponseResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // `inline`: il browser lo apre nel visualizzatore invece di scaricarlo
      // di nascosto. Il download esplicito lo fa il frontend, che ha già il
      // blob e può dargli il nome che vuole.
      'Content-Disposition': `inline; filename="${nomeFile}"`,
    },
    body: pdf.toString('base64'),
    isBase64Encoded: true,
  };
}

/** Valida e normalizza `voci: [{tipo, id}]` dal corpo della richiesta. */
function leggiVoci(body: Record<string, unknown>): RiferimentoVoce[] {
  const voci = body.voci;
  if (!Array.isArray(voci) || voci.length === 0) {
    throw new BadRequestError('voci è obbligatorio e deve contenerne almeno una');
  }
  // Il controllo è puntuale perché la coppia (tipo, id) è ciò che identifica
  // una voce: un tipo sbagliato non punterebbe a niente, e la riga scritta
  // resterebbe invisibile invece di dare errore.
  const valide = voci.every((v: unknown) => {
    const voce = v as Partial<RiferimentoVoce>;
    return !!voce && typeof voce.id === 'string' && voce.id.length > 0
      && typeof voce.tipo === 'string' && TIPI_VOCE.includes(voce.tipo as TipoVoce);
  });
  if (!valide) {
    throw new BadRequestError(`ogni voce deve avere un id e un tipo fra ${TIPI_VOCE.join(', ')}`);
  }
  return voci as RiferimentoVoce[];
}

export const handler = async (
  event: RequestEvent
): Promise<ResponseResult> => {
  try {
    const auth = getAuthContext(event);
    const metodo = event.requestContext.http.method;
    const percorso = event.requestContext.http.path;
    const id = event.pathParameters?.id;

    // -----------------------------------------------------------
    // GET /api/documenti/:id — il PDF conservato
    //
    // L'UNICA rotta dell'area aperta oltre l'admin. Il controllo non è "sei un
    // socio" ma "sei IL socio": si confronta documento.socio_id con la scheda
    // di chi chiama. Un socio che prova l'id della ricevuta di un altro
    // riceve 403.
    // -----------------------------------------------------------
    if (metodo === 'GET' && id) {
      const { documento, pdf } = await getDocumentoConPdf(id);
      if (!auth.isAdmin) {
        const socio = await getSocioByViewerId(auth.userId);
        if (!socio || socio.id !== documento.socio_id) {
          throw new ForbiddenError('Questa ricevuta non è intestata a te');
        }
      }
      return pdfResponse(pdf, documento.nome_file);
    }

    // Da qui in giù è tutto riservato agli amministratori.
    requireAdmin(auth);

    // -----------------------------------------------------------
    // GET /api/documenti/voci — le voci ancora da documentare
    // -----------------------------------------------------------
    if (metodo === 'GET' && percorso.endsWith('/voci')) {
      const qs = event.queryStringParameters;
      const options = {
        socioId: qs?.socio_id,
        da: qs?.da,
        a: qs?.a,
        // Solo il valore esatto "1", come per gli altri interruttori di
        // elenco: un parametro scritto in altro modo non deve cambiare ciò
        // che si vede senza che nessuno l'abbia chiesto.
        includiEmesse: qs?.includi_emesse === '1',
        limit: intParam(qs?.limit),
        offset: intParam(qs?.offset),
      };
      const { rows, total, totaleImporto } = await listVoci(options);
      return ok({
        data: rows,
        total,
        totale_importo: totaleImporto,
        limit: options.limit ?? rows.length,
        offset: options.offset ?? 0,
      });
    }

    // -----------------------------------------------------------
    // POST /api/documenti/anteprima — genera il PDF senza scrivere niente
    // -----------------------------------------------------------
    if (metodo === 'POST' && percorso.endsWith('/anteprima')) {
      const body = corpoJson(event);
      if (typeof body.socio_id !== 'string' || !body.socio_id) {
        throw new BadRequestError('socio_id è obbligatorio');
      }
      const anteprima = await anteprimaDocumento({
        socioId: body.socio_id,
        causale: String(body.causale ?? ''),
        voci: leggiVoci(body),
      });
      // JSON e non il PDF grezzo: all'anteprima servono anche il numero
      // provvisorio e l'importo in lettere, che il frontend mostra accanto
      // al documento prima della conferma.
      return ok({
        pdf_base64: anteprima.pdf.toString('base64'),
        numero_provvisorio: anteprima.numeroProvvisorio,
        anno: anteprima.anno,
        importo: anteprima.importo,
        importo_lettere: anteprima.importoLettere,
        nome_file: anteprima.nomeFile,
      });
    }

    // -----------------------------------------------------------
    // GET /api/documenti — elenco delle ricevute emesse
    // -----------------------------------------------------------
    if (metodo === 'GET') {
      const qs = event.queryStringParameters;
      const options = {
        socioId: qs?.socio_id,
        da: qs?.da,
        a: qs?.a,
        limit: intParam(qs?.limit),
        offset: intParam(qs?.offset),
      };
      const { rows, total } = await listDocumenti(options);
      return ok({
        data: rows,
        total,
        limit: options.limit ?? rows.length,
        offset: options.offset ?? 0,
      });
    }

    // -----------------------------------------------------------
    // POST /api/documenti — emissione definitiva
    // -----------------------------------------------------------
    if (metodo === 'POST') {
      const body = corpoJson(event);
      if (typeof body.socio_id !== 'string' || !body.socio_id) {
        throw new BadRequestError('socio_id è obbligatorio');
      }
      const { documento, pdf } = await emettiDocumento(
        {
          socioId: body.socio_id,
          causale: String(body.causale ?? ''),
          voci: leggiVoci(body),
        },
        auth.userId
      );
      return created({
        id: documento.id,
        anno: documento.anno,
        numero: documento.numero,
        data_documento: documento.data_documento,
        importo: documento.importo,
        importo_lettere: documento.importo_lettere,
        nome_file: documento.nome_file,
        pdf_base64: pdf.toString('base64'),
      });
    }

    return errorResponse(new NotFoundError('Route non trovata'));
  } catch (error) {
    return errorResponse(error);
  }
};
