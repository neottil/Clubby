import { query, withTransaction, type QueryFn } from '../db/client.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';
import {
  getVoucherBySocioId,
  createMovimento,
  getMovimentoByIncontroId,
  updateMovimentoImporto,
  updateMovimentoDaIncontro,
} from './vouchers.service.js';

export interface Incontro {
  id: string;
  socio_id: string;
  data_incontro: string;
  attivita: string;
  costo: number;
  note: string | null;
  note_markdown: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIncontroInput {
  socio_id: string;
  data_incontro: string;
  attivita: string;
  costo: number;
  note?: string;
  note_markdown?: boolean;
}

// socio_id volutamente escluso: il socio di un incontro non è modificabile
// dopo la creazione (vedi updateIncontro).
export interface UpdateIncontroInput {
  data_incontro?: string;
  attivita?: string;
  costo?: number;
  note?: string;
  note_markdown?: boolean;
}

function toIncontro(row: unknown): Incontro {
  return row as Incontro;
}

/**
 * Descrizione del movimento di addebito generato da un incontro.
 *
 * Unico punto in cui viene composta: la usano sia la creazione sia la modifica
 * dell'incontro, che devono produrre la stessa stringa (altrimenti rinominare
 * l'attività lascerebbe descrizioni di formato diverso nella stessa lista).
 */
function descrizioneAddebito(attivita: string): string {
  return `Incontro: ${attivita}`;
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
  // Controllo esplicito e non lasciato al vincolo NOT NULL della colonna: una
  // stringa vuota lo soddisfarebbe comunque, e l'errore di Postgres tornerebbe
  // al client come 500 anziché come 400 con un messaggio leggibile.
  if (!input.attivita?.trim()) throw new BadRequestError('attivita è obbligatoria');
  if (input.costo === undefined || input.costo < 0) {
    throw new BadRequestError('costo deve essere >= 0');
  }

  await getSocioById(input.socio_id);

  return withTransaction(async (q) => {
    const result = await q(
      `INSERT INTO incontro (socio_id, data_incontro, attivita, costo, note, note_markdown)
       VALUES (:socio_id, :data_incontro, :attivita, :costo, :note, :note_markdown)
       RETURNING *`,
      {
        socio_id: input.socio_id,
        data_incontro: input.data_incontro,
        attivita: input.attivita.trim(),
        costo: input.costo,
        note: input.note ?? null,
        note_markdown: input.note_markdown ?? false,
      }
    );
    const incontro = toIncontro(result.rows[0]);

    const voucher = await getVoucherBySocioId(input.socio_id, q);
    if (voucher) {
      await createMovimento(
        voucher.id,
        {
          importo: -Number(input.costo),
          descrizione: descrizioneAddebito(input.attivita),
          incontro_id: incontro.id,
          data_movimento: input.data_incontro,
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
      if (!input.attivita.trim()) throw new BadRequestError('attivita è obbligatoria');
      setClauses.push('attivita = :attivita');
      params.attivita = input.attivita.trim();
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
    if (input.note_markdown !== undefined) {
      setClauses.push('note_markdown = :note_markdown');
      params.note_markdown = input.note_markdown;
    }

    if (setClauses.length === 0) throw new BadRequestError('Nessun campo da aggiornare');

    const result = await q(
      `UPDATE incontro SET ${setClauses.join(', ')} WHERE id = :id RETURNING *`,
      params
    );
    const incontro = toIncontro(result.rows[0]);

    // Il movimento collegato segue l'incontro in importo, data e descrizione:
    // una sola lettura, poi solo i campi effettivamente cambiati. Data e
    // descrizione sono presi dalla riga appena aggiornata e non da "input",
    // che è parziale: se cambia solo l'attività, la data da riscrivere è
    // comunque quella già memorizzata sull'incontro.
    const derivatiCambiati = input.data_incontro !== undefined || input.attivita !== undefined;
    if (input.costo !== undefined || derivatiCambiati) {
      const movimento = await getMovimentoByIncontroId(id, q);
      if (movimento) {
        if (input.costo !== undefined) {
          await updateMovimentoImporto(movimento.id, -Number(input.costo), q);
        }
        if (derivatiCambiati) {
          await updateMovimentoDaIncontro(
            movimento.id,
            {
              data_movimento: incontro.data_incontro,
              descrizione: descrizioneAddebito(incontro.attivita),
            },
            q
          );
        }
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
