// Write Case 1 in the case terminal, submit it for review, and close it.
import { expect, test } from '@playwright/test';
import { case01 } from '../../src/content/cases/case01';
import { missionsDone, saved, seed, typeInTerminal } from './helpers';

test('case 1: script written in the terminal passes every hidden test', async ({ page, isMobile }) => {
  await seed(page, { missions: missionsDone(7), xp: 3000 });
  await page.goto('./#/case/snapshot');
  if (isMobile) await page.getByRole('tab', { name: 'Terminal' }).click();
  await typeInTerminal(page, `cat > ~/cases/snapshot.sh <<'EOF'\n${case01.solution.trimEnd()}\nEOF`);
  // The editor picks up the file written from the terminal.
  if (isMobile) await page.getByRole('tab', { name: 'Script' }).click();
  await expect(page.locator('.cm-content').locator('visible=true')).toContainText('Failed logins');

  await page.getByRole('button', { name: /Run tests|Test/ }).first().click();
  await expect(page.getByText('All tests passed').locator('visible=true').first()).toBeVisible();
  await expect(page.getByText('Case closed').locator('visible=true').first()).toBeVisible();

  const st = await saved(page);
  expect(st.challenges['case:snapshot'].solved).toBe(true);
  expect(st.xp).toBe(3000 + case01.xp);
  expect(st.badges['case-closed']).toBeTruthy();
});

test('case 1: the starter template fails review with a useful diff', async ({ page, isMobile }) => {
  await seed(page, { missions: missionsDone(7) });
  await page.goto('./#/case/snapshot');
  await page.getByRole('button', { name: /Run tests|Test/ }).first().click();
  if (isMobile) await page.getByRole('tab', { name: /Tests/ }).click();
  await expect(page.getByText(/0 of 3 tests passed/).locator('visible=true').first()).toBeVisible();
  await expect(page.getByText('Expected').locator('visible=true').first()).toBeVisible();
  expect((await saved(page)).challenges['case:snapshot'].solved).toBeFalsy();
});
