/**
 * Database client — uses pg Pool directly (both local and production).
 *
 * The query() interface uses named parameters (:name) for compatibility
 * with the existing service layer, converting them to $1, $2, etc.
 */

import pg from 'pg';

// Il driver pg, per il tipo DATE (OID 1082), costruisce di default un
// oggetto Date JS a mezzanotte — che poi, serializzato in JSON (.toISOString,
// sempre in UTC), può "scivolare" al giorno prima o dopo a seconda del
// timezone del processo Node. Disabilitato: la data resta la stringa
// "YYYY-MM-DD" esatta memorizzata in Postgres, senza alcuna conversione.
pg.types.setTypeParser(1082, (val: string) => val);

const pool = new pg.Pool({
  host:     process.env.DB_HOST ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME ?? 'clubmanager',
  user:     process.env.DB_USER ?? 'clubmanager',
  password: process.env.DB_PASSWORD ?? 'clubmanager',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export interface QueryResult {
  rows: Record<string, unknown>[];
  numberOfRecordsUpdated?: number;
}

export type QueryFn = (sql: string, params?: Record<string, unknown>) => Promise<QueryResult>;

interface Queryable {
  query: (sql: string, values: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

/**
 * Converte i parametri con nome (:name) in parametri posizionali ($1, $2, ...)
 * ed esegue la query su un qualunque oggetto "queryable" (pool o client).
 */
async function runQuery(
  executor: Queryable,
  sql: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  const values: unknown[] = [];
  let i = 1;
  const pgSql = sql.replace(/:(\w+)/g, (_, name) => {
    values.push(params[name] ?? null);
    return `$${i++}`;
  });

  const result = await executor.query(pgSql, values);
  return {
    rows: result.rows,
    numberOfRecordsUpdated: result.rowCount ?? undefined,
  };
}

/**
 * Execute a SQL query with named parameters (:name syntax).
 * Converts to positional $1, $2, ... for pg.
 */
export async function query(
  sql: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  return runQuery(pool, sql, params);
}

/**
 * Esegue `fn` dentro una singola transazione (BEGIN/COMMIT/ROLLBACK su una
 * connessione dedicata, presa in prestito dal pool). `fn` riceve una `query`
 * con la stessa firma di quella esportata sopra, ma vincolata alla stessa
 * connessione/transazione — usarla per tutte le query che devono essere
 * atomiche insieme. In caso di eccezione la transazione viene annullata e
 * l'errore ripropagato al chiamante.
 */
export async function withTransaction<T>(
  fn: (txQuery: QueryFn) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txQuery: QueryFn = (sql, params) => runQuery(client, sql, params ?? {});
    const result = await fn(txQuery);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default pool;
