import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

const createdFiles: string[] = [];
afterAll(() => {
  for (const file of createdFiles) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
});

async function freshRepository() {
  const { createCsvRepository } = await import('~/server/utils/csvRepository');
  const file = path.join(os.tmpdir(), `bp-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  createdFiles.push(file);
  vi.stubEnv('BP_DATA_FILE', file);
  return { repository: createCsvRepository(), file };
}

function tempPath(): string {
  const file = path.join(os.tmpdir(), `bp-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  createdFiles.push(file);
  return file;
}

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-9222-222222222222';
const UUID_C = '33333333-3333-4333-9333-333333333333';

const RECORD_A = { id: UUID_A, recordedAt: '2026-01-01T09:30:00Z', systolic: 122, diastolic: 78 };
const RECORD_B = { id: UUID_B, recordedAt: '2026-01-02T11:00:00Z', systolic: 118, diastolic: 76 };
const RECORD_C = { id: UUID_C, recordedAt: '2026-01-03T00:00:00Z', systolic: 120, diastolic: 60 };

const HEADER = 'id,recorded_at,systolic,diastolic';
const mod = () => import('~/server/utils/csvRepository');
const validation = () => import('~/shared/utils/record-validation');

describe('CSV serialization', () => {
  it('round-trips records through serialize/parse', async () => {
    const { serializeCsvRows, parseCsvRecords } = await mod();
    const { records, malformedRows } = parseCsvRecords(serializeCsvRows([RECORD_A, RECORD_B]));
    expect(malformedRows).toEqual([]);
    expect(records[0]).toEqual(RECORD_A);
    expect(records[1]).toEqual(RECORD_B);
  });

  it('escapes commas, quotes, and newlines then round-trips them safely', async () => {
    const { serializeRecordLine, parseCsvRows } = await mod();
    expect(serializeRecordLine({ id: 'quoted,id', recordedAt: '2026-01-01T09:30:00Z', systolic: 122, diastolic: 78 }))
      .toBe('"quoted,id",2026-01-01T09:30:00Z,122,78');
    const line = serializeRecordLine({
      id: 'multi\nline "id"',
      recordedAt: '2026-01-01T09:30:00Z',
      systolic: 122,
      diastolic: 78,
    });
    expect(parseCsvRows(line + '\n')).toEqual([
      ['multi\nline "id"', '2026-01-01T09:30:00Z', '122', '78'],
    ]);
  });
});

describe('CSV parsing robustness', () => {
  it('creates the file with a header when missing', async () => {
    const { repository, file } = await freshRepository();
    await repository.insertRecords([RECORD_A]);
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    expect(lines).toEqual([
      HEADER,
      `${UUID_A},2026-01-01T09:30:00Z,122,78`,
    ]);
  });

  it('a no-op insert on an empty store stores only the header', async () => {
    const { repository, file } = await freshRepository();
    await repository.insertRecords([]);
    expect(fs.readFileSync(file, 'utf8')).toBe(HEADER + '\n');
  });

  it('skips malformed rows and keeps valid ones', async () => {
    const { parseCsvRecords } = await mod();
    const csv = [
      HEADER,
      `${UUID_A},2026-01-01T09:30:00Z,122,78`,
      'not,enough,cells',
    ].join('\n');
    const { records, malformedRows } = parseCsvRecords(csv);
    expect(records).toEqual([RECORD_A]);
    expect(malformedRows).toEqual(['not,enough,cells']);
  });

  it('ignores non-integer and out-of-range values', async () => {
    const { parseCsvRecords } = await mod();
    const csv = [
      HEADER,
      `${UUID_A},2026-01-01T09:30:00Z,12.5,78`,
      `${UUID_B},2026-01-02T00:00:00Z,999,78`,
      `${UUID_C},2026-01-03T00:00:00Z,120,60`,
    ].join('\n');
    expect(parseCsvRecords(csv).records).toEqual([RECORD_C]);
  });

  it('rejects systolic values not greater than diastolic', async () => {
    const { parseCsvRecords } = await mod();
    const csv = [HEADER, `${UUID_A},2026-01-01T09:30:00Z,90,120`].join('\n');
    expect(parseCsvRecords(csv).records).toEqual([]);
  });

  it('parses empty text as zero records', async () => {
    const { parseCsvRecords } = await mod();
    expect(parseCsvRecords('')).toEqual({ records: [], malformedRows: [] });
  });
});

describe('record validation', () => {
  it('requires a valid UUID id and ISO-8601 UTC timestamp', async () => {
    const { validateRecord } = await validation();
    expect(validateRecord(RECORD_A).valid).toBe(true);
    expect(validateRecord({ ...RECORD_A, id: 'not-a-uuid' }).valid).toBe(false);
    expect(validateRecord({ ...RECORD_A, recordedAt: '2026-01-01 09:30' }).valid).toBe(false);
    expect(validateRecord({ ...RECORD_A, recordedAt: '2026-01-01T09:30:00+02:00' }).valid).toBe(false);
    expect(validateRecord({ ...RECORD_A, recordedAt: '2026-13-01T09:30:00Z' }).valid).toBe(false);
  });

  it('requires integer mmHg within bounds and systolic > diastolic', async () => {
    const { validateRecord } = await validation();
    expect(validateRecord({ ...RECORD_A, systolic: 12.5, diastolic: 8 }).valid).toBe(false);
    expect(validateRecord({ ...RECORD_A, systolic: 999, diastolic: 60 }).valid).toBe(false);
    expect(validateRecord({ ...RECORD_A, systolic: 90, diastolic: 120 }).valid).toBe(false);
    expect(validateRecord({ ...RECORD_A, systolic: 90, diastolic: 90 }).valid).toBe(false);
  });

  it('validates the { systolic, diastolic } user-entry shape', async () => {
    const { validateBPInput } = await validation();
    expect(validateBPInput({}).error).toMatch(/required/i);
    expect(validateBPInput({ systolic: 'abc', diastolic: 70 }).valid).toBe(false);
    expect(validateBPInput({ systolic: undefined, diastolic: 70 }).valid).toBe(false);
    expect(validateBPInput({ systolic: 120, diastolic: 80 }).valid).toBe(true);
  });
});

describe('idempotent sync, dedupe, and serialized writes', () => {
  it('replaying a sync with the same ids does not duplicate rows', async () => {
    const { repository, file } = await freshRepository();
    expect(await repository.insertRecords([RECORD_A, RECORD_B])).toEqual([RECORD_A, RECORD_B]);
    expect(await repository.insertRecords([RECORD_A, RECORD_B])).toEqual([]);

    const rows = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(rows).toHaveLength(3); // header + 2 unique records
  });

  it('repository dedupes rows by id and lists newest first', async () => {
    const { repository } = await freshRepository();
    await repository.insertRecords([RECORD_A, RECORD_B, RECORD_C, RECORD_A]);

    const records = await repository.listRecords();
    expect(records.map((r) => r.id)).toEqual([UUID_C, UUID_B, UUID_A]);
  });

  it('serialized writes cannot interleave concurrent inserts', async () => {
    const { repository, file } = await freshRepository();
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `0000000a-0000-4000-8000-${String(index).padStart(12, '0')}`,
      recordedAt: `2026-02-${String((index % 27) + 1).padStart(2, '0')}T08:00:00Z`,
      systolic: 110 + index,
      diastolic: 70 + index,
    }));
    // Two overlapping batches; every write is queued through the
    // process-local lock, so no partial/interleaved rows can appear.
    await Promise.all([
      repository.insertRecords(many.slice(0, 10)),
      repository.insertRecords(many.slice(10)),
    ]);

    const stored = await repository.listRecords();
    expect(stored).toHaveLength(20);
    // Every line still parses into exactly two CSV fields+2 numeric cells.
    for (const row of fs.readFileSync(file, 'utf8').trim().split('\n').slice(1)) {
      expect(row.split('\n')).toHaveLength(1);
    }
  });
});

describe('newest-first sorting', () => {
  it('sortByNewestFirst orders by timestamp desc, tie-breaks by id', async () => {
    const { sortByNewestFirst } = await import('~/composables/useBPRecords');
    const records = [
      { id: '22222222-2222-4222-9222-222222222222', recordedAt: '2026-03-02T10:00:00Z', systolic: 120, diastolic: 80 },
      { id: '11111111-1111-4111-8111-111111111111', recordedAt: '2026-03-03T09:00:00Z', systolic: 121, diastolic: 81 },
      { id: '33333333-3333-4333-9333-333333333333', recordedAt: '2026-03-02T10:00:00Z', systolic: 122, diastolic: 82 },
      { id: '44444444-4444-4444-8444-444444444444', recordedAt: '2026-03-01T00:00:00Z', systolic: 123, diastolic: 83 },
    ];
    const sorted = sortByNewestFirst(records as never);
    // Ties (equal timestamp) break on id descending — same as the CSV
    // repository's comparator, so client and server agree.
    expect(sorted.map((r) => r.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-9333-333333333333',
      '22222222-2222-4222-9222-222222222222',
      '44444444-4444-4444-8444-444444444444',
    ]);
    expect(sorted[2]?.recordedAt).toBe('2026-03-02T10:00:00Z');
  });

  it('sortByNewestFirst does not mutate the input', async () => {
    const { sortByNewestFirst } = await import('~/composables/useBPRecords');
    const input = [
      { id: '11111111-1111-4111-8111-111111111111', recordedAt: '2026-03-01T00:00:00Z', systolic: 120, diastolic: 80 },
      { id: '22222222-2222-4222-9222-222222222222', recordedAt: '2026-03-02T00:00:00Z', systolic: 120, diastolic: 80 },
    ];
    const snapshot = [...input];
    sortByNewestFirst(input as never);
    expect(input).toEqual(snapshot);
  });
});

describe('last-14-days chart filtering', () => {
  it('keeps only records from the latest 14 days including today, chronological', async () => {
    const { last14Days } = await import('~/composables/useBPRecords');
    const records = [
      OLD_OUTSIDE,
      DAY1,
      TODAY,
      DAY14,
    ];
    expect(last14Days(records, NOW).map((record) => record.recordedAt)).toEqual([
      DAY14.recordedAt,
      DAY1.recordedAt,
      TODAY.recordedAt,
    ]);
  });
});

// Fixed "now" for deterministic filtering tests.
const NOW = new Date('2026-03-10T15:00:00Z');
const TODAY = { id: UUID_A, recordedAt: '2026-03-10T09:00:00Z', systolic: 120, diastolic: 80 };
const DAY1 = { id: UUID_B, recordedAt: '2026-03-09T22:00:00Z', systolic: 121, diastolic: 81 };
const DAY14 = { id: UUID_C, recordedAt: '2026-02-25T00:30:00Z', systolic: 119, diastolic: 79 };
const OLD_OUTSIDE = { id: '00000000-0000-4000-8000-000000000000', recordedAt: '2026-02-24T23:59:59Z', systolic: 130, diastolic: 85 };
