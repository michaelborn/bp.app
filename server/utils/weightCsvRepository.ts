import fs from 'node:fs';
import path from 'node:path';

import type { WeightRecord } from '#shared/weight-record';
import { parseWeightRecord, validateWeightRecord } from '#shared/utils/weight-validation';
import { parseCsvRows, serializeCsvRow, withWriteLock, compareRecordsNewestFirst } from './csvRepository';

export const WEIGHT_CSV_HEADER = 'id,recorded_at,weight';

// Weight persistence mirrors the blood-pressure CSV repository, sharing the
// row plumbing (RFC 4180 parsing/serialization, process-local write lock,
// atomic rewrites) but with its own file, header, and validation.

export interface WeightRecordsRepository {
  listRecords(): Promise<WeightRecord[]>;
  insertRecords(records: WeightRecord[]): Promise<WeightRecord[]>;
  updateRecord(record: WeightRecord): Promise<WeightRecord>;
  deleteRecords(ids: string[]): Promise<string[]>;
}

export function weightCsvFilePath(): string {
  return process.env.BP_WEIGHT_FILE || '/data/weight-records.csv';
}

export function serializeWeightRecordLine(record: WeightRecord): string {
  return serializeCsvRow([record.id, record.recordedAt, String(record.weight)]);
}

export function parseWeightCsvRecords(text: string): { records: WeightRecord[]; malformedRows: string[] } {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { records: [], malformedRows: [] };
  }
  const records: WeightRecord[] = [];
  const malformedRows: string[] = [];
  for (const [index, cells] of rows.entries()) {
    const line = cells.join(',');
    if (index === 0 && isHeader(cells)) {
      continue;
    }
    if (cells.length !== 3) {
      malformedRows.push(line);
      continue;
    }
    const candidate = {
      id: (cells[0] ?? '').trim(),
      recordedAt: (cells[1] ?? '').trim(),
      weight: Number(cells[2] ?? ''),
    };
    if (!validateWeightRecord(candidate).valid) {
      malformedRows.push(line);
      continue;
    }
    records.push(parseWeightRecord(candidate));
  }
  return { records, malformedRows };
}

function isHeader(cells: string[]): boolean {
  return cells.length >= 3
    && (cells[0] ?? '').trim().toLowerCase() === 'id'
    && (cells[1] ?? '').trim().toLowerCase() === 'recorded_at'
    && (cells[2] ?? '').trim().toLowerCase() === 'weight';
}

function ensureDataDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeRecordsAtomically(filePath: string, records: WeightRecord[]): void {
  ensureDataDir(filePath);
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, [WEIGHT_CSV_HEADER, ...records.map(serializeWeightRecordLine)].join('\n') + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function readCsvRecords(filePath: string): WeightRecord[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) {
    return [];
  }
  return parseWeightCsvRecords(text).records;
}

// Upserts by id (sync replays and edits); invalid records are skipped.
export async function insertWeightCsvRecords(filePath: string, newRecords: WeightRecord[]): Promise<WeightRecord[]> {
  ensureDataDir(filePath);
  return withWriteLock(() => {
    const records = readCsvRecords(filePath);
    const upserted: WeightRecord[] = [];
    for (const record of newRecords) {
      if (!validateWeightRecord(record).valid) {
        continue;
      }
      const index = records.findIndex((r) => r.id === record.id);
      if (index >= 0) {
        records[index] = record;
      } else {
        records.push(record);
      }
      upserted.push(record);
    }
    if (upserted.length) {
      writeRecordsAtomically(filePath, records);
    }
    return upserted;
  });
}

export async function updateWeightCsvRecord(filePath: string, record: WeightRecord): Promise<WeightRecord> {
  ensureDataDir(filePath);
  return withWriteLock(() => {
    const records = readCsvRecords(filePath);
    const index = records.findIndex((r) => r.id === record.id);
    if (index === -1) {
      throw new Error('not-found');
    }
    records[index] = record;
    writeRecordsAtomically(filePath, records);
    return record;
  });
}

export async function deleteWeightCsvRecords(filePath: string, ids: string[]): Promise<string[]> {
  ensureDataDir(filePath);
  return withWriteLock(() => {
    const idSet = new Set(ids);
    const records = readCsvRecords(filePath);
    const kept = records.filter((r) => !idSet.has(r.id));
    if (kept.length === records.length) {
      return [];
    }
    const removed = new Set(records.filter((r) => idSet.has(r.id)).map((r) => r.id));
    writeRecordsAtomically(filePath, kept);
    return [...removed];
  });
}

export function createWeightCsvRepository(): WeightRecordsRepository {
  const filePath = weightCsvFilePath();
  return {
    async listRecords() {
      const records = await withWriteLock(async () => readCsvRecords(filePath));
      return records.sort(compareRecordsNewestFirst);
    },
    async insertRecords(records: WeightRecord[]) {
      return insertWeightCsvRecords(filePath, records);
    },
    async updateRecord(record: WeightRecord) {
      if (!validateWeightRecord(record).valid) {
        throw new Error('invalid-record');
      }
      return updateWeightCsvRecord(filePath, record);
    },
    async deleteRecords(ids: string[]) {
      return deleteWeightCsvRecords(filePath, ids);
    },
  };
}
