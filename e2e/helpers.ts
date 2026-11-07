import { expect, type Page } from '@playwright/test';

// Waits until the service worker is active and controlling this page, so
// offline-navigation tests can rely on the cached app shell.
export async function waitForServiceWorkerController(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) {
            return false;
          }
          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration) {
            return false;
          }
          await navigator.serviceWorker.ready;
          return true;
        }),
      {
        message: 'service worker should register on first load',
        timeout: 15_000,
        intervals: [250, 500, 1000, 2000],
      },
    )
    .toBe(true);
  await page.reload();
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker?.controller),
    undefined,
    { timeout: 15_000 },
  );
}

export async function openRecordDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Record BP' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
