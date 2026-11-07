import { createCsvRepository } from '../utils/csvRepository';

// GET /api/records — all valid persisted records, newest first.
export default defineEventHandler(async () => {
  const repo = createCsvRepository();
  return repo.listRecords();
});
