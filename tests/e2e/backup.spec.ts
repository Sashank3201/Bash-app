// Progress survives an export → reset → import round trip, and the app works offline.
import { expect, test } from '@playwright/test';
import { missionsDone, saved, seed } from './helpers';

test('backup code round trip', async ({ page }) => {
  await seed(page, { missions: missionsDone(5), xp: 2400, activity: ['2026-10-01', '2026-10-02'] });
  page.on('dialog', (d) => d.accept());
  await page.goto('./#/dossier');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const code = (await page.locator('[class*="codeBox"] code').innerText()).trim();
  expect(code.length).toBeGreaterThan(40);
  await page.keyboard.press('Escape');

  await page.goto('./#/dossier');
  await page.getByRole('button', { name: 'Reset progress' }).click();
  await expect.poll(async () => (await saved(page)).xp).toBe(0);

  await page.goto('./#/dossier');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByPlaceholder('Paste your backup code here').fill(code);
  await page.getByRole('button', { name: 'Restore from code' }).click();
  await expect(page.getByText('Backup restored.')).toBeVisible();
  const st = await saved(page);
  expect(st.xp).toBe(2400);
  expect(Object.keys(st.missions)).toHaveLength(5);
});

test('works offline after the first visit', async ({ page, context }) => {
  test.skip(!!process.env.E2E_BASE_URL?.includes(':5173'), 'the dev server has no service worker');
  await seed(page, { missions: missionsDone(2) });
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('The Daily Brief')).toBeVisible();
  await page.goto('./#/lab');
  await expect(page.getByTestId('terminal-input').first()).toBeVisible();
  await context.setOffline(false);
});
