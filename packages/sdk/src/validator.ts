import { query } from './engine.js';
import { escId, escStr } from './loader.js';

export interface ColumnSchema {
  name: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  allowedValues?: string[];
}

export interface TableSchema {
  columns: ColumnSchema[];
  minRows?: number;
  maxRows?: number;
}

export interface ValidationIssue {
  column: string;
  rule: string;
  message: string;
  count: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  rowCount: number;
  columnCount: number;
}

export async function validate(table: string, schema: TableSchema): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const t = escId(table);

  const countResult = await query(`SELECT count(*) as cnt FROM ${t}`);
  const rowCount = Number(countResult[0]?.cnt ?? 0);

  const colResult = await query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name=${escStr(table)}`,
  );
  const existingCols = new Map(colResult.map((r) => [String(r.column_name), String(r.data_type)]));

  if (schema.minRows !== undefined && rowCount < schema.minRows) {
    issues.push({
      column: '*',
      rule: 'minRows',
      message: `Table has ${rowCount} rows, minimum is ${schema.minRows}`,
      count: 1,
    });
  }

  if (schema.maxRows !== undefined && rowCount > schema.maxRows) {
    issues.push({
      column: '*',
      rule: 'maxRows',
      message: `Table has ${rowCount} rows, maximum is ${schema.maxRows}`,
      count: 1,
    });
  }

  for (const col of schema.columns) {
    if (!existingCols.has(col.name)) {
      issues.push({
        column: col.name,
        rule: 'exists',
        message: `Column "${col.name}" not found in table`,
        count: 1,
      });
      continue;
    }

    const c = escId(col.name);

    if (col.required) {
      const nullResult = await query(
        `SELECT count(*) as cnt FROM ${t} WHERE ${c} IS NULL`,
      );
      const nulls = Number(nullResult[0]?.cnt ?? 0);
      if (nulls > 0) {
        issues.push({
          column: col.name,
          rule: 'required',
          message: `${nulls} null values in required column`,
          count: nulls,
        });
      }
    }

    if (col.min !== undefined) {
      const minVal = Number(col.min);
      if (!Number.isFinite(minVal)) continue;
      const result = await query(
        `SELECT count(*) as cnt FROM ${t} WHERE ${c} < ${minVal}`,
      );
      const cnt = Number(result[0]?.cnt ?? 0);
      if (cnt > 0) {
        issues.push({
          column: col.name,
          rule: 'min',
          message: `${cnt} values below minimum ${col.min}`,
          count: cnt,
        });
      }
    }

    if (col.max !== undefined) {
      const maxVal = Number(col.max);
      if (!Number.isFinite(maxVal)) continue;
      const result = await query(
        `SELECT count(*) as cnt FROM ${t} WHERE ${c} > ${maxVal}`,
      );
      const cnt = Number(result[0]?.cnt ?? 0);
      if (cnt > 0) {
        issues.push({
          column: col.name,
          rule: 'max',
          message: `${cnt} values above maximum ${col.max}`,
          count: cnt,
        });
      }
    }

    if (col.pattern) {
      const result = await query(
        `SELECT count(*) as cnt FROM ${t} WHERE ${c} IS NOT NULL AND NOT regexp_matches(${c}::VARCHAR, ${escStr(col.pattern)})`,
      );
      const cnt = Number(result[0]?.cnt ?? 0);
      if (cnt > 0) {
        issues.push({
          column: col.name,
          rule: 'pattern',
          message: `${cnt} values don't match pattern /${col.pattern}/`,
          count: cnt,
        });
      }
    }

    if (col.allowedValues) {
      const vals = col.allowedValues.map((v) => escStr(v)).join(', ');
      const result = await query(
        `SELECT count(*) as cnt FROM ${t} WHERE ${c} IS NOT NULL AND ${c}::VARCHAR NOT IN (${vals})`,
      );
      const cnt = Number(result[0]?.cnt ?? 0);
      if (cnt > 0) {
        issues.push({
          column: col.name,
          rule: 'allowedValues',
          message: `${cnt} values not in allowed set`,
          count: cnt,
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    rowCount,
    columnCount: existingCols.size,
  };
}
