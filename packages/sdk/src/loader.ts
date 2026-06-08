import { getConnection, registerFile } from './engine.js';

export type FileFormat = 'csv' | 'json' | 'parquet' | 'tsv';

function detectFormat(name: string): FileFormat {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') return 'json';
  if (ext === 'parquet' || ext === 'pq') return 'parquet';
  if (ext === 'tsv') return 'tsv';
  return 'csv';
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

  await registerFile(file.name, buffer);

  const conn = await getConnection();

  const readFn =
    format === 'csv' || format === 'tsv'
      ? `read_csv('${file.name}', auto_detect=true${format === 'tsv' ? ", delim='\\t'" : ''})`
      : format === 'json'
        ? `read_json('${file.name}', auto_detect=true)`
        : `read_parquet('${file.name}')`;

  await conn.query(`CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM ${readFn}`);

  const countResult = await conn.query(`SELECT count(*) as cnt FROM "${name}"`);
  const rows = Number(countResult.toArray()[0]?.toJSON().cnt ?? 0);

  const colResult = await conn.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='${name}' ORDER BY ordinal_position`,
  );
  const columns = colResult.toArray().map((r) => String(r.toJSON().column_name));

  return { table: name, format, rows, columns };
}
