import { createWeightCsvRepository } from '../utils/weightCsvRepository';

// GET /api/weight — all valid persisted weight records as JSON, newest first.
export default defineEventHandler(async () => {
  const repo = createWeightCsvRepository();
  return repo.listRecords();
});
