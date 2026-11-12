/* Generates the README screenshot: the 14-day chart in desktop view,
 * wrapped in fake browser chrome.
 * Usage: node scripts/screenshot.cjs
 */
const { spawnSync, spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.BP_SHOT_PORT || 4598;
const DATA_FILE = process.env.BP_SHOT_DATA_FILE || '/tmp/bp-shot-data.csv';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(__dirname, '..', 'screenshots');
const RAW_SHOT = '/tmp/opencode/bp-chart-raw.png';
const BAR_PNG = '/tmp/opencode/bp-chrome-bar.png';

const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// 14 daily readings with an irregular but believable wobble.
const READINGS = [
  [2026, 11, 1, 8, 30, 131, 86],
  [2026, 11, 2, 7, 45, 127, 83],
  [2026, 11, 3, 8, 15, 133, 85],
  [2026, 11, 4, 7, 50, 124, 82],
  [2026, 11, 5, 8, 25, 129, 84],
  [2026, 11, 6, 7, 35, 122, 81],
  [2026, 11, 7, 8, 10, 126, 83],
  [2026, 11, 8, 7, 55, 119, 78],
  [2026, 11, 9, 8, 20, 123, 80],
  [2026, 11, 10, 7, 45, 118, 77],
  [2026, 11, 11, 8, 5, 121, 79],
  [2026, 11, 12, 7, 40, 117, 76],
  [2026, 11, 13, 8, 25, 120, 78],
  [2026, 11, 14, 7, 15, 116, 75],
].map(([y, m, d, h, min, sys, dia], index) => ({
  id: UUID(index + 1),
  recordedAt: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`,
  systolic: sys,
  diastolic: dia,
}));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function magick(args, quiet = false) {
  const result = spawnSync('convert', args.filter((a) => a !== undefined && a !== ''), { stdio: ['ignore', 'inherit', 'pipe'] });
  if (result.status !== 0) {
    const message = result.stderr?.toString();
    if (!quiet) {
      console.error('convert args:', args);
      throw new Error(`convert failed: ${message}`);
    }
    console.error('convert (ignored):', message);
  } else if (quiet) {
  }
  return result.status === 0;
}

// Draws a fake browser chrome bar above the captured app window.
function addBrowserChrome(rawPath, outPath) {
  const [w, h] = execSync(`identify -format '%w %h' '${rawPath}'`).toString().split(' ').map(Number);
  const barH = 96;
  const pillW = 920;
  const pillH = 64;
  const pillX = Math.round(w / 2 - pillW / 2);
  const pillY = 16;
  const dotR = 21;
  const dotY = barH / 2;

  const hasFont = spawnSync('convert', ['-list', 'font'], { stdio: 'pipe' })
    .stdout.toString()
    .toLowerCase()
    .includes('dejavu-sans');
  const fontArgs = hasFont ? ['-font', 'DejaVu-Sans', '-pointsize', '30', '-fill', '#6a7484', '-stroke', 'none',
    '-draw', `text ${pillX + 44},${pillY + pillH / 2 + 11} 'https://bp.app/'`] : [];

  magick([
    '-size', `${w}x${barH}`,
    `xc:#dde1e7`,
    '-fill', '#ff5f57', '-stroke', 'none',
    '-draw', `circle ${56},${dotY} ${56},${dotY - dotR}`,
    '-fill', '#febc2e',
    '-draw', `circle ${112},${dotY} ${112},${dotY - dotR}`,
    '-fill', '#28c840',
    '-draw', `circle ${168},${dotY} ${168},${dotY - dotR}`,
    '-fill', '#f6f7f9',
    '-draw', `roundrectangle ${pillX},${pillY} ${pillX + pillW},${pillY + pillH} ${pillH / 2},${pillH / 2}`,
    ...fontArgs,
    BAR_PNG,
  ]);

  magick([BAR_PNG, rawPath, '-append', outPath]);
}

async function main() {
  execSync(`rm -f ${DATA_FILE}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(RAW_SHOT, { force: true });

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

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(BASE_URL);
    // Chart tab is the default view; wait for the canvases to be drawn.
    await page.locator('.bp-chart-canvas canvas').first().waitFor({ state: 'visible' });
    await sleep(600);
    await page.locator('.bp-chart-canvas canvas').last().waitFor({ state: 'visible' });
    await sleep(600);
    // Crop to the app content itself (drops side margins / trailing space).
    await page.locator('main.bp-page').screenshot({ path: RAW_SHOT });
    await browser.close();

    addBrowserChrome(RAW_SHOT, path.join(OUT_DIR, 'chart.png'));
    fs.rmSync(RAW_SHOT, { force: true });
    fs.rmSync(BAR_PNG, { force: true });
    fs.rmSync(path.join(OUT_DIR, 'table-desktop.png'), { force: true });
    fs.rmSync(path.join(OUT_DIR, 'table-mobile.png'), { force: true });
    console.log('screenshot written to screenshots/chart.png');
  } finally {
    server.kill();
    execSync(`rm -f ${DATA_FILE}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
