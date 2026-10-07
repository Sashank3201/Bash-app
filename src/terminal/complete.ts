// Tab completion for commands and paths.

import { BUILTINS } from '../shell/builtins';
import { COMMANDS } from '../shell/commands/registry';
import type { Shell } from '../shell/shell';
import { normalize } from '../shell/vfs';

const KEYWORDS = ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'function', 'in'];

export interface Completion {
  /** Text to replace the current word with. */
  replacement: string;
  /** All candidates (for the suggestion chips). */
  candidates: string[];
  start: number;
  end: number;
}

function commonPrefix(xs: string[]): string {
  if (!xs.length) return '';
  let p = xs[0];
  for (const x of xs) while (!x.startsWith(p)) p = p.slice(0, -1);
  return p;
}

/** Find the word under the cursor and whether it is in command position. */
export function wordAt(line: string, cursor: number): { word: string; start: number; isCommand: boolean } {
  let start = cursor;
  while (start > 0 && !/[\s|;&<>(]/.test(line[start - 1])) start--;
  const before = line.slice(0, start).replace(/\s+$/, '');
  const isCommand = before === '' || /[|;&(]$/.test(before) || /(^|[\s;&|])(sudo|then|do|else|time|xargs|!)$/.test(before);
  return { word: line.slice(start, cursor), start, isCommand };
}

export function commandNames(sh: Shell): string[] {
  return [...new Set([...Object.keys(BUILTINS), ...Object.keys(COMMANDS), ...sh.funcs.keys(), ...sh.aliases.keys(), ...KEYWORDS])].filter((n) => n !== '.' && n !== ':' && n !== '[').sort();
}

export function complete(sh: Shell, line: string, cursor: number): Completion | null {
  const { word, start, isCommand } = wordAt(line, cursor);
  const unq = word.replace(/^['"]/, '');
  let candidates: string[];
  let suffixFor: (c: string) => string = () => ' ';
  if (isCommand && !unq.includes('/')) {
    candidates = commandNames(sh).filter((n) => n.startsWith(unq));
  } else if (unq.startsWith('$')) {
    const prefix = unq.slice(1).replace(/^\{/, '');
    candidates = [...sh.vars.keys()].filter((k) => k.startsWith(prefix) && /^[A-Za-z_]/.test(k)).map((k) => '$' + k);
  } else {
    // path completion
    const tilde = unq.startsWith('~');
    const expanded = tilde ? (sh.getScalar('HOME') ?? '/') + unq.slice(1) : unq;
    const slash = expanded.lastIndexOf('/');
    const dirPart = slash >= 0 ? expanded.slice(0, slash + 1) : '';
    const base = slash >= 0 ? expanded.slice(slash + 1) : expanded;
    const dirAbs = normalize(dirPart || '.', sh.cwd);
    let names: string[] = [];
    try {
      names = sh.vfs.readdir(dirAbs, sh.cred);
    } catch {
      return null;
    }
    const shownDir = slash >= 0 ? unq.slice(0, unq.lastIndexOf('/') + 1) : '';
    const matches = names.filter((n) => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')));
    candidates = matches.map((n) => shownDir + n);
    const isDir = (c: string) => {
      const name = c.slice(shownDir.length);
      const n = sh.vfs.tryLookup(normalize(dirPart + name, sh.cwd));
      return n?.type === 'dir';
    };
    suffixFor = (c) => (isDir(c) ? '/' : ' ');
    if (isCommand) {
      // ./script — only executables and dirs
      candidates = candidates.filter((c) => {
        const n = sh.vfs.tryLookup(normalize(dirPart + c.slice(shownDir.length), sh.cwd));
        return n && (n.type === 'dir' || (n.mode & 0o111) !== 0);
      });
    }
  }
  if (!candidates.length) return null;
  const quoteSafe = (s: string) => s.replace(/([\s'"\\$`!&;|<>()*?[\]{}])/g, '\\$1');
  if (candidates.length === 1) {
    const c = candidates[0];
    return { replacement: quoteSafe(c) + suffixFor(c), candidates, start, end: cursor };
  }
  const prefix = commonPrefix(candidates);
  return { replacement: quoteSafe(prefix.length > unq.length ? prefix : unq), candidates, start, end: cursor };
}

/** Live suggestions while typing the first word. */
export function suggest(sh: Shell, line: string, cursor: number): string[] {
  const { word, isCommand } = wordAt(line, cursor);
  if (!isCommand || word.length < 1) return [];
  return commandNames(sh)
    .filter((n) => n.startsWith(word) && n !== word)
    .slice(0, 8);
}
