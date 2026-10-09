// The certificate is earned by closing the capstone case, not just by finishing Day 21.
import { expect, test } from '@playwright/test';
import { missionsDone, seed } from './helpers';

test('locked until the capstone case is closed', async ({ page }) => {
  await seed(page, { missions: missionsDone(21), xp: 9800 });
  await page.goto('./#/certificate');
  await expect(page.getByText('Not yet earned')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open the capstone' })).toBeVisible();
  await page.goto('./#/');
  await expect(page.getByText('Incident 0x21 is still open.')).toBeVisible();
});

test('signed once the capstone is solved', async ({ page }) => {
  await seed(page, {
    missions: missionsDone(21),
    xp: 10500,
    challenges: { 'case:capstone': { solved: true, solvedAt: Date.UTC(2026, 9, 29), hints: 0, attempts: 2, xp: 600 } },
  });
  await page.goto('./#/certificate');
  await expect(page.getByText('Lead Analyst', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Print/ })).toBeVisible();
  await expect(page.getByText('Not yet earned')).toHaveCount(0);
  await expect(page.getByText('Sashank', { exact: true })).toBeVisible();
});
