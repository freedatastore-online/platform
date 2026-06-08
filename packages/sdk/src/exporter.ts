import { query, getConnection } from './engine.js';
import { escId, escStr } from './loader.js';

export type ExportFormat = 'csv' | 'json' | 'parquet' | 'sql';

export async function exportTable(
  table: string,
  format: ExportFormat,
): Promise<Blob> {
  const conn = await getConnection();
  const t = escId(table);

  switch (format) {
    case 'csv': {
      const result = await conn.query(`SELECT * FROM ${t}`);
      const rows = result.toArray().map((r) => r.toJSON() as Record<string, unknown>);
      if (rows.length === 0) return new Blob([''], { type: 'text/csv' });
      const headers = Object.keys(rows[0]!);
      const csvRows = [
        headers.join(','),
        ...rows.map((row) =>
          headers
            .map((h) => {
              const val = row[h];
              if (val === null || val === undefined) return '';
              const str = String(val);
              return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            })
            .join(','),
        ),
      ];
      return new Blob([csvRows.join('\n')], { type: 'text/csv' });
    }
    case 'json': {
      const rows = await query(`SELECT * FROM ${t}`);
      return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    }
    case 'sql': {
      const schemaResult = await query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=${escStr(table)} ORDER BY ordinal_position`,
      );
      const cols = schemaResult.map(
        (r) => `  ${escId(String(r.column_name))} ${r.data_type}`,
      );
      const createSQL = `CREATE TABLE ${t} (\n${cols.join(',\n')}\n);\n\n`;
      const rows = await query(`SELECT * FROM ${t}`);
      const inserts = rows.map((row) => {
        const values = Object.values(row)
          .map((v) => (v === null ? 'NULL' : typeof v === 'string' ? escStr(v) : v))
          .join(', ');
        return `INSERT INTO ${t} VALUES (${values});`;
      });
      return new Blob([createSQL + inserts.join('\n')], { type: 'text/sql' });
    }
    case 'parquet': {
      const db = (await import('./engine.js')).getDB;
      const instance = await db();
      const parquetFile = table.replace(/[^a-zA-Z0-9_]/g, '_') + '.parquet';
      await conn.query(`COPY ${t} TO ${escStr(parquetFile)} (FORMAT PARQUET)`);
      const buffer = await instance.copyFileToBuffer(parquetFile);
      return new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' });
    }
  }
}
