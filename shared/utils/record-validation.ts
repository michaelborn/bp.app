import type { BPRecord } from '../bp-record';

export const SYSTOLIC_MIN = 20;
export const SYSTOLIC_MAX = 300;
export const DIASTOLIC_MIN = 10;
export const DIASTOLIC_MAX = 250;

export type BPRecordFields = {
  systolic?: number | string;
  diastolic?: number | string;
};

export type BPRecordValidationResult = {
  valid: boolean;
  error?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Validates the { systolic, diastolic } user entry. Integers only.
export function validateBPInput(input: BPRecordFields): BPRecordValidationResult {
  const { systolic, diastolic } = input;
  const s = Number(systolic);
  const d = Number(diastolic);

  if (systolic === undefined || systolic === '' || diastolic === undefined || diastolic === '') {
    return { valid: false, error: 'Both systolic and diastolic are required.' };
  }
  if (!Number.isInteger(s) || !Number.isInteger(d)) {
    return { valid: false, error: 'Enter whole numbers of mmHg, without decimals.' };
  }
  if (s < SYSTOLIC_MIN || s > SYSTOLIC_MAX) {
    return { valid: false, error: `Systolic must be between ${SYSTOLIC_MIN} and ${SYSTOLIC_MAX} mmHg.` };
  }
  if (d < DIASTOLIC_MIN || d > DIASTOLIC_MAX) {
    return { valid: false, error: `Diastolic must be between ${DIASTOLIC_MIN} and ${DIASTOLIC_MAX} mmHg.` };
  }
  if (s <= d) {
    return { valid: false, error: 'Systolic must be greater than diastolic.' };
  }
  return { valid: true };
}

// Validates a full record as received over the API (or read from CSV).
export function validateRecord(value: unknown): BPRecordValidationResult {
  const result = validateBPInput({
    systolic: (value as { systolic?: unknown })?.systolic as number | undefined,
    diastolic: (value as { diastolic?: unknown })?.diastolic as number | undefined,
  });
  if (!result.valid) {
    if (result.error === 'Both systolic and diastolic are required.') {
      return { valid: false, error: 'Record requires both systolic and diastolic integers.' };
    }
    return result;
  }

  if (typeof value !== 'object' || value === null) {
    return { valid: false, error: 'Record must be an object.' };
  }
  const record = value as Partial<BPRecord>;
  if (typeof record.id !== 'string' || !UUID_RE.test(record.id)) {
    return { valid: false, error: 'Record requires a valid UUID id.' };
  }
  if (typeof record.recordedAt !== 'string' || !isIsoUtcTimestamp(record.recordedAt)) {
    return { valid: false, error: 'Record requires an ISO-8601 UTC timestamp in recordedAt.' };
  }
  return { valid: true };
}

export function isIsoUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export function parseRecord(value: unknown): BPRecord {
  const record = value as BPRecord;
  return {
    id: record.id,
    recordedAt: record.recordedAt,
    systolic: Number(record.systolic),
    diastolic: Number(record.diastolic),
  };
}
