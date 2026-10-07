// Every piece of course content must be solvable by its own reference solution.
import { describe, expect, it } from 'vitest';
import { buildFixture } from '../../src/content';
import { ARENA } from '../../src/content/arena';
import { CASES } from '../../src/content/cases';
import { FLASHCARDS, getCard } from '../../src/content/flashcards';
import { MISSIONS } from '../../src/content/missions';
import { lookupRef } from '../../src/content/reference';
import { checkCommand, gradeCase, normOut, runIn } from '../../src/engine/grader';
import { parse } from '../../src/shell/parser';
import { TerminalSession } from '../../src/terminal/session';
import type { Step } from '../../src/content/types';

async function runInSession(session: TerminalSession, src: string) {
  let rec: Parameters<NonNullable<TerminalSession['onCommand']>>[0] | null = null;
  session.onCommand = (r) => {
    rec = r;
  };
  await session.submit(src.includes('\n') ? src : src);
  // multi-line solutions are submitted line by line by real users; submit() handles continuation
  if (!rec) throw new Error(`command did not complete: ${src}`);
  return rec as NonNullable<typeof rec>;
}

async function submitAll(session: TerminalSession, src: string) {
  const lines = src.split('\n');
  let rec = null;
  session.onCommand = (r) => {
    rec = r;
  };
  for (const l of lines) await session.submit(l);
  if (!rec) throw new Error(`command did not complete: ${src}`);
  return rec as unknown as NonNullable<Parameters<NonNullable<TerminalSession['onCommand']>>[0]>;
}

describe('missions', () => {
  for (const m of MISSIONS) {
    describe(`day ${m.day}: ${m.title}`, () => {
      it('every task solution passes its own check (in order, without running examples)', async () => {
        const session = new TerminalSession({ vfs: buildFixture(m.fixture, Date.UTC(2026, 2, 14, 12)), hasManual: (t) => !!lookupRef(t) });
        const steps: Step[] = [...m.lesson, ...m.drills];
        for (const st of steps) {
          if (st.kind !== 'task') continue;
          const rec = st.solution.includes('\n') ? await submitAll(session, st.solution) : await runInSession(session, st.solution);
          const res = await checkCommand(st.check, { ...rec, cols: session.cols }, st.solution);
          expect(res, `step ${st.id}: ${st.solution}\nstdout: ${rec.stdout}\nstderr: ${rec.stderr}`).toMatchObject({ ok: true });
          // a solution that errors would make 'reference' checks pass vacuously
          if (st.check.status === undefined) expect(rec.stderr, `step ${st.id} wrote to stderr`).toBe('');
        }
      });

      it('quizzes, predictions and orderings are well formed', async () => {
        const ids = new Set<string>();
        for (const st of [...m.lesson, ...m.drills]) {
          expect(ids.has(st.id), `duplicate step id ${st.id}`).toBe(false);
          ids.add(st.id);
          if (st.kind === 'quiz' || st.kind === 'predict') {
            expect(st.answer).toBeGreaterThanOrEqual(0);
            expect(st.answer).toBeLessThan(st.options.length);
          }
          if (st.kind === 'predict' && !/error|nothing/i.test(st.options[st.answer])) {
            const r = await runIn(buildFixture(m.fixture, Date.UTC(2026, 2, 14, 12)), st.code);
            expect(normOut(r.stdout).join('\n'), `predict ${st.id}`).toBe(st.options[st.answer].replace(/\\n/g, '\n').trimEnd());
          }
          if (st.kind === 'order') expect(() => parse(st.lines.join('\n')), `order ${st.id}`).not.toThrow();
          if (st.kind === 'fill') expect(st.template.split('___').length - 1).toBe(st.answers.length);
          if (st.kind === 'task') expect(st.hints.length, `task ${st.id} needs hints`).toBeGreaterThan(0);
        }
        for (const c of m.debrief.cards) expect(getCard(c), `card ${c}`).toBeDefined();
      });
    });
  }
});

describe('cases', () => {
  for (const cs of CASES) {
    it(`case ${cs.number}: reference solution passes every test`, async () => {
      const r = await gradeCase(cs, cs.solution);
      for (const t of r) expect(t, `${t.name}\nexpected:\n${t.expected}\nactual:\n${t.actual}\nstderr:${t.stderr}`).toMatchObject({ ok: true });
    });
    it(`case ${cs.number}: the starter template does not pass`, async () => {
      const r = await gradeCase(cs, cs.starter);
      expect(r.every((t) => t.ok)).toBe(false);
    });
  }
});

describe('arena', () => {
  for (const c of ARENA) {
    it(`arena ${c.id}: solution passes`, async () => {
      const session = new TerminalSession({ vfs: buildFixture(c.fixture, Date.UTC(2026, 2, 14, 12)) });
      const rec = c.solution.includes('\n') ? await submitAll(session, c.solution) : await runInSession(session, c.solution);
      const res = await checkCommand(c.check, { ...rec, cols: session.cols }, c.solution);
      expect(res, `${c.id}: ${c.solution}\n${rec.stdout}\n${rec.stderr}`).toMatchObject({ ok: true });
    });
  }
});

describe('flashcards', () => {
  it('have unique ids', () => {
    expect(new Set(FLASHCARDS.map((f) => f.id)).size).toBe(FLASHCARDS.length);
  });
});
