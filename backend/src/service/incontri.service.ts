import { query } from '../db/client.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';

export interface Incontro {
  id: string;
  socio_id: string;
  data_incontro: string;
  costo: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIncontroInput {
  socio_id: string;
  data_incontro: string;
  costo: number;
  note?: string;
}

export interface UpdateIncontroInput {
  data_incontro?: string;
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

export async function getIncontroById(id: string): Promise<Incontro> {
  const result = await query(
    `SELECT * FROM incontro WHERE id = :id`,
    { id }
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Incontro con id ${id} non trovato`);
  }
  return toIncontro(result.rows[0]);
}

export async function createIncontro(input: CreateIncontroInput): Promise<Incontro> {
  if (!input.socio_id) throw new BadRequestError('socio_id è obbligatorio');
  if (!input.data_incontro) throw new BadRequestError('data_incontro è obbligatoria');
  if (input.costo === undefined || input.costo < 0) {
    throw new BadRequestError('costo deve essere >= 0');
  }

  await getSocioById(input.socio_id);

  const result = await query(
    `INSERT INTO incontro (socio_id, data_incontro, costo, note)
     VALUES (:socio_id, :data_incontro, :costo, :note)
     RETURNING *`,
    {
      socio_id: input.socio_id,
      data_incontro: input.data_incontro,
      costo: input.costo,
      note: input.note ?? null,
    }
  );

  return toIncontro(result.rows[0]);
}

export async function updateIncontro(id: string, input: UpdateIncontroInput): Promise<Incontro> {
  await getIncontroById(id);

  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  if (input.data_incontro !== undefined) {
    setClauses.push('data_incontro = :data_incontro');
    params.data_incontro = input.data_incontro;
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

  const result = await query(
    `UPDATE incontro SET ${setClauses.join(', ')} WHERE id = :id RETURNING *`,
    params
  );

  return toIncontro(result.rows[0]);
}

export async function deleteIncontro(id: string): Promise<void> {
  await getIncontroById(id);
  await query(`DELETE FROM incontro WHERE id = :id`, { id });
}
