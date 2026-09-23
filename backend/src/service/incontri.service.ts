import { query, withTransaction, type QueryFn } from '../db/client.js';
import { limiteEOffset } from '../util/paginazione.js';
import { condizioniRicerca } from '../util/ricerca.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';
import { getAttivitaById } from './attivita.service.js';
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
  /** Voce di listino (tabella attivita). */
  attivita_id: string;
  /**
   * Nome dell'attività, dalla JOIN con il listino: non è una colonna di
   * incontro. Presente in lettura perché ogni riga sia leggibile da sola,
   * senza che il chiamante debba incrociare a parte il listino.
   */
  attivita?: string;
  /**
   * Account dell'istruttore che ha tenuto l'incontro (claim `sub`). null se
   * l'incontro non è attribuito a nessuno: l'admin può non indicarlo, e gli
   * incontri anteriori alla gestione degli istruttori a database non hanno un
   * account a cui ricondursi.
   */
  istruttore_id: string | null;
  costo: number;
  note: string | null;
  note_markdown: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIncontroInput {
  socio_id: string;
  data_incontro: string;
  attivita_id: string;
  istruttore_id?: string | null;
  costo: number;
  note?: string;
  note_markdown?: boolean;
}

// socio_id volutamente escluso: il socio di un incontro non è modificabile
// dopo la creazione (vedi updateIncontro).
export interface UpdateIncontroInput {
  data_incontro?: string;
  attivita_id?: string;
  istruttore_id?: string | null;
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

/**
 * Pagina di incontri con, in più, la somma dei costi di TUTTI gli incontri che
 * soddisfano il filtro — non solo di quelli restituiti. È il totale che il
 * resoconto mostra per il periodo scelto: calcolarlo nel browser sulle righe
 * caricate darebbe un valore più basso del vero finché non si carica tutto.
 */
export interface PaginaIncontri extends Page<Incontro> {
  totaleCosto: number;
}

export interface ListIncontriOptions {
  socioId?: string;
  /** Ricerca libera su cognome, nome e attività. */
  q?: string;
  attivitaId?: string;
  istruttoreId?: string;
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
  attivita:      ['a.nome'],
  // Per id e non per nome: i nomi degli istruttori stanno nel database
  // dell'authorizer e non sono raggiungibili da questa query. L'ordinamento
  // non è alfabetico, ma tiene insieme le righe dello stesso istruttore, che è
  // ciò per cui si clicca su quella colonna.
  istruttore:    ['i.istruttore_id'],
  costo:         ['i.costo'],
};


/**
 * Descrizione del movimento di addebito generato da un incontro.
 *
 * Unico punto in cui viene composta: la usano sia la creazione sia la modifica
 * dell'incontro, che devono produrre la stessa stringa (altrimenti rinominare
 * l'attività lascerebbe descrizioni di formato diverso nella stessa lista).
 *
 * Il nome dell'attività viene copiato nella descrizione invece di essere
 * risolto ogni volta dal listino: il movimento è una scrittura contabile, e
 * deve continuare a dire per che cosa fu addebitato anche se l'attività viene
 * in seguito rinominata.
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
export async function listIncontri(options: ListIncontriOptions = {}): Promise<PaginaIncontri> {
  const { limit, offset } = limiteEOffset(options);

  const where: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  if (options.socioId) {
    where.push('i.socio_id = :socioId');
    params.socioId = options.socioId;
  }
  if (options.attivitaId) {
    where.push('i.attivita_id = :attivitaId');
    params.attivitaId = options.attivitaId;
  }
  if (options.istruttoreId) {
    where.push('i.istruttore_id = :istruttoreId');
    params.istruttoreId = options.istruttoreId;
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
  where.push(...condizioniRicerca(options.q, ['s.cognome', 's.nome', 'a.nome'], params));

  const orderColumns = SORT_COLUMNS[options.sort ?? ''] ?? SORT_COLUMNS.data_incontro;
  const orderDir     = options.dir === 'asc' ? 'ASC' : 'DESC';
  // created_at come spareggio: le date sono DATE, quindi più incontri dello
  // stesso giorno avrebbero altrimenti un ordine che Postgres non garantisce
  // stabile — e con la paginazione un ordine instabile fa comparire due volte
  // la stessa riga in pagine diverse, o sparire un'altra.
  const orderBy = `${orderColumns.map(c => `${c} ${orderDir}`).join(', ')}, i.created_at DESC`;

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // COUNT(*) OVER() e SUM(costo) OVER(): numero e costo complessivo delle
  // righe che passano il filtro, calcolati dalla stessa query che restituisce
  // la pagina. Le funzioni finestra sono valutate prima di LIMIT/OFFSET, quindi
  // coprono tutto il risultato filtrato e non la sola pagina; e stando nella
  // stessa query non esiste il rischio che totali e righe rispondano a filtri
  // leggermente diversi.
  const result = await query(
    `SELECT i.*, s.nome, s.cognome, a.nome AS attivita,
            COUNT(*) OVER() AS total_count,
            SUM(i.costo) OVER() AS totale_costo
     FROM incontro i
     JOIN socio s ON s.id = i.socio_id
     JOIN attivita a ON a.id = i.attivita_id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT :limit OFFSET :offset`,
    params
  );

  const prima = result.rows[0];
  const total       = prima ? Number(prima.total_count) : 0;
  const totaleCosto = prima ? Number(prima.totale_costo) : 0;
  const rows = result.rows.map(row => {
    // I totali sono un dettaglio della query, non campi dell'incontro:
    // lasciarli passerebbe nel JSON di ogni riga.
    const { total_count: _n, totale_costo: _c, ...incontro } = row as Record<string, unknown>;
    return toIncontro(incontro);
  });

  return { rows, total, totaleCosto };
}

export async function getIncontroById(id: string, q: QueryFn = query): Promise<Incontro> {
  const result = await q(
    `SELECT i.*, a.nome AS attivita
     FROM incontro i
     JOIN attivita a ON a.id = i.attivita_id
     WHERE i.id = :id`,
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
  // Controllo esplicito e non lasciato al vincolo NOT NULL della colonna:
  // l'errore di Postgres tornerebbe al client come 500 anziché come 400 con un
  // messaggio leggibile.
  if (!input.attivita_id) throw new BadRequestError('attivita_id è obbligatoria');
  if (input.costo === undefined || input.costo < 0) {
    throw new BadRequestError('costo deve essere >= 0');
  }

  await getSocioById(input.socio_id);
  // Il nome serve alla descrizione del movimento, e la lettura fa da controllo
  // di esistenza: un attivita_id inventato verrebbe altrimenti respinto dalla
  // foreign key con un errore del driver.
  const attivita = await getAttivitaById(input.attivita_id);

  return withTransaction(async (q) => {
    const result = await q(
      `INSERT INTO incontro (socio_id, data_incontro, attivita_id, istruttore_id, costo, note, note_markdown)
       VALUES (:socio_id, :data_incontro, :attivita_id, :istruttore_id, :costo, :note, :note_markdown)
       RETURNING *`,
      {
        socio_id: input.socio_id,
        data_incontro: input.data_incontro,
        attivita_id: input.attivita_id,
        // Stringa vuota normalizzata a NULL: "nessun istruttore" deve essere
        // un solo valore a db, altrimenti i raggruppamenti del resoconto
        // vedrebbero due gruppi distinti ('' e NULL) per lo stesso caso.
        istruttore_id: input.istruttore_id || null,
        costo: input.costo,
        note: input.note ?? null,
        note_markdown: input.note_markdown ?? false,
      }
    );
    const incontro = { ...toIncontro(result.rows[0]), attivita: attivita.nome };

    const voucher = await getVoucherBySocioId(input.socio_id, q);
    if (voucher) {
      await createMovimento(
        voucher.id,
        {
          importo: -Number(input.costo),
          descrizione: descrizioneAddebito(attivita.nome),
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
    if (input.attivita_id !== undefined) {
      if (!input.attivita_id) throw new BadRequestError('attivita_id è obbligatoria');
      await getAttivitaById(input.attivita_id, q);
      setClauses.push('attivita_id = :attivita_id');
      params.attivita_id = input.attivita_id;
    }
    if (input.istruttore_id !== undefined) {
      setClauses.push('istruttore_id = :istruttore_id');
      params.istruttore_id = input.istruttore_id || null;
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

    await q(
      `UPDATE incontro SET ${setClauses.join(', ')} WHERE id = :id`,
      params
    );
    // Riletto con la JOIN invece di usare RETURNING: serve il nome
    // dell'attività aggiornata, sia per la risposta sia per la descrizione del
    // movimento collegato.
    const incontro = await getIncontroById(id, q);

    // Il movimento collegato segue l'incontro in importo, data e descrizione:
    // una sola lettura, poi solo i campi effettivamente cambiati. Data e
    // descrizione sono presi dalla riga appena aggiornata e non da "input",
    // che è parziale: se cambia solo l'attività, la data da riscrivere è
    // comunque quella già memorizzata sull'incontro.
    const derivatiCambiati = input.data_incontro !== undefined || input.attivita_id !== undefined;
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
              descrizione: descrizioneAddebito(incontro.attivita ?? ''),
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
