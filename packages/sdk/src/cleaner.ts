import { query, getConnection } from './engine.js';
import { escId, escStr } from './loader.js';

export type CleanRule =
  | { type: 'drop_nulls'; columns?: string[] }
  | { type: 'drop_duplicates' }
  | { type: 'trim_whitespace'; columns?: string[] }
  | { type: 'fill_nulls'; column: string; value: string | number }
  | { type: 'drop_column'; column: string }
  | { type: 'rename_column'; from: string; to: string }
  | { type: 'cast'; column: string; toType: string };

export interface CleanResult {
  rule: CleanRule;
  rowsBefore: number;
  rowsAfter: number;
  rowsAffected: number;
}

/** Whitelist of valid SQL types for cast operations. */
const VALID_TYPES = new Set([
  'VARCHAR', 'TEXT', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
  'DOUBLE', 'FLOAT', 'REAL', 'DECIMAL', 'NUMERIC', 'BOOLEAN', 'BOOL',
  'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIME', 'INTERVAL',
  'BLOB', 'HUGEINT', 'UINTEGER', 'UBIGINT',
]);

export async function clean(table: string, rules: CleanRule[]): Promise<CleanResult[]> {
  const results: CleanResult[] = [];
  const t = escId(table);

  for (const rule of rules) {
    const before = Number((await query(`SELECT count(*) as cnt FROM ${t}`))[0]?.cnt ?? 0);

    const conn = await getConnection();

    switch (rule.type) {
      case 'drop_nulls': {
        const cols =
          rule.columns ??
          (
            await query(
              `SELECT column_name FROM information_schema.columns WHERE table_name=${escStr(table)}`,
            )
          ).map((r) => String(r.column_name));
        const where = cols.map((c) => `${escId(c)} IS NOT NULL`).join(' AND ');
        await conn.query(`CREATE OR REPLACE TABLE ${t} AS SELECT * FROM ${t} WHERE ${where}`);
        break;
      }
      case 'drop_duplicates':
        await conn.query(`CREATE OR REPLACE TABLE ${t} AS SELECT DISTINCT * FROM ${t}`);
        break;
      case 'trim_whitespace': {
        const cols =
          rule.columns ??
          (
            await query(
              `SELECT column_name FROM information_schema.columns WHERE table_name=${escStr(table)} AND data_type='VARCHAR'`,
            )
          ).map((r) => String(r.column_name));
        for (const col of cols) {
          const c = escId(col);
          await conn.query(`UPDATE ${t} SET ${c} = trim(${c}) WHERE ${c} IS NOT NULL`);
        }
        break;
      }
      case 'fill_nulls': {
        const c = escId(rule.column);
        await conn.query(
          `UPDATE ${t} SET ${c} = ${escStr(String(rule.value))} WHERE ${c} IS NULL`,
        );
        break;
      }
      case 'drop_column':
        await conn.query(`ALTER TABLE ${t} DROP COLUMN ${escId(rule.column)}`);
        break;
      case 'rename_column':
        await conn.query(`ALTER TABLE ${t} RENAME COLUMN ${escId(rule.from)} TO ${escId(rule.to)}`);
        break;
      case 'cast': {
        const upperType = rule.toType.toUpperCase().trim();
        if (!VALID_TYPES.has(upperType)) {
          throw new Error(`Invalid type for cast: ${rule.toType}`);
        }
        await conn.query(
          `ALTER TABLE ${t} ALTER COLUMN ${escId(rule.column)} SET DATA TYPE ${upperType}`,
        );
        break;
      }
    }

    const after = Number((await query(`SELECT count(*) as cnt FROM ${t}`))[0]?.cnt ?? 0);

    results.push({
      rule,
      rowsBefore: before,
      rowsAfter: after,
      rowsAffected: before - after,
    });
  }

  return results;
}
