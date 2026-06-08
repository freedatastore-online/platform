import { query } from './engine.js';
import { escId, escStr } from './loader.js';

export interface ColumnProfile {
  name: string;
  type: string;
  nullCount: number;
  nullPct: number;
  distinctCount: number;
  min: unknown;
  max: unknown;
  mean: number | null;
  median: number | null;
  stddev: number | null;
  topValues: { value: unknown; count: number }[];
}

export interface TableProfile {
  table: string;
  rows: number;
  columns: number;
  profiles: ColumnProfile[];
  duplicateRows: number;
}

export async function profile(table: string): Promise<TableProfile> {
  const t = escId(table);
  const countResult = await query(`SELECT count(*) as cnt FROM ${t}`);
  const rows = Number(countResult[0]?.cnt ?? 0);

  const colResult = await query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=${escStr(table)} ORDER BY ordinal_position`,
  );

  const profiles: ColumnProfile[] = [];

  for (const col of colResult) {
    const name = String(col.column_name);
    const c = escId(name);
    const type = String(col.data_type);
    const isNumeric = /INT|FLOAT|DOUBLE|DECIMAL|NUMERIC|BIGINT|SMALLINT|TINYINT|HUGEINT/i.test(
      type,
    );

    const statsSQL = `
      SELECT
        count(*) - count(${c}) as null_count,
        ROUND(100.0 * (count(*) - count(${c})) / GREATEST(count(*), 1), 2) as null_pct,
        count(DISTINCT ${c}) as distinct_count,
        min(${c})::VARCHAR as min_val,
        max(${c})::VARCHAR as max_val
        ${isNumeric ? `, avg(${c}) as mean_val, median(${c}) as median_val, stddev(${c}) as stddev_val` : ''}
      FROM ${t}
    `;

    const stats = (await query(statsSQL))[0]!;

    const topSQL = `
      SELECT ${c}::VARCHAR as val, count(*) as cnt
      FROM ${t}
      WHERE ${c} IS NOT NULL
      GROUP BY ${c}
      ORDER BY cnt DESC
      LIMIT 10
    `;
    const topRows = await query(topSQL);
    const topValues = topRows.map((r) => ({ value: r.val, count: Number(r.cnt) }));

    profiles.push({
      name,
      type,
      nullCount: Number(stats.null_count),
      nullPct: Number(stats.null_pct),
      distinctCount: Number(stats.distinct_count),
      min: stats.min_val,
      max: stats.max_val,
      mean: isNumeric ? Number(stats.mean_val) : null,
      median: isNumeric ? Number(stats.median_val) : null,
      stddev: isNumeric ? Number(stats.stddev_val) : null,
      topValues,
    });
  }

  const dupSQL = `SELECT count(*) as cnt FROM (SELECT *, count(*) as _n FROM ${t} GROUP BY ALL HAVING _n > 1)`;
  const dupResult = await query(dupSQL);
  const duplicateRows = Number(dupResult[0]?.cnt ?? 0);

  return { table, rows, columns: profiles.length, profiles, duplicateRows };
}
