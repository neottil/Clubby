import { query } from '../db/client.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';

export interface Buono {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;   // calcolato
  attivo: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovimentoBuono {
  id: string;
  buono_id: string;
  data_movimento: string;
  importo: number;
  descrizione: string | null;
  created_at: string;
}

export interface CreateBuonoInput {
  socio_id: string;
  saldo_iniziale: number;
  note?: string;
}

export interface CreateMovimentoInput {
  importo: number;
  descrizione?: string;
}

// ---------------------------------------------------------------
// Buoni
// ---------------------------------------------------------------

export async function listBuoni(socioId?: string): Promise<Buono[]> {
  const sql = socioId
    ? `SELECT b.*,
              (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
       FROM buono b
       LEFT JOIN movimento_buono m ON m.buono_id = b.id
       WHERE b.socio_id = :socioId
       GROUP BY b.id
       ORDER BY b.data_creazione DESC`
    : `SELECT b.*,
              (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
       FROM buono b
       LEFT JOIN movimento_buono m ON m.buono_id = b.id
       GROUP BY b.id
       ORDER BY b.data_creazione DESC`;

  const params = socioId ? { socioId } : {};
  const result = await query(sql, params);
  return result.rows as Buono[];
}

export async function getBuonoById(id: string): Promise<Buono> {
  const result = await query(
    `SELECT b.*,
            (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
     FROM buono b
     LEFT JOIN movimento_buono m ON m.buono_id = b.id
     WHERE b.id = :id
     GROUP BY b.id`,
    { id }
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Buono con id ${id} non trovato`);
  }
  return result.rows[0] as Buono;
}

export async function createBuono(input: CreateBuonoInput): Promise<Buono> {
  if (!input.socio_id) throw new BadRequestError('socio_id è obbligatorio');
  if (input.saldo_iniziale === undefined || input.saldo_iniziale < 0) {
    throw new BadRequestError('saldo_iniziale deve essere >= 0');
  }

  await getSocioById(input.socio_id);

  const result = await query(
    `INSERT INTO buono (socio_id, saldo_iniziale, note)
     VALUES (:socio_id, :saldo_iniziale, :note)
     RETURNING *, saldo_iniziale AS saldo_residuo`,
    {
      socio_id: input.socio_id,
      saldo_iniziale: input.saldo_iniziale,
      note: input.note ?? null,
    }
  );

  return result.rows[0] as Buono;
}

// ---------------------------------------------------------------
// Movimenti
// ---------------------------------------------------------------

export async function listMovimenti(buonoId: string): Promise<MovimentoBuono[]> {
  // verifica esistenza buono
  await getBuonoById(buonoId);

  const result = await query(
    `SELECT * FROM movimento_buono
     WHERE buono_id = :buonoId
     ORDER BY data_movimento DESC`,
    { buonoId }
  );
  return result.rows as MovimentoBuono[];
}

export async function createMovimento(
  buonoId: string,
  input: CreateMovimentoInput
): Promise<MovimentoBuono> {
  const buono = await getBuonoById(buonoId);

  if (!buono.attivo) {
    throw new BadRequestError('Il buono non è attivo');
  }

  if (input.importo === undefined) {
    throw new BadRequestError('importo è obbligatorio');
  }

  // Verifica che il saldo non diventi negativo per addebitit
  if (input.importo < 0) {
    const nuovoSaldo = Number(buono.saldo_residuo) + Number(input.importo);
    if (nuovoSaldo < 0) {
      throw new BadRequestError(
        `Saldo insufficiente. Saldo residuo: ${buono.saldo_residuo.toFixed(2)}, importo richiesto: ${Math.abs(input.importo).toFixed(2)}`
      );
    }
  }

  const result = await query(
    `INSERT INTO movimento_buono (buono_id, importo, descrizione)
     VALUES (:buonoId, :importo, :descrizione)
     RETURNING *`,
    {
      buonoId,
      importo: input.importo,
      descrizione: input.descrizione ?? null,
    }
  );

  return result.rows[0] as MovimentoBuono;
}
