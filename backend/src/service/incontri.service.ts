import { query, withTransaction, type QueryFn } from '../db/client.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';
import {
  getVoucherBySocioId,
  createMovimento,
  getMovimentoByIncontroId,
  updateMovimentoImporto,
} from './vouchers.service.js';

export interface Incontro {
  id: string;
  socio_id: string;
  data_incontro: string;
  attivita: string | null;
  costo: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIncontroInput {
  socio_id: string;
  data_incontro: string;
  attivita?: string;
  costo: number;
  note?: string;
}

// socio_id volutamente escluso: il socio di un incontro non è modificabile
// dopo la creazione (vedi updateIncontro).
export interface UpdateIncontroInput {
  data_incontro?: string;
  attivita?: string;
  costo?: number;
  note?: string;
}

function toIncontro(row: unknown): Incontro {
  return row as Incontro;
}

export async function listIncontri(socioId?: string): Promise<Incontro[]> {
  if (socioId) {
    const result = await query(
      `SELECT * FROM incontro WHERE socio_id = :socioId ORDER BY data_incontro DESC`,
      { socioId }
    );
    return result.rows.map(toIncontro);
  }

  const result = await query(
    `SELECT i.*, s.nome, s.cognome
     FROM incontro i
     JOIN socio s ON s.id = i.socio_id
     ORDER BY i.data_incontro DESC`
  );
  return result.rows.map(toIncontro);
}

export async function getIncontroById(id: string, q: QueryFn = query): Promise<Incontro> {
  const result = await q(
    `SELECT * FROM incontro WHERE id = :id`,
    { id }
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Incontro con id ${id} non trovato`);
  }
  return toIncontro(result.rows[0]);
}

/**
 * Crea un incontro e, se il socio ha un voucher, genera atomicamente (stessa
 * transazione) un movimento di addebito collegato con lo stesso importo del
 * costo. Se il voucher non ha saldo sufficiente, l'intera operazione viene
 * annullata: né l'incontro né il movimento vengono creati.
 */
export async function createIncontro(input: CreateIncontroInput): Promise<Incontro> {
  if (!input.socio_id) throw new BadRequestError('socio_id è obbligatorio');
  if (!input.data_incontro) throw new BadRequestError('data_incontro è obbligatoria');
  if (input.costo === undefined || input.costo < 0) {
    throw new BadRequestError('costo deve essere >= 0');
  }

  await getSocioById(input.socio_id);

  return withTransaction(async (q) => {
    const result = await q(
      `INSERT INTO incontro (socio_id, data_incontro, attivita, costo, note)
       VALUES (:socio_id, :data_incontro, :attivita, :costo, :note)
       RETURNING *`,
      {
        socio_id: input.socio_id,
        data_incontro: input.data_incontro,
        attivita: input.attivita ?? null,
        costo: input.costo,
        note: input.note ?? null,
      }
    );
    const incontro = toIncontro(result.rows[0]);

    const voucher = await getVoucherBySocioId(input.socio_id, q);
    if (voucher) {
      await createMovimento(
        voucher.id,
        {
          importo: -Number(input.costo),
          descrizione: `Incontro del ${input.data_incontro}`,
          incontro_id: incontro.id,
        },
        q
      );
    }

    return incontro;
  });
}

/**
 * Modifica un incontro. Se il costo cambia e l'incontro ha un movimento
 * collegato (generato automaticamente alla creazione), l'importo del
 * movimento viene aggiornato nella stessa transazione — se il nuovo importo
 * porterebbe il voucher in negativo, l'intera modifica viene annullata.
 */
export async function updateIncontro(id: string, input: UpdateIncontroInput): Promise<Incontro> {
  return withTransaction(async (q) => {
    await getIncontroById(id, q);

    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    if (input.data_incontro !== undefined) {
      setClauses.push('data_incontro = :data_incontro');
      params.data_incontro = input.data_incontro;
    }
    if (input.attivita !== undefined) {
      setClauses.push('attivita = :attivita');
      params.attivita = input.attivita;
    }
    if (input.costo !== undefined) {
      if (input.costo < 0) throw new BadRequestError('costo deve essere >= 0');
      setClauses.push('costo = :costo');
      params.costo = input.costo;
    }
    if (input.note !== undefined) {
      setClauses.push('note = :note');
      params.note = input.note;
    }

    if (setClauses.length === 0) throw new BadRequestError('Nessun campo da aggiornare');

    const result = await q(
      `UPDATE incontro SET ${setClauses.join(', ')} WHERE id = :id RETURNING *`,
      params
    );
    const incontro = toIncontro(result.rows[0]);

    if (input.costo !== undefined) {
      const movimento = await getMovimentoByIncontroId(id, q);
      if (movimento) {
        await updateMovimentoImporto(movimento.id, -Number(input.costo), q);
      }
    }

    return incontro;
  });
}

/**
 * Elimina un incontro. Il movimento collegato (se presente) viene rimosso
 * automaticamente insieme, in modo atomico: il vincolo ON DELETE CASCADE su
 * movimento_voucher.incontro_id lo garantisce nell'ambito della stessa DELETE.
 */
export async function deleteIncontro(id: string): Promise<void> {
  await getIncontroById(id);
  await query(`DELETE FROM incontro WHERE id = :id`, { id });
}
