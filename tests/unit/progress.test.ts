// XP, ranks, streaks, spaced repetition, unlocking and badges.
import { describe, expect, it } from 'vitest';
import { BADGES, type BadgeSnapshot } from '../../src/engine/badges';
import { capstoneClosed, caseUnlocked, currentDay, isUnlocked } from '../../src/engine/course';
import { addDays, isDue, newCard, rankFor, RANKS, review, streakInfo, xpAfterHints } from '../../src/engine/progress';
import type { MissionRecord } from '../../src/store/app';

const done = (...days: number[]): Record<number, MissionRecord> =>
  Object.fromEntries(days.map((d) => [d, { step: 0, phase: 'debrief', steps: {}, done: true } as MissionRecord]));

describe('ranks', () => {
  it('climb with XP and report progress to the next rank', () => {
    expect(rankFor(0).rank.title).toBe('Intern');
    expect(rankFor(1799).rank.title).toBe('Intern');
    expect(rankFor(1800).rank.title).toBe('Junior Analyst');
    expect(rankFor(3000).progress).toBeCloseTo((3000 - 1800) / (4200 - 1800));
    const top = rankFor(99999);
    expect(top.rank.title).toBe('Lead Analyst');
    expect(top.next).toBeNull();
    expect(top.progress).toBe(1);
  });
  it('are ordered by threshold', () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].min).toBeGreaterThan(RANKS[i - 1].min);
  });
});

describe('hints', () => {
  it('halve XP per hint, floor at a quarter, and pay a fifth for a revealed answer', () => {
    expect(xpAfterHints(120, 0, false)).toBe(120);
    expect(xpAfterHints(120, 1, false)).toBe(60);
    expect(xpAfterHints(120, 2, false)).toBe(30);
    expect(xpAfterHints(120, 5, false)).toBe(30);
    expect(xpAfterHints(120, 0, true)).toBe(24);
  });
});

describe('streaks', () => {
  it('count consecutive local days and remember the best run', () => {
    const today = '2026-03-14';
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-12', '2026-03-13', '2026-03-14'];
    expect(streakInfo(days, today)).toEqual({ current: 3, best: 3, activeToday: true });
  });
  it('keep yesterday’s streak alive until the day is over', () => {
    expect(streakInfo(['2026-03-12', '2026-03-13'], '2026-03-14')).toEqual({ current: 2, best: 2, activeToday: false });
    expect(streakInfo(['2026-03-11'], '2026-03-14').current).toBe(0);
  });
  it('handle month boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(streakInfo(['2026-02-28', '2026-03-01'], '2026-03-01').current).toBe(2);
  });
});

describe('spaced repetition (SM-2)', () => {
  it('schedules good answers further and further out', () => {
    const t = '2026-03-14';
    let c = newCard(t);
    expect(isDue(c, t)).toBe(true);
    c = review(c, 'good', t);
    expect(c.interval).toBe(1);
    c = review(c, 'good', t);
    expect(c.interval).toBe(3);
    c = review(c, 'good', t);
    expect(c.interval).toBe(Math.round(3 * 2.5));
    expect(isDue(c, t)).toBe(false);
    expect(isDue(c, addDays(t, c.interval))).toBe(true);
  });
  it('resets on “again” and never lets ease drop below 1.3', () => {
    let c = newCard('2026-03-14');
    for (let i = 0; i < 10; i++) c = review(c, 'again', '2026-03-14');
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(10);
    expect(c.ease).toBe(1.3);
    expect(c.due).toBe('2026-03-14');
  });
});

describe('unlocking', () => {
  it('opens each day after the previous one is done', () => {
    expect(isUnlocked(1, {})).toBe(true);
    expect(isUnlocked(2, {})).toBe(false);
    expect(isUnlocked(2, done(1))).toBe(true);
    expect(isUnlocked(3, done(1))).toBe(false);
    expect(currentDay(done(1, 2, 3))).toBe(4);
    expect(currentDay(done(...Array.from({ length: 21 }, (_, i) => i + 1)))).toBe(22);
  });
  it('opens a case once its day has started', () => {
    expect(caseUnlocked(7, done(1, 2, 3, 4, 5, 6))).toBe(false);
    expect(caseUnlocked(7, done(1, 2, 3, 4, 5, 6, 7))).toBe(true);
  });
  it('closes the programme only when the capstone case is solved', () => {
    expect(capstoneClosed({})).toBe(false);
    expect(capstoneClosed({ 'case:capstone': { solved: false } })).toBe(false);
    expect(capstoneClosed({ 'case:capstone': { solved: true } })).toBe(true);
  });
});

describe('badges', () => {
  const base: BadgeSnapshot = {
    missionsDone: [],
    challengesSolved: [],
    casesSolved: 0,
    arenaSolved: 0,
    activity: [],
    stats: { commands: 0, scripts: 0, reviews: 0, manPages: 0, sudo: 0, longestPipe: 0, exports: 0 },
    perfectMissions: 0,
    lastActiveHour: null,
  };
  const earned = (s: BadgeSnapshot) => BADGES.filter((b) => b.earned(s)).map((b) => b.id);

  it('start with none and have unique ids', () => {
    expect(earned(base)).toEqual([]);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
  it('award Lead Analyst for the capstone case, not for finishing day 21', () => {
    expect(earned({ ...base, missionsDone: [21] })).not.toContain('lead');
    expect(earned({ ...base, challengesSolved: [{ id: 'case:capstone', hints: 0, kind: 'case' }], casesSolved: 1 })).toContain('lead');
  });
  it('award chapter seals for whole weeks', () => {
    expect(earned({ ...base, missionsDone: [1, 2, 3, 4, 5, 6] })).not.toContain('chapter-1');
    expect(earned({ ...base, missionsDone: [1, 2, 3, 4, 5, 6, 7] })).toContain('chapter-1');
  });
});
