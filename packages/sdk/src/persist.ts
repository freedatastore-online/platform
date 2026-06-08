/**
 * OPFS-backed DuckDB persistence — tables survive tab close.
 *
 * Uses Origin Private File System (supported in all modern browsers)
 * to store DuckDB database files. Tables persist across sessions.
 */

import { getDB, getConnection, query } from './engine.js';

const OPFS_DIR = 'freedatastore';

async function getOPFSDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

/**
 * Check if OPFS is available in this browser.
 */
export function isOPFSAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in (navigator.storage ?? {})
  );
}

/**
 * Save a DuckDB table to OPFS as Parquet.
 * Persists across tab closes and browser restarts.
 */
export async function saveTable(tableName: string): Promise<void> {
  if (!isOPFSAvailable()) throw new Error('OPFS not available in this browser');

  const conn = await getConnection();
  const db = await getDB();

  const fileName = `${tableName}.parquet`;
  await conn.query(`COPY "${tableName}" TO '${fileName}' (FORMAT PARQUET)`);
  const buffer = await db.copyFileToBuffer(fileName);

  const dir = await getOPFSDir();
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(buffer.buffer as ArrayBuffer);
  await writable.close();
}

/**
 * Load a previously saved table from OPFS back into DuckDB.
 */
export async function loadTable(tableName: string): Promise<boolean> {
  if (!isOPFSAvailable()) return false;

  try {
    const dir = await getOPFSDir();
    const fileHandle = await dir.getFileHandle(`${tableName}.parquet`);
    const file = await fileHandle.getFile();
    const buffer = new Uint8Array(await file.arrayBuffer());

    const db = await getDB();
    const fileName = `${tableName}.parquet`;
    await db.registerFileBuffer(fileName, buffer);

    const conn = await getConnection();
    await conn.query(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${fileName}')`);
    return true;
  } catch {
    return false; // File doesn't exist yet
  }
}

/**
 * List all tables saved in OPFS.
 */
export async function listSavedTables(): Promise<string[]> {
  if (!isOPFSAvailable()) return [];

  try {
    const dir = await getOPFSDir();
    const tables: string[] = [];
    for await (const [name] of dir as any) {
      if (typeof name === 'string' && name.endsWith('.parquet')) {
        tables.push(name.replace('.parquet', ''));
      }
    }
    return tables;
  } catch {
    return [];
  }
}

/**
 * Delete a saved table from OPFS.
 */
export async function deleteSavedTable(tableName: string): Promise<void> {
  if (!isOPFSAvailable()) return;

  try {
    const dir = await getOPFSDir();
    await dir.removeEntry(`${tableName}.parquet`);
  } catch {
    // File didn't exist
  }
}

/**
 * Clear all saved tables from OPFS.
 */
export async function clearSavedTables(): Promise<void> {
  if (!isOPFSAvailable()) return;

  const tables = await listSavedTables();
  const dir = await getOPFSDir();
  for (const name of tables) {
    try {
      await dir.removeEntry(`${name}.parquet`);
    } catch {
      // Skip if already gone
    }
  }
}

/**
 * Get total size of all saved tables in OPFS (bytes).
 */
export async function getSavedSize(): Promise<number> {
  if (!isOPFSAvailable()) return 0;

  try {
    const dir = await getOPFSDir();
    let total = 0;
    for await (const [name, entry] of dir as any) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        total += file.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Restore all previously saved tables into DuckDB.
 * Call this on app startup to resume a workspace.
 */
export async function restoreWorkspace(): Promise<string[]> {
  const tables = await listSavedTables();
  const restored: string[] = [];
  for (const name of tables) {
    const ok = await loadTable(name);
    if (ok) restored.push(name);
  }
  return restored;
}

/**
 * Save all current DuckDB tables to OPFS.
 * Call this before tab close or periodically.
 */
export async function saveWorkspace(): Promise<string[]> {
  const result = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='main'",
  );
  const saved: string[] = [];
  for (const row of result) {
    const name = String(row.table_name);
    await saveTable(name);
    saved.push(name);
  }
  return saved;
}
