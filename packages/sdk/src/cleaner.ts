import { query, getConnection } from './engine.js';

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

export async function clean(table: string, rules: CleanRule[]): Promise<CleanResult[]> {
  const results: CleanResult[] = [];

  for (const rule of rules) {
    const before = Number((await query(`SELECT count(*) as cnt FROM "${table}"`))[0]?.cnt ?? 0);

    const conn = await getConnection();

    switch (rule.type) {
      case 'drop_nulls': {
        const cols =
          rule.columns ??
          (
            await query(
              `SELECT column_name FROM information_schema.columns WHERE table_name='${table}'`,
            )
          ).map((r) => String(r.column_name));
        const where = cols.map((c) => `"${c}" IS NOT NULL`).join(' AND ');
        await conn.query(`CREATE OR REPLACE TABLE "${table}" AS SELECT * FROM "${table}" WHERE ${where}`);
        break;
      }
      case 'drop_duplicates':
        await conn.query(`CREATE OR REPLACE TABLE "${table}" AS SELECT DISTINCT * FROM "${table}"`);
        break;
      case 'trim_whitespace': {
        const cols =
          rule.columns ??
          (
            await query(
              `SELECT column_name FROM information_schema.columns WHERE table_name='${table}' AND data_type='VARCHAR'`,
            )
          ).map((r) => String(r.column_name));
        for (const col of cols) {
          await conn.query(`UPDATE "${table}" SET "${col}" = trim("${col}") WHERE "${col}" IS NOT NULL`);
        }
        break;
      }
      case 'fill_nulls':
        await conn.query(
          `UPDATE "${table}" SET "${rule.column}" = '${rule.value}' WHERE "${rule.column}" IS NULL`,
        );
        break;
      case 'drop_column':
        await conn.query(`ALTER TABLE "${table}" DROP COLUMN "${rule.column}"`);
        break;
      case 'rename_column':
        await conn.query(`ALTER TABLE "${table}" RENAME COLUMN "${rule.from}" TO "${rule.to}"`);
        break;
      case 'cast':
        await conn.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${rule.column}" SET DATA TYPE ${rule.toType}`,
        );
        break;
    }

    const after = Number((await query(`SELECT count(*) as cnt FROM "${table}"`))[0]?.cnt ?? 0);

    results.push({
      rule,
      rowsBefore: before,
      rowsAfter: after,
      rowsAffected: before - after,
    });
  }

  return results;
}
