/**
 * Database client — uses pg Pool directly (both local and production).
 * Production connects to Aurora Postgres endpoint via pg.
 *
 * The query() interface uses named parameters (:name) for compatibility
 * with the existing service layer, converting them to $1, $2, etc.
 */

import pg from 'pg';

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

/**
 * Execute a SQL query with named parameters (:name syntax).
 * Converts to positional $1, $2, ... for pg.
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
