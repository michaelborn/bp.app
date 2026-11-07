// GET /api/health — liveness for container/proxy checks.
// Intentionally reveals nothing about stored records.
export default defineEventHandler(() => {
  return { status: 'ok' };
});
