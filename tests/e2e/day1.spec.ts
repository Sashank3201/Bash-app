// A new learner signs up and plays Day 1 to the end: XP, streak, rank and flashcards all move.
import { expect, test } from '@playwright/test';
import { day01 } from '../../src/content/missions/day01';
import { playMission, saved } from './helpers';

test('onboarding, then Day 1 from briefing to debrief', async ({ page }) => {
  await page.goto('./');
  await page.getByPlaceholder('Your first name').fill('Sashank');
  await page.getByRole('button', { name: 'Accept the offer' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Day 1' }).click();
  await expect(page).toHaveURL(/#\/mission\/1/);

  await playMission(page, day01);
  await expect(page.getByRole('button', { name: /Next: Day 2/ })).toBeVisible();

  const st = await saved(page);
  expect(st.profile.name).toBe('Sashank');
  expect(st.missions['1'].done).toBe(true);
  expect(st.xp).toBeGreaterThanOrEqual(300);
  expect(st.activity.length).toBe(1);
  expect(Object.keys(st.cards)).toEqual(expect.arrayContaining(day01.debrief.cards));
  expect(st.badges['day-one']).toBeTruthy();

  // Today now points at Day 2 and the flashcards are waiting in Review.
  await page.goto('./#/');
  await expect(page.getByText('Day 2 of 21')).toBeVisible();
  await page.goto('./#/review');
  await expect(page.getByText(new RegExp(`${day01.debrief.cards.length} of \\d+ cards unlocked`))).toBeVisible();
});
