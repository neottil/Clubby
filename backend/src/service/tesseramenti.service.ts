/**
 * Tesseramento al club: rinnovi con la loro scadenza e la quota pagata.
 *
 * La quota non passa dal voucher: è un importo incassato a parte, e compare
 * solo fra le voci registrabili (vedi documenti/voci.service.ts).
 */

import { query, withTransaction, type QueryFn } from '../db/client.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';
import { leggiImpostazioni } from './impostazioni.service.js';
import { dataValida } from '../util/date.js';
import { limiteEOffset, direzione } from '../util/paginazione.js';
import { condizioniRicerca } from '../util/ricerca.js';

export interface Tesseramento {
  id: string;
  socio_id: string;
  data_rinnovo: string;
  scadenza: string;
  importo: number;
  /** null sui tesseramenti registrati prima che il numero si chiedesse. */
  numero_tessera: string | null;
  created_at: string;
  /** Stato della riga rispetto a oggi; presente solo nello storico. */
  stato?: StatoTesseramento;
  /**
   * La ricevuta che comprende questa quota, quando ce n'è una. Presenti solo
   * nello storico di un socio e a modulo ricevute attivo.
   */
  documento_id?: string | null;
  documento_anno?: number | null;
  documento_numero?: number | null;
}

/** Riga della tabella Tesseramenti: un socio e il suo ultimo rinnovo. */
export interface SituazioneTesseramento {
  socio_id: string;
  nome: string;
  cognome: string;
  /** null se il socio non è mai stato tesserato. */
  ultimo_rinnovo: string | null;
  scadenza: string | null;
  /** Numero del tesseramento più recente: null se non ne ha uno o mai tesserato. */
  numero_tessera: string | null;
  rinnovi: number;
}

export interface RinnovoInput {
  socio_id: string;
  /** Nuova scadenza, "YYYY-MM-DD". */
  scadenza: string;
  /** Omessa = oggi. */
  data_rinnovo?: string;
  /** Omesso = quota configurata nelle impostazioni. */
  importo?: number;
  /** Il numero stampato sulla tessera: obbligatorio. */
  numero_tessera?: unknown;
}

/** Lunghezza massima del numero di tessera, come la colonna. */
export const LUNGHEZZA_NUMERO_TESSERA = 30;

/**
 * Il numero di tessera ripulito e controllato. Testo e non intero: i numeri
 * degli enti hanno prefissi, lettere e zeri iniziali.
 */
function numeroTessera(valore: unknown): string {
  const numero = typeof valore === 'string' ? valore.trim() : '';
  if (!numero) throw new BadRequestError('numero_tessera è obbligatorio');
  if (numero.length > LUNGHEZZA_NUMERO_TESSERA) {
    throw new BadRequestError(`numero_tessera può avere al massimo ${LUNGHEZZA_NUMERO_TESSERA} caratteri`);
  }
  return numero;
}


/**
 * Un numero di tessera appartiene a un solo socio; lo stesso socio lo riusa
 * nei rinnovi. Da chiamare dentro la transazione che poi scrive il numero.
 *
 * Il lock consultivo sul numero serve perché il lock sulla riga del socio non
 * basta: due soci diversi che registrano insieme lo stesso numero bloccano
 * due righe diverse, e nessuno dei due vedrebbe l'altro.
 */
async function verificaNumeroLibero(q: QueryFn, numero: string, socioId: string): Promise<void> {
  await q(`SELECT pg_advisory_xact_lock(hashtext(:numero))`, { numero });
  const altro = await q(
    `SELECT s.nome, s.cognome FROM tesseramento t JOIN socio s ON s.id = t.socio_id
      WHERE t.numero_tessera = :numero AND t.socio_id <> :socioId
      LIMIT 1`,
    { numero, socioId }
  );
  if (altro.rows.length > 0) {
    const { nome, cognome } = altro.rows[0];
    throw new ConflictError(`Il numero di tessera ${numero} è già di ${nome} ${cognome}`);
  }
}


/** Tutti i soci, ciascuno con l'ultima scadenza (null se mai tesserato). */
export async function listSituazioneTesseramenti(): Promise<SituazioneTesseramento[]> {
  const result = await query(
    `SELECT s.id AS socio_id, s.nome, s.cognome,
            ultimo.data_rinnovo AS ultimo_rinnovo, ultimo.scadenza, ultimo.numero_tessera,
            (SELECT COUNT(*) FROM tesseramento t WHERE t.socio_id = s.id) AS rinnovi
     FROM socio s
     LEFT JOIN LATERAL (
       SELECT data_rinnovo, scadenza, numero_tessera FROM tesseramento t
       WHERE t.socio_id = s.id
       ORDER BY scadenza DESC, created_at DESC
       LIMIT 1
     ) ultimo ON TRUE
     ORDER BY s.cognome, s.nome`,
    {}
  );
  return result.rows.map(r => ({ ...r, rinnovi: Number(r.rinnovi) }) as SituazioneTesseramento);
}

/** Stato del tesseramento di un socio, rispetto a oggi. */
export type StatoTesseramento = 'attivo' | 'in_scadenza' | 'scaduto' | 'mai';
const STATI: readonly StatoTesseramento[] = ['attivo', 'in_scadenza', 'scaduto', 'mai'];

/** Entro quanti giorni dalla scadenza un tesseramento è "in scadenza". */
export const GIORNI_PREAVVISO = 30;

/**
 * Lo stato di una scadenza, calcolato dal database. Una regola sola per la
 * pagina Tesseramenti dell'admin e per lo storico che legge il socio: due
 * calcoli diversi darebbero ai due uno stato diverso. Richiede il parametro
 * :preavviso.
 */
function statoSql(scadenza: string): string {
  return `CASE
               WHEN ${scadenza} IS NULL THEN 'mai'
               WHEN ${scadenza} < CURRENT_DATE THEN 'scaduto'
               WHEN ${scadenza} <= CURRENT_DATE + CAST(:preavviso AS INTEGER) THEN 'in_scadenza'
               ELSE 'attivo'
             END`;
}

export interface RigaTesseramento extends SituazioneTesseramento {
  stato: StatoTesseramento;
}

export interface ListTesseramentiOptions {
  /** Ricerca parola per parola su cognome e nome. */
  q?: string;
  stato?: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}

// Whitelist delle colonne ordinabili. Lo stato si ordina per urgenza, non
// alfabeticamente: prima gli scaduti, poi quelli in scadenza.
const ORDINAMENTO_TESSERAMENTI: Record<string, string[]> = {
  socioNome:      ['cognome', 'nome'],
  ultimo_rinnovo: ['ultimo_rinnovo'],
  scadenza:       ['scadenza'],
  stato:          [`CASE stato WHEN 'scaduto' THEN 0 WHEN 'in_scadenza' THEN 1 WHEN 'attivo' THEN 2 ELSE 3 END`],
  rinnovi:        ['rinnovi'],
};

/**
 * Tesseramenti di tutti i soci, a pagine, con lo stato calcolato dal
 * database. Restituisce anche quanti soci ci sono in ogni stato, su tutti i
 * soci e non sulla sola pagina: sono i numeri del filtro per stato.
 */
export async function listTesseramentiPaginati(options: ListTesseramentiOptions = {}): Promise<{
  rows: RigaTesseramento[];
  total: number;
  conteggi: Record<StatoTesseramento, number>;
}> {
  const { limit, offset } = limiteEOffset(options);
  const params: Record<string, unknown> = { limit, offset, preavviso: GIORNI_PREAVVISO };

  const where = condizioniRicerca(options.q, ['cognome', 'nome'], params);
  if (options.stato) {
    if (!STATI.includes(options.stato as StatoTesseramento)) {
      throw new BadRequestError(`stato non valido. Valori ammessi: ${STATI.join(', ')}`);
    }
    where.push('stato = :stato');
    params.stato = options.stato;
  }

  const colonne = ORDINAMENTO_TESSERAMENTI[options.sort ?? ''] ?? ORDINAMENTO_TESSERAMENTI.socioNome;
  const dir = direzione(options.dir);
  // NULLS LAST: chi non è mai stato tesserato resta in fondo in entrambe le
  // direzioni, invece di comparire in cima ordinando per data decrescente.
  const orderBy = [...colonne.map(c => `${c} ${dir} NULLS LAST`), 'socio_id'].join(', ');

  // Stessa situazione di listSituazioneTesseramenti, più lo stato. Le date sono
  // confrontate dal database: nessuna conversione di fuso in mezzo.
  const situazione = `
    WITH t AS (
      SELECT s.id AS socio_id, s.nome, s.cognome,
             ultimo.data_rinnovo AS ultimo_rinnovo, ultimo.scadenza,
             ultimo.numero_tessera,
             CAST((SELECT COUNT(*) FROM tesseramento x WHERE x.socio_id = s.id) AS INTEGER) AS rinnovi,
             ${statoSql('ultimo.scadenza')} AS stato
      FROM socio s
      LEFT JOIN LATERAL (
        SELECT data_rinnovo, scadenza, numero_tessera FROM tesseramento x
        WHERE x.socio_id = s.id
        ORDER BY scadenza DESC, created_at DESC
        LIMIT 1
      ) ultimo ON TRUE
    )`;

  const [pagina, perStato] = await Promise.all([
    query(
      `${situazione}
       SELECT *, COUNT(*) OVER() AS total_count
       FROM t
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${orderBy}
       LIMIT :limit OFFSET :offset`,
      params
    ),
    // CAST e non "::int": il convertitore dei parametri con nome leggerebbe
    // ":int" come un parametro (vedi db/client.ts).
    query(`${situazione} SELECT stato, CAST(COUNT(*) AS INTEGER) AS n FROM t GROUP BY stato`, { preavviso: GIORNI_PREAVVISO }),
  ]);

  const conteggi: Record<StatoTesseramento, number> = { attivo: 0, in_scadenza: 0, scaduto: 0, mai: 0 };
  for (const r of perStato.rows) conteggi[r.stato as StatoTesseramento] = Number(r.n);

  const total = pagina.rows.length > 0 ? Number(pagina.rows[0].total_count) : 0;
  const rows = pagina.rows.map(row => {
    const { total_count: _n, ...riga } = row as Record<string, unknown>;
    return riga as unknown as RigaTesseramento;
  });
  return { rows, total, conteggi };
}

/**
 * Rinnovi di un socio, dal più recente, ciascuno con il proprio stato: quello
 * della prima riga è lo stato del socio ("mai" se lo storico è vuoto).
 */
export async function storicoTesseramenti(
  socioId: string,
  conDocumento = false
): Promise<Tesseramento[]> {
  await getSocioById(socioId);
  // Le giunture della ricevuta si aggiungono solo a modulo attivo (lo decide
  // il chiamante): a modulo spento i campi non devono comparire affatto.
  // L'indice unico su (tipo, riferimento_id) garantisce al più una riga per
  // rinnovo, quindi la giuntura non duplica lo storico.
  const result = await query(
    `SELECT t.*, ${statoSql('t.scadenza')} AS stato${conDocumento ? ', d.documento_id, doc.anno AS documento_anno, doc.numero AS documento_numero' : ''}
       FROM tesseramento t${conDocumento ? `
       LEFT JOIN documento_emesso_voce d ON d.tipo = 'tesseramento' AND d.riferimento_id = t.id
       LEFT JOIN documento doc ON doc.id = d.documento_id` : ''}
      WHERE t.socio_id = :socioId
      ORDER BY t.scadenza DESC, t.created_at DESC`,
    { socioId, preavviso: GIORNI_PREAVVISO }
  );
  return result.rows as unknown as Tesseramento[];
}

/**
 * Registra un rinnovo. La nuova scadenza deve seguire sia la data del rinnovo
 * sia la scadenza precedente: un "rinnovo" che accorcia il tesseramento è
 * quasi certamente un errore di battitura, e lo storico non si corregge
 * cancellando righe.
 */
export async function rinnovaTesseramento(input: RinnovoInput): Promise<Tesseramento> {
  if (!input.socio_id) throw new BadRequestError('socio_id è obbligatorio');
  if (!dataValida(input.scadenza)) throw new BadRequestError('scadenza è obbligatoria, nel formato YYYY-MM-DD');
  if (input.data_rinnovo !== undefined && input.data_rinnovo !== null && !dataValida(input.data_rinnovo)) {
    throw new BadRequestError('data_rinnovo deve essere nel formato YYYY-MM-DD');
  }

  const numero = numeroTessera(input.numero_tessera);
  await getSocioById(input.socio_id);

  const importo = input.importo === undefined || input.importo === null
    ? (await leggiImpostazioni()).quota_tesseramento
    : Number(input.importo);
  if (!Number.isFinite(importo) || importo < 0) {
    throw new BadRequestError('importo deve essere >= 0');
  }

  return withTransaction(async (q) => {
    // Blocca la riga del socio: due rinnovi simultanei leggerebbero la stessa
    // scadenza precedente e passerebbero entrambi il controllo.
    await q(`SELECT id FROM socio WHERE id = :socioId FOR UPDATE`, { socioId: input.socio_id });

    // Confronti fra date fatti dal database, sulle stesse DATE che salva:
    // nessuna conversione di fuso in mezzo.
    const verifica = await q(
      `SELECT CAST(:scadenza AS DATE) > COALESCE(CAST(:dataRinnovo AS DATE), CURRENT_DATE) AS dopo_rinnovo,
              CAST(:scadenza AS DATE) > COALESCE(MAX(scadenza), CAST(:scadenza AS DATE) - 1) AS dopo_precedente,
              to_char(MAX(scadenza), 'DD/MM/YYYY') AS precedente
       FROM tesseramento WHERE socio_id = :socioId`,
      { scadenza: input.scadenza, dataRinnovo: input.data_rinnovo ?? null, socioId: input.socio_id }
    );
    const { dopo_rinnovo, dopo_precedente, precedente } = verifica.rows[0];
    if (!dopo_rinnovo) {
      throw new BadRequestError('La scadenza deve essere successiva alla data del rinnovo');
    }
    if (!dopo_precedente) {
      throw new BadRequestError(`La nuova scadenza deve essere successiva a quella attuale (${precedente})`);
    }
    await verificaNumeroLibero(q, numero, input.socio_id);

    const result = await q(
      `INSERT INTO tesseramento (socio_id, data_rinnovo, scadenza, importo, numero_tessera)
       VALUES (:socioId, COALESCE(CAST(:dataRinnovo AS DATE), CURRENT_DATE), CAST(:scadenza AS DATE), :importo, :numero)
       RETURNING *`,
      { socioId: input.socio_id, dataRinnovo: input.data_rinnovo ?? null, scadenza: input.scadenza, importo, numero }
    );
    return result.rows[0] as unknown as Tesseramento;
  });
}

/**
 * Corregge o aggiunge il numero di tessera, e solo sul tesseramento in corso:
 * il più recente del socio, con la scadenza non ancora passata. I tesseramenti
 * chiusi sono storia, e un socio scaduto prende il numero nuovo rinnovando.
 * Date e quota non si toccano: possono essere già finite in una ricevuta.
 */
export async function correggiNumeroTessera(id: string, valore: unknown): Promise<Tesseramento> {
  const numero = numeroTessera(valore);

  return withTransaction(async (q) => {
    const trovato = await q(`SELECT socio_id FROM tesseramento WHERE id = :id`, { id });
    if (trovato.rows.length === 0) throw new NotFoundError('Tesseramento non trovato');
    const socioId = trovato.rows[0].socio_id as string;

    // Stesso lock del rinnovo: un rinnovo che arrivasse insieme cambierebbe
    // quale sia il tesseramento in corso fra la verifica e la scrittura.
    await q(`SELECT id FROM socio WHERE id = :socioId FOR UPDATE`, { socioId });
    const inCorso = await q(
      `SELECT id FROM tesseramento
        WHERE socio_id = :socioId AND scadenza >= CURRENT_DATE
        ORDER BY scadenza DESC, created_at DESC
        LIMIT 1`,
      { socioId }
    );
    // Il più recente con scadenza futura è il più recente in assoluto: un
    // tesseramento più recente avrebbe una scadenza ancora più avanti.
    if (inCorso.rows[0]?.id !== id) {
      throw new ConflictError('Si può correggere solo il numero del tesseramento in corso');
    }
    await verificaNumeroLibero(q, numero, socioId);

    const result = await q(
      `UPDATE tesseramento SET numero_tessera = :numero WHERE id = :id RETURNING *`,
      { numero, id }
    );
    return result.rows[0] as unknown as Tesseramento;
  });
}
