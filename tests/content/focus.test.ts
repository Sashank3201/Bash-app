// Check one piece of content while writing it, and print what its solutions produce.
//
//   FOCUS=day16 npm run -s focus             one mission: tasks run in order, outputs printed
//   FOCUS=case:decoder npm run -s focus      one case: every hidden test's reference output printed
//   FOCUS=arena:security npm run -s focus    one arena file (src/content/arena/security.ts)
//   SNIPS=path/to/snips.txt FX=day16 npm run -s focus
//        run snippets (separated by a line "----") on a fixture and print stdout/stderr/status
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFixture } from '../../src/content';
import { ARENA_BY_FILE } from '../../src/content/arena';
import { CASES } from '../../src/content/cases';
import { MISSIONS } from '../../src/content/missions';
import { astFacts, runIn } from '../../src/engine/grader';
import { parse } from '../../src/shell/parser';
import { checkCaseShape, checkCaseSolution, checkChallenge, checkMissionSteps, checkMissionTasks, NOW } from './helpers';

const FOCUS = process.env.FOCUS ?? '';
const print = (s: string) => console.log(s);

describe.skipIf(!FOCUS)(`focus ${FOCUS}`, () => {
  const day = /^day(\d+)$/.exec(FOCUS);
  const cs = /^case:(.+)$/.exec(FOCUS);
  const arena = /^arena:(.+)$/.exec(FOCUS);
  if (day) {
    const m = MISSIONS.find((x) => x.day === Number(day[1]));
    it('mission exists', () => expect(m).toBeDefined());
    if (m) {
      it('tasks', () => checkMissionTasks(m, print));
      it('steps', () => checkMissionSteps(m));
    }
  } else if (cs) {
    const c = CASES.find((x) => x.id === cs[1]);
    it('case exists', () => expect(c).toBeDefined());
    if (c) {
      it('reference solution', () => checkCaseSolution(c, print));
      it('shape', () => checkCaseShape(c));
    }
  } else if (arena) {
    const list = ARENA_BY_FILE[arena[1]];
    it('arena file exists', () => expect(list).toBeDefined());
    for (const c of list ?? []) it(c.id, () => checkChallenge(c, print));
  } else {
    it('FOCUS is dayNN, case:ID or arena:FILE', () => expect(FOCUS).toBe('dayNN | case:ID | arena:FILE'));
  }
});

it.skipIf(!process.env.SNIPS)('snippets', async () => {
  const fx = process.env.FX ?? 'base';
  const snippets = readFileSync(process.env.SNIPS!, 'utf8').split('\n----\n');
  for (const s of snippets) {
    if (!s.trim()) continue;
    const r = await runIn(buildFixture(fx, NOW), s, { stdin: process.env.STDIN });
    let facts: string;
    try {
      const f = astFacts(parse(s));
      facts = `nodes: ${[...f.kinds].join(',')} | commands: ${[...f.commands].join(',')}`;
    } catch (e) {
      facts = 'PARSE ERROR ' + String(e);
    }
    print(`$ ${s}\n[${facts}]\n${r.stdout}${r.stderr ? 'STDERR> ' + r.stderr : ''}<status ${r.status}>\n`);
  }
});
