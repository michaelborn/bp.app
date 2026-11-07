import fs from 'node:fs';
import path from 'node:path';

import type { BPRecord } from '#shared/bp-record';
import { parseRecord, validateRecord } from '#shared/utils/record-validation';

export const CSV_HEADER = 'id,recorded_at,systolic,diastolic';

// Repository interface for records persistence. Kept behind these two
// functions so a later SQLite implementation can swap in without changing
// the API contract.
export interface RecordsRepository {
  listRecords(): Promise<BPRecord[]>;
  insertRecords(records: BPRecord[]): Promise<BPRecord[]>;
}

// Resolves the CSV path from the environment, defaulting under /data.
export function csvFilePath(): string {
  return process.env.BP_DATA_FILE || '/data/bp-records.csv';
}

export function ensureDataDir(filePath: string): string {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Serializes one record into an RFC 4180 CSV row with quoted/escaped fields.
export function serializeRecordLine(record: BPRecord): string {
  return serializeCsvRow([record.id, record.recordedAt, String(record.systolic), String(record.diastolic)]);
}

export function serializeCsvRows(records: BPRecord[]): string {
  return [CSV_HEADER, ...records.map(serializeRecordLine)].join('\n') + '\n';
}

function serializeCsvRow(cells: string[]): string {
  return cells.map((cell) => (/[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell)).join(',');
}

// Parses CSV text (header: id,recorded_at,systolic,diastolic) supporting
// quoted fields. Reports malformed rows instead of throwing.
export function parseCsvRecords(text: string): { records: BPRecord[]; malformedRows: string[] } {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { records: [], malformedRows: [] };
  }
  const records: BPRecord[] = [];
  const malformedRows: string[] = [];
  for (const [index, cells] of rows.entries()) {
    const line = cells.join(',');
    if (index === 0 && isHeader(cells)) {
      continue;
    }
    if (cells.length !== 4) {
      malformedRows.push(line);
      continue;
    }
    const candidate = {
      id: (cells[0] ?? '').trim(),
      recordedAt: (cells[1] ?? '').trim(),
      systolic: Number(cells[2] ?? ''),
      diastolic: Number(cells[3] ?? ''),
    };
    if (!validateRecord(candidate).valid) {
      malformedRows.push(line);
      continue;
    }
    records.push(candidate);
  }
  return { records, malformedRows };
}

function isHeader(cells: string[]): boolean {
  return cells.length >= 4
    && (cells[0] ?? '').trim().toLowerCase() === 'id'
    && (cells[1] ?? '').trim().toLowerCase() === 'recorded_at'
    && (cells[2] ?? '').trim().toLowerCase() === 'systolic'
    && (cells[3] ?? '').trim().toLowerCase() === 'diastolic';
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  let rowHadContent = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (rowHadContent || row.some((c) => c !== '')) {
      rows.push(row);
    }
    row = [];
    rowHadContent = false;
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          rowHadContent = true;
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      rowHadContent = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      rowHadContent = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    rowHadContent = true;
    i++;
  }
  if (rowHadContent || row.length > 0 || field !== '') {
    pushRow();
  }
  return rows;
}

// Reads all parsed records from the CSV file; a missing/empty file yields
// no records.
export function readCsvRecords(filePath: string): BPRecord[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) {
    return [];
  }
  return parseCsvRecords(text).records;
}

export async function readCsvRecordsAsync(filePath: string): Promise<BPRecord[]> {
  return withWriteLock(async () => readCsvRecords(filePath));
}

// Process-local write queue/mutex. Chains write operations so concurrent
// requests cannot interleave/corrupt CSV rows. Not multi-instance safe.
let writeLock: Promise<unknown> = Promise.resolve();

export async function withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const previous = writeLock;
  let resolve!: (value: unknown) => void;
  writeLock = new Promise((r) => { resolve = r; });
  try {
    await previous;
  } catch {
    // Previous holder failed; continue with the next writer anyway.
  }
  try {
    return await fn();
  } finally {
    resolve(undefined);
  }
}

// Appends records whose ids are not yet stored, creating the file with the
// CSV header when it is missing. Returns the records that were inserted.
export async function insertCsvRecords(filePath: string, newRecords: BPRecord[]): Promise<BPRecord[]> {
  ensureDataDir(filePath);
  return withWriteLock(() => {
    const existing = readCsvRecords(filePath);
    const ids = new Set(existing.map((r) => r.id));
    const inserted: BPRecord[] = [];

    let content = '';
    if (!fs.existsSync(filePath)) {
      content = CSV_HEADER + '\n';
    }
    for (const record of newRecords) {
      if (!validateRecord(record).valid || ids.has(record.id)) {
        continue;
      }
      ids.add(record.id);
      inserted.push(record);
      content += serializeRecordLine(record) + '\n';
    }
    if (content) {
      fs.appendFileSync(filePath, content, 'utf8');
    }
    return inserted;
  });
}

export function dedupeById(records: BPRecord[]): BPRecord[] {
  const seen = new Map<string, BPRecord>();
  for (const record of records) {
    seen.set(record.id, record);
  }
  return [...seen.values()];
}

export function compareRecordsNewestFirst(a: BPRecord, b: BPRecord): number {
  if (a.recordedAt === b.recordedAt) {
    return a.id < b.id ? 1 : -1;
  }
  return a.recordedAt < b.recordedAt ? 1 : -1;
}

// Repository bound to the configured CSV path.
export function createCsvRepository(): RecordsRepository {
  const filePath = csvFilePath();
  return {
    async listRecords() {
      return dedupeById(await readCsvRecordsAsync(filePath)).sort(compareRecordsNewestFirst);
    },
    async insertRecords(records: BPRecord[]) {
      return insertCsvRecords(filePath, records);
    },
  };
}
