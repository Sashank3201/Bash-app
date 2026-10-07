// Registry + helpers for the external-style commands (ls, grep, awk ...).

import type { InBuf, Writer } from '../io';
import type { Shell } from '../shell';
import { FsError, type Cred, type VFS } from '../vfs';

export interface CmdCtx {
  sh: Shell;
  name: string;
  argv: string[];
  args: string[];
  stdin: InBuf;
  stdout: Writer;
  stderr: Writer;
  vfs: VFS;
  cwd: string;
  cred: Cred;
  abs(p: string): string;
  err(msg: string): void;
}

export type CmdFn = (c: CmdCtx) => Promise<number> | number;

export const COMMANDS: Record<string, CmdFn> = {};

export function register(names: string | string[], fn: CmdFn) {
  for (const n of Array.isArray(names) ? names : [names]) COMMANDS[n] = fn;
}

export interface ParsedOpts {
  flags: Record<string, string | true>;
  /** Repeated options, e.g. grep -e a -e b */
  multi: Record<string, string[]>;
  operands: string[];
}

export class UsageError extends Error {}

/**
 * Generic getopt-style parsing.
 * `short`: single-letter flags without argument, `withArg`: letters taking an argument,
 * `long`: long name → short letter (suffix '=' when it takes an argument).
 */
export function parseOpts(
  args: string[],
  spec: { short?: string; withArg?: string; long?: Record<string, string>; stopAtFirstOperand?: boolean },
): ParsedOpts {
  const flags: Record<string, string | true> = {};
  const multi: Record<string, string[]> = {};
  const operands: string[] = [];
  const short = spec.short ?? '';
  const withArg = spec.withArg ?? '';
  const set = (k: string, v: string | true) => {
    flags[k] = v;
    if (typeof v === 'string') (multi[k] ??= []).push(v);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--') && spec.long) {
      const eq = a.indexOf('=');
      const name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      let key = spec.long[name];
      if (key === undefined) {
        const cands = Object.keys(spec.long).filter((k) => k.startsWith(name));
        if (cands.length === 1) key = spec.long[cands[0]];
      }
      if (key === undefined) throw new UsageError(`unrecognized option '${a}'`);
      if (key.endsWith('=')) {
        const k = key.slice(0, -1);
        if (eq >= 0) set(k, a.slice(eq + 1));
        else if (i + 1 < args.length) set(k, args[++i]);
        else throw new UsageError(`option '${a}' requires an argument`);
      } else set(key, true);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (withArg.includes(f)) {
          const rest = a.slice(j + 1);
          if (rest) set(f, rest);
          else if (i + 1 < args.length) set(f, args[++i]);
          else throw new UsageError(`option requires an argument -- '${f}'`);
          break;
        }
        if (short.includes(f)) {
          set(f, true);
          continue;
        }
        throw new UsageError(`invalid option -- '${f}'`);
      }
      continue;
    }
    operands.push(a);
    if (spec.stopAtFirstOperand) {
      operands.push(...args.slice(i + 1));
      break;
    }
  }
  return { flags, multi, operands };
}

/** Run a command body, converting UsageError into the GNU-style message. */
export function withUsage(fn: CmdFn, usage?: string): CmdFn {
  return async (c) => {
    try {
      return await fn(c);
    } catch (e) {
      if (e instanceof UsageError) {
        c.err(e.message);
        c.stderr.write(`Try '${c.name} --help' for more information.\n`);
        if (usage) void usage;
        return c.name === 'grep' || c.name === 'egrep' || c.name === 'fgrep' || c.name === 'diff' ? 2 : 1;
      }
      throw e;
    }
  };
}

/** Read a file operand ('-' means stdin). Prints `cmd: file: error` and returns null on failure. */
export async function readText(c: CmdCtx, path: string): Promise<string | null> {
  if (path === '-') return c.stdin.readAll();
  if (path === '/dev/null') return '';
  if (path === '/dev/stdin') return c.stdin.readAll();
  try {
    return c.vfs.readFile(c.abs(path), c.cred);
  } catch (e) {
    if (e instanceof FsError) {
      c.err(`${path}: ${e.message}`);
      return null;
    }
    throw e;
  }
}

/** Split text into lines; a trailing newline does not create an empty last line. */
export function splitLines(s: string): string[] {
  if (s === '') return [];
  const lines = s.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function joinLines(lines: string[]): string {
  return lines.length ? lines.join('\n') + '\n' : '';
}

/** Inputs for filter commands: each file operand, or stdin when there are none. */
export async function* inputs(c: CmdCtx, operands: string[]): AsyncGenerator<{ name: string; text: string | null }> {
  if (!operands.length) {
    yield { name: '-', text: await c.stdin.readAll() };
    return;
  }
  for (const f of operands) yield { name: f, text: await readText(c, f) };
}

/** Byte-order comparison (LC_ALL=C). */
export function cmpC(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** ANSI helpers for TTY output. */
export const ansi = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[1;31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[1;34m${s}\x1b[0m`,
  green: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[1;36m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  redBg: (s: string) => `\x1b[37;41m${s}\x1b[0m`,
};
