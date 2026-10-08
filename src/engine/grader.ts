// Checks a learner's command/script against a task or case definition.

import type { Node, Program, Word, WordPart } from '../shell/ast';
import { InBuf, StringWriter, type Writer } from '../shell/io';
import { parse } from '../shell/parser';
import { Shell } from '../shell/shell';
import { ExitSignal } from '../shell/errors';
import { normalize, type VFS } from '../shell/vfs';
import '../shell/commands';
import type { CaseFile, Check, NodeKind } from '../content/types';
import { buildFixture } from '../content/fixtures';

export const HOME = '/home/analyst';

export interface RunOutput {
  stdout: string;
  stderr: string;
  status: number;
  shell: Shell;
}

export interface RunOpts {
  cwd?: string;
  user?: string;
  stdin?: string;
  args?: string[];
  scriptName?: string;
  tty?: boolean;
  cols?: number;
  env?: Record<string, string>;
}

class TtyWriter extends StringWriter implements Writer {
  isTTY = true;
}

/** Run source in a throwaway shell on the given filesystem. */
export async function runIn(vfs: VFS, src: string, o: RunOpts = {}): Promise<RunOutput> {
  const sh = new Shell({ vfs, user: o.user ?? 'analyst', cwd: o.cwd ?? HOME, maxSteps: 300_000, timeLimitMs: 8000, fastSleep: true, env: o.env, host: { cols: () => o.cols ?? 80 } });
  const stdout = o.tty ? new TtyWriter() : new StringWriter();
  const stderr = new StringWriter();
  if (o.scriptName) {
    sh.scriptName = o.scriptName;
    sh.arg0 = o.scriptName;
  }
  sh.positional = o.args ?? [];
  let status: number;
  try {
    status = await sh.run(src, { stdin: new InBuf(o.stdin ?? ''), stdout, stderr });
  } catch (e) {
    if (e instanceof ExitSignal) status = e.status;
    else throw e;
  }
  return { stdout: stdout.buf, stderr: stderr.buf, status, shell: sh };
}

// ------------------------------------------------------------------ AST inspection

export interface AstFacts {
  commands: Set<string>;
  kinds: Set<NodeKind>;
}

function wordLit(w: Word): string | null {
  if (w.parts.every((p) => p.t === 'lit' || p.t === 'q')) return w.parts.map((p) => (p as { v: string }).v).join('');
  return null;
}

export function astFacts(prog: Program): AstFacts {
  const commands = new Set<string>();
  const kinds = new Set<NodeKind>();
  const visitWord = (w: Word) => {
    const walk = (parts: WordPart[]) => {
      for (const p of parts) {
        if (p.t === 'cmd' || p.t === 'procsub') {
          kinds.add('cmdsub');
          visit(p.body);
        } else if (p.t === 'dq') walk(p.parts);
        else if (p.t === 'param') kinds.add('variable');
        else if (p.t === 'arith') kinds.add('arith');
      }
    };
    walk(w.parts);
  };
  const visit = (n: Node) => {
    switch (n.type) {
      case 'list':
        n.items.forEach((i) => visit(i.node));
        break;
      case 'simple': {
        if (n.assigns.length) kinds.add('variable');
        if (n.redirs.length) kinds.add('redirect');
        if (n.redirs.some((r) => r.heredoc)) kinds.add('heredoc');
        const names = n.words.map(wordLit);
        let i = 0;
        while (i < names.length && (names[i] === 'sudo' || names[i] === 'time' || names[i] === 'command')) {
          commands.add(names[i]!);
          i++;
        }
        if (names[i]) commands.add(names[i]!);
        if ((names[i] === 'xargs' || names[i] === 'find') && names.length > i + 1) {
          names.slice(i + 1).forEach((x) => x && commands.add(x));
        }
        n.words.forEach(visitWord);
        n.assigns.forEach((a) => a.value && visitWord(a.value));
        break;
      }
      case 'pipeline':
        if (n.cmds.length > 1) kinds.add('pipeline');
        n.cmds.forEach(visit);
        break;
      case 'andor':
        kinds.add('andor');
        visit(n.first);
        n.rest.forEach((r) => visit(r.node));
        break;
      case 'if':
        kinds.add('if');
        n.clauses.forEach((c) => {
          visit(c.cond);
          visit(c.body);
        });
        if (n.else) visit(n.else);
        break;
      case 'for':
        kinds.add('for');
        n.words?.forEach(visitWord);
        visit(n.body);
        break;
      case 'cfor':
        kinds.add('cfor');
        kinds.add('for');
        visit(n.body);
        break;
      case 'while':
        kinds.add('while');
        visit(n.cond);
        visit(n.body);
        break;
      case 'case':
        kinds.add('case');
        n.items.forEach((it) => it.body && visit(it.body));
        break;
      case 'group':
        visit(n.body);
        break;
      case 'subshell':
        kinds.add('subshell');
        visit(n.body);
        break;
      case 'func':
        kinds.add('function');
        visit(n.body);
        break;
      case 'cond':
        kinds.add('cond');
        break;
      case 'arith':
        kinds.add('arith');
        break;
    }
    if ('redirs' in n && n.type !== 'simple' && n.redirs.length) kinds.add('redirect');
  };
  visit(prog);
  return { commands, kinds };
}

// ------------------------------------------------------------------ comparison

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\(B/g, '');
}

export function normOut(s: string, check: Pick<Check, 'anyOrder' | 'looseSpace'> = {}): string[] {
  let lines = stripAnsi(s)
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (check.looseSpace) lines = lines.map((l) => l.trim().replace(/\s+/g, ' '));
  if (check.anyOrder) lines = [...lines].sort();
  return lines;
}

const KIND_LABEL: Record<NodeKind, string> = {
  pipeline: 'a pipe (|)',
  andor: '&& or ||',
  if: 'an if statement',
  for: 'a for loop',
  cfor: 'a C-style for loop',
  while: 'a while/until loop',
  case: 'a case statement',
  function: 'a function',
  cond: '[[ ... ]]',
  arith: 'arithmetic $(( ))',
  subshell: 'a subshell ( )',
  redirect: 'a redirection (>, >>, <)',
  cmdsub: 'command substitution $( )',
  heredoc: 'a here-document (<<)',
  variable: 'a variable',
};

export interface CheckResult {
  ok: boolean;
  message?: string;
  expected?: string;
}

export function expandHome(p: string): string {
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return HOME + p.slice(1);
  return normalize(p, HOME);
}

/** Judge one command the learner typed in the mission terminal. */
export async function checkCommand(
  check: Check,
  run: { src: string; stdout: string; status: number; vfsBefore: VFS; cwdBefore: string; shell: Shell; cols?: number },
  solution: string,
): Promise<CheckResult> {
  let prog: Program;
  try {
    prog = parse(run.src);
  } catch {
    return { ok: false, message: 'That command has a syntax error — check your quotes and brackets.' };
  }
  const facts = astFacts(prog);
  for (const u of check.uses ?? []) {
    if (!facts.commands.has(u)) return { ok: false, message: `Close — but this task wants you to use \`${u}\`.` };
  }
  for (const f of check.forbid ?? []) {
    if (facts.commands.has(f)) return { ok: false, message: `Try it without \`${f}\` this time.` };
  }
  for (const k of check.nodes ?? []) {
    if (!facts.kinds.has(k)) return { ok: false, message: `Almost — this one needs ${KIND_LABEL[k]}.` };
  }
  if (check.status !== undefined && run.status !== check.status) {
    return { ok: false, message: run.status !== 0 ? 'The command reported an error — read the red message above.' : 'Not quite — check the task again.' };
  }
  if (check.output !== undefined) {
    let expected: string;
    if (check.output === 'reference') {
      const ref = await runIn(run.vfsBefore.clone(), solution, { cwd: run.cwdBefore, tty: true, cols: run.cols });
      expected = ref.stdout;
    } else if (typeof check.output === 'string') expected = check.output;
    else expected = '';
    const actualLines = normOut(run.stdout, check);
    if (typeof check.output === 'object') {
      const o = check.output;
      const text = actualLines.join('\n');
      if ('regex' in o && !new RegExp(o.regex, o.flags ?? 'm').test(text)) return { ok: false, message: 'The output doesn’t look right yet.' };
      if ('contains' in o) {
        const missing = o.contains.find((x) => !text.includes(x));
        if (missing !== undefined) return { ok: false, message: 'The output is missing something the task asked for.' };
      }
      if ('lines' in o && actualLines.length !== o.lines) return { ok: false, message: `Expected ${o.lines} line${o.lines === 1 ? '' : 's'} of output, got ${actualLines.length}.` };
    } else {
      const expLines = normOut(expected, check);
      if (expLines.join('\n') !== actualLines.join('\n')) {
        let message: string;
        if (!actualLines.length) message = 'Your command didn’t print anything.';
        else if (expLines.length !== actualLines.length) message = `Not quite: the answer has ${expLines.length} line${expLines.length === 1 ? '' : 's'} of output, yours has ${actualLines.length}.`;
        else message = 'Close — the output doesn’t match yet. Compare it with what the task asks for.';
        return { ok: false, message, expected: expLines.join('\n') };
      }
    }
  }
  const fsRes = checkFs(check, run.shell.vfs);
  if (fsRes) return { ok: false, message: fsRes };
  if (check.cwd !== undefined && normalize(run.shell.cwd) !== expandHome(check.cwd)) {
    return { ok: false, message: `You’re in ${run.shell.cwd.replace(HOME, '~')} — the task wants you in ${check.cwd}.` };
  }
  for (const [k, v] of Object.entries(check.vars ?? {})) {
    if (run.shell.getScalar(k) !== v) return { ok: false, message: `The variable \`${k}\` isn’t set to what the task asks for.` };
  }
  return { ok: true };
}

export function checkFs(check: Check, vfs: VFS): string | null {
  for (const e of check.fs ?? []) {
    const abs = expandHome(e.path);
    const n = vfs.tryLookup(abs);
    const shown = e.path;
    if ('exists' in e) {
      if (!!n !== e.exists) return e.exists ? `\`${shown}\` doesn’t exist yet.` : `\`${shown}\` should be gone.`;
    } else if ('type' in e) {
      if (!n) return `\`${shown}\` doesn’t exist yet.`;
      if ((n.type === 'dir' ? 'dir' : 'file') !== e.type) return `\`${shown}\` should be a ${e.type === 'dir' ? 'directory' : 'file'}.`;
    } else if ('content' in e) {
      if (!n || n.type !== 'file') return `\`${shown}\` doesn’t exist yet.`;
      if ((n.content ?? '').replace(/\s+$/, '') !== e.content.replace(/\s+$/, '')) return `\`${shown}\` doesn’t contain the right text yet.`;
    } else if ('contains' in e) {
      if (!n || n.type !== 'file') return `\`${shown}\` doesn’t exist yet.`;
      if (!(n.content ?? '').includes(e.contains)) return `\`${shown}\` is missing something.`;
    } else if ('mode' in e) {
      if (!n) return `\`${shown}\` doesn’t exist yet.`;
      if ((n.mode & 0o7777) !== e.mode) return `The permissions on \`${shown}\` aren’t right yet (want ${e.mode.toString(8)}).`;
    } else if ('executable' in e) {
      if (!n) return `\`${shown}\` doesn’t exist yet.`;
      if (((n.mode & 0o100) !== 0) !== e.executable) return e.executable ? `\`${shown}\` isn’t executable yet.` : `\`${shown}\` shouldn’t be executable.`;
    }
  }
  return null;
}

// ------------------------------------------------------------------ cases

export interface CaseTestResult {
  name: string;
  ok: boolean;
  args: string[];
  expected: string;
  actual: string;
  stderr: string;
  message?: string;
}

function writeScript(vfs: VFS, path: string, content: string) {
  const abs = expandHome(path);
  const dir = abs.slice(0, abs.lastIndexOf('/'));
  if (!vfs.exists(dir)) vfs.mkdir(dir, { parents: true, cred: { uid: 1000, gid: 1000 } });
  vfs.writeFile(abs, content, { cred: { uid: 1000, gid: 1000 }, mode: 0o755 });
  const n = vfs.lookup(abs);
  n.mode = 0o755;
}

export async function gradeCase(cs: CaseFile, script: string): Promise<CaseTestResult[]> {
  const results: CaseTestResult[] = [];
  const now = Date.now();
  for (const t of cs.tests) {
    const fixture = t.fixture ?? cs.fixture;
    const userFs = buildFixture(fixture, now);
    writeScript(userFs, cs.scriptPath, script);
    const refFs = buildFixture(fixture, now);
    writeScript(refFs, cs.scriptPath, cs.solution);
    const args = t.args ?? [];
    const scriptAbs = cs.scriptPath.replace(/^~/, HOME);
    const cmd = t.run ? `SCRIPT=${shq(scriptAbs)}\n${t.run}` : ['bash', scriptAbs, ...args].map(shq).join(' ');
    const [actual, expected] = await Promise.all([runIn(userFs, cmd, { stdin: t.stdin }), runIn(refFs, cmd, { stdin: t.stdin })]);
    const check: Check = t.check ?? { output: 'reference' };
    let ok = true;
    let message: string | undefined;
    if (check.output === 'reference' || check.output === undefined) {
      if (check.output === 'reference' && normOut(actual.stdout, check).join('\n') !== normOut(expected.stdout, check).join('\n')) {
        ok = false;
        message = 'Output differs from the expected report.';
      }
    } else if (typeof check.output === 'string') {
      if (normOut(actual.stdout, check).join('\n') !== normOut(check.output, check).join('\n')) {
        ok = false;
        message = 'Output differs from the expected report.';
      }
    } else {
      const text = normOut(actual.stdout, check).join('\n');
      const o = check.output;
      if ('regex' in o && !new RegExp(o.regex, o.flags ?? 'm').test(text)) {
        ok = false;
        message = 'Output doesn’t match the required format.';
      }
      if ('contains' in o) {
        const missing = o.contains.find((x) => !text.includes(x));
        if (missing !== undefined) {
          ok = false;
          message = `Output is missing: ${missing}`;
        }
      }
    }
    if (ok && check.status !== undefined && actual.status !== check.status) {
      ok = false;
      message = `Exit status was ${actual.status}, expected ${check.status}.`;
    }
    if (ok && check.status === undefined && actual.status !== expected.status) {
      ok = false;
      message = `Exit status was ${actual.status}, expected ${expected.status}.`;
    }
    if (ok) {
      const fsMsg = checkFs(check, actual.shell.vfs);
      if (fsMsg) {
        ok = false;
        message = fsMsg;
      }
    }
    results.push({ name: t.name, ok, args: t.run ? [t.run] : args, expected: stripAnsi(expected.stdout), actual: stripAnsi(actual.stdout), stderr: actual.stderr, message });
  }
  return results;
}

function shq(s: string): string {
  if (/^[A-Za-z0-9_./=:,@%+-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
