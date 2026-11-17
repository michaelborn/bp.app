import { createWeightCsvRepository } from '../../utils/weightCsvRepository';

// DELETE /api/weight/:id — removes a weight record. Idempotent.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Record id in URL must be a UUID.' } });
  }

  const repo = createWeightCsvRepository();
  await repo.deleteRecords([id]);
  return { deleted: true };
});
