// Every piece of course content must be solvable by its own reference solution.
import { describe, expect, it } from 'vitest';
import '../../src/content';
import { ARENA } from '../../src/content/arena';
import { CASES } from '../../src/content/cases';
import { FLASHCARDS } from '../../src/content/flashcards';
import { MISSIONS } from '../../src/content/missions';
import { checkCaseShape, checkCaseSolution, checkChallenge, checkMissionSteps, checkMissionTasks, isStubCase, isStubMission } from './helpers';

describe('missions', () => {
  for (const m of MISSIONS) {
    describe(`day ${m.day}: ${m.title}`, () => {
      it('every task solution passes its own check (in order, without running examples)', () => checkMissionTasks(m));
      it('quizzes, predictions and orderings are well formed', () => checkMissionSteps(m));
    });
  }
});

describe('cases', () => {
  for (const cs of CASES.filter((c) => !isStubCase(c))) {
    it(`case ${cs.number}: reference solution passes every test`, () => checkCaseSolution(cs));
    it(`case ${cs.number}: tests vary and the starter fails`, () => checkCaseShape(cs));
  }
});

describe('arena', () => {
  it('ids are unique', () => {
    expect(new Set(ARENA.map((c) => c.id)).size).toBe(ARENA.length);
  });
  for (const c of ARENA) it(`arena ${c.id}: solution passes`, () => checkChallenge(c));
});

describe('flashcards', () => {
  it('have unique ids', () => {
    expect(new Set(FLASHCARDS.map((f) => f.id)).size).toBe(FLASHCARDS.length);
  });
  it('are all introduced by some mission debrief', () => {
    const listed = new Set(MISSIONS.flatMap((m) => m.debrief.cards));
    for (const f of FLASHCARDS) expect(listed.has(f.id), `card ${f.id} is never unlocked`).toBe(true);
  });
});

describe('completeness', () => {
  // ALLOW_STUBS lets the site deploy while later days are still being written (they stay locked
  // until the learner gets there). Every other check still applies to everything that is written.
  it.skipIf(!!process.env.ALLOW_STUBS)('no stub content remains', () => {
    const stubs = [...MISSIONS.filter(isStubMission).map((m) => `day ${m.day}`), ...CASES.filter(isStubCase).map((c) => `case ${c.id}`)];
    expect(stubs).toEqual([]);
  });
});
