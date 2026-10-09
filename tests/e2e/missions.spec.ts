// Every mission, played in the browser the way a learner would (slow: run with E2E_ALL=1, optionally DAYS=15-21).
import { test } from '@playwright/test';
import { MISSIONS } from '../../src/content/missions';
import { missionsDone, playMission, seed } from './helpers';

const [from, to] = (process.env.DAYS ?? '1-21').split('-').map(Number);

test.describe('all missions', () => {
  test.skip(!process.env.E2E_ALL, 'set E2E_ALL=1 to play every mission');
  for (const m of MISSIONS.filter((x) => x.day >= from && x.day <= (to || from))) {
    test(`Day ${m.day}: ${m.title}`, async ({ page }) => {
      await seed(page, { missions: missionsDone(m.day - 1) });
      await page.goto(`./#/mission/${m.day}`);
      await playMission(page, m);
    });
  }
});
