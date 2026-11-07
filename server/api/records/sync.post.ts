import type { BPRecord, SyncRequest, SyncResponse } from '#shared/bp-record';
import { validateRecord } from '#shared/utils/record-validation';
import { createCsvRepository } from '../../utils/csvRepository';

// POST /api/records/sync — accepts { records: BPRecord[] }.
// Inserts only ids not already stored (idempotent); returns acknowledged ids
// and the canonical stored records. Validates the whole batch before writing;
// no partial acceptance.
export default defineEventHandler(async (event): Promise<SyncResponse> => {
  const body = await readBody(event);

  if (typeof body !== 'object' || body === null || !Array.isArray((body as SyncRequest).records)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Body must be a JSON object with a records array.' } });
  }

  const incoming = (body as SyncRequest).records;
  if (incoming.some((r) => typeof r !== 'object' || r === null)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Every record must be an object.' } });
  }
  for (const [index, record] of incoming.entries()) {
    const validation = validateRecord(record);
    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: { error: validation.error, index },
      });
    }
  }

  const batch = new Map<string, BPRecord>();
  for (const record of incoming as BPRecord[]) {
    const normalized: BPRecord = {
      id: record.id,
      recordedAt: record.recordedAt,
      systolic: Number(record.systolic),
      diastolic: Number(record.diastolic),
    };
    if (!batch.has(normalized.id)) {
      batch.set(normalized.id, normalized);
    }
  }

  const repo = createCsvRepository();
  const inserted = await repo.insertRecords([...batch.values()]);
  const insertedIds = new Set(inserted.map((r) => r.id));
  const stored = await repo.listRecords();
  const canonical = [...batch.keys()].map((id) => stored.find((r) => r.id === id)!).filter((r) => Boolean(r));

  return {
    acked: [...batch.keys()],
    records: canonical,
  };
});
