// Shared helpers for the end-to-end tests.
import { expect, type Page } from '@playwright/test';
import type { Mission, Step } from '../../src/content/types';

/** Seed saved progress before the app loads (merged over the app's defaults). */
export async function seed(page: Page, state: Record<string, unknown>) {
  await page.addInitScript((st) => {
    if (!localStorage.getItem('ink-shell')) {
      const base = { profile: { name: 'Sashank', onboarded: true, startedAt: Date.now() }, settings: { theme: 'light', fontScale: 1, haptics: false, sounds: false, typewriter: false } };
      localStorage.setItem('ink-shell', JSON.stringify({ state: { ...base, ...st }, version: 1 }));
    }
  }, state);
}

/** The persisted app state, as the tests read it. */
export interface SavedState {
  profile: { name: string };
  xp: number;
  activity: string[];
  missions: Record<string, { done: boolean }>;
  challenges: Record<string, { solved: boolean }>;
  cards: Record<string, unknown>;
  badges: Record<string, unknown>;
}

/** Read the persisted app state. */
export async function saved(page: Page): Promise<SavedState> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ink-shell') ?? '{}').state ?? {});
}

/** Missions 1..n marked done. */
export function missionsDone(n: number) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, { step: 0, phase: 'debrief', steps: {}, done: true, doneAt: Date.now() }]));
}

/** Type a command (or a multi-line script) into the visible terminal, line by line. */
export async function typeInTerminal(page: Page, src: string) {
  const input = page.getByTestId('terminal-input').locator('visible=true').first();
  for (const line of src.split('\n')) {
    await input.fill(line);
    await input.press('Enter');
  }
}

/** Close any sheet the step opened (e.g. `man ls` opens the manual), as a learner would. */
async function closeSheets(page: Page) {
  const dialog = page.getByRole('dialog').locator('visible=true');
  if (await dialog.count().then((n) => n > 0, () => false)) {
    await page.keyboard.press('Escape');
    try {
      await expect(dialog).toHaveCount(0, { timeout: 3000 });
    } catch {
      await dialog.first().getByRole('button', { name: 'Close' }).click();
      await expect(dialog).toHaveCount(0);
    }
  }
}

async function clickContinue(page: Page) {
  // On phones a success strip sits above the open terminal; either control advances.
  const strip = page.getByRole('button', { name: /continue|finish mission/i }).locator('visible=true').first();
  await expect(strip).toBeEnabled();
  await strip.click();
}

async function solveOrder(page: Page, lines: string[]) {
  for (let target = 0; target < lines.length; target++) {
    for (let guard = 0; guard < 20; guard++) {
      const texts = await page.locator('[class*="orderItem"] code').allInnerTexts();
      const at = texts.findIndex((t, i) => i >= target && t.trim() === lines[target].trim());
      if (at === target || at < 0) break;
      await page.locator('[class*="orderItem"]').nth(at).getByRole('button', { name: 'Move up' }).click();
    }
  }
  await page.getByRole('button', { name: 'Check order' }).click();
}

/** Play every step of a mission the way a learner would, then reach the debrief. */
export async function playMission(page: Page, m: Mission) {
  const begin = page.getByRole('button', { name: 'Begin mission' });
  // The briefing types itself out; skip it if it is still going (it may finish on its own first).
  await page.getByText('Tap to skip').click({ timeout: 2000 }).catch(() => {});
  await begin.click();
  const steps: Step[] = [...m.lesson, ...m.drills];
  for (const st of steps) {
    switch (st.kind) {
      case 'task':
        await typeInTerminal(page, st.solution);
        await closeSheets(page);
        break;
      case 'quiz':
      case 'predict':
        await page.getByRole('radio').nth(st.answer).click();
        break;
      case 'fill':
        for (let i = 0; i < st.answers.length; i++) await page.getByLabel(`Blank ${i + 1}`).fill(st.answers[i][0]);
        await page.getByRole('button', { name: 'Check', exact: true }).click();
        break;
      case 'order':
        await solveOrder(page, st.lines);
        break;
      default:
        break;
    }
    await clickContinue(page);
  }
  await expect(page.getByText('Complete', { exact: true })).toBeVisible();
}
