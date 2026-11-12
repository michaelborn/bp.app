import { createCsvRepository } from '../../utils/csvRepository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/records/delete — batch deletion: { ids: string[] }. Idempotent;
// unknown ids are acked without error.
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (typeof body !== 'object' || body === null || !Array.isArray((body as { ids?: unknown }).ids)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Body must be a JSON object with an ids array.' } });
  }
  const ids = (body as { ids: unknown[] }).ids;
  if (ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', data: { error: 'Every id must be a UUID.' } });
  }

  const repo = createCsvRepository();
  const removed = await repo.deleteRecords(ids as string[]);
  return { acked: ids, removed };
});
