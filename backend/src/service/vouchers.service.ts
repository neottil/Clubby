import { query, type QueryFn } from '../db/client.js';
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

export interface MovimentoVoucher {
  id: string;
  voucher_id: string;
  incontro_id: string | null;
  data_movimento: string;
  importo: number;
  descrizione: string | null;
  created_at: string;
}

export interface CreateVoucherInput {
  socio_id: string;
  saldo_iniziale: number;
}

export interface CreateMovimentoInput {
  importo: number;
  descrizione?: string;
  incontro_id?: string;
  // Omessa = adesso (ricariche e correzioni manuali, che avvengono nel momento
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
       ORDER BY b.data_creazione DESC`;

  const params = socioId ? { socioId } : {};
  const result = await query(sql, params);
  return result.rows.map(toVoucher);
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

export async function createVoucher(input: CreateVoucherInput): Promise<Voucher> {
  if (!input.socio_id) throw new BadRequestError('socio_id è obbligatorio');
  if (input.saldo_iniziale === undefined || input.saldo_iniziale < 0) {
    throw new BadRequestError('saldo_iniziale deve essere >= 0');
  }

  await getSocioById(input.socio_id);

  const existing = await query(
    `SELECT id FROM voucher WHERE socio_id = :socio_id LIMIT 1`,
    { socio_id: input.socio_id }
  );
  if (existing.rows.length > 0) {
    throw new BadRequestError('Il socio ha già un voucher');
  }

  const result = await query(
    `INSERT INTO voucher (socio_id, saldo_iniziale)
     VALUES (:socio_id, :saldo_iniziale)
     RETURNING *, saldo_iniziale AS saldo_residuo`,
    {
      socio_id: input.socio_id,
      saldo_iniziale: input.saldo_iniziale,
    }
  );

  return toVoucher(result.rows[0]);
}

// ---------------------------------------------------------------
// Movimenti
// ---------------------------------------------------------------

export async function listMovimenti(voucherId: string): Promise<MovimentoVoucher[]> {
  await getVoucherById(voucherId);

  const result = await query(
    // Nessuna JOIN con incontro: l'attività è già dentro descrizione
    // ("Incontro: {attivita}", scritta da incontri.service.ts) e il dettaglio
    // completo si carica a parte quando l'utente apre la riga (GET /incontri/:id).
    `SELECT * FROM movimento_voucher
     WHERE voucher_id = :voucherId
     ORDER BY data_movimento DESC`,
    { voucherId }
  );
  return result.rows.map(toMovimento);
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

export async function createMovimento(
  voucherId: string,
  input: CreateMovimentoInput,
  q: QueryFn = query
): Promise<MovimentoVoucher> {
  const voucher = await getVoucherById(voucherId, q);

  if (input.importo === undefined) {
    throw new BadRequestError('importo è obbligatorio');
  }

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
    // CAST(... AS TIMESTAMP) e non "::timestamp": il convertitore di parametri
    // con nome (db/client.ts) sostituisce ogni ":parola", quindi interpreterebbe
    // "::timestamp" come un secondo parametro chiamato "timestamp".
    `INSERT INTO movimento_voucher (voucher_id, importo, descrizione, incontro_id, data_movimento)
     VALUES (:voucherId, :importo, :descrizione, :incontroId, COALESCE(CAST(:dataMovimento AS TIMESTAMP), NOW()))
     RETURNING *`,
    {
      voucherId,
      importo: input.importo,
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
     SET data_movimento = CAST(:dataMovimento AS TIMESTAMP), descrizione = :descrizione
     WHERE id = :id`,
    { id, dataMovimento: input.data_movimento, descrizione: input.descrizione }
  );
}
