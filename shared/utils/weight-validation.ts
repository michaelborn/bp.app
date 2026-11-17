import type { WeightRecord } from '../weight-record';

// Weight bounds in the canonical unit (kilograms).
export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 400;

export type WeightInputFields = {
  weight?: number | string;
};

export type Validation = { valid: boolean; error?: string };

// Validates the weight value as entered in kilograms: required, at most one
// decimal place (90.5 is fine, 90.55 is not), within bounds.
export function validateWeightInput(input: WeightInputFields): Validation {
  const { weight } = input;
  const w = Number(weight);

  if (weight === undefined || weight === '') {
    return { valid: false, error: 'Enter a weight.' };
  }
  if (!Number.isFinite(w) || Math.round(w * 10) !== w * 10) {
    return { valid: false, error: 'Enter a weight with at most one decimal place.' };
  }
  if (w < WEIGHT_MIN_KG || w > WEIGHT_MAX_KG) {
    return { valid: false, error: `Weight must be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.` };
  }
  return { valid: true };
}

// Validates a full weight record as received over the API (or read from CSV).
export function validateWeightRecord(value: unknown): Validation {
  const input = validateWeightInput({
    weight: (value as { weight?: unknown })?.weight as number | undefined,
  });
  if (!input.valid) {
    if (input.error === 'Enter a weight.') {
      return { valid: false, error: 'Record requires a weight in kilograms.' };
    }
    return input;
  }

  if (typeof value !== 'object' || value === null) {
    return { valid: false, error: 'Record must be an object.' };
  }
  const record = value as Partial<WeightRecord>;
  if (typeof record.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id)) {
    return { valid: false, error: 'Record requires a valid UUID id.' };
  }
  if (typeof record.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(record.recordedAt) || Number.isNaN(new Date(record.recordedAt).getTime())) {
    return { valid: false, error: 'Record requires an ISO-8601 UTC timestamp in recordedAt.' };
  }
  return { valid: true };
}

export function parseWeightRecord(value: unknown): WeightRecord {
  const record = value as WeightRecord;
  return {
    id: record.id,
    recordedAt: record.recordedAt,
    weight: Number(record.weight),
  };
}
