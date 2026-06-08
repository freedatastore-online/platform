import { getConnection, registerFile } from './engine.js';

export type FileFormat = 'csv' | 'json' | 'parquet' | 'tsv';

function detectFormat(name: string): FileFormat {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') return 'json';
  if (ext === 'parquet' || ext === 'pq') return 'parquet';
  if (ext === 'tsv') return 'tsv';
  return 'csv';
}

/** Escape a SQL identifier (table/column name) by doubling any double-quotes. */
export function escId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Escape a SQL string literal by doubling single quotes. */
export function escStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface LoadResult {
  table: string;
  format: FileFormat;
  rows: number;
  columns: string[];
}

export async function loadFile(file: File, tableName?: string): Promise<LoadResult> {
  const name = tableName ?? file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  const format = detectFormat(file.name);
  const buffer = new Uint8Array(await file.arrayBuffer());

  // Use a sanitized buffer name to avoid path issues
  const bufferName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  await registerFile(bufferName, buffer);

  const conn = await getConnection();

  const readFn =
    format === 'csv' || format === 'tsv'
      ? `read_csv(${escStr(bufferName)}, auto_detect=true${format === 'tsv' ? ", delim='\\t'" : ''})`
      : format === 'json'
        ? `read_json(${escStr(bufferName)}, auto_detect=true)`
        : `read_parquet(${escStr(bufferName)})`;

  await conn.query(`CREATE OR REPLACE TABLE ${escId(name)} AS SELECT * FROM ${readFn}`);

  const countResult = await conn.query(`SELECT count(*) as cnt FROM ${escId(name)}`);
  const rows = Number(countResult.toArray()[0]?.toJSON().cnt ?? 0);

  const colResult = await conn.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name=${escStr(name)} ORDER BY ordinal_position`,
  );
  const columns = colResult.toArray().map((r) => String(r.toJSON().column_name));

  return { table: name, format, rows, columns };
}
