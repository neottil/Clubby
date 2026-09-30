/**
 * Emissione e lettura delle ricevute.
 *
 * Questo file è l'unico dell'area che parla con il database **e** con il
 * generatore: numerazione, PDF e legame con le voci stanno in una transazione
 * sola, e o riescono tutti o non succede niente. È il motivo per cui l'area
 * non è un servizio a sé — spezzandola, quella garanzia andrebbe ricostruita
 * a mano proprio sulla parte che non può sbagliare.
 *
 * Non esistono bozze. Il numero si assegna alla **conferma**, non
 * all'anteprima: senza numeri prenotati non ci sono documenti a metà da
 * raccogliere, e la domanda "che fine fanno le bozze abbandonate" non si pone.
 */

import { query, withTransaction, type QueryFn } from '../../db/client.js';
import { limiteEOffset } from '../../util/paginazione.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../middleware/auth.js';
import { getSocioById } from '../soci.service.js';
import { leggiImpostazioni } from '../impostazioni.service.js';
import { vociPerDocumento, segnaVociEmesse, type RiferimentoVoce } from './voci.service.js';
import { prossimoNumero, numeroProvvisorio } from './numerazione.js';
import { generaDocumentoPdf, type DatiDocumento, type RigaDocumento } from './pdf.js';
import { percorsoLogo } from './logo.js';
import { importoInLettere } from './lettere.js';

/** Riga dell'elenco: tutto tranne i byte, che pesano e non servono a una lista. */
export interface Documento {
  id: string;
  anno: number;
  numero: number;
  data_documento: string;
  socio_id: string;
  intestatario: string;
  causale: string;
  importo: number;
  importo_lettere: string;
  nome_file: string;
  emesso_da: string | null;
  created_at: string;
}

export interface EmissioneInput {
  socioId: string;
  causale: string;
  voci: RiferimentoVoce[];
}

export interface AnteprimaDocumento {
  pdf: Buffer;
  numeroProvvisorio: number;
  anno: number;
  importo: number;
  importoLettere: string;
  nomeFile: string;
}

/** Massimo di voci in un documento: oltre, la selezione è quasi certo un errore. */
const MAX_VOCI = 200;

/**
 * Nome del file scaricato: anno prima del numero, così i file di un club
 * ordinati per nome escono nell'ordine in cui sono stati emessi. Solo cifre e
 * underscore, niente intestatario: il nome finisce sul disco di chi scarica, e
 * non c'è motivo di portarci dentro il nome di una persona.
 */
function nomeFile(numero: number, anno: number): string {
  return `ricevuta_${anno}_${numero}.pdf`;
}

/** Oggi in "YYYY-MM-DD" ora locale: la data del documento è sempre oggi. */
function oggi(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const gg = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${gg}`;
}

/**
 * Raccoglie tutto ciò che serve al PDF, ricalcolando gli importi dal database.
 *
 * Condivisa fra anteprima ed emissione, così i due documenti non possono
 * divergere per una svista: l'unica differenza fra ciò che si vede e ciò che
 * si conferma è il numero.
 */
async function preparaDati(
  input: EmissioneInput,
  numero: number,
  q: QueryFn
): Promise<{ dati: DatiDocumento; importo: number; vociValide: number }> {
  const causale = input.causale?.trim();
  if (!causale) throw new BadRequestError('La causale è obbligatoria');
  if (!Array.isArray(input.voci) || input.voci.length === 0) {
    throw new BadRequestError('Seleziona almeno una voce da documentare');
  }
  if (input.voci.length > MAX_VOCI) {
    throw new BadRequestError(`Non si possono documentare più di ${MAX_VOCI} voci in una ricevuta`);
  }

  const socio = await getSocioById(input.socioId);
  const voci = await vociPerDocumento(input.socioId, input.voci, q);
  if (voci.length === 0) {
    throw new ConflictError('Nessuna delle voci selezionate è ancora da registrare');
  }

  const impostazioni = await leggiImpostazioni();
  const intestatario = `${socio.nome} ${socio.cognome}`.trim();
  const data = oggi();
  const anno = Number(data.slice(0, 4));

  const righe: RigaDocumento[] = voci.map(v => ({
    data: String(v.data).slice(0, 10),
    descrizione: v.descrizione,
    importo: Number(v.importo),
  }));
  // Arrotondato al centesimo: la somma di più NUMERIC letti come float
  // potrebbe altrimenti dare 160.00000000000003, che finirebbe in lettere.
  const importo = Math.round(righe.reduce((t, r) => t + r.importo, 0) * 100) / 100;

  return {
    importo,
    vociValide: voci.length,
    dati: {
      numero,
      anno,
      data,
      intestatario,
      causale,
      importo,
      importoLettere: importoInLettere(importo),
      righe,
      intestazione: impostazioni.ricevuta_intestazione,
      piePagina: impostazioni.ricevuta_pie_pagina,
      logo: percorsoLogo(),
    },
  };
}

/**
 * Genera il PDF che l'admin vede prima di confermare. **Non scrive niente.**
 *
 * Il numero mostrato è provvisorio: fra l'anteprima e la conferma un altro
 * admin può emettere. Per questo il documento definitivo viene rigenerato, e
 * non si conservano questi byte.
 */
export async function anteprimaDocumento(input: EmissioneInput): Promise<AnteprimaDocumento> {
  const anno = Number(oggi().slice(0, 4));
  const numero = await numeroProvvisorio(anno, query);
  const { dati, importo } = await preparaDati(input, numero, query);

  return {
    pdf: await generaDocumentoPdf(dati),
    numeroProvvisorio: numero,
    anno: dati.anno,
    importo,
    importoLettere: dati.importoLettere,
    nomeFile: nomeFile(numero, dati.anno),
  };
}

/**
 * Emette il documento: numero definitivo, PDF, riga e legame con le voci, in
 * un'unica transazione.
 *
 * Il PDF si genera **dentro** la transazione perché contiene il numero. Le
 * emissioni simultanee si mettono quindi in fila per qualche decina di
 * millisecondi sul lock del contatore: con qualche ricevuta al giorno non è
 * misurabile, e in cambio la numerazione è corretta per costruzione.
 */
export async function emettiDocumento(
  input: EmissioneInput,
  emessoDa: string
): Promise<{ documento: Documento; pdf: Buffer }> {
  return withTransaction(async q => {
    const anno = Number(oggi().slice(0, 4));
    const numero = await prossimoNumero(anno, q);
    const { dati, importo, vociValide } = await preparaDati(input, numero, q);

    // Se fra l'anteprima e la conferma qualcuno ha registrato una delle voci,
    // l'importo non è più quello visto a schermo: si annulla tutto e si
    // chiede di rifare la selezione, invece di emettere un documento diverso
    // da quello approvato.
    if (vociValide !== input.voci.length) {
      throw new ConflictError(
        'Alcune delle voci selezionate sono già finite in una ricevuta nel frattempo. Ricarica l\'elenco e rifai la selezione.'
      );
    }

    const pdf = await generaDocumentoPdf(dati);
    const file = nomeFile(numero, anno);

    const inserito = await q(
      `INSERT INTO documento
         (anno, numero, data_documento, socio_id, intestatario, causale,
          importo, importo_lettere, nome_file, contenuto, emesso_da)
       VALUES
         (:anno, :numero, CAST(:data AS DATE), :socioId, :intestatario, :causale,
          :importo, :importoLettere, :nomeFile, :contenuto, :emessoDa)
       RETURNING id, anno, numero, data_documento, socio_id, intestatario,
                 causale, importo, importo_lettere, nome_file, emesso_da, created_at`,
      {
        anno,
        numero,
        data: dati.data,
        socioId: input.socioId,
        intestatario: dati.intestatario,
        causale: dati.causale,
        importo,
        importoLettere: dati.importoLettere,
        nomeFile: file,
        contenuto: pdf,
        emessoDa,
      }
    );

    const documento = toDocumento(inserito.rows[0]);

    const esito = await segnaVociEmesse(input.voci, documento.id, q);
    // Seconda rete: fra il controllo sopra e questa INSERT un'altra
    // transazione potrebbe aver marcato le stesse voci. L'indice unico la
    // ferma, e qui ce ne accorgiamo prima di confermare.
    if (esito.emesse !== esito.richieste) {
      throw new ConflictError(
        'Alcune delle voci selezionate sono già finite in una ricevuta nel frattempo. Ricarica l\'elenco e rifai la selezione.'
      );
    }

    return { documento, pdf };
  });
}

export interface ListDocumentiOptions {
  socioId?: string;
  /** Estremi inclusi, "YYYY-MM-DD". */
  da?: string;
  a?: string;
  limit?: number;
  offset?: number;
}

export interface PaginaDocumenti {
  rows: Array<Documento & { nome: string; cognome: string }>;
  total: number;
}

export async function listDocumenti(options: ListDocumentiOptions = {}): Promise<PaginaDocumenti> {
  const { limit, offset } = limiteEOffset(options);

  const where: string[] = [];
  const params: Record<string, unknown> = { limit, offset };
  if (options.socioId) {
    where.push('d.socio_id = :socioId');
    params.socioId = options.socioId;
  }
  if (options.da) {
    where.push('d.data_documento >= CAST(:da AS DATE)');
    params.da = options.da;
  }
  if (options.a) {
    where.push('d.data_documento <= CAST(:a AS DATE)');
    params.a = options.a;
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // `contenuto` volutamente fuori dalla SELECT: un elenco di venticinque righe
  // trascinerebbe altrettanti PDF per mostrare cinque colonne di testo.
  const result = await query(
    `SELECT d.id, d.anno, d.numero, d.data_documento, d.socio_id, d.intestatario,
            d.causale, d.importo, d.importo_lettere, d.nome_file, d.emesso_da,
            d.created_at, s.nome, s.cognome,
            COUNT(*) OVER() AS total_count
       FROM documento d
       JOIN socio s ON s.id = d.socio_id
       ${whereSql}
      ORDER BY d.anno DESC, d.numero DESC
      LIMIT :limit OFFSET :offset`,
    params
  );

  const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(row => {
    const { total_count: _n, nome, cognome, ...documento } = row as Record<string, unknown>;
    return {
      ...toDocumento(documento),
      nome: nome as string,
      cognome: cognome as string,
    };
  });

  return { rows, total };
}

/** Il documento con i suoi byte: è la sola lettura che li carica. */
export async function getDocumentoConPdf(
  id: string
): Promise<{ documento: Documento; pdf: Buffer }> {
  const result = await query(`SELECT * FROM documento WHERE id = :id`, { id });
  if (result.rows.length === 0) {
    throw new NotFoundError('Ricevuta non trovata');
  }
  const { contenuto, ...resto } = result.rows[0] as Record<string, unknown>;
  return { documento: toDocumento(resto), pdf: contenuto as Buffer };
}

function toDocumento(row: Record<string, unknown>): Documento {
  return {
    id: row.id as string,
    anno: Number(row.anno),
    numero: Number(row.numero),
    // NUMERIC arriva come stringa dal driver: senza Number, il frontend
    // riceverebbe "160.00" e lo stamperebbe come testo.
    importo: Number(row.importo),
    data_documento: String(row.data_documento).slice(0, 10),
    socio_id: row.socio_id as string,
    intestatario: row.intestatario as string,
    causale: row.causale as string,
    importo_lettere: row.importo_lettere as string,
    nome_file: row.nome_file as string,
    emesso_da: (row.emesso_da as string) ?? null,
    created_at: row.created_at as string,
  };
}
