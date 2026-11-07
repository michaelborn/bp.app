import { defineConfig } from '@playwright/test';

const PORT = 4599;
const DATA_FILE = '/tmp/bp-e2e-data.csv';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    // Always a fresh server/data file: kill anything already on port 4599.
    command: `fuser -k ${PORT}/tcp 2>/dev/null; sleep 0.5; rm -f ${DATA_FILE}; BP_DATA_FILE=${DATA_FILE} PORT=${PORT} HOST=127.0.0.1 node .output/server/index.mjs`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
