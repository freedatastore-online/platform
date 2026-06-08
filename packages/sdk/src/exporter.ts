import { query, getConnection } from './engine.js';

export type ExportFormat = 'csv' | 'json' | 'parquet' | 'sql';

export async function exportTable(
  table: string,
  format: ExportFormat,
): Promise<Blob> {
  const conn = await getConnection();

  switch (format) {
    case 'csv': {
      const result = await conn.query(`SELECT * FROM "${table}"`);
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
      const rows = await query(`SELECT * FROM "${table}"`);
      return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    }
    case 'sql': {
      const schemaResult = await query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='${table}' ORDER BY ordinal_position`,
      );
      const cols = schemaResult.map(
        (r) => `  "${r.column_name}" ${r.data_type}`,
      );
      const createSQL = `CREATE TABLE "${table}" (\n${cols.join(',\n')}\n);\n\n`;
      const rows = await query(`SELECT * FROM "${table}"`);
      const inserts = rows.map((row) => {
        const values = Object.values(row)
          .map((v) => (v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v))
          .join(', ');
        return `INSERT INTO "${table}" VALUES (${values});`;
      });
      return new Blob([createSQL + inserts.join('\n')], { type: 'text/sql' });
    }
    case 'parquet': {
      const db = (await import('./engine.js')).getDB;
      const instance = await db();
      await conn.query(`COPY "${table}" TO '${table}.parquet' (FORMAT PARQUET)`);
      const buffer = await instance.copyFileToBuffer(`${table}.parquet`);
      return new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' });
    }
  }
}
