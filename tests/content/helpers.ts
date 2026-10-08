// Shared checks for course content: used by content.test.ts (everything) and focus.test.ts (one module).
import { expect } from 'vitest';
import { buildFixture, hasFixture } from '../../src/content';
import { getCard } from '../../src/content/flashcards';
import { lookupRef } from '../../src/content/reference';
import { checkCommand, gradeCase, normOut, runIn, type CaseTestResult } from '../../src/engine/grader';
import { parse } from '../../src/shell/parser';
import { TerminalSession } from '../../src/terminal/session';
import type { CaseFile, Challenge, Mission, Step } from '../../src/content/types';

// Fixtures date their files relative to the real clock, like the app does.
export const NOW = Date.now();

type Rec = NonNullable<Parameters<NonNullable<TerminalSession['onCommand']>>[0]>;

/** Submit a solution the way a learner would: line by line (submit() handles continuation lines). */
export async function submitSolution(session: TerminalSession, src: string): Promise<Rec> {
  let rec: Rec | null = null;
  session.onCommand = (r) => {
    rec = r;
  };
  for (const line of src.split('\n')) await session.submit(line);
  if (!rec) throw new Error(`command did not complete: ${src}`);
  return rec;
}

/** Every task's solution, run in order in one terminal, passes its own check without writing to stderr. */
export async function checkMissionTasks(m: Mission, log?: (s: string) => void) {
  const session = new TerminalSession({ vfs: buildFixture(m.fixture, NOW), hasManual: (t) => !!lookupRef(t) });
  const steps: Step[] = [...m.lesson, ...m.drills];
  for (const st of steps) {
    if (st.kind !== 'task') continue;
    const rec = await submitSolution(session, st.solution);
    log?.(`### ${st.id}\n$ ${st.solution}\n${rec.stdout}${rec.stderr ? 'STDERR> ' + rec.stderr : ''}<status ${rec.status}>\n`);
    const res = await checkCommand(st.check, { ...rec, cols: session.cols }, st.solution);
    expect(res, `step ${st.id}: ${st.solution}\nstdout: ${rec.stdout}\nstderr: ${rec.stderr}`).toMatchObject({ ok: true });
    // a solution that errors would make 'reference' checks pass vacuously
    if (st.check.status === undefined) expect(rec.stderr, `step ${st.id} wrote to stderr`).toBe('');
  }
}

/** Quizzes, predictions, orderings, fills and cards are well formed; predictions match the simulator. */
export async function checkMissionSteps(m: Mission) {
  expect(hasFixture(m.fixture), `fixture ${m.fixture}`).toBe(true);
  const ids = new Set<string>();
  for (const st of [...m.lesson, ...m.drills]) {
    expect(ids.has(st.id), `duplicate step id ${st.id}`).toBe(false);
    ids.add(st.id);
    if (st.kind === 'quiz' || st.kind === 'predict') {
      expect(st.answer).toBeGreaterThanOrEqual(0);
      expect(st.answer).toBeLessThan(st.options.length);
      expect(new Set(st.options).size, `${st.id} has duplicate options`).toBe(st.options.length);
    }
    if (st.kind === 'predict' && !/error|nothing/i.test(st.options[st.answer])) {
      const r = await runIn(buildFixture(m.fixture, NOW), st.code);
      expect(normOut(r.stdout).join('\n'), `predict ${st.id}`).toBe(st.options[st.answer].replace(/\\n/g, '\n').trimEnd());
    }
    if (st.kind === 'order') expect(() => parse(st.lines.join('\n')), `order ${st.id}`).not.toThrow();
    if (st.kind === 'fill') expect(st.template.split('___').length - 1).toBe(st.answers.length);
    if (st.kind === 'task') expect(st.hints.length, `task ${st.id} needs hints`).toBeGreaterThan(0);
  }
  for (const c of m.debrief.cards) expect(getCard(c), `card ${c}`).toBeDefined();
  for (const c of m.cards ?? []) {
    expect(c.day, `card ${c.id} belongs to day ${m.day}`).toBe(m.day);
    expect(m.debrief.cards, `card ${c.id} is listed in the debrief`).toContain(c.id);
  }
}

export function isStubCase(cs: CaseFile) {
  return cs.tests.length === 0;
}

export function isStubMission(m: Mission) {
  return !m.lesson.some((s) => s.kind === 'task');
}

function describeResult(t: CaseTestResult) {
  return `${t.name}\nexpected:\n${t.expected}\nactual:\n${t.actual}\nstderr:${t.stderr}`;
}

/** The reference solution passes every hidden test, cleanly. */
export async function checkCaseSolution(cs: CaseFile, log?: (s: string) => void) {
  const r = await gradeCase(cs, cs.solution);
  for (const t of r) {
    log?.(`## ${t.name}  [${t.args.join(' ')}]\n${t.expected}${t.stderr ? 'STDERR> ' + t.stderr : ''}\n`);
    expect(t, describeResult(t)).toMatchObject({ ok: true });
    const check = cs.tests.find((x) => x.name === t.name)?.check;
    if (!check?.status) expect(t.stderr, `${t.name} wrote to stderr`).toBe('');
    if (check?.output !== undefined) expect(t.actual.trim(), `${t.name} printed nothing`).not.toBe('');
  }
  return r;
}

/** Hidden tests produce different outputs, and the starter template fails at least one of them. */
export async function checkCaseShape(cs: CaseFile) {
  expect(hasFixture(cs.fixture), `fixture ${cs.fixture}`).toBe(true);
  for (const t of cs.tests) if (t.fixture) expect(hasFixture(t.fixture), `fixture ${t.fixture}`).toBe(true);
  expect(cs.tests.length, 'a case needs at least 3 tests').toBeGreaterThanOrEqual(3);
  expect(cs.hints.length, 'a case needs hints').toBeGreaterThanOrEqual(2);
  const r = await gradeCase(cs, cs.solution);
  if (r.length > 1) expect(new Set(r.map((t) => t.expected)).size, 'every test produced the same output').toBeGreaterThan(1);
  const starter = await gradeCase(cs, cs.starter);
  expect(starter.every((t) => t.ok), 'the starter template must not pass').toBe(false);
}

/** An arena challenge's solution passes its own check without writing to stderr. */
export async function checkChallenge(c: Challenge, log?: (s: string) => void) {
  expect(hasFixture(c.fixture), `fixture ${c.fixture}`).toBe(true);
  expect(c.hints.length, `${c.id} needs hints`).toBeGreaterThan(0);
  expect(c.unlockDay).toBeGreaterThanOrEqual(1);
  expect(c.unlockDay).toBeLessThanOrEqual(21);
  const session = new TerminalSession({ vfs: buildFixture(c.fixture, NOW), hasManual: (t) => !!lookupRef(t) });
  const rec = await submitSolution(session, c.solution);
  log?.(`### ${c.id}\n$ ${c.solution}\n${rec.stdout}${rec.stderr ? 'STDERR> ' + rec.stderr : ''}<status ${rec.status}>\n`);
  const res = await checkCommand(c.check, { ...rec, cols: session.cols }, c.solution);
  expect(res, `${c.id}: ${c.solution}\n${rec.stdout}\n${rec.stderr}`).toMatchObject({ ok: true });
  if (c.check.status === undefined) expect(rec.stderr, `${c.id} wrote to stderr`).toBe('');
}
