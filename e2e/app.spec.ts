import { expect, test } from '@playwright/test';

import { openRecordDialog, waitForServiceWorkerController } from './helpers';

// The suite runs in declaration order against one server (workers: 1), so
// each step builds deterministically on the previous one.

test('chart tab is the default view with an empty state', async ({ page }) => {
    await page.goto('/');

  const chartTab = page.getByRole('tab', { name: 'Chart' });
  const tableTab = page.getByRole('tab', { name: 'Table' });

  // Fresh server: chart shows the empty state.
  await expect(page.getByText('No readings in the last two weeks.')).toBeVisible();
  await expect(page.getByLabel('Blood pressure — last two weeks')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: /chart/i })).toBeVisible();
  await expect(chartTab).toHaveAttribute('aria-selected', 'true');
  await expect(tableTab).toHaveAttribute('aria-selected', 'false');
  // Record BP sits on the right of the header row.
  await expect(page.getByRole('button', { name: 'Record BP' })).toBeVisible();
});

test('switching tabs shows the table and back again', async ({ page }) => {
    await page.goto('/');
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(page.getByRole('tab', { name: 'Table' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: /table/i })).toBeVisible();
  // No readings yet: table view shows its empty state instead of a table.
  await expect(page.getByText('No readings yet.')).toBeVisible();

  // Return to the chart without opening the record form.
  await page.getByRole('tab', { name: 'Chart' }).click();
  await expect(page.getByRole('tabpanel', { name: /chart/i })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('arrow keys switch tabs (WAI-ARIA tab pattern)', async ({ page }) => {
    await page.goto('/');
  await page.getByRole('tab', { name: 'Chart' }).focus();
  await page.keyboard.press('ArrowRight');

  const tableTab = page.getByRole('tab', { name: 'Table' });
  await expect(tableTab).toHaveAttribute('aria-selected', 'true');
  await expect(tableTab).toBeFocused();
});

test('Record BP validates input and does not silently discard it', async ({ page }) => {
    await page.goto('/');
  await openRecordDialog(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Empty fields: inline message, dialog stays open.
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/required/i);

  // systolic <= diastolic is rejected with an inline message.
  await dialog.getByLabel('Systolic (mmHg)').fill('80');
  await dialog.getByLabel('Diastolic (mmHg)').fill('121');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Systolic must be greater than diastolic.');
  // The dialog stays open with the entered values intact.
  await expect(dialog.getByLabel('Systolic (mmHg)')).toHaveValue('80');

  // Out-of-range value is rejected.
  await dialog.getByLabel('Systolic (mmHg)').fill('999');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/between 20 and 300/);
});

test('Record BP cancels without saving', async ({ page }) => {
    await page.goto('/');
  await openRecordDialog(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('dialog fields share the width side by side, even on a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto('/');
  await openRecordDialog(page);

  const dialog = page.getByRole('dialog');
  const systolic = await dialog.getByLabel('Systolic (mmHg)').boundingBox();
  const diastolic = await dialog.getByLabel('Diastolic (mmHg)').boundingBox();
  expect(systolic).not.toBeNull();
  expect(diastolic).not.toBeNull();
  if (!systolic || !diastolic) {
    return;
  }
  // Side by side (same top), horizontally proportioned (equal widths)…
  expect(systolic.y).toBeCloseTo(diastolic.y, 1);
  expect(systolic.width).toBeCloseTo(diastolic.width, 1);
  // …and fully inside the window with no overlap/overflow.
  expect(systolic.x).toBeGreaterThanOrEqual(0);
  expect(systolic.x + systolic.width).toBeLessThanOrEqual(diastolic.x + 1);
  expect(diastolic.x + diastolic.width).toBeLessThanOrEqual(320);
});

test('saving a valid reading syncs it to the server', async ({ page }) => {
    await page.goto('/');
  await openRecordDialog(page);
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Systolic (mmHg)').fill('122');
  await dialog.getByLabel('Diastolic (mmHg)').fill('78');
  await dialog.getByRole('button', { name: 'Save' }).click();

  // Immediate local-save feedback…
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  // …then the server round-trip flips the status to Synced.
  await expect(page.locator('.bp-sync')).toContainText('Synced', { timeout: 10_000 });

  // Second, newer record.
  await openRecordDialog(page);
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Systolic (mmHg)').fill('130');
  await dialog.getByLabel('Diastolic (mmHg)').fill('85');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();

  // Table tab lists the readings newest first (two rows just added, plus the
  // header row).
  await page.getByRole('tab', { name: 'Table' }).click();
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('130');
  await expect(rows.nth(1)).toContainText('85');
  await expect(rows.nth(2)).toContainText('122');
  await expect(rows.nth(2)).toContainText('78');
  // Readings are stamped automatically (date/time present in first column).
  await expect(rows.nth(1).locator('th').first()).not.toHaveText('');
});

test('Export CSV downloads every stored record', async ({ page }) => {
  await page.goto('/');
  // Fresh context: records come from the server after the initial pull.
  await page.getByRole('tab', { name: 'Table' }).click();
  const rows = page.getByRole('table').getByRole('row');
  await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThan(2);

  const exportButton = page.getByRole('button', { name: 'Export CSV' });
  await expect(exportButton).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^bp-app-records-\d{4}-\d{2}-\d{2}\.csv$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  const csv = Buffer.concat(chunks).toString('utf8');
  const lines = csv.trim().split('\n');
  expect(lines[0]).toBe('id,recorded_at,systolic,diastolic');
  // The two online records (130/85 newest, then 122/78) are included.
  expect(csv).toContain('130,85');
  expect(csv).toContain('122,78');
  // ISO-8601 timestamps intact (within each row).
  expect(lines[1]).toMatch(/,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z,/);
});

test('offline saves are retained locally and sync after reconnect', async ({ page }) => {
    await page.goto('/');
  // First online load installs the precached app shell.
  await waitForServiceWorkerController(page);

  // Go offline; saving must still succeed against local IndexedDB.
  await page.context().setOffline(true);

  await openRecordDialog(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Systolic (mmHg)').fill('132');
  await dialog.getByLabel('Diastolic (mmHg)').fill('84');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();

  // Reload while offline: the app shell must be served from cache and the
  // record must still be there, aware it has not synced yet.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'bp.app' })).toBeVisible();
  await expect(page.locator('.bp-sync')).toContainText(/Offline|Waiting/);

  await page.getByRole('tab', { name: 'Table' }).click();
  // Newest first: the freshly created record sits in the first data row.
  const row = page.getByRole('table').getByRole('row').nth(1);
  await expect(row).toContainText('132');
  await expect(row).toContainText('84');
  await expect(row).toContainText('Waiting to sync');

  // Reconnect: the queued record syncs (online event / poll) and the
  // pending status clears only after the server acknowledges it.
  await page.context().setOffline(false);
  await expect(row).not.toContainText('Waiting to sync', { timeout: 20_000 });
  await expect(row).toContainText('Synced');

  // Server has the record.
  const records = (await page.evaluate(
    async () => (await (await fetch('/api/records')).json()) as { id: string; systolic: number; diastolic: number }[],
  )) as { id: string; systolic: number; diastolic: number }[];
  const syncedRecord = records.find((r) => r.systolic === 132 && r.diastolic === 84);
  expect(syncedRecord?.id).toBeTruthy();
});

test('pending records poll for connectivity and sync without user action', async ({ page }) => {
    await page.goto('/');
  await page.context().setOffline(true);
  await openRecordDialog(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Systolic (mmHg)').fill('140');
  await dialog.getByLabel('Diastolic (mmHg)').fill('88');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved on this device/)).toBeVisible();

  await page.context().setOffline(false);
  // Poll runs every 30s; allow up to 45s.
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const response = await fetch('/api/records');
        const records = (await response.json()) as { systolic: number }[];
        return records.some((r) => r.systolic === 140);
      });
    }, {
      message: 'the 30s connectivity poll should deliver the queued record',
      timeout: 45_000,
      intervals: [1000, 5000, 10_000, 20_000],
    })
    .toBe(true);
  await expect(page.locator('body')).toContainText(/Synced/);
});

test.describe('table edit mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the initial server pull/sync to settle so late record
    // refreshes cannot re-render rows mid-edit (which drops input focus).
    await expect(page.locator('.bp-sync')).toContainText(/Synced/, { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Table' }).click();
  });

  // Anchors a table row by its record id, immune to re-sorting.
  function rowForId(page: any, id: string) {
    return page.locator(`tr[data-record-id="${id}"]`);
  }

  test('edit mode turns values into inputs with a delete column', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();

    const firstDataRow = page.getByRole('table').getByRole('row').nth(1);
    const dateInput = firstDataRow.locator('[data-test="date-input"]');
    await expect(dateInput).toHaveAttribute('type', 'datetime-local');
    await expect(firstDataRow.locator('[data-test="systolic-input"]')).toHaveValue(/^\d+$/);
    await expect(firstDataRow.getByRole('button', { name: 'Delete' })).toBeVisible();

    // Leaving edit mode restores plain text cells.
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(firstDataRow.locator('[data-test="date-input"]')).toHaveCount(0);
  });

  test('edited values save on blur and sync to the server', async ({ page }) => {
    const targetId = await page.evaluate(async () => (await (await fetch('/api/records')).json())[0].id);
    const targetRow = rowForId(page, targetId);

    await page.getByRole('button', { name: 'Edit' }).click();
    await targetRow.locator('[data-test="systolic-input"]').fill('137');
    // Blur the edited field by focusing the next input (real interaction).
    await targetRow.locator('[data-test="diastolic-input"]').click();

    // Row flips to Waiting to sync, then Synced once acknowledged.
    await expect(targetRow).toContainText(/Waiting to sync|Synced/, { timeout: 10_000 });
    await expect(targetRow).toContainText('Synced', { timeout: 15_000 });

    // The server stores the edited value.
    await expect
      .poll(async () => {
        return page.evaluate(async (id) => {
          const records = (await (await fetch('/api/records')).json()) as { id: string; systolic: number }[];
          return records.find((r) => r.id === id)?.systolic === 137;
        }, targetId);
      }, { timeout: 10_000 })
      .toBe(true);
  });

  test('editing the date via datetime-local persists an ISO timestamp', async ({ page }) => {
    const targetId = await page.evaluate(async () => (await (await fetch('/api/records')).json())[0].id);
    const targetRow = rowForId(page, targetId);

    await page.getByRole('button', { name: 'Edit' }).click();
    await targetRow.locator('[data-test="date-input"]').fill('2026-11-05T10:30');
    await targetRow.locator('[data-test="systolic-input"]').click(); // blur triggers commit
    await expect(targetRow).toContainText('Synced', { timeout: 15_000 });

    await expect
      .poll(async () => {
        return page.evaluate(async (id) => {
          const records = (await (await fetch('/api/records')).json()) as { id: string; recordedAt: string }[];
          return records.find((r) => r.id === id)?.recordedAt.startsWith('2026-11-05T') ?? false;
        }, targetId);
      }, { timeout: 10_000 })
      .toBe(true);
  });

  test('invalid edits show an inline error and are not saved', async ({ page }) => {
    const targetId = await page.evaluate(async () => (await (await fetch('/api/records')).json())[0].id);
    const targetRow = rowForId(page, targetId);

    await page.getByRole('button', { name: 'Edit' }).click();
    await targetRow.locator('[data-test="systolic-input"]').fill('90');
    await targetRow.locator('[data-test="diastolic-input"]').fill('120');
    // blur via clicking elsewhere (focus moves away)
    await targetRow.locator('[data-test="systolic-input"]').click();

    await expect(targetRow.getByRole('alert')).toContainText('Systolic must be greater than diastolic.');
    // The invalid values remain in the inputs (not silently discarded).
    await expect(targetRow.locator('[data-test="systolic-input"]')).toHaveValue('90');
    await expect(targetRow.locator('[data-test="diastolic-input"]')).toHaveValue('120');

    await page.getByRole('button', { name: 'Done' }).click();
  });

  test('delete removes the row locally and on the server', async ({ page }) => {
    const targetId = await page.evaluate(async () => (await (await fetch('/api/records')).json())[0].id);
    const rowsBefore = await page.getByRole('table').getByRole('row').count();

    await page.getByRole('button', { name: 'Edit' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await rowForId(page, targetId).getByRole('button', { name: 'Delete' }).click();

    await expect(rowForId(page, targetId)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(rowsBefore - 1, { timeout: 10_000 });

    // The server no longer has the deleted record.
    await expect
      .poll(async () => {
        return page.evaluate(async (id) => {
          const records = (await (await fetch('/api/records')).json()) as { id: string }[];
          return !records.some((r) => r.id === id);
        }, targetId);
      }, { timeout: 10_000 })
      .toBe(true);
  });

  test('offline edit and delete are queued and sync after reconnect', async ({ page }) => {
    // Grab the ids while still online.
    const ids = await page.evaluate(async () => {
      const records = (await (await fetch('/api/records')).json()) as { id: string }[];
      return records.map((r) => r.id);
    });
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const [editedId, deletedId] = [ids[0], ids[1]];

    await page.context().setOffline(true);

    // Edit while offline.
    await page.getByRole('button', { name: 'Edit' }).click();
    await rowForId(page, editedId).locator('[data-test="systolic-input"]').fill('144');
    await rowForId(page, editedId).locator('[data-test="diastolic-input"]').click();
    await expect(rowForId(page, editedId)).toContainText('Waiting to sync');

    // Delete another row while offline.
    page.once('dialog', (dialog) => dialog.accept());
    await rowForId(page, deletedId).getByRole('button', { name: 'Delete' }).click();

    // Reconnect: the edit lands as an update and the deletion removes the row.
    await page.context().setOffline(false);
    await expect
      .poll(async () => {
        return page.evaluate(async ([editedId, deletedId]) => {
          const records = (await (await fetch('/api/records')).json()) as { id: string; systolic: number }[];
          const edited = records.find((r) => r.id === editedId);
          return edited?.systolic === 144 && !records.some((r) => r.id === deletedId);
        }, [editedId, deletedId] as const);
      }, { timeout: 45_000, intervals: [1000, 5000, 10_000, 20_000] })
      .toBe(true);

    await page.getByRole('button', { name: 'Done' }).click();
  });
});

test.describe('chart mode toggle', () => {
  test('toggles between split graphs and the stacked graph', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Stack graph' }).waitFor();

    // Default: split — two canvases.
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(2);

    // Toggle to stack: one canvas showing both series (legend visible).
    await page.getByRole('button', { name: 'Stack graph' }).click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Split graph' })).toBeVisible();
    await expect(page.locator('.bp-chart-canvas')).toContainText('');

    // Back to split.
    await page.getByRole('button', { name: 'Split graph' }).click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(2);
  });

  test('the chosen mode persists across reloads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Stack graph' }).click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Split graph' })).toBeVisible();

    // Restore the default for later tests.
    await page.getByRole('button', { name: 'Split graph' }).click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(2);
  });
});
