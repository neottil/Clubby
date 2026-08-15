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
  // Nome dell'istruttore, scelto fra quelli configurati nel frontend
  // (VITE_SELECT_ISTRUTTORI_VALUES). null quando il tenant non configura la
  // lista (un solo istruttore: il campo non viene nemmeno mostrato) o per gli
  // incontri registrati prima dell'introduzione del campo.
  istruttore: string | null;
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
  istruttore?: string;
  costo: number;
  note?: string;
  note_markdown?: boolean;
}

// socio_id volutamente escluso: il socio di un incontro non è modificabile
// dopo la creazione (vedi updateIncontro).
export interface UpdateIncontroInput {
  data_incontro?: string;
  attivita?: string;
  istruttore?: string | null;
  costo?: number;
  note?: string;
  note_markdown?: boolean;
}

function toIncontro(row: unknown): Incontro {
  return row as Incontro;
}

/**
 * Pagina di risultati: le righe richieste più il totale di quante ne
 * soddisfano il filtro (non quante ne sono state restituite). Il totale serve
 * al frontend per sapere se c'è dell'altro da caricare e per dire "25 di 340".
 */
export interface Page<T> {
  rows: T[];
  total: number;
}

export interface ListIncontriOptions {
  socioId?: string;
  /** Ricerca libera su cognome, nome e attività. */
  q?: string;
  attivita?: string;
  /** Estremi inclusi, "YYYY-MM-DD". */
  da?: string;
  a?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Colonne su cui è permesso ordinare, mappate sull'SQL corrispondente.
 *
 * Whitelist e non interpolazione diretta: ORDER BY non è parametrizzabile
 * come un valore, quindi il nome di colonna finisce concatenato nell'SQL —
 * accettare una stringa arbitraria dal client sarebbe un'iniezione. Le chiavi
 * sono quelle usate dal frontend per le intestazioni della tabella.
 */
// Il valore è la lista di colonne che compongono l'ordinamento: la direzione
// va ripetuta su ognuna, perché in SQL ASC/DESC vale per la singola colonna —
// "ORDER BY cognome, nome DESC" ordinerebbe i cognomi in modo crescente.
const SORT_COLUMNS: Record<string, string[]> = {
  socioNome:     ['s.cognome', 's.nome'],
  data_incontro: ['i.data_incontro'],
  attivita:      ['i.attivita'],
  istruttore:    ['i.istruttore'],
  costo:         ['i.costo'],
};

const DEFAULT_LIMIT = 25;
// Tetto massimo per una singola pagina: senza, un client potrebbe chiedere
// limit=1000000 e riportare il problema che la paginazione serve a evitare.
const MAX_LIMIT = 200;

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

/**
 * Elenco paginato degli incontri, filtrato e ordinato dal database.
 *
 * Filtri e ordinamento stanno qui e non nel browser perché il frontend riceve
 * una pagina per volta: filtrare le sole righe già caricate darebbe risultati
 * falsi (un socio che sta nella pagina successiva risulterebbe inesistente).
 *
 * La JOIN con socio è sempre presente, anche filtrando per un singolo socio:
 * così ogni riga porta con sé nome e cognome e la ricerca libera può cercare
 * anche sul nominativo, senza che il chiamante debba incrociare a parte
 * l'elenco dei soci.
 */
export async function listIncontri(options: ListIncontriOptions = {}): Promise<Page<Incontro>> {
  const limit  = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, options.offset ?? 0);

  const where: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  if (options.socioId) {
    where.push('i.socio_id = :socioId');
    params.socioId = options.socioId;
  }
  if (options.attivita) {
    where.push('i.attivita = :attivita');
    params.attivita = options.attivita;
  }
  // CAST(... AS DATE) e non "::date": il convertitore di parametri con nome
  // (db/client.ts) sostituisce ogni ":parola" e leggerebbe "::date" come un
  // secondo parametro chiamato "date".
  if (options.da) {
    where.push('i.data_incontro >= CAST(:da AS DATE)');
    params.da = options.da;
  }
  if (options.a) {
    where.push('i.data_incontro <= CAST(:a AS DATE)');
    params.a = options.a;
  }
  if (options.q?.trim()) {
    where.push(`(s.cognome ILIKE :q OR s.nome ILIKE :q OR i.attivita ILIKE :q)`);
    params.q = `%${options.q.trim()}%`;
  }

  const orderColumns = SORT_COLUMNS[options.sort ?? ''] ?? SORT_COLUMNS.data_incontro;
  const orderDir     = options.dir === 'asc' ? 'ASC' : 'DESC';
  // created_at come spareggio: le date sono DATE, quindi più incontri dello
  // stesso giorno avrebbero altrimenti un ordine che Postgres non garantisce
  // stabile — e con la paginazione un ordine instabile fa comparire due volte
  // la stessa riga in pagine diverse, o sparire un'altra.
  const orderBy = `${orderColumns.map(c => `${c} ${orderDir}`).join(', ')}, i.created_at DESC`;

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // COUNT(*) OVER(): il totale delle righe che passano il filtro viene
  // calcolato dalla stessa query che restituisce la pagina, evitando una
  // seconda andata e ritorno al database con gli stessi filtri da tenere
  // sincronizzati a mano.
  const result = await query(
    `SELECT i.*, s.nome, s.cognome, COUNT(*) OVER() AS total_count
     FROM incontro i
     JOIN socio s ON s.id = i.socio_id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT :limit OFFSET :offset`,
    params
  );

  const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(row => {
    // total_count è un dettaglio della query, non un campo dell'incontro:
    // lasciarlo passerebbe nel JSON di ogni riga.
    const { total_count: _ignored, ...incontro } = row as Record<string, unknown>;
    return toIncontro(incontro);
  });

  return { rows, total };
}

/** Una riga del resoconto: un'attività di un istruttore, con conteggio e costo. */
export interface RigaResoconto {
  /** null per gli incontri senza istruttore (vedi la colonna in schema.sql). */
  istruttore: string | null;
  attivita: string;
  incontri: number;
  costo: number;
}

/**
 * Resoconto aggregato degli incontri di un periodo, raggruppati per istruttore
 * e attività.
 *
 * L'aggregazione è in SQL e non nel browser perché il resoconto ha bisogno di
 * *tutti* gli incontri del periodo: con l'elenco paginato il frontend ne vedrebbe
 * solo una pagina e produrrebbe totali più bassi del vero, senza alcun segnale
 * che manchi qualcosa. Qui il traffico è invece proporzionale al numero di
 * combinazioni istruttore/attività — poche decine — non al numero di incontri.
 *
 * Include anche i gruppi con istruttore NULL: sta al chiamante decidere come
 * presentarli (ResocontoPage li dichiara come esclusi dai prospetti).
 */
export async function resocontoIncontri(da?: string, a?: string): Promise<RigaResoconto[]> {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (da) {
    where.push('data_incontro >= CAST(:da AS DATE)');
    params.da = da;
  }
  if (a) {
    where.push('data_incontro <= CAST(:a AS DATE)');
    params.a = a;
  }

  const result = await query(
    `SELECT istruttore, attivita, COUNT(*) AS incontri, SUM(costo) AS costo
     FROM incontro
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY istruttore, attivita
     ORDER BY istruttore NULLS LAST, SUM(costo) DESC`,
    params
  );

  // COUNT e SUM arrivano come stringa (bigint e numeric via JSON): convertiti
  // qui, così il frontend riceve numeri e non deve ricordarsi di farlo.
  return result.rows.map(row => ({
    istruttore: (row.istruttore as string | null) ?? null,
    attivita:   row.attivita as string,
    incontri:   Number(row.incontri),
    costo:      Number(row.costo),
  }));
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
      `INSERT INTO incontro (socio_id, data_incontro, attivita, istruttore, costo, note, note_markdown)
       VALUES (:socio_id, :data_incontro, :attivita, :istruttore, :costo, :note, :note_markdown)
       RETURNING *`,
      {
        socio_id: input.socio_id,
        data_incontro: input.data_incontro,
        attivita: input.attivita.trim(),
        // Stringa vuota normalizzata a NULL: "nessun istruttore" deve essere
        // un solo valore a db, altrimenti i raggruppamenti del resoconto
        // vedrebbero due gruppi distinti ('' e NULL) per lo stesso caso.
        istruttore: input.istruttore?.trim() || null,
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
    if (input.istruttore !== undefined) {
      setClauses.push('istruttore = :istruttore');
      params.istruttore = input.istruttore?.trim() || null;
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
