/**
 * Client del database dell'authorizer.
 *
 * Database e utente sono separati da quelli dell'applicazione: l'authorizer
 * custodisce le credenziali degli utenti, e il backend applicativo non deve
 * poterle leggere nemmeno per errore. Le due connessioni puntano alla stessa
 * istanza Postgres ma a database diversi, con utenti diversi.
 *
 * L'interfaccia usa parametri con nome (:name) come nel backend, convertiti
 * qui in parametri posizionali per pg.
 */

import pg from 'pg';

// Stesse motivazioni del backend: per il tipo DATE (OID 1082) pg costruirebbe
// un Date a mezzanotte che, serializzato in UTC, può scivolare al giorno prima.
pg.types.setTypeParser(1082, (val: string) => val);

const pool = new pg.Pool({
  host:     process.env.DB_HOST ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME ?? 'clubby_auth',
  user:     process.env.DB_USER ?? 'clubby_auth',
  password: process.env.DB_PASSWORD ?? 'clubby_auth',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export interface QueryResult {
  rows: Record<string, unknown>[];
  numberOfRecordsUpdated?: number;
}

/**
 * Esegue una query con parametri con nome (:name), convertendoli in $1, $2...
 * Ogni occorrenza di :name diventa un placeholder proprio con lo stesso
 * valore, quindi lo stesso parametro può comparire più volte nella query.
 */
export async function query(
  sql: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  const values: unknown[] = [];
  let i = 1;
  const pgSql = sql.replace(/:(\w+)/g, (_, name) => {
    values.push(params[name] ?? null);
    return `$${i++}`;
  });

  const result = await pool.query(pgSql, values);
  return {
    rows: result.rows,
    numberOfRecordsUpdated: result.rowCount ?? undefined,
  };
}

export default pool;
