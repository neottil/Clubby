import { query } from '../db/client.js';
import { NotFoundError, BadRequestError } from '../middleware/auth.js';
import { limiteEOffset, direzione } from '../util/paginazione.js';
import { condizioniRicerca } from '../util/ricerca.js';

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

/** Socio ridotto al minimo per nominarlo e sceglierlo in un menu. */
export interface SocioRidotto {
  id: string;
  nome: string;
  cognome: string;
}

/**
 * Elenco dei soci senza i dati personali: nominativo e nient'altro.
 *
 * È ciò che vede un istruttore, che ha bisogno di scegliere il socio quando
 * registra un incontro ma non di conoscerne recapiti, data di iscrizione o
 * note. La riduzione è fatta in SQL e non filtrando l'oggetto dopo: i campi
 * esclusi non escono nemmeno dal database.
 */
export async function listSociRidotto(): Promise<SocioRidotto[]> {
  const result = await query(
    `SELECT id, nome, cognome FROM socio ORDER BY cognome, nome`
  );
  return result.rows as unknown as SocioRidotto[];
}

export interface ListSociOptions {
  /** Ricerca parola per parola; sui soli nominativi se `ridotto`. */
  q?: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
  /** Solo le schede non collegate ad alcun account. */
  senzaAccount?: boolean;
  /** Solo id e nominativo, per chi non deve vedere l'anagrafica (istruttore). */
  ridotto?: boolean;
}

/**
 * Colonne ordinabili. Whitelist e non testo del client: ORDER BY non è
 * parametrizzabile e finisce concatenato nella query (vedi incontri.service).
 * L'id in coda rende l'ordine stabile fra una pagina e l'altra anche a
 * parità di valori.
 */
const ORDINAMENTO_SOCI: Record<string, string[]> = {
  cognome:         ['cognome', 'nome'],
  nome:            ['nome', 'cognome'],
  email:           ['email'],
  telefono:        ['telefono'],
  data_iscrizione: ['data_iscrizione'],
};

/** Elenco paginato dei soci, filtrato e ordinato dal database. */
export async function listSociPaginati(
  options: ListSociOptions = {}
): Promise<{ rows: (Socio | SocioRidotto)[]; total: number }> {
  const { limit, offset } = limiteEOffset(options);
  const params: Record<string, unknown> = { limit, offset };

  // L'istruttore cerca e ordina solo sul nominativo: sui campi che non vede
  // una ricerca rivelerebbe comunque qualcosa (chi ha quell'email).
  const colonneRicerca = options.ridotto ? ['cognome', 'nome'] : ['cognome', 'nome', 'email', 'telefono'];
  const where = condizioniRicerca(options.q, colonneRicerca, params);
  if (options.senzaAccount) where.push('id_viewer IS NULL');

  const chiave = options.ridotto && !['cognome', 'nome'].includes(options.sort ?? '') ? 'cognome' : options.sort ?? 'cognome';
  const colonne = ORDINAMENTO_SOCI[chiave] ?? ORDINAMENTO_SOCI.cognome;
  const dir = direzione(options.dir);
  const orderBy = [...colonne.map(c => `${c} ${dir} NULLS LAST`), 'id'].join(', ');

  const result = await query(
    `SELECT ${options.ridotto ? 'id, nome, cognome' : '*'}, COUNT(*) OVER() AS total_count
     FROM socio
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}
     LIMIT :limit OFFSET :offset`,
    params
  );

  const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(row => {
    const { total_count: _n, ...socio } = row as Record<string, unknown>;
    return socio as unknown as Socio | SocioRidotto;
  });
  return { rows, total };
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

/** L'account a cui collegare un socio: di suo possiede solo le credenziali. */
export interface Account {
  id: string;
  email: string;
}

/**
 * Collega un account a un socio, copiando sul socio l'email dell'account.
 *
 * L'email è l'unico dato anagrafico che l'authorizer possiede, ed è quello con
 * cui la persona accede: da qui in poi identifica il socio, e diventa non
 * modificabile finché il collegamento resta (vedi updateSocio). Nome, cognome
 * e telefono restano invece del socio, che ne è l'unica fonte, e continuano a
 * essere correggibili da un admin.
 */
export async function collegaSocioAdAccount(
  socioId: string,
  account: Account
): Promise<Socio> {
  const giaCollegato = await getSocioByViewerId(account.id);
  if (giaCollegato && giaCollegato.id !== socioId) {
    throw new BadRequestError(
      `L'account è già collegato al socio ${giaCollegato.cognome} ${giaCollegato.nome}. ` +
      `Rimuovi prima quell'associazione.`
    );
  }

  const result = await query(
    `UPDATE socio SET id_viewer = :viewerId, email = :email
     WHERE id = :id
     RETURNING *`,
    { id: socioId, viewerId: account.id, email: account.email }
  );

  if (result.rows.length === 0) {
    throw new NotFoundError(`Socio con id ${socioId} non trovato`);
  }

  return toSocio(result.rows[0]);
}

/**
 * Soci collegati a un account, indicizzati per id dell'account.
 *
 * È il ponte fra i due database: gli account stanno nell'authorizer e non
 * hanno un nominativo, che vive qui. Chi deve mostrare "chi è" un account
 * passa da qui invece di chiederlo all'authorizer, che non lo saprebbe.
 *
 * Legge tutti i soci collegati in una volta: sono tanti quanti gli account
 * registrati — decine, in un'associazione — e una query per riga
 * trasformerebbe un elenco in una raffica di interrogazioni.
 */
export async function sociPerAccount(): Promise<Map<string, Socio>> {
  const result = await query(`SELECT * FROM socio WHERE id_viewer IS NOT NULL`);
  const perAccount = new Map<string, Socio>();
  for (const row of result.rows) {
    const socio = toSocio(row);
    if (socio.id_viewer) perAccount.set(socio.id_viewer, socio);
  }
  return perAccount;
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
  const attuale = await getSocioById(id);

  // L'email di un socio collegato è quella con cui la persona accede, e
  // appartiene al suo account: cambiarla qui creerebbe una seconda verità e
  // romperebbe l'aggancio automatico, che si basa proprio su quel confronto.
  // Per cambiarla serve un altro account, che un admin collega dopo aver
  // scollegato il precedente.
  if (
    attuale.id_viewer &&
    input.email !== undefined &&
    (input.email ?? '').trim().toLowerCase() !== (attuale.email ?? '').toLowerCase()
  ) {
    throw new BadRequestError(
      'L\'email di un socio collegato a un account non è modificabile: è quella con cui accede. ' +
      'Per cambiarla, scollega l\'account e collegane uno registrato con la nuova email.'
    );
  }

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

// Il collegamento account ↔ socio si fa con collegaSocioAdAccount (più sopra),
// che oltre a scrivere id_viewer allinea l'anagrafica del socio a quella
// dell'account. Non esiste più una versione che scriva il solo id_viewer:
// averne due sarebbe stato un invito a usare quella che lascia il socio con
// nome ed email vecchi.

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
