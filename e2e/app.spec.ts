import { expect, test, type Download } from '@playwright/test';

import { openRecordDialog, openSettingsMenu, openWeightRecordDialog, waitForServiceWorkerController } from './helpers';

// The suite runs in declaration order against one server (workers: 1), so
// each step builds deterministically on the previous one.

test('chart tab is the default view with an empty state', async ({ page }) => {
    await page.goto('/');

  const chartTab = page.getByRole('tab', { name: 'Chart' });
  const tableTab = page.getByRole('tab', { name: 'Blood pressure' });

  // Fresh server: chart shows the empty state.
  await expect(page.getByText('No readings in the last two weeks.')).toBeVisible();
  await expect(page.getByLabel('Blood pressure — last two weeks')).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: /chart/i })).toBeVisible();
  await expect(chartTab).toHaveAttribute('aria-selected', 'true');
  await expect(tableTab).toHaveAttribute('aria-selected', 'false');
  // Header carries the Record dropdown (primary) and the settings gear.
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('switching tabs shows the table and back again', async ({ page }) => {
    await page.goto('/');
  await page.getByRole('tab', { name: 'Blood pressure' }).click();
  await expect(page.getByRole('tab', { name: 'Blood pressure' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: /blood pressure/i })).toBeVisible();
  // No readings yet: table view shows its empty state instead of a table.
  await expect(page.getByText('No readings yet.')).toBeVisible();

  // Weight tab has its own screen and table; recording happens from the
  // header Record menu, so the tab itself carries no record button.
  await page.getByRole('tab', { name: 'Weight' }).click();
  await expect(page.getByRole('tab', { name: 'Weight' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: /weight/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record weight' })).toHaveCount(0);
  await expect(page.getByText('No weigh-ins yet.')).toBeVisible();

  // Return to the chart without opening the record form.
  await page.getByRole('tab', { name: 'Chart' }).click();
  await expect(page.getByRole('tabpanel', { name: /chart/i })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('arrow keys switch tabs (WAI-ARIA tab pattern)', async ({ page }) => {
    await page.goto('/');
  await page.getByRole('tab', { name: 'Chart' }).focus();
  await page.keyboard.press('ArrowRight');

  const tableTab = page.getByRole('tab', { name: 'Blood pressure' });
  await expect(tableTab).toHaveAttribute('aria-selected', 'true');
  await expect(tableTab).toBeFocused();
});

test('Record menu opens both dialogs and closes like a menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Blood pressure' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Weight' })).toBeVisible();

  // Weight item opens the weight dialog.
  await menu.getByRole('menuitem', { name: 'Weight' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Weight (kg)')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  // Reopening works after a menu-driven dialog closes; Escape dismisses.
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
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
  await page.getByRole('tab', { name: 'Blood pressure' }).click();
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('130');
  await expect(rows.nth(1)).toContainText('85');
  await expect(rows.nth(2)).toContainText('122');
  await expect(rows.nth(2)).toContainText('78');
  // Readings are stamped automatically (date/time present in first column).
  await expect(rows.nth(1).locator('th').first()).not.toHaveText('');
});

test('unchecked automatic timestamp records a manual date and time', async ({ page }) => {
  await page.goto('/');
  await openRecordDialog(page);
  const dialog = page.getByRole('dialog');
  const autoCheckbox = dialog.getByRole('checkbox', { name: /recorded automatically/i });
  await expect(autoCheckbox).toBeChecked();
  await expect(dialog.locator('[data-test="manual-datetime"]')).toHaveCount(0);

  await autoCheckbox.uncheck();
  const datetime = dialog.locator('[data-test="manual-datetime"]');
  await expect(datetime).toBeVisible();
  // Prefilled with the current moment (non-empty, editable).
  await expect(datetime).not.toHaveValue('');

  // An empty manual date is rejected inline.
  await datetime.fill('');
  await dialog.getByLabel('Systolic (mmHg)').fill('118');
  await dialog.getByLabel('Diastolic (mmHg)').fill('76');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Enter a valid date and time.');
  await expect(dialog).toBeVisible();

  // A valid back-dated reading saves with the entered timestamp.
  await datetime.fill('2026-11-01T08:30');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();

  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const expected = new Date('2026-11-01T08:30').toISOString();
        const records = (await (await fetch('/api/records')).json()) as { systolic: number; recordedAt: string }[];
        return records.some((r) => r.systolic === 118 && r.recordedAt === expected);
      });
    }, { timeout: 10_000 })
    .toBe(true);
});

test('Export CSV downloads two separate files (blood pressure + weight)', async ({ page }) => {
  await page.goto('/');
  // Fresh context: records come from the server after the initial pull.
  await page.getByRole('tab', { name: 'Blood pressure' }).click();
  const rows = page.getByRole('table').getByRole('row');
  await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThan(2);

  // Export lives in the settings menu.
  await openSettingsMenu(page);
  const exportButton = page.locator('[data-test="export-csv"]');
  await expect(exportButton).toBeEnabled();

  // Predicate-based waits: each waits for its own filename, so both downloads
  // (fired back to back by one click) are captured deterministically.
  const bpDownloadPromise = page.waitForEvent('download', (download) =>
    download.suggestedFilename().startsWith('bp-app-bloodpressure-'),
  );
  const weightDownloadPromise = page.waitForEvent('download', (download) =>
    download.suggestedFilename().startsWith('bp-app-weight-'),
  );
  await exportButton.click();
  const [bpDownload, weightDownload] = await Promise.all([bpDownloadPromise, weightDownloadPromise]);

  const readDownload = async (download: Download) => {
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) {
      chunks.push(chunk as Buffer);
    }
    return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
  };
  const [bpFile, weightFile] = await Promise.all([readDownload(bpDownload), readDownload(weightDownload)]);

  expect(bpFile.name).toMatch(/^bp-app-bloodpressure-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(weightFile.name).toMatch(/^bp-app-weight-\d{4}-\d{2}-\d{2}\.csv$/);

  // Blood pressure file: same shape the server persists, records included.
  const bpLines = bpFile.text.trim().split('\n');
  expect(bpLines[0]).toBe('id,recorded_at,systolic,diastolic');
  expect(bpFile.text).toContain('130,85');
  expect(bpFile.text).toContain('122,78');
  expect(bpLines[1]).toMatch(/,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z,/);

  // Weight file: header-only (no weigh-ins seeded yet), still a valid CSV.
  expect(weightFile.text.trim().split('\n')[0]).toBe('id,recorded_at,weight');
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

  await page.getByRole('tab', { name: 'Blood pressure' }).click();
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
    await page.getByRole('tab', { name: 'Blood pressure' }).click();
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
    // Default: split — two canvases, settings offers to stack.
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(2);
    await openSettingsMenu(page);
    const graphToggle = page.locator('[data-test="graph-toggle"]');
    await expect(graphToggle).toHaveText('Stack graph');

    // Stack: one canvas showing both series; the item flips its label.
    await graphToggle.click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(1);

    await openSettingsMenu(page);
    await expect(graphToggle).toHaveText('Split graph');
    await graphToggle.click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(2);
  });

  test('the chosen mode persists across reloads', async ({ page }) => {
    await page.goto('/');
    await openSettingsMenu(page);
    await page.locator('[data-test="graph-toggle"]').click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(1);
    await openSettingsMenu(page);
    await expect(page.locator('[data-test="graph-toggle"]')).toHaveText('Split graph');

    // Restore the default for later tests.
    await page.locator('[data-test="graph-toggle"]').click();
    await expect(page.locator('.bp-chart-canvas canvas')).toHaveCount(2);
  });
});

test.describe('weight tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.bp-sync')).toContainText(/Synced/, { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Weight' }).click();
  });

  test('record weight dialog validates and saves in kilograms', async ({ page }) => {
    await openWeightRecordDialog(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Empty field: inline message.
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Enter a weight.');

    // More than one decimal place is rejected.
    await dialog.locator('[data-test="weight-input"]').fill('90.55');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toContainText('at most one decimal place');

    // A valid weigh-in saves with the automatic timestamp.
    await dialog.locator('[data-test="weight-input"]').fill('89.9');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved on this device.')).toBeVisible();

    const row = page.getByRole('table').getByRole('row').nth(1);
    await expect(row).toContainText('89.9');
    await expect(row).toContainText('Synced', { timeout: 15_000 });

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const records = (await (await fetch('/api/weight')).json()) as { weight: number }[];
          return records.some((r) => r.weight === 89.9);
        });
      }, { timeout: 10_000 })
      .toBe(true);
  });

  test('unit switcher converts the display and persists across reloads', async ({ page }) => {
    // Record 89.9 kg first.
    await openWeightRecordDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-test="weight-input"]').fill('89.9');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved on this device.')).toBeVisible();

    // The toggle lives in the settings menu; its aria-label ("Show weight in
    // pounds"/"kilograms") overrides the visible text, so locate it via
    // data-test and assert the label text instead.
    await openSettingsMenu(page);
    const unitToggle = page.locator('[data-test="unit-toggle"]');
    await unitToggle.click();
    const row = page.getByRole('table').getByRole('row').nth(1);
    await expect(row).toContainText(/19[0-9]\.\d/); // ~198.0 lb

    // The switch survives a reload.
    await page.reload();
    await openSettingsMenu(page);
    await expect(page.locator('[data-test="unit-toggle"]')).toHaveText('Units: lb');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    // Record a pound value: the server stores kilograms (canonical).
    await openWeightRecordDialog(page);
    const weightDialog = page.getByRole('dialog');
    await expect(weightDialog.getByText('Weight (lb)')).toBeVisible();
    await weightDialog.locator('[data-test="weight-input"]').fill('170');
    await weightDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved on this device.')).toBeVisible();

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const records = (await (await fetch('/api/weight')).json()) as { weight: number }[];
          return records.some((r) => r.weight === 77.1);
        });
      }, { timeout: 10_000 })
      .toBe(true);

    // Back to kilograms: values show converted (77.1 kg).
    await openSettingsMenu(page);
    await page.locator('[data-test="unit-toggle"]').click();
    await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('77.1');
  });

  test('manual date and time works for weigh-ins via the header Record menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Weight' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Weight (kg)')).toBeVisible();

    await dialog.getByRole('checkbox', { name: /recorded automatically/i }).uncheck();
    await dialog.locator('[data-test="manual-datetime"]').fill('2026-11-02T07:15');
    await dialog.locator('[data-test="weight-input"]').fill('87.3');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved on this device.')).toBeVisible();

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const expected = new Date('2026-11-02T07:15').toISOString();
          const records = (await (await fetch('/api/weight')).json()) as { weight: number; recordedAt: string }[];
          return records.some((r) => r.weight === 87.3 && r.recordedAt === expected);
        });
      }, { timeout: 10_000 })
      .toBe(true);
  });

  test('weight edit and delete sync like blood pressure', async ({ page }) => {
    // Seed one weigh-in.
    await openWeightRecordDialog(page);
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-test="weight-input"]').fill('90.5');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved on this device.')).toBeVisible();
    const targetId = await page.evaluate(async () => (await (await fetch('/api/weight')).json())[0].id);
    const targetRow = page.locator(`tr[data-record-id="${targetId}"]`);

    // Edit the weight value on blur.
    await page.getByRole('button', { name: 'Edit' }).click();
    await targetRow.locator('[data-test="weight-cell-input"]').fill('91.3');
    await targetRow.locator('[data-test="date-input"]').click();
    await expect(targetRow).toContainText('Synced', { timeout: 15_000 });

    await expect
      .poll(async () => {
        return page.evaluate(async (id) => {
          const records = (await (await fetch('/api/weight')).json()) as { id: string; weight: number }[];
          return records.find((r) => r.id === id)?.weight === 91.3;
        }, targetId);
      }, { timeout: 10_000 })
      .toBe(true);

    // Delete the row; the server record disappears.
    page.once('dialog', (dialogBox) => dialogBox.accept());
    await targetRow.getByRole('button', { name: 'Delete' }).click();
    await expect(targetRow).toHaveCount(0, { timeout: 10_000 });

    await expect
      .poll(async () => {
        return page.evaluate(async (id) => {
          const records = (await (await fetch('/api/weight')).json()) as { id: string }[];
          return !records.some((r) => r.id === id);
        }, targetId);
      }, { timeout: 10_000 })
      .toBe(true);
  });
});
