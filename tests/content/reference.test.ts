// The in-app manual covers every command the course asks learners to use.
import { describe, expect, it } from 'vitest';
import { ARENA } from '../../src/content/arena';
import { CASES } from '../../src/content/cases';
import { MISSIONS } from '../../src/content/missions';
import { REFERENCE, lookupRef } from '../../src/content/reference';
import { astFacts } from '../../src/engine/grader';
import { BUILTINS, COMMANDS, parse } from '../../src/shell';

/** [where, source] for every solution, example and fenced code block in the course. */
function snippets(): [string, string][] {
  const out: [string, string][] = [];
  const md = (where: string, s?: string) => {
    for (const m of (s ?? '').matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)) out.push([`${where} (prose)`, m[1]]);
  };
  for (const m of MISSIONS) {
    md(`day${m.day}`, m.briefing);
    for (const st of [...m.lesson, ...m.drills]) {
      const where = `day${m.day}/${st.id}`;
      if ('md' in st) md(where, st.md);
      if (st.kind === 'task') out.push([where, st.solution]);
      if ('code' in st && st.code) out.push([where, st.code]);
      if (st.kind === 'order') out.push([where, st.lines.join('\n')]);
    }
  }
  for (const c of CASES) {
    out.push([`case:${c.id}`, c.solution]);
    md(`case:${c.id}`, c.brief);
    md(`case:${c.id}`, c.walkthrough);
  }
  for (const a of ARENA) out.push([`arena:${a.id}`, a.solution]);
  return out;
}

describe('reference', () => {
  it('has a page for every command and builtin the course uses', () => {
    const known = new Set([...Object.keys(COMMANDS), ...Object.keys(BUILTINS)]);
    const missing = new Map<string, string>();
    for (const [where, src] of snippets()) {
      let prog;
      try {
        prog = parse(src);
      } catch {
        continue; // prose fragments with placeholders
      }
      for (const c of astFacts(prog).commands) if (known.has(c) && !lookupRef(c) && !missing.has(c)) missing.set(c, where);
    }
    expect([...missing].map(([c, w]) => `${c} (first used in ${w})`)).toEqual([]);
  });

  it('only links to pages that exist', () => {
    const broken = REFERENCE.flatMap((r) => (r.related ?? []).filter((x) => !lookupRef(x)).map((x) => `${r.name} → ${x}`));
    expect(broken).toEqual([]);
  });

  it('has one page per name', () => {
    const names = REFERENCE.map((r) => r.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
});
