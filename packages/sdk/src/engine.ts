import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

const CDN = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/';

export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db;

  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);

  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (conn) return conn;
  const instance = await getDB();
  conn = await instance.connect();
  return conn;
}

export async function query(sql: string): Promise<Record<string, unknown>[]> {
  const c = await getConnection();
  const result = await c.query(sql);
  return result.toArray().map((row) => row.toJSON() as Record<string, unknown>);
}

export async function registerFile(name: string, data: Uint8Array): Promise<void> {
  const instance = await getDB();
  await instance.registerFileBuffer(name, data);
}

export async function reset(): Promise<void> {
  if (conn) {
    await conn.close();
    conn = null;
  }
}
