import type { WeightRecord, WeightSyncRequest, WeightSyncResponse } from '#shared/weight-record';
import { parseWeightRecord, validateWeightRecord } from '#shared/utils/weight-validation';
import { createWeightCsvRepository } from '../../utils/weightCsvRepository';

// POST /api/weight/sync — accepts { records: WeightRecord[] }; validates the
// full batch, upserts by id (idempotent), returns acknowledged ids and the
// canonical stored records.
export default defineEventHandler(async (event): Promise<WeightSyncResponse> => {
  const body = await readBody(event);

  if (typeof body !== 'object' || body === null || !Array.isArray((body as WeightSyncRequest).records)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Body must be a JSON object with a records array.' } });
  }

  const incoming = (body as WeightSyncRequest).records;
  if (incoming.some((r) => typeof r !== 'object' || r === null)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Every record must be an object.' } });
  }
  for (const [index, record] of incoming.entries()) {
    const validation = validateWeightRecord(record);
    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: { error: validation.error, index },
      });
    }
  }

  const batch = new Map<string, WeightRecord>();
  for (const record of incoming as WeightRecord[]) {
    if (!batch.has(record.id)) {
      batch.set(record.id, parseWeightRecord(record));
    }
  }

  const repo = createWeightCsvRepository();
  await repo.insertRecords([...batch.values()]);
  const stored = await repo.listRecords();
  const canonical = [...batch.keys()]
    .map((id) => stored.find((r) => r.id === id))
    .filter((r): r is WeightRecord => Boolean(r));

  return {
    acked: [...batch.keys()],
    records: canonical,
  };
});
