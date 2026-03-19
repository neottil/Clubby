import { query } from '../db/client.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';

export interface Socio {
  id: string;
  nome: string;
  cognome: string;
  email: string | null;
  telefono: string | null;
  data_iscrizione: string;
  id_viewer: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSocioInput {
  nome: string;
  cognome: string;
  email?: string;
  telefono?: string;
  data_iscrizione?: string;
  note?: string;
}

export interface UpdateSocioInput {
  nome?: string;
  cognome?: string;
  email?: string;
  telefono?: string;
  note?: string;
}

function toSocio(row: unknown): Socio {
  return row as Socio;
}

export async function listSoci(): Promise<Socio[]> {
  const result = await query(
    `SELECT * FROM socio ORDER BY cognome, nome`
  );
  return result.rows.map(toSocio);
}

export async function getSocioById(id: string): Promise<Socio> {
  const result = await query(
    `SELECT * FROM socio WHERE id = :id`,
    { id }
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Socio con id ${id} non trovato`);
  }
  return toSocio(result.rows[0]);
}

export async function getSocioByViewerId(viewerId: string): Promise<Socio | null> {
  const result = await query(
    `SELECT * FROM socio WHERE id_viewer = :viewerId`,
    { viewerId }
  );
  return result.rows.length > 0 ? toSocio(result.rows[0]) : null;
}

export async function createSocio(input: CreateSocioInput): Promise<Socio> {
  if (!input.nome?.trim() || !input.cognome?.trim()) {
    throw new BadRequestError('Nome e cognome sono obbligatori');
  }

  const result = await query(
    `INSERT INTO socio (nome, cognome, email, telefono, data_iscrizione, note)
     VALUES (:nome, :cognome, :email, :telefono, :data_iscrizione, :note)
     RETURNING *`,
    {
      nome: input.nome.trim(),
      cognome: input.cognome.trim(),
      email: input.email ?? null,
      telefono: input.telefono ?? null,
      data_iscrizione: input.data_iscrizione ?? new Date().toISOString().split('T')[0],
      note: input.note ?? null,
    }
  );

  return toSocio(result.rows[0]);
}

export async function updateSocio(id: string, input: UpdateSocioInput): Promise<Socio> {
  await getSocioById(id);

  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  if (input.nome !== undefined) {
    setClauses.push('nome = :nome');
    params.nome = input.nome.trim();
  }
  if (input.cognome !== undefined) {
    setClauses.push('cognome = :cognome');
    params.cognome = input.cognome.trim();
  }
  if (input.email !== undefined) {
    setClauses.push('email = :email');
    params.email = input.email;
  }
  if (input.telefono !== undefined) {
    setClauses.push('telefono = :telefono');
    params.telefono = input.telefono;
  }
  if (input.note !== undefined) {
    setClauses.push('note = :note');
    params.note = input.note;
  }

  if (setClauses.length === 0) {
    throw new BadRequestError('Nessun campo da aggiornare');
  }

  const result = await query(
    `UPDATE socio SET ${setClauses.join(', ')} WHERE id = :id RETURNING *`,
    params
  );

  return toSocio(result.rows[0]);
}

export async function deleteSocio(id: string): Promise<void> {
  await getSocioById(id);
  await query(`DELETE FROM socio WHERE id = :id`, { id });
}

export async function associaViewer(socioId: string, viewerId: string): Promise<Socio> {
  const existing = await getSocioByViewerId(viewerId);
  if (existing && existing.id !== socioId) {
    throw new BadRequestError(
      `Il viewer ${viewerId} è già associato al socio ${existing.cognome} ${existing.nome}`
    );
  }

  const result = await query(
    `UPDATE socio SET id_viewer = :viewerId WHERE id = :id RETURNING *`,
    { id: socioId, viewerId }
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`Socio con id ${socioId} non trovato`);
  }

  return toSocio(result.rows[0]);
}

export async function disassociaViewer(socioId: string): Promise<Socio> {
  const result = await query(
    `UPDATE socio SET id_viewer = NULL WHERE id = :id RETURNING *`,
    { id: socioId }
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`Socio con id ${socioId} non trovato`);
  }

  return toSocio(result.rows[0]);
}
