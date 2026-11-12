import { createCsvRepository } from '../../utils/csvRepository';

// DELETE /api/records/:id — removes a record. Idempotent: deleting an
// unknown id still reports success.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Record id in URL must be a UUID.' } });
  }

  const repo = createCsvRepository();
  await repo.deleteRecords([id]);
  return { deleted: true };
});
