/* Generates README screenshots from the production build.
 * Usage: BP_SHOT_PORT=4598 node scripts/screenshot.cjs
 * Requires a fresh CSV data file and the built app in .output/.
 */
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.BP_SHOT_PORT || 4598;
const DATA_FILE = process.env.BP_SHOT_DATA_FILE || '/tmp/bp-shot-data.csv';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(__dirname, '..', 'screenshots');

const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// 14 morning/evening readings for a realistic-looking history.
const READINGS = [
  [2026, 10, 26, 8, 30, 132, 86],
  [2026, 10, 27, 7, 45, 128, 82],
  [2026, 10, 27, 22, 10, 124, 80],
  [2026, 10, 28, 8, 15, 126, 84],
  [2026, 10, 29, 7, 55, 121, 79],
  [2026, 10, 30, 8, 20, 119, 77],
  [2026, 10, 31, 9, 5, 118, 76],
  [2026, 11, 1, 7, 40, 122, 78],
  [2026, 11, 2, 8, 25, 127, 81],
  [2026, 11, 3, 7, 50, 125, 80],
  [2026, 11, 4, 8, 10, 123, 79],
  [2026, 11, 5, 7, 35, 120, 77],
  [2026, 11, 6, 8, 45, 117, 75],
  [2026, 11, 7, 7, 20, 121, 78],
].map(([y, m, d, h, min, sys, dia], index) => ({
  id: UUID(index + 1),
  recordedAt: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`,
  systolic: sys,
  diastolic: dia,
}));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  execSync(`rm -f ${DATA_FILE}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = spawn('node', ['.output/server/index.mjs'], {
    env: { ...process.env, BP_DATA_FILE: DATA_FILE, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    // Wait for the app to come up.
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try {
        await fetch(`${BASE_URL}/api/health`);
        break;
      } catch {}
    }

    // Seed records via the sync API.
    const response = await fetch(`${BASE_URL}/api/records/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: READINGS }),
    });
    if (!response.ok) {
      throw new Error(`seed failed: HTTP ${response.status}`);
    }

    const { chromium } = require('playwright');
    const browser = await chromium.launch();

    // Desktop table
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(BASE_URL);
    await desktopPage.getByRole('tab', { name: 'Table' }).click();
    await desktopPage.locator('.bp-table-section').waitFor({ state: 'visible' });
    await sleep(300);
    await desktopPage.locator('main.bp-page').screenshot({ path: path.join(OUT_DIR, 'table-desktop.png') });

    // Mobile table
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(BASE_URL);
    await mobilePage.getByRole('tab', { name: 'Table' }).click();
    await sleep(300);
    await mobilePage.locator('main.bp-page').screenshot({ path: path.join(OUT_DIR, 'table-mobile.png') });

    await browser.close();
    console.log('screenshots written to', OUT_DIR);
  } finally {
    server.kill();
    execSync(`rm -f ${DATA_FILE}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
