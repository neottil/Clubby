import { query, withTransaction, type QueryFn } from '../db/client.js';
import { limiteEOffset, direzione } from '../util/paginazione.js';
import { condizioniRicerca } from '../util/ricerca.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';

export interface Voucher {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;
  created_at: string;
  updated_at: string;
}

/**
 * Natura di un movimento (vedi la colonna in schema.sql):
 *   ricarica   credito acquistato dal socio (positivo), registrabile
 *   addebito   consumo del credito (negativo): l'incontro che lo ha generato,
 *              se c'è, sta in incontro_id. Non è registrabile, perché è già
 *              coperto dalla ricarica che lo paga.
 */
export type TipoMovimento = 'ricarica' | 'addebito';

export interface MovimentoVoucher {
  id: string;
  voucher_id: string;
  incontro_id: string | null;
  tipo: TipoMovimento;
  data_movimento: string;
  /** Valore del movimento sul voucher: è questo che muove il saldo. */
  importo: number;
  /**
   * Solo per le ricariche con valore extra (vedi util/ricariche.ts): quanto ha
   * pagato davvero il socio, quando è meno di quanto gli è stato accreditato.
   * NULL quando le due cose coincidono. Le ricevute contano questo.
   */
  importo_pagato: number | null;
  descrizione: string | null;
  created_at: string;
  /**
   * La ricevuta che comprende questa ricarica, se ne è stata emessa una.
   *
   * Null su addebiti e rettifiche, che non sono voci registrabili, e sulle
   * ricariche marcate come emesse prima della spec 003, quando l'emissione
   * non produceva ancora un documento. All'inizio è quindi null quasi ovunque:
   * il frontend mostra il codice solo dove c'è.
   */
  documento_id: string | null;
  /**
   * Anno e numero della ricevuta: insieme sono il codice mostrato in tabella e
   * il nome con cui il PDF viene scaricato. Null esattamente quando lo è
   * `documento_id`.
   */
  documento_anno: number | null;
  documento_numero: number | null;
}

export interface CreateVoucherInput {
  socio_id: string;
  /**
   * Credito importato da un voucher già in uso prima di Clubby, per la sola
   * configurazione iniziale. Omesso = 0. Non è una ricarica e non viene
   * registrato.
   */
  saldo_iniziale?: number;
  /** Credito acquistato attivando il voucher: registrato come prima ricarica. */
  ricarica?: number;
}

export interface CreateMovimentoInput {
  importo: number;
  /**
   * Quanto è stato pagato, se diverso da `importo` (ricariche con valore
   * extra). Omesso o uguale a `importo`: resta NULL sulla riga. Lo calcola il
   * server (ricariche.service), mai il client.
   */
  importo_pagato?: number | null;
  descrizione?: string;
  incontro_id?: string;
  /**
   * Omesso: un importo positivo è una ricarica, uno negativo un addebito.
   * Indicarlo serve a far rifiutare un importo del segno sbagliato invece di
   * registrarlo come il tipo opposto a quello inteso.
   */
  tipo?: TipoMovimento;
  // Data di calendario "YYYY-MM-DD" (la colonna è una DATE).
  // Omessa = oggi (ricariche e correzioni manuali, che avvengono nel momento
  // in cui l'admin le inserisce). L'addebito generato da un incontro la
  // valorizza invece con la data dell'incontro: un incontro registrato in
  // ritardo, o programmato in avanti, avrebbe altrimenti un movimento datato
  // "oggi" e la lista mostrerebbe un addebito prima o dopo l'incontro che lo
  // ha causato.
  data_movimento?: string;
}

function toVoucher(row: unknown): Voucher {
  return row as Voucher;
}

function toMovimento(row: unknown): MovimentoVoucher {
  return row as MovimentoVoucher;
}

// ---------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------

export async function listVouchers(socioId?: string): Promise<Voucher[]> {
  const sql = `SELECT b.*,
              (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
       FROM voucher b
       LEFT JOIN movimento_voucher m ON m.voucher_id = b.id
       ${socioId ? 'WHERE b.socio_id = :socioId' : ''}
       GROUP BY b.id
       ORDER BY b.data_creazione DESC, b.created_at DESC`;

  const params = socioId ? { socioId } : {};
  const result = await query(sql, params);
  return result.rows.map(toVoucher);
}

/** Voucher in un elenco, con il nominativo del socio: ricerca e ordinamento lo usano. */
export interface RigaVoucher extends Voucher {
  nome: string;
  cognome: string;
}

export interface ListVouchersOptions {
  /** Solo il voucher di questo socio. */
  socioId?: string;
  /** Tutti tranne quello di questo socio (il proprio, mostrato a parte). */
  escludiSocioId?: string;
  /** Ricerca parola per parola su cognome e nome del socio. */
  q?: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}

// Whitelist delle colonne ordinabili, come per incontri e soci.
const ORDINAMENTO_VOUCHER: Record<string, string[]> = {
  socioNome:      ['cognome', 'nome'],
  data_creazione: ['data_creazione'],
  saldo_iniziale: ['saldo_iniziale'],
  saldo_residuo:  ['saldo_residuo'],
};

/** Elenco paginato dei voucher, con saldo e socio, filtrato e ordinato dal database. */
export async function listVouchersPaginati(
  options: ListVouchersOptions = {}
): Promise<{ rows: RigaVoucher[]; total: number }> {
  const { limit, offset } = limiteEOffset(options);
  const params: Record<string, unknown> = { limit, offset };

  const where = condizioniRicerca(options.q, ['cognome', 'nome'], params);
  if (options.socioId) {
    where.push('socio_id = :socioId');
    params.socioId = options.socioId;
  }
  if (options.escludiSocioId) {
    where.push('socio_id <> :escludiSocioId');
    params.escludiSocioId = options.escludiSocioId;
  }

  const colonne = ORDINAMENTO_VOUCHER[options.sort ?? ''] ?? ORDINAMENTO_VOUCHER.socioNome;
  const dir = direzione(options.dir);
  const orderBy = [...colonne.map(c => `${c} ${dir}`), 'id'].join(', ');

  // Il saldo è un aggregato: calcolato in una CTE, così filtro, ordinamento e
  // conteggio lavorano su righe già complete, come su una tabella.
  const result = await query(
    `WITH v AS (
       SELECT b.*, s.nome, s.cognome,
              (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
       FROM voucher b
       JOIN socio s ON s.id = b.socio_id
       LEFT JOIN movimento_voucher m ON m.voucher_id = b.id
       GROUP BY b.id, s.id
     )
     SELECT *, COUNT(*) OVER() AS total_count
     FROM v
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}
     LIMIT :limit OFFSET :offset`,
    params
  );

  const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(row => {
    const { total_count: _n, ...voucher } = row as Record<string, unknown>;
    return voucher as unknown as RigaVoucher;
  });
  return { rows, total };
}

export async function getVoucherById(id: string, q: QueryFn = query): Promise<Voucher> {
  const result = await q(
    `SELECT b.*,
            (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
     FROM voucher b
     LEFT JOIN movimento_voucher m ON m.voucher_id = b.id
     WHERE b.id = :id
     GROUP BY b.id`,
    { id }
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Voucher con id ${id} non trovato`);
  }
  return toVoucher(result.rows[0]);
}

/**
 * Restituisce il voucher di un socio, o null se non ne ha uno. Usato da
 * incontri.service per generare automaticamente un movimento di addebito
 * quando si crea/modifica un incontro.
 */
export async function getVoucherBySocioId(
  socioId: string,
  q: QueryFn = query
): Promise<Voucher | null> {
  const result = await q(
    `SELECT b.*,
            (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
     FROM voucher b
     LEFT JOIN movimento_voucher m ON m.voucher_id = b.id
     WHERE b.socio_id = :socioId
     GROUP BY b.id`,
    { socioId }
  );
  return result.rows.length > 0 ? toVoucher(result.rows[0]) : null;
}

/**
 * Attiva il voucher di un socio. Il credito acquistato (`ricarica`) entra come
 * primo movimento di ricarica nella stessa transazione: o nascono entrambi o
 * nessuno dei due.
 */
export async function createVoucher(input: CreateVoucherInput): Promise<Voucher> {
  if (!input.socio_id) throw new BadRequestError('socio_id è obbligatorio');
  const saldoIniziale = input.saldo_iniziale ?? 0;
  if (!Number.isFinite(Number(saldoIniziale)) || Number(saldoIniziale) < 0) {
    throw new BadRequestError('saldo_iniziale deve essere >= 0');
  }
  if (input.ricarica !== undefined && input.ricarica !== null && !(Number(input.ricarica) > 0)) {
    throw new BadRequestError('ricarica deve essere un importo positivo');
  }

  await getSocioById(input.socio_id);

  const existing = await query(
    `SELECT id FROM voucher WHERE socio_id = :socio_id LIMIT 1`,
    { socio_id: input.socio_id }
  );
  if (existing.rows.length > 0) {
    throw new BadRequestError('Il socio ha già un voucher');
  }

  return withTransaction(async (q) => {
    const result = await q(
      `INSERT INTO voucher (socio_id, saldo_iniziale)
       VALUES (:socio_id, :saldo_iniziale)
       RETURNING id`,
      { socio_id: input.socio_id, saldo_iniziale: saldoIniziale }
    );
    const id = result.rows[0].id as string;

    if (input.ricarica) {
      await createMovimento(id, {
        importo: Number(input.ricarica),
        tipo: 'ricarica',
        descrizione: 'Acquisto voucher',
      }, q);
    }

    return getVoucherById(id, q);
  });
}

// ---------------------------------------------------------------
// Movimenti
// ---------------------------------------------------------------


/**
 * Movimenti di un voucher, dal più recente, a pagine: un socio accumula un
 * movimento per ogni incontro, quindi lo storico cresce quanto la sua attività
 * e il pannello non può caricarlo tutto in una volta.
 *
 * Restituisce anche il totale complessivo, che serve al pannello per sapere se
 * ci sono altri movimenti da caricare.
 */
export async function listMovimenti(
  voucherId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ rows: MovimentoVoucher[]; total: number }> {
  await getVoucherById(voucherId);

  const { limit, offset } = limiteEOffset(options);

  const result = await query(
    // Nessuna JOIN con incontro: l'attività è già dentro descrizione
    // ("Incontro: {attivita}", scritta da incontri.service.ts) e il dettaglio
    // completo si carica a parte quando l'utente apre la riga (GET /incontri/:id).
    // created_at come spareggio: data_movimento è una DATE, quindi due
    // movimenti dello stesso giorno (tipico: ricarica e addebito) avrebbero
    // altrimenti un ordine non deterministico — che con la paginazione
    // significa righe duplicate o mancanti fra una pagina e l'altra.
    // La JOIN con documento_emesso_voce porta la ricevuta della riga, quando
    // c'è: il legame esiste già dalla 002, e l'indice unico (tipo,
    // riferimento_id) lo rende una ricerca puntuale. Nessuna colonna nuova su
    // movimento_voucher, quindi nessun dato duplicato da tenere allineato.
    `SELECT m.*, d.documento_id, doc.anno AS documento_anno, doc.numero AS documento_numero,
            COUNT(*) OVER() AS total_count
     FROM movimento_voucher m
     LEFT JOIN documento_emesso_voce d
       ON d.tipo = 'ricarica' AND d.riferimento_id = m.id
     -- Anno e numero: insieme sono il codice della ricevuta mostrato in
     -- tabella. LEFT JOIN su chiave primaria, e sulle righe senza documento
     -- (addebiti, rettifiche, ricariche marcate emesse prima della 003) non
     -- aggiunge niente.
     LEFT JOIN documento doc ON doc.id = d.documento_id
     WHERE m.voucher_id = :voucherId
     ORDER BY m.data_movimento DESC, m.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { voucherId, limit, offset }
  );

  const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(row => {
    const { total_count: _ignored, ...movimento } = row as Record<string, unknown>;
    return toMovimento(movimento);
  });

  return { rows, total };
}

/** Quando e quanto è stata l'ultima ricarica di un voucher. */
export interface UltimaRicarica {
  data_movimento: string;
  importo: number;
}

/**
 * L'ultima ricarica di un voucher, o null se non ne ha ancora ricevuta
 * nessuna.
 *
 * Query a sé, e non due colonne in più negli elenchi dei voucher: è un dato
 * che serve a una sola scheda dell'interfaccia, e portarlo in giro in ogni
 * SELECT lo farebbe calcolare per ogni riga di ogni pagina, senza che nessuno
 * lo guardi.
 *
 * created_at come spareggio, come in listMovimenti: data_movimento è una DATE,
 * quindi due ricariche dello stesso giorno avrebbero un ordine arbitrario.
 */
export async function getUltimaRicarica(voucherId: string): Promise<UltimaRicarica | null> {
  const result = await query(
    `SELECT data_movimento, importo
     FROM movimento_voucher
     WHERE voucher_id = :voucherId AND tipo = 'ricarica'
     ORDER BY data_movimento DESC, created_at DESC
     LIMIT 1`,
    { voucherId }
  );
  return result.rows.length > 0 ? (result.rows[0] as unknown as UltimaRicarica) : null;
}

/**
 * Cerca il movimento generato automaticamente da un incontro (al più uno,
 * garantito dall'indice unico su incontro_id).
 */
export async function getMovimentoByIncontroId(
  incontroId: string,
  q: QueryFn = query
): Promise<MovimentoVoucher | null> {
  const result = await q(
    `SELECT * FROM movimento_voucher WHERE incontro_id = :incontroId`,
    { incontroId }
  );
  return result.rows.length > 0 ? toMovimento(result.rows[0]) : null;
}

/**
 * Tipo di un nuovo movimento, coerente con il segno dell'importo. Il tipo non
 * cambia più dopo: correggere l'importo di un addebito o di una ricarica ne
 * lascia la natura invariata.
 */
function tipoMovimento(input: CreateMovimentoInput): TipoMovimento {
  const importo = Number(input.importo);
  const tipo = input.tipo ?? (importo > 0 ? 'ricarica' : 'addebito');

  if (tipo !== 'ricarica' && tipo !== 'addebito') {
    throw new BadRequestError("tipo deve essere 'ricarica' o 'addebito'");
  }
  if (tipo === 'ricarica' && importo <= 0) {
    throw new BadRequestError('Una ricarica deve avere un importo positivo');
  }
  if (tipo === 'addebito' && importo >= 0) {
    throw new BadRequestError('Un addebito deve avere un importo negativo');
  }
  return tipo;
}

export async function createMovimento(
  voucherId: string,
  input: CreateMovimentoInput,
  q: QueryFn = query
): Promise<MovimentoVoucher> {
  const voucher = await getVoucherById(voucherId, q);

  if (input.importo === undefined || input.importo === null || !Number.isFinite(Number(input.importo))) {
    throw new BadRequestError('importo è obbligatorio');
  }
  const tipo = tipoMovimento(input);

  // Un addebito che porta il saldo sotto zero è permesso (l'admin conferma
  // dall'interfaccia): si blocca solo se il saldo è GIÀ negativo prima di
  // questo movimento, per evitare di accumulare ulteriori addebiti su un
  // voucher già scoperto.
  if (input.importo < 0 && Number(voucher.saldo_residuo) < 0) {
    throw new BadRequestError(
      `Il voucher ha già un saldo negativo (${Number(voucher.saldo_residuo).toFixed(2)}). Non è possibile aggiungere altri addebiti finché il saldo non torna positivo.`
    );
  }

  const result = await q(
    // CAST(... AS DATE) e non "::date": il convertitore di parametri con nome
    // (db/client.ts) sostituisce ogni ":parola", quindi interpreterebbe
    // "::date" come un secondo parametro chiamato "date".
    `INSERT INTO movimento_voucher (voucher_id, tipo, importo, importo_pagato, descrizione, incontro_id, data_movimento)
     VALUES (:voucherId, :tipo, :importo, :importoPagato, :descrizione, :incontroId, COALESCE(CAST(:dataMovimento AS DATE), CURRENT_DATE))
     RETURNING *`,
    {
      voucherId,
      tipo,
      importo: input.importo,
      // NULL quando pagato e accreditato coincidono: la colonna dice "questa
      // ricarica è costata meno di quanto vale", non ripete il valore.
      importoPagato:
        input.importo_pagato != null && Number(input.importo_pagato) !== Number(input.importo)
          ? input.importo_pagato
          : null,
      descrizione: input.descrizione ?? null,
      incontroId: input.incontro_id ?? null,
      dataMovimento: input.data_movimento ?? null,
    }
  );

  return toMovimento(result.rows[0]);
}

/**
 * Aggiorna l'importo di un movimento già esistente (usato quando si modifica
 * il costo di un incontro collegato). Come in createMovimento, l'operazione
 * è bloccata solo se il saldo (senza contare questo movimento) è già
 * negativo — il nuovo importo può invece portare il saldo sotto zero.
 */
export async function updateMovimentoImporto(
  id: string,
  nuovoImporto: number,
  q: QueryFn = query
): Promise<MovimentoVoucher> {
  const existing = await q(`SELECT * FROM movimento_voucher WHERE id = :id`, { id });
  if (existing.rows.length === 0) {
    throw new NotFoundError(`Movimento con id ${id} non trovato`);
  }
  const movimento = toMovimento(existing.rows[0]);

  const voucher = await getVoucherById(movimento.voucher_id, q);
  const saldoSenzaQuestoMovimento = Number(voucher.saldo_residuo) - Number(movimento.importo);
  if (nuovoImporto < 0 && saldoSenzaQuestoMovimento < 0) {
    throw new BadRequestError(
      `Il voucher ha già un saldo negativo (${saldoSenzaQuestoMovimento.toFixed(2)}) senza contare questo movimento. Non è possibile aumentare l'addebito.`
    );
  }

  const result = await q(
    `UPDATE movimento_voucher SET importo = :importo WHERE id = :id RETURNING *`,
    { id, importo: nuovoImporto }
  );
  return toMovimento(result.rows[0]);
}

/**
 * Riallinea data e descrizione di un movimento all'incontro che lo ha
 * generato, dopo che l'incontro è stato modificato. Sono i due campi che
 * derivano dall'incontro invece di essere inseriti dall'admin: senza questo,
 * spostare di data o rinominare l'attività lascerebbe il movimento fermo ai
 * valori precedenti, e la lista movimenti racconterebbe una storia diversa da
 * quella degli incontri.
 */
export async function updateMovimentoDaIncontro(
  id: string,
  input: { data_movimento: string; descrizione: string },
  q: QueryFn = query
): Promise<void> {
  await q(
    `UPDATE movimento_voucher
     SET data_movimento = CAST(:dataMovimento AS DATE), descrizione = :descrizione
     WHERE id = :id`,
    { id, dataMovimento: input.data_movimento, descrizione: input.descrizione }
  );
}
