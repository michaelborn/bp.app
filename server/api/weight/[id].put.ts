import type { WeightRecord } from '#shared/weight-record';
import { parseWeightRecord, validateWeightRecord } from '#shared/utils/weight-validation';
import { createWeightCsvRepository } from '../../utils/weightCsvRepository';

// PUT /api/weight/:id — replaces a stored weight record. The body must be a
// full WeightRecord whose id matches the URL param.
export default defineEventHandler(async (event): Promise<WeightRecord> => {
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Record id in URL must be a UUID.' } });
  }
  if (typeof body !== 'object' || body === null) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Body must be a JSON object.' } });
  }
  if ((body as { id?: unknown }).id !== id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Record id in body must match the URL param.' } });
  }
  const validation = validateWeightRecord(body);
  if (!validation.valid) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: validation.error } });
  }

  try {
    const repo = createWeightCsvRepository();
    return await repo.updateRecord(parseWeightRecord(body));
  } catch (error) {
    if (error instanceof Error && error.message === 'not-found') {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', data: { error: 'No weight record with that id.' } });
    }
    throw error;
  }
});
