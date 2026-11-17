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
  const { createWeightCsvRepository } = await import('~/server/utils/weightCsvRepository');
  const file = path.join(os.tmpdir(), `bp-weight-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  createdFiles.push(file);
  vi.stubEnv('BP_WEIGHT_FILE', file);
  return { repository: createWeightCsvRepository(), file };
}

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-9222-222222222222';

const W_A = { id: UUID_A, recordedAt: '2026-01-01T09:30:00Z', weight: 90.5 };
const W_B = { id: UUID_B, recordedAt: '2026-01-02T11:00:00Z', weight: 91.2 };

const HEADER = 'id,recorded_at,weight';
const mod = () => import('~/server/utils/weightCsvRepository');
const validation = () => import('~/shared/utils/weight-validation');
const conversion = () => import('~/shared/weight-record');

describe('weight validation', () => {
  it('accepts one-decimal weights within bounds', async () => {
    const { validateWeightRecord, validateWeightInput } = await validation();
    expect(validateWeightRecord(W_A).valid).toBe(true);
    expect(validateWeightInput({ weight: 90.5 }).valid).toBe(true);
    expect(validateWeightInput({ weight: '90.5' }).valid).toBe(true);
  });

  it('rejects more than one decimal place', async () => {
    const { validateWeightInput } = await validation();
    expect(validateWeightInput({ weight: 90.55 }).valid).toBe(false);
    expect(validateWeightInput({ weight: 90.55 }).error).toMatch(/one decimal place/i);
  });

  it('rejects out-of-bounds weights', async () => {
    const { validateWeightInput } = await validation();
    expect(validateWeightInput({ weight: 19 }).valid).toBe(false);
    expect(validateWeightInput({ weight: 401 }).valid).toBe(false);
    expect(validateWeightInput({ weight: '' }).error).toMatch(/Enter a weight/);
  });

  it('requires a valid UUID id and ISO-8601 UTC timestamp', async () => {
    const { validateWeightRecord } = await validation();
    expect(validateWeightRecord({ ...W_A, id: 'nope' }).valid).toBe(false);
    expect(validateWeightRecord({ ...W_A, recordedAt: '2026-01-01 09:30' }).valid).toBe(false);
  });
});

describe('kg/lb conversion', () => {
  it('round-trips kg through lb at one-decimal display precision', async () => {
    const { kgToLb, lbToKg } = await conversion();
    expect(kgToLb(90.5)).toBeCloseTo(199.5, 1);
    expect(lbToKg(kgToLb(90.5))).toBeCloseTo(90.5, 1);
    expect(lbToKg(176.2)).toBeCloseTo(79.9, 1);
  });
});

describe('weight CSV repository', () => {
  it('creates the file with the weight header on first insert', async () => {
    const { repository, file } = await freshRepository();
    await repository.insertRecords([W_A]);
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    expect(lines).toEqual([HEADER, `${UUID_A},2026-01-01T09:30:00Z,90.5`]);
  });

  it('lists newest first and dedupes by id', async () => {
    const { repository } = await freshRepository();
    await repository.insertRecords([W_A, W_B, W_A]);
    const records = await repository.listRecords();
    expect(records.map((r) => r.id)).toEqual([UUID_B, UUID_A]);
  });

  it('replaying a sync does not duplicate rows', async () => {
    const { repository, file } = await freshRepository();
    await repository.insertRecords([W_A, W_B]);
    await repository.insertRecords([W_A, W_B]);
    expect(fs.readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(3);
  });

  it('updateRecord replaces in place and rejects unknown/invalid records', async () => {
    const { repository } = await freshRepository();
    await repository.insertRecords([W_A]);
    const updated = await repository.updateRecord({ ...W_A, weight: 92 });
    expect(updated.weight).toBe(92);

    await expect(repository.updateRecord({ ...W_B })).rejects.toThrow('not-found');
    await expect(repository.updateRecord({ ...W_A, weight: 90.55 })).rejects.toThrow('invalid-record');
    expect((await repository.listRecords()).find((r) => r.id === UUID_A)?.weight).toBe(92);
  });

  it('deleteRecords removes rows and is idempotent', async () => {
    const { repository, file } = await freshRepository();
    await repository.insertRecords([W_A, W_B]);
    expect(await repository.deleteRecords([UUID_A])).toEqual([UUID_A]);
    expect(await repository.deleteRecords([UUID_A])).toEqual([]);
    expect(fs.readFileSync(file, 'utf8').trimEnd().split('\n')).toHaveLength(2);
    expect((await repository.listRecords()).map((r) => r.id)).toEqual([UUID_B]);
  });

  it('skips malformed rows when reading', async () => {
    const { parseWeightCsvRecords } = await mod();
    const csv = [
      HEADER,
      `${UUID_A},2026-01-01T09:30:00Z,90.5`,
      'not,enough,cells',
      `${UUID_B},2026-01-02T11:00:00Z,90.55`,
    ].join('\n');
    const { records, malformedRows } = parseWeightCsvRecords(csv);
    expect(records).toEqual([W_A]);
    expect(malformedRows).toHaveLength(2);
  });
});
