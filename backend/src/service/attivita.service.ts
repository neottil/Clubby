/**
 * Listino delle attività e abilitazioni degli istruttori.
 *
 * Le attività erano una variabile di configurazione del frontend: sono ora un
 * dato applicativo, perché servono a decidere che cosa un istruttore può
 * registrare — una decisione di autorizzazione, che deve stare dove sta il
 * controllo, non nel bundle del browser.
 *
 * L'istruttore è identificato dall'id del suo account nell'authorizer (il
 * claim `sub`): qui non esiste una tabella utenti, e non c'è quindi alcuna FK
 * a garantirne l'esistenza. Stessa convenzione di socio.id_viewer.
 */

import { query, withTransaction, type QueryFn } from '../db/client.js';
import { NotFoundError, BadRequestError, ConflictError } from '../middleware/auth.js';

export interface Attivita {
  id: string;
  nome: string;
  costo_default: number;
  attiva: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAttivitaInput {
  nome: string;
  costo_default?: number;
  attiva?: boolean;
}

export interface UpdateAttivitaInput {
  nome?: string;
  costo_default?: number;
  attiva?: boolean;
}

/**
 * costo_default arriva dal driver come stringa (DECIMAL → numeric): convertito
 * qui, così chi legge il listino riceve un numero e non deve ricordarsene a
 * ogni uso (il costo proposto nel form finirebbe altrimenti concatenato invece
 * che sommato).
 */
function toAttivita(row: Record<string, unknown>): Attivita {
  return { ...row, costo_default: Number(row.costo_default) } as Attivita;
}

/**
 * Elenco del listino. `soloAttive` per i menu di scelta: un'attività
 * disattivata non va più proposta, ma resta leggibile sugli incontri passati.
 */
export async function listAttivita(soloAttive = false): Promise<Attivita[]> {
  const result = await query(
    `SELECT * FROM attivita
     ${soloAttive ? 'WHERE attiva = TRUE' : ''}
     ORDER BY nome`
  );
  return result.rows.map(r => toAttivita(r as Record<string, unknown>));
}

export async function getAttivitaById(id: string, q: QueryFn = query): Promise<Attivita> {
  const result = await q(`SELECT * FROM attivita WHERE id = :id`, { id });
  if (result.rows.length === 0) {
    throw new NotFoundError(`Attività con id ${id} non trovata`);
  }
  return toAttivita(result.rows[0] as Record<string, unknown>);
}

export async function createAttivita(input: CreateAttivitaInput): Promise<Attivita> {
  const nome = input.nome?.trim();
  if (!nome) throw new BadRequestError('Il nome dell\'attività è obbligatorio');
  if (input.costo_default !== undefined && input.costo_default < 0) {
    throw new BadRequestError('Il costo non può essere negativo');
  }

  // Il vincolo UNIQUE è già a database: intercettarlo qui serve solo a
  // restituire un 409 con un messaggio leggibile invece di un 500.
  const esistente = await query(
    `SELECT 1 FROM attivita WHERE LOWER(nome) = LOWER(:nome)`,
    { nome }
  );
  if (esistente.rows.length > 0) {
    throw new ConflictError(`Esiste già un'attività chiamata "${nome}"`);
  }

  const result = await query(
    `INSERT INTO attivita (nome, costo_default, attiva)
     VALUES (:nome, :costo_default, :attiva)
     RETURNING *`,
    {
      nome,
      costo_default: input.costo_default ?? 0,
      attiva: input.attiva ?? true,
    }
  );
  return toAttivita(result.rows[0] as Record<string, unknown>);
}

export async function updateAttivita(id: string, input: UpdateAttivitaInput): Promise<Attivita> {
  await getAttivitaById(id);

  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  if (input.nome !== undefined) {
    const nome = input.nome.trim();
    if (!nome) throw new BadRequestError('Il nome dell\'attività è obbligatorio');
    const esistente = await query(
      `SELECT 1 FROM attivita WHERE LOWER(nome) = LOWER(:nome) AND id <> :id`,
      { nome, id }
    );
    if (esistente.rows.length > 0) {
      throw new ConflictError(`Esiste già un'attività chiamata "${nome}"`);
    }
    setClauses.push('nome = :nome');
    params.nome = nome;
  }
  if (input.costo_default !== undefined) {
    if (input.costo_default < 0) throw new BadRequestError('Il costo non può essere negativo');
    setClauses.push('costo_default = :costo_default');
    params.costo_default = input.costo_default;
  }
  if (input.attiva !== undefined) {
    setClauses.push('attiva = :attiva');
    params.attiva = input.attiva;
  }

  if (setClauses.length === 0) throw new BadRequestError('Nessun campo da aggiornare');

  const result = await query(
    `UPDATE attivita SET ${setClauses.join(', ')} WHERE id = :id RETURNING *`,
    params
  );
  return toAttivita(result.rows[0] as Record<string, unknown>);
}

/**
 * Elimina una voce di listino. Se ha incontri collegati l'operazione viene
 * rifiutata: cancellarla renderebbe illeggibile lo storico. Il controllo è
 * esplicito e non lasciato alla violazione della foreign key, che tornerebbe
 * come 500 con un messaggio del driver.
 */
export async function deleteAttivita(id: string): Promise<void> {
  await getAttivitaById(id);

  const usata = await query(
    `SELECT COUNT(*) AS n FROM incontro WHERE attivita_id = :id`,
    { id }
  );
  const n = Number(usata.rows[0].n);
  if (n > 0) {
    throw new ConflictError(
      `L'attività è usata da ${n} ${n === 1 ? 'incontro' : 'incontri'} e non può essere eliminata. ` +
      `Puoi disattivarla: sparirà dalle scelte ma resterà leggibile sullo storico.`
    );
  }

  await query(`DELETE FROM attivita WHERE id = :id`, { id });
}

// ---------------------------------------------------------------
// Abilitazioni degli istruttori
// ---------------------------------------------------------------

/** Id delle attività che un istruttore è abilitato a svolgere. */
export async function abilitazioniDi(istruttoreId: string, q: QueryFn = query): Promise<string[]> {
  const result = await q(
    `SELECT attivita_id FROM istruttore_attivita WHERE istruttore_id = :istruttoreId`,
    { istruttoreId }
  );
  return result.rows.map(r => String(r.attivita_id));
}

/** Tutte le abilitazioni, per istruttore: una sola lettura per la pagina Impostazioni. */
export async function tutteLeAbilitazioni(): Promise<Record<string, string[]>> {
  const result = await query(
    `SELECT istruttore_id, attivita_id FROM istruttore_attivita`
  );
  const perIstruttore: Record<string, string[]> = {};
  for (const row of result.rows) {
    (perIstruttore[String(row.istruttore_id)] ??= []).push(String(row.attivita_id));
  }
  return perIstruttore;
}

/**
 * Sostituisce in blocco le abilitazioni di un istruttore. In transazione: una
 * cancellazione riuscita seguita da un inserimento fallito lascerebbe
 * l'istruttore senza alcuna abilitazione, cioè impossibilitato a lavorare.
 */
export async function impostaAbilitazioni(
  istruttoreId: string,
  attivitaIds: string[]
): Promise<string[]> {
  if (!istruttoreId) throw new BadRequestError('Istruttore non specificato');

  return withTransaction(async (q) => {
    // Ogni id va verificato: un id inesistente violerebbe comunque la foreign
    // key, ma con un errore del driver invece che con un messaggio utile.
    for (const attivitaId of attivitaIds) {
      await getAttivitaById(attivitaId, q);
    }

    await q(`DELETE FROM istruttore_attivita WHERE istruttore_id = :istruttoreId`, { istruttoreId });

    for (const attivitaId of attivitaIds) {
      await q(
        `INSERT INTO istruttore_attivita (istruttore_id, attivita_id)
         VALUES (:istruttoreId, :attivitaId)`,
        { istruttoreId, attivitaId }
      );
    }

    return attivitaIds;
  });
}

/**
 * Attività che un istruttore può svolgere, complete di nome e costo: è la
 * lista che il suo form di inserimento deve proporre.
 */
export async function attivitaDiIstruttore(istruttoreId: string): Promise<Attivita[]> {
  const result = await query(
    `SELECT a.* FROM attivita a
     JOIN istruttore_attivita ia ON ia.attivita_id = a.id
     WHERE ia.istruttore_id = :istruttoreId AND a.attiva = TRUE
     ORDER BY a.nome`,
    { istruttoreId }
  );
  return result.rows.map(r => toAttivita(r as Record<string, unknown>));
}

/**
 * Verifica che un istruttore sia abilitato a un'attività, e lo dice con un
 * messaggio comprensibile. Usata dal servizio incontri prima di scrivere: il
 * controllo non può stare solo nell'interfaccia, che propone la lista giusta
 * ma non impedisce una chiamata diretta all'API.
 */
export async function verificaAbilitazione(
  istruttoreId: string,
  attivitaId: string,
  q: QueryFn = query
): Promise<void> {
  const result = await q(
    `SELECT 1 FROM istruttore_attivita
     WHERE istruttore_id = :istruttoreId AND attivita_id = :attivitaId`,
    { istruttoreId, attivitaId }
  );
  if (result.rows.length === 0) {
    const attivita = await getAttivitaById(attivitaId, q);
    throw new BadRequestError(`Non sei abilitato all'attività "${attivita.nome}"`);
  }
}
