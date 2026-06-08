/**
 * File System Access API wrapper — open/save files natively, open directories,
 * with automatic fallback to <input> + download for Firefox/Safari.
 */

const supportsFileSystemAccess =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;

const DATA_FILE_TYPES = [
  {
    description: 'Data files',
    accept: {
      'text/csv': ['.csv', '.tsv'],
      'application/json': ['.json', '.jsonl', '.ndjson'],
      'application/octet-stream': ['.parquet', '.pq'],
    },
  },
];

export interface OpenFileResult {
  file: File;
  handle: FileSystemFileHandle | null;
}

/**
 * Open a file with optional write-back handle.
 * Chrome/Edge: native file picker, returns handle for save-back.
 * Firefox/Safari: falls back to <input type="file">, handle is null.
 */
export async function openFile(): Promise<OpenFileResult> {
  if (supportsFileSystemAccess) {
    const [handle] = await (window as any).showOpenFilePicker({
      types: DATA_FILE_TYPES,
      multiple: false,
    });
    const file = await handle.getFile();
    return { file, handle };
  }

  // Fallback: hidden <input type="file">
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.json,.jsonl,.ndjson,.parquet,.pq';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) resolve({ file, handle: null });
      else reject(new Error('No file selected'));
    };
    input.click();
  });
}

/**
 * Open multiple files at once.
 */
export async function openFiles(): Promise<OpenFileResult[]> {
  if (supportsFileSystemAccess) {
    const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({
      types: DATA_FILE_TYPES,
      multiple: true,
    });
    return Promise.all(
      handles.map(async (handle) => ({
        file: await handle.getFile(),
        handle,
      })),
    );
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.json,.jsonl,.ndjson,.parquet,.pq';
    input.multiple = true;
    input.onchange = () => {
      const files = input.files;
      if (files && files.length > 0) {
        resolve(Array.from(files).map((file) => ({ file, handle: null })));
      } else {
        reject(new Error('No files selected'));
      }
    };
    input.click();
  });
}

export interface DirectoryResult {
  name: string;
  files: { name: string; file: File; handle: FileSystemFileHandle }[];
}

/**
 * Open a directory and get all data files in it.
 * Only available on Chrome/Edge. Throws on unsupported browsers.
 */
export async function openDirectory(): Promise<DirectoryResult> {
  if (!supportsFileSystemAccess || !('showDirectoryPicker' in window)) {
    throw new Error(
      'Directory access requires Chrome or Edge. Use openFile() or openFiles() instead.',
    );
  }

  const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker();
  const dataExtensions = new Set(['.csv', '.tsv', '.json', '.jsonl', '.ndjson', '.parquet', '.pq']);
  const files: DirectoryResult['files'] = [];

  for await (const [name, entry] of dirHandle as any) {
    if (entry.kind !== 'file') continue;
    const ext = '.' + name.split('.').pop()?.toLowerCase();
    if (!dataExtensions.has(ext)) continue;
    const file = await entry.getFile();
    files.push({ name, file, handle: entry });
  }

  return { name: dirHandle.name, files };
}

/**
 * Save a Blob to a file handle (write back to the same file).
 * Falls back to download if handle is null or browser doesn't support it.
 */
export async function saveFile(
  blob: Blob,
  handle: FileSystemFileHandle | null,
  suggestedName?: string,
): Promise<void> {
  // Try writing back to existing handle
  if (handle && supportsFileSystemAccess) {
    const writable = await (handle as any).createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  // Try save-as picker
  if (supportsFileSystemAccess) {
    const ext = suggestedName?.split('.').pop() ?? 'csv';
    const mimeMap: Record<string, string> = {
      csv: 'text/csv',
      json: 'application/json',
      parquet: 'application/octet-stream',
      sql: 'text/sql',
      tsv: 'text/tab-separated-values',
    };
    const newHandle = await (window as any).showSaveFilePicker({
      suggestedName: suggestedName ?? `data.${ext}`,
      types: [
        {
          description: 'Data file',
          accept: { [mimeMap[ext] ?? 'application/octet-stream']: [`.${ext}`] },
        },
      ],
    });
    const writable = await newHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  // Fallback: trigger download
  download(blob, suggestedName ?? 'data.csv');
}

/**
 * Show a save-as dialog (or trigger download on unsupported browsers).
 */
export async function saveFileAs(blob: Blob, suggestedName: string): Promise<void> {
  return saveFile(blob, null, suggestedName);
}

/**
 * Trigger a browser download (works everywhere).
 */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Check what file system capabilities are available.
 */
export function getCapabilities(): {
  openFile: boolean;
  openDirectory: boolean;
  saveFile: boolean;
  saveFileAs: boolean;
  opfs: boolean;
} {
  return {
    openFile: true, // always available (fallback to <input>)
    openDirectory: supportsFileSystemAccess && 'showDirectoryPicker' in (window ?? {}),
    saveFile: supportsFileSystemAccess,
    saveFileAs: supportsFileSystemAccess,
    opfs: typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in (navigator.storage ?? {}),
  };
}
