import type { BPRecord } from '#shared/bp-record';
import { parseRecord, validateRecord } from '#shared/utils/record-validation';
import { createCsvRepository } from '../../utils/csvRepository';

// PUT /api/records/:id — replaces a stored record (values and/or timestamp).
// The body must be a full BPRecord whose id matches the URL param.
export default defineEventHandler(async (event): Promise<BPRecord> => {
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
  const validation = validateRecord(body);
  if (!validation.valid) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: validation.error } });
  }

  try {
    const repo = createCsvRepository();
    return await repo.updateRecord(parseRecord(body));
  } catch (error) {
    if (error instanceof Error && error.message === 'not-found') {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', data: { error: 'No record with that id.' } });
    }
    throw error;
  }
});
