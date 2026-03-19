/**
 * Database client
 *
 * In produzione (NODE_ENV != development): usa RDS Data API (Aurora Serverless v2)
 * In sviluppo locale (DB_LOCAL=true):       usa pg direttamente su Postgres locale
 *
 * L'interfaccia query() è identica in entrambi i casi.
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  Field,
  SqlParameter,
} from '@aws-sdk/client-rds-data';

const IS_LOCAL       = process.env.DB_LOCAL === 'true';
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN!;
const DB_SECRET_ARN  = process.env.DB_SECRET_ARN!;
const DB_NAME        = process.env.DB_NAME ?? 'clubmanager';
const AWS_REGION     = process.env.AWS_REGION_NAME ?? 'eu-central-1';

// AWS_ENDPOINT è settato solo in locale (es. http://localstack:4566).
// In produzione la variabile non esiste e il client usa l'endpoint AWS reale.
const AWS_ENDPOINT   = process.env.AWS_ENDPOINT;

export interface QueryResult {
  rows: Record<string, unknown>[];
  numberOfRecordsUpdated?: number;
}

// ---------------------------------------------------------------
// RDS Data API client (produzione)
// ---------------------------------------------------------------
const rdsClient = IS_LOCAL
  ? null
  : new RDSDataClient({
      region: AWS_REGION,
      ...(AWS_ENDPOINT ? { endpoint: AWS_ENDPOINT } : {}),
    });

async function queryRds(sql: string, params: Record<string, unknown>): Promise<QueryResult> {
  const parameters: SqlParameter[] = Object.entries(params).map(([name, value]) => ({
    name,
    value: toField(value),
  }));

  const command = new ExecuteStatementCommand({
    resourceArn: DB_CLUSTER_ARN,
    secretArn:   DB_SECRET_ARN,
    database:    DB_NAME,
    sql,
    parameters,
    includeResultMetadata: true,
  });

  const response = await rdsClient!.send(command);
  const columnNames = (response.columnMetadata ?? []).map(col => col.name ?? '');

  const rows: Record<string, unknown>[] = (response.records ?? []).map(record => {
    const row: Record<string, unknown> = {};
    record.forEach((field, idx) => {
      row[columnNames[idx]] = fromField(field);
    });
    return row;
  });

  return { rows, numberOfRecordsUpdated: response.numberOfRecordsUpdated };
}

// ---------------------------------------------------------------
// pg client (sviluppo locale con Postgres diretto)
// ---------------------------------------------------------------
let pgPool: any = null;

async function getPool() {
  if (!pgPool) {
    // Import dinamico: pg è una devDependency, non incluso nel bundle Lambda
    const { default: pg } = await import('pg' as any);
    pgPool = new pg.Pool({
      host:     process.env.DB_HOST ?? 'localhost',
      port:     parseInt(process.env.DB_PORT ?? '5432'),
      database: process.env.DB_NAME ?? 'clubmanager',
      user:     process.env.DB_USER ?? 'clubmanager',
      password: process.env.DB_PASSWORD ?? 'clubmanager_dev',
    });
  }
  return pgPool;
}

async function queryPg(sql: string, params: Record<string, unknown>): Promise<QueryResult> {
  const pool = await getPool();

  // Converte :nome → $1, $2, ... e raccoglie i valori nell'ordine
  const values: unknown[] = [];
  let i = 1;
  const pgSql = sql.replace(/:(\w+)/g, (_, name) => {
    values.push(params[name] ?? null);
    return `$${i++}`;
  });

  const result = await pool.query(pgSql, values);
  return {
    rows: result.rows,
    numberOfRecordsUpdated: result.rowCount,
  };
}

// ---------------------------------------------------------------
// Interfaccia pubblica
// ---------------------------------------------------------------
export async function query(
  sql: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  return IS_LOCAL ? queryPg(sql, params) : queryRds(sql, params);
}

// ---------------------------------------------------------------
// RDS Field helpers
// ---------------------------------------------------------------
function toField(value: unknown): Field {
  if (value === null || value === undefined) return { isNull: true };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function fromField(field: Field): unknown {
  if (field.isNull)           return null;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.longValue !== undefined)    return field.longValue;
  if (field.doubleValue !== undefined)  return field.doubleValue;
  if (field.stringValue !== undefined)  return field.stringValue;
  if (field.blobValue !== undefined)    return field.blobValue;
  return null;
}
