import { query, withTransaction, type QueryFn } from '../db/client.js';
import { limiteEOffset } from '../util/paginazione.js';
import { condizioniRicerca } from '../util/ricerca.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { getSocioById } from './soci.service.js';
import { getAttivitaById } from './attivita.service.js';
import { voceGiaEmessa } from './documenti/voci.service.js';
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
  /**
   * Quando l'incontro è stato rendicontato all'istruttore; null se deve
   * ancora esserlo. Non si annulla, e un incontro rendicontato non si può
   * eliminare: il club ha già riconosciuto un compenso su quel numero.
   */
  rendicontato_il: string | null;
  /**
   * La ricevuta che comprende questo incontro, quando ce n'è una.
   *
   * Presenti solo se il modulo ricevute è attivo **e** chi chiama è
   * l'intestatario (l'admin, o il socio dell'incontro): un istruttore che
   * guarda gli incontri che ha tenuto non deve leggere il codice di un
   * documento intestato a qualcun altro. Vedi `conDocumento`.
   *
   * Un incontro coperto da voucher non è documentato singolarmente: la
   * ricevuta sta sulla ricarica che lo paga, quindi qui resta null.
   */
  documento_id?: string | null;
  documento_anno?: number | null;
  documento_numero?: number | null;
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
  /**
   * Restringe l'elenco agli incontri ANCORA da rendicontare.
   *
   * Non è il default, di proposito: la rendicontazione riguarda il compenso
   * dell'istruttore e non dice niente al socio, che nella propria pagina
   * Incontri deve continuare a vedere tutto il proprio storico. Lo stesso vale
   * per la vista di gestione dell'admin. Il filtro è quindi acceso solo da chi
   * sta effettivamente rendicontando, cioè da Resoconti.
   */
  soloDaRendicontare?: boolean;
  /**
   * Porta anche la ricevuta di ogni incontro (id, anno, numero).
   *
   * Lo decide il chiamante, non questo servizio, perché dipende da CHI sta
   * guardando: l'admin e il socio dell'incontro sì, l'istruttore che ha tenuto
   * l'incontro di un altro no — quel documento non è suo. Spento anche a
   * modulo ricevute spento, dove i campi non devono comparire affatto.
   */
  conDocumento?: boolean;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Le due giunture che portano la ricevuta di una riga.
 *
 * Sicure dentro una query paginata **grazie all'indice unico**
 * `idx_documento_emesso_voce_riferimento` su (tipo, riferimento_id): al più una
 * riga per incontro, quindi la giuntura non moltiplica le righe. Se
 * quell'indice sparisse, `COUNT(*) OVER()` e `SUM(costo) OVER()` qui sotto
 * comincerebbero a contare doppio senza dare errore.
 */
const COLONNE_DOCUMENTO = `, d.documento_id, doc.anno AS documento_anno, doc.numero AS documento_numero`;
const JOIN_DOCUMENTO = `
     LEFT JOIN documento_emesso_voce d ON d.tipo = 'incontro' AND d.riferimento_id = i.id
     LEFT JOIN documento doc ON doc.id = d.documento_id`;

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
  if (options.soloDaRendicontare) {
    where.push('i.rendicontato_il IS NULL');
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
    `SELECT i.*, s.nome, s.cognome, a.nome AS attivita${options.conDocumento ? COLONNE_DOCUMENTO : ''},
            COUNT(*) OVER() AS total_count,
            SUM(i.costo) OVER() AS totale_costo
     FROM incontro i
     JOIN socio s ON s.id = i.socio_id
     JOIN attivita a ON a.id = i.attivita_id${options.conDocumento ? JOIN_DOCUMENTO : ''}
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

/**
 * `conDocumento` è spento di default perché questa funzione la usano soprattutto
 * i controlli interni (modifica, eliminazione, creazione del movimento), a cui
 * la ricevuta non serve. La accende solo la lettura di un incontro fatta da chi
 * ha diritto di vederne il documento.
 */
export async function getIncontroById(
  id: string,
  q: QueryFn = query,
  conDocumento = false
): Promise<Incontro> {
  const result = await q(
    `SELECT i.*, a.nome AS attivita${conDocumento ? COLONNE_DOCUMENTO : ''}
     FROM incontro i
     JOIN attivita a ON a.id = i.attivita_id${conDocumento ? JOIN_DOCUMENTO : ''}
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
 * costo. Il saldo del voucher non blocca la creazione: può andare, o restare,
 * sotto zero (spec 010), e la conferma la chiede l'interfaccia.
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
 * movimento viene aggiornato nella stessa transazione, anche se il voucher
 * va o resta sotto zero.
 */
export async function updateIncontro(id: string, input: UpdateIncontroInput): Promise<Incontro> {
  return withTransaction(async (q) => {
    const attuale = await getIncontroById(id, q);

    // Stesso motivo per cui non si può eliminare, e vale anche per le note o
    // la data: un incontro chiuso è la riga su cui si è pagato o registrato, e
    // se può ancora cambiare quel numero smette di essere ricostruibile. Il
    // controllo è sull'intera modifica e non sul solo costo di proposito —
    // spostare la data di un incontro lo farebbe uscire dal periodo in cui è
    // stato conteggiato, che è lo stesso danno per un'altra via.
    if (attuale.rendicontato_il) {
      throw new BadRequestError(
        'Questo incontro è già stato rendicontato all\'istruttore e non può più essere modificato. ' +
        'Per correggere un errore, contatta l\'amministratore.'
      );
    }
    // `q` e non la connessione globale: siamo dentro una transazione, e la
    // lettura deve vedere lo stesso istante delle scritture che seguono.
    if (await voceGiaEmessa('incontro', id, q)) {
      throw new BadRequestError(
        'Per questo incontro è già stata emessa una ricevuta e non può più essere modificato. ' +
        'Per correggere un errore, contatta l\'amministratore.'
      );
    }

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
  const incontro = await getIncontroById(id);
  // Un incontro rendicontato è già entrato in un conteggio su cui il club ha
  // riconosciuto un compenso all'istruttore: cancellarlo renderebbe quel
  // conteggio non più ricostruibile. Il messaggio dice il perché, perché è
  // quello che il frontend mostra all'utente.
  if (incontro.rendicontato_il) {
    throw new BadRequestError(
      'Questo incontro è già stato rendicontato all\'istruttore e non può essere eliminato. ' +
      'Se è stato registrato per errore, correggine i dati invece di cancellarlo.'
    );
  }
  // Un incontro non coperto da voucher è una voce registrabile: se è già
  // finito in un documento emesso, cancellarlo lascerebbe quel documento a
  // riferire qualcosa che non esiste più.
  if (await voceGiaEmessa('incontro', id)) {
    throw new BadRequestError(
      'Per questo incontro è già stata emessa una ricevuta e non può essere eliminato. ' +
      'Se è stato registrato per errore, correggine i dati invece di cancellarlo.'
    );
  }
  await query(`DELETE FROM incontro WHERE id = :id`, { id });
}

/**
 * Segna come rendicontati gli incontri indicati, e risponde con quanti lo
 * sono diventati DAVVERO in questa chiamata.
 *
 * `WHERE rendicontato_il IS NULL` non è una precauzione teorica: due admin che
 * lavorano sullo stesso periodo selezionano quasi certamente righe in comune, e
 * senza quella condizione il secondo sovrascriverebbe in silenzio la data del
 * primo. Così invece le righe già rendicontate restano com'erano, e la
 * differenza fra richiesti e aggiornati è ciò che l'interfaccia riporta.
 */
export async function rendicontaIncontri(ids: string[]): Promise<{ richiesti: number; rendicontati: number }> {
  if (ids.length === 0) return { richiesti: 0, rendicontati: 0 };

  const result = await query(
    `UPDATE incontro
        SET rendicontato_il = NOW(), updated_at = NOW()
      WHERE id = ANY(:ids) AND rendicontato_il IS NULL
      RETURNING id`,
    { ids }
  );
  return { richiesti: ids.length, rendicontati: result.rows.length };
}
