import { query, type QueryFn } from '../db/client.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';

export interface Buono {
  id: string;
  socio_id: string;
  data_creazione: string;
  saldo_iniziale: number;
  saldo_residuo: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovimentoBuono {
  id: string;
  buono_id: string;
  incontro_id: string | null;
  data_movimento: string;
  importo: number;
  descrizione: string | null;
  created_at: string;
  // Presenti solo nella risposta di listMovimenti (JOIN con incontro),
  // per costruire l'etichetta "Incontro-{attività}-{data}" in UI.
  incontro_attivita?: string | null;
  incontro_data?: string | null;
}

export interface CreateBuonoInput {
  socio_id: string;
  saldo_iniziale: number;
  note?: string;
}

export interface CreateMovimentoInput {
  importo: number;
  descrizione?: string;
  incontro_id?: string;
}

function toBuono(row: unknown): Buono {
  return row as Buono;
}

function toMovimento(row: unknown): MovimentoBuono {
  return row as MovimentoBuono;
}

// ---------------------------------------------------------------
// Buoni
// ---------------------------------------------------------------

export async function listBuoni(socioId?: string): Promise<Buono[]> {
  const sql = `SELECT b.*,
              (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
       FROM buono b
       LEFT JOIN movimento_buono m ON m.buono_id = b.id
       ${socioId ? 'WHERE b.socio_id = :socioId' : ''}
       GROUP BY b.id
       ORDER BY b.data_creazione DESC`;

  const params = socioId ? { socioId } : {};
  const result = await query(sql, params);
  return result.rows.map(toBuono);
}

export async function getBuonoById(id: string, q: QueryFn = query): Promise<Buono> {
  const result = await q(
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
  return toBuono(result.rows[0]);
}

/**
 * Restituisce il buono di un socio, o null se non ne ha uno. Usato da
 * incontri.service per generare automaticamente un movimento di addebito
 * quando si crea/modifica un incontro.
 */
export async function getBuonoBySocioId(
  socioId: string,
  q: QueryFn = query
): Promise<Buono | null> {
  const result = await q(
    `SELECT b.*,
            (b.saldo_iniziale + COALESCE(SUM(m.importo), 0)) AS saldo_residuo
     FROM buono b
     LEFT JOIN movimento_buono m ON m.buono_id = b.id
     WHERE b.socio_id = :socioId
     GROUP BY b.id`,
    { socioId }
  );
  return result.rows.length > 0 ? toBuono(result.rows[0]) : null;
}

export async function createBuono(input: CreateBuonoInput): Promise<Buono> {
  if (!input.socio_id) throw new BadRequestError('socio_id è obbligatorio');
  if (input.saldo_iniziale === undefined || input.saldo_iniziale < 0) {
    throw new BadRequestError('saldo_iniziale deve essere >= 0');
  }

  await getSocioById(input.socio_id);

  const existing = await query(
    `SELECT id FROM buono WHERE socio_id = :socio_id LIMIT 1`,
    { socio_id: input.socio_id }
  );
  if (existing.rows.length > 0) {
    throw new BadRequestError('Il socio ha già un buono');
  }

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

  return toBuono(result.rows[0]);
}

// ---------------------------------------------------------------
// Movimenti
// ---------------------------------------------------------------

export async function listMovimenti(buonoId: string): Promise<MovimentoBuono[]> {
  await getBuonoById(buonoId);

  const result = await query(
    `SELECT m.*, i.attivita AS incontro_attivita, i.data_incontro AS incontro_data
     FROM movimento_buono m
     LEFT JOIN incontro i ON i.id = m.incontro_id
     WHERE m.buono_id = :buonoId
     ORDER BY m.data_movimento DESC`,
    { buonoId }
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
): Promise<MovimentoBuono | null> {
  const result = await q(
    `SELECT * FROM movimento_buono WHERE incontro_id = :incontroId`,
    { incontroId }
  );
  return result.rows.length > 0 ? toMovimento(result.rows[0]) : null;
}

export async function createMovimento(
  buonoId: string,
  input: CreateMovimentoInput,
  q: QueryFn = query
): Promise<MovimentoBuono> {
  const buono = await getBuonoById(buonoId, q);

  if (input.importo === undefined) {
    throw new BadRequestError('importo è obbligatorio');
  }

  // Un addebito che porta il saldo sotto zero è permesso (l'admin conferma
  // dall'interfaccia): si blocca solo se il saldo è GIÀ negativo prima di
  // questo movimento, per evitare di accumulare ulteriori addebiti su un
  // buono già scoperto.
  if (input.importo < 0 && Number(buono.saldo_residuo) < 0) {
    throw new BadRequestError(
      `Il buono ha già un saldo negativo (${Number(buono.saldo_residuo).toFixed(2)}). Non è possibile aggiungere altri addebiti finché il saldo non torna positivo.`
    );
  }

  const result = await q(
    `INSERT INTO movimento_buono (buono_id, importo, descrizione, incontro_id)
     VALUES (:buonoId, :importo, :descrizione, :incontroId)
     RETURNING *`,
    {
      buonoId,
      importo: input.importo,
      descrizione: input.descrizione ?? null,
      incontroId: input.incontro_id ?? null,
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
): Promise<MovimentoBuono> {
  const existing = await q(`SELECT * FROM movimento_buono WHERE id = :id`, { id });
  if (existing.rows.length === 0) {
    throw new NotFoundError(`Movimento con id ${id} non trovato`);
  }
  const movimento = toMovimento(existing.rows[0]);

  const buono = await getBuonoById(movimento.buono_id, q);
  const saldoSenzaQuestoMovimento = Number(buono.saldo_residuo) - Number(movimento.importo);
  if (nuovoImporto < 0 && saldoSenzaQuestoMovimento < 0) {
    throw new BadRequestError(
      `Il buono ha già un saldo negativo (${saldoSenzaQuestoMovimento.toFixed(2)}) senza contare questo movimento. Non è possibile aumentare l'addebito.`
    );
  }

  const result = await q(
    `UPDATE movimento_buono SET importo = :importo WHERE id = :id RETURNING *`,
    { id, importo: nuovoImporto }
  );
  return toMovimento(result.rows[0]);
}
