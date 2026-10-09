// Shell builtins (things that must run inside the shell process).

import type { Assign } from './ast';
import { BreakSignal, ContinueSignal, ExitSignal, ExpansionError, IncompleteInput, ReturnSignal, ShellSyntaxError } from './errors';
import { echoEscapes, printf, shellQuote } from './format';
import type { InBuf } from './io';
import { Parser } from './parser';
import { FsError, ROOT, normalize } from './vfs';
import { COMMANDS } from './commands/registry';
import { fileCompare, fileTest, type IOCtx, type Shell, type Var } from './shell';

export type Builtin = (sh: Shell, argv: string[], io: IOCtx, arrays: Map<string, Assign>) => Promise<number>;

const err = (sh: Shell, io: IOCtx, msg: string) => io.stderr.write(sh.errPrefix() + msg + '\n');

const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'case', 'esac', 'for', 'while', 'until', 'do', 'done', 'in', 'function', 'select', 'time', '{', '}', '!', '[[', ']]']);

export const DECLARATION_BUILTINS = new Set(['declare', 'typeset', 'local', 'export', 'readonly']);

function isName(s: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
}

function quoteValue(v: string): string {
  return '"' + v.replace(/(["\\$`])/g, '\\$1') + '"';
}

function declareLine(name: string, v: Var): string {
  let flags = '';
  if (v.kind === 'indexed') flags += 'a';
  if (v.kind === 'assoc') flags += 'A';
  if (v.integer) flags += 'i';
  if (v.lower) flags += 'l';
  if (v.readonly) flags += 'r';
  if (v.upper) flags += 'u';
  if (v.exported) flags += 'x';
  const f = flags ? '-' + flags : '--';
  if (v.kind === 'indexed') {
    const items = [...v.arr!.entries()].sort((a, b) => a[0] - b[0]).map(([k, x]) => `[${k}]=${quoteValue(x)}`);
    return `declare ${f} ${name}=(${items.join(' ')})`;
  }
  if (v.kind === 'assoc') {
    const items = [...v.map!.entries()].map(([k, x]) => `[${k}]=${quoteValue(x)} `);
    return `declare ${f} ${name}=(${items.join('')})`;
  }
  return `declare ${f} ${name}=${quoteValue(v.value)}`;
}

// ------------------------------------------------------------------ test / [

class TestError extends Error {}

const UNARY = new Set(['-e', '-f', '-d', '-r', '-w', '-x', '-s', '-L', '-h', '-z', '-n', '-u', '-g', '-k', '-O', '-G', '-N', '-b', '-c', '-p', '-S', '-t', '-a', '-v', '-o']);
const BINARY = new Set(['=', '==', '!=', '<', '>', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-nt', '-ot', '-ef']);

function testInt(s: string): bigint {
  const t = s.trim();
  if (!/^[+-]?\d+$/.test(t)) throw new TestError(`${s}: integer expression expected`);
  return BigInt(t);
}

function testUnary(sh: Shell, op: string, a: string): boolean {
  if (op === '-v') return sh.isSet(a);
  return fileTest(sh, op, a);
}

function testBinary(sh: Shell, op: string, a: string, b: string): boolean {
  switch (op) {
    case '=':
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '-eq': return testInt(a) === testInt(b);
    case '-ne': return testInt(a) !== testInt(b);
    case '-lt': return testInt(a) < testInt(b);
    case '-le': return testInt(a) <= testInt(b);
    case '-gt': return testInt(a) > testInt(b);
    case '-ge': return testInt(a) >= testInt(b);
    default:
      return fileCompare(sh, op, a, b);
  }
}

function testExpr(sh: Shell, args: string[]): boolean {
  const n = args.length;
  if (n === 0) return false;
  if (n === 1) return args[0] !== '';
  if (n === 2) {
    if (args[0] === '!') return args[1] === '';
    if (UNARY.has(args[0])) return testUnary(sh, args[0], args[1]);
    throw new TestError(`${args[0]}: unary operator expected`);
  }
  if (n === 3) {
    if (BINARY.has(args[1])) return testBinary(sh, args[1], args[0], args[2]);
    if (args[1] === '-a') return args[0] !== '' && args[2] !== '';
    if (args[1] === '-o') return args[0] !== '' || args[2] !== '';
    if (args[0] === '!') return !testExpr(sh, args.slice(1));
    if (args[0] === '(' && args[2] === ')') return args[1] !== '';
    throw new TestError(`${args[1]}: binary operator expected`);
  }
  if (n === 4) {
    if (args[0] === '!') return !testExpr(sh, args.slice(1));
    if (args[0] === '(' && args[3] === ')') return testExpr(sh, args.slice(1, 3));
  }
  // general: -o lowest, then -a, then !, then primaries
  const p = { i: 0 };
  const orE = (): boolean => {
    let v = andE();
    while (args[p.i] === '-o') {
      p.i++;
      const r = andE();
      v = v || r;
    }
    return v;
  };
  const andE = (): boolean => {
    let v = notE();
    while (args[p.i] === '-a') {
      p.i++;
      const r = notE();
      v = v && r;
    }
    return v;
  };
  const notE = (): boolean => {
    if (args[p.i] === '!') {
      p.i++;
      return !notE();
    }
    return prim();
  };
  const prim = (): boolean => {
    const a = args[p.i];
    if (a === undefined) throw new TestError('argument expected');
    if (a === '(') {
      p.i++;
      const v = orE();
      if (args[p.i] !== ')') throw new TestError("`)' expected");
      p.i++;
      return v;
    }
    if (BINARY.has(args[p.i + 1] ?? '') && p.i + 2 < args.length) {
      const r = testBinary(sh, args[p.i + 1], a, args[p.i + 2]);
      p.i += 3;
      return r;
    }
    if (UNARY.has(a) && p.i + 1 < args.length) {
      const r = testUnary(sh, a, args[p.i + 1]);
      p.i += 2;
      return r;
    }
    p.i++;
    return a !== '';
  };
  const v = orE();
  if (p.i < args.length) throw new TestError('too many arguments');
  return v;
}

async function testBuiltin(sh: Shell, argv: string[], io: IOCtx): Promise<number> {
  const prevIO = sh.testIO;
  sh.testIO = io;
  try {
    return await testBuiltinInner(sh, argv, io);
  } finally {
    sh.testIO = prevIO;
  }
}

async function testBuiltinInner(sh: Shell, argv: string[], io: IOCtx): Promise<number> {
  let args = argv.slice(1);
  const name = argv[0];
  if (name === '[') {
    if (args[args.length - 1] !== ']') {
      err(sh, io, "[: missing `]'");
      return 2;
    }
    args = args.slice(0, -1);
  }
  try {
    return testExpr(sh, args) ? 0 : 1;
  } catch (e) {
    if (e instanceof TestError) {
      err(sh, io, `${name}: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

// ------------------------------------------------------------------ read

async function readBuiltin(sh: Shell, argv: string[], io: IOCtx): Promise<number> {
  let raw = false;
  let prompt = '';
  let arrayName: string | null = null;
  let delim = '\n';
  let nchars: number | null = null;
  const names: string[] = [];
  const args = argv.slice(1);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      names.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('-') && a.length > 1 && !names.length) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        const val = () => {
          const rest = a.slice(j + 1);
          j = a.length;
          if (rest) return rest;
          i++;
          if (i >= args.length) throw new ExpansionError(`read: -${f}: option requires an argument`, 2);
          return args[i];
        };
        if (f === 'r') raw = true;
        else if (f === 's' || f === 'e') {
          /* silent / readline: ignored */
        } else if (f === 'p') prompt = val();
        else if (f === 'a') arrayName = val();
        else if (f === 'd') delim = val().slice(0, 1) || '\0';
        else if (f === 'n' || f === 'N') nchars = Number(val());
        else if (f === 't' || f === 'u') val();
        else {
          err(sh, io, `read: -${f}: invalid option`);
          return 2;
        }
      }
      continue;
    }
    names.push(a);
  }
  for (const n of names) {
    if (!isName(n)) {
      err(sh, io, `read: \`${n}': not a valid identifier`);
      return 1;
    }
  }
  const stdin: InBuf = io.stdin;
  if (prompt && stdin.isTTY) io.stderr.write(prompt);
  let line: string;
  let hadDelim: boolean;
  if (nchars !== null) {
    line = await stdin.readChars(nchars);
    hadDelim = line.length === nchars;
    if (!line.length) hadDelim = false;
  } else {
    line = '';
    hadDelim = false;
    for (;;) {
      const r = await stdin.readLine(delim);
      if (!r) break;
      const [chunk, nl] = r;
      if (!raw && nl && delim === '\n' && /(^|[^\\])(\\\\)*\\$/.test(chunk)) {
        line += chunk.slice(0, -1);
        continue;
      }
      line += chunk;
      hadDelim = nl;
      break;
    }
    if (!raw) line = line.replace(/\\(.)/g, '$1');
  }
  const eof = !hadDelim;
  if (eof && line === '') {
    if (arrayName) sh.assignArray(arrayName, [], false);
    else for (const n of names.length ? names : ['REPLY']) sh.setVar(n, '');
    return 1;
  }
  const ifsVar = sh.getVar('IFS');
  const ifs = ifsVar ? ifsVar.value : ' \t\n';
  if (arrayName) {
    sh.assignArray(arrayName, [{ value: splitIfs(line, ifs, Infinity) }], false);
    return eof ? 1 : 0;
  }
  if (!names.length) {
    sh.setVar('REPLY', line);
    return eof ? 1 : 0;
  }
  const parts = splitIfs(line, ifs, names.length);
  names.forEach((n, i) => sh.setVar(n, parts[i] ?? ''));
  return eof ? 1 : 0;
}

/** Split like `read`: at most `max` fields, the last one gets the remainder (trimmed of IFS whitespace). */
export function splitIfs(line: string, ifs: string, max: number): string[] {
  if (ifs === '') return [line];
  const ws = [...ifs].filter((c) => c === ' ' || c === '\t' || c === '\n').join('');
  const isWs = (c: string) => ws.includes(c);
  const isSep = (c: string) => ifs.includes(c);
  const out: string[] = [];
  let i = 0;
  // trim leading IFS whitespace
  while (i < line.length && isWs(line[i])) i++;
  while (i < line.length) {
    if (out.length === max - 1) {
      let rest = line.slice(i);
      // trim trailing IFS whitespace
      let e = rest.length;
      while (e > 0 && isWs(rest[e - 1])) e--;
      rest = rest.slice(0, e);
      // a single trailing non-whitespace separator is stripped too
      if (rest.length && isSep(rest[rest.length - 1]) && !isWs(rest[rest.length - 1]) && !rest.slice(0, -1).split('').some(isSep)) {
        rest = rest.slice(0, -1);
      }
      out.push(rest);
      return out;
    }
    let field = '';
    while (i < line.length && !isSep(line[i])) field += line[i++];
    out.push(field);
    // consume separators: whitespace*, at most one non-ws sep, whitespace*
    while (i < line.length && isWs(line[i])) i++;
    if (i < line.length && isSep(line[i]) && !isWs(line[i])) {
      i++;
      while (i < line.length && isWs(line[i])) i++;
    }
  }
  return out;
}

// ------------------------------------------------------------------ declare & friends

async function declareBuiltin(sh: Shell, argv: string[], io: IOCtx, arrays: Map<string, Assign>): Promise<number> {
  const cmd = argv[0];
  const flags = new Set<string>();
  const unflags = new Set<string>();
  const items: string[] = [];
  let parsingOpts = true;
  for (const a of argv.slice(1)) {
    if (parsingOpts && a === '--') {
      parsingOpts = false;
      continue;
    }
    if (parsingOpts && /^[-+][a-zA-Z]+$/.test(a)) {
      for (const f of a.slice(1)) (a[0] === '-' ? flags : unflags).add(f);
      continue;
    }
    parsingOpts = false;
    items.push(a);
  }
  if (cmd === 'export') {
    if (!flags.has('n')) flags.add('x');
    else {
      flags.delete('n');
      unflags.add('x');
    }
  }
  if (cmd === 'readonly') flags.add('r');
  const isLocal = cmd === 'local' || ((cmd === 'declare' || cmd === 'typeset') && sh.inFunction() && !flags.has('g'));
  if (cmd === 'local' && !sh.inFunction()) {
    err(sh, io, 'local: can only be used in a function');
    return 1;
  }
  if (flags.has('f') || flags.has('F')) {
    const names = items.length ? items : [...sh.funcs.keys()].sort();
    let st = 0;
    for (const n of names) {
      if (!sh.funcs.has(n)) {
        st = 1;
        continue;
      }
      io.stdout.write(flags.has('F') ? `declare -f ${n}\n` : `${n} () \n{ ... }\n`);
    }
    return st;
  }
  if (!items.length || flags.has('p')) {
    const names = items.length ? items : [...sh.vars.keys()].sort();
    let st = 0;
    for (const n of names) {
      const v = sh.vars.get(n);
      if (!v) {
        if (items.length) {
          err(sh, io, `${cmd}: ${n}: not found`);
          st = 1;
        }
        continue;
      }
      if (cmd === 'export' && !v.exported) continue;
      if (cmd === 'readonly' && !v.readonly) continue;
      if (!items.length && flags.size && !flags.has('p')) {
        if (flags.has('x') && !v.exported) continue;
        if (flags.has('r') && !v.readonly) continue;
        if (flags.has('a') && v.kind !== 'indexed') continue;
        if (flags.has('A') && v.kind !== 'assoc') continue;
      }
      io.stdout.write(declareLine(n, v) + '\n');
    }
    return st;
  }
  let status = 0;
  for (const item of items) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(\[([^\]]*)\])?(\+?)=([\s\S]*)$/.exec(item);
    const name = m ? m[1] : item;
    if (!isName(name)) {
      err(sh, io, `${cmd}: \`${item}': not a valid identifier`);
      status = 1;
      continue;
    }
    try {
      const existing = sh.vars.get(name);
      if (existing?.readonly && (m || flags.size)) {
        if (!(cmd === 'readonly' && !m)) {
          err(sh, io, `${name}: readonly variable`);
          status = 1;
          continue;
        }
      }
      if (isLocal) sh.declareLocal(name);
      let v = sh.vars.get(name);
      if (!v) {
        v = { kind: 'scalar', value: '' };
        sh.vars.set(name, v);
      }
      if (flags.has('a') && v.kind === 'scalar') {
        v.kind = 'indexed';
        v.arr = new Map(v.value !== '' ? [[0, v.value]] : []);
      }
      if (flags.has('A') && v.kind !== 'assoc') {
        v.kind = 'assoc';
        v.map = new Map();
      }
      if (flags.has('i')) v.integer = true;
      if (unflags.has('i')) v.integer = false;
      if (flags.has('l')) {
        v.lower = true;
        v.upper = false;
      }
      if (flags.has('u')) {
        v.upper = true;
        v.lower = false;
      }
      if (flags.has('x')) v.exported = true;
      if (unflags.has('x')) v.exported = false;
      const arr = arrays.get(name);
      if (arr && arr.array) {
        await sh.assign({ ...arr, name });
      } else if (m) {
        if (m[3] !== undefined) sh.setElem(name, m[3], m[5], m[4] === '+');
        else sh.setVar(name, m[5], { append: m[4] === '+' });
      }
      if (flags.has('r')) v.readonly = true;
    } catch (e) {
      if (e instanceof ExpansionError) {
        err(sh, io, e.message);
        status = 1;
        continue;
      }
      throw e;
    }
  }
  return status;
}

// ------------------------------------------------------------------ source / eval

async function runInCurrent(sh: Shell, src: string, io: IOCtx, name: string | null): Promise<number> {
  const p = new Parser(src, 0, 1);
  const savedScript = sh.scriptName;
  if (name) sh.scriptName = name;
  try {
    for (;;) {
      let items;
      try {
        items = p.nextLine();
      } catch (e) {
        if (e instanceof ShellSyntaxError || e instanceof IncompleteInput) {
          const msg = e instanceof ShellSyntaxError ? e.message : 'syntax error: unexpected end of file';
          io.stderr.write(sh.errPrefix(e instanceof ShellSyntaxError ? e.line : p.line) + msg + '\n');
          return 2;
        }
        throw e;
      }
      if (!items) break;
      for (const item of items) await sh.exec(item.node, io);
    }
    return sh.lastStatus;
  } finally {
    sh.scriptName = savedScript;
  }
}

// ------------------------------------------------------------------ getopts

const getoptsState = new WeakMap<Shell, { ind: number; char: number }>();

async function getoptsBuiltin(sh: Shell, argv: string[], io: IOCtx): Promise<number> {
  if (argv.length < 3) {
    err(sh, io, 'getopts: usage: getopts optstring name [arg ...]');
    return 2;
  }
  let optstring = argv[1];
  const varName = argv[2];
  const args = argv.length > 3 ? argv.slice(3) : sh.positional;
  const silent = optstring.startsWith(':');
  if (silent) optstring = optstring.slice(1);
  let optind = Number(sh.getScalar('OPTIND') ?? '1') || 1;
  let st = getoptsState.get(sh);
  if (!st || st.ind !== optind) st = { ind: optind, char: 1 };
  const finish = () => {
    sh.setVar(varName, '?');
    sh.setVar('OPTIND', String(optind));
    getoptsState.set(sh, { ind: optind, char: 1 });
    return 1;
  };
  const arg = args[optind - 1];
  if (arg === undefined || !arg.startsWith('-') || arg === '-') return finish();
  if (arg === '--') {
    optind++;
    return finish();
  }
  const ch = arg[st.char];
  let nextChar = st.char + 1;
  const advance = () => {
    if (nextChar >= arg.length) {
      optind++;
      nextChar = 1;
    }
  };
  const idx = optstring.indexOf(ch);
  if (idx < 0 || ch === ':') {
    advance();
    sh.setVar(varName, '?');
    if (silent) sh.setVar('OPTARG', ch);
    else {
      sh.unsetVar('OPTARG');
      io.stderr.write(`${sh.arg0}: illegal option -- ${ch}\n`);
    }
  } else if (optstring[idx + 1] === ':') {
    if (nextChar < arg.length) {
      sh.setVar('OPTARG', arg.slice(nextChar));
      optind++;
      nextChar = 1;
      sh.setVar(varName, ch);
    } else if (args[optind] !== undefined) {
      sh.setVar('OPTARG', args[optind]);
      optind += 2;
      nextChar = 1;
      sh.setVar(varName, ch);
    } else {
      optind++;
      nextChar = 1;
      if (silent) {
        sh.setVar(varName, ':');
        sh.setVar('OPTARG', ch);
      } else {
        sh.setVar(varName, '?');
        sh.unsetVar('OPTARG');
        io.stderr.write(`${sh.arg0}: option requires an argument -- ${ch}\n`);
      }
    }
  } else {
    advance();
    sh.setVar(varName, ch);
    sh.unsetVar('OPTARG');
  }
  sh.setVar('OPTIND', String(optind));
  getoptsState.set(sh, { ind: optind, char: nextChar });
  return 0;
}

// ------------------------------------------------------------------ the table

const SIGNALS: Record<string, string> = {
  '0': 'EXIT', EXIT: 'EXIT', ERR: 'ERR', INT: 'INT', SIGINT: 'INT', '2': 'INT', TERM: 'TERM', SIGTERM: 'TERM', '15': 'TERM',
  HUP: 'HUP', SIGHUP: 'HUP', '1': 'HUP', DEBUG: 'DEBUG', RETURN: 'RETURN', QUIT: 'QUIT', SIGQUIT: 'QUIT',
};

export const BUILTINS: Record<string, Builtin> = {
  ':': async () => 0,
  true: async () => 0,
  false: async () => 1,

  echo: async (_sh, argv, io) => {
    let i = 1;
    let newline = true;
    let escapes = false;
    while (i < argv.length && /^-[neE]+$/.test(argv[i])) {
      for (const f of argv[i].slice(1)) {
        if (f === 'n') newline = false;
        else if (f === 'e') escapes = true;
        else escapes = false;
      }
      i++;
    }
    let s = argv.slice(i).join(' ');
    if (escapes) {
      const [t, stop] = echoEscapes(s);
      s = t;
      if (stop) {
        io.stdout.write(s);
        return 0;
      }
    }
    io.stdout.write(s + (newline ? '\n' : ''));
    return 0;
  },

  printf: async (sh, argv, io) => {
    let args = argv.slice(1);
    let varName: string | null = null;
    if (args[0] === '-v') {
      varName = args[1];
      args = args.slice(2);
    }
    if (args[0] === '--') args = args.slice(1);
    if (!args.length) {
      err(sh, io, 'printf: usage: printf [-v var] format [arguments]');
      return 2;
    }
    const r = printf(args[0], args.slice(1));
    for (const e of r.errors) err(sh, io, 'printf: ' + e);
    if (varName) sh.setVar(varName, r.out);
    else io.stdout.write(r.out);
    return r.errors.length ? 1 : 0;
  },

  cd: async (sh, argv, io) => {
    const args = argv.slice(1).filter((a) => a !== '-L' && a !== '-P' && a !== '--');
    if (args.length > 1) {
      err(sh, io, 'cd: too many arguments');
      return 1;
    }
    let target: string | undefined = args[0];
    let print = false;
    if (target === undefined || target === '') {
      target = sh.getScalar('HOME');
      if (target === undefined) {
        err(sh, io, 'cd: HOME not set');
        return 1;
      }
    } else if (target === '-') {
      target = sh.getScalar('OLDPWD');
      if (target === undefined) {
        err(sh, io, 'cd: OLDPWD not set');
        return 1;
      }
      print = true;
    }
    const abs = normalize(target, sh.cwd);
    try {
      const n = sh.vfs.lookup(abs, { cred: sh.cred });
      if (n.type !== 'dir') throw new FsError('ENOTDIR');
      if (!sh.vfs.can(n, sh.cred, 'x')) throw new FsError('EACCES');
    } catch (e) {
      if (e instanceof FsError) {
        err(sh, io, `cd: ${args[0] ?? target}: ${e.message}`);
        return 1;
      }
      throw e;
    }
    sh.setVar('OLDPWD', sh.cwd, { export: true });
    sh.cwd = abs;
    sh.setVar('PWD', abs);
    if (print) io.stdout.write(abs + '\n');
    return 0;
  },

  pwd: async (sh, argv, io) => {
    io.stdout.write((argv.includes('-P') ? sh.vfs.realpathOrSelf(sh.cwd) : sh.cwd) + '\n');
    return 0;
  },

  export: declareBuiltin,
  declare: declareBuiltin,
  typeset: declareBuiltin,
  local: declareBuiltin,
  readonly: declareBuiltin,

  unset: async (sh, argv, io) => {
    let funcs = false;
    let status = 0;
    for (const a of argv.slice(1)) {
      if (a === '-f') {
        funcs = true;
        continue;
      }
      if (a === '-v') continue;
      if (funcs) {
        sh.funcs.delete(a);
        continue;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\[(.*)\]$/.exec(a);
      try {
        if (m) {
          const v = sh.vars.get(m[1]);
          if (v?.kind === 'indexed') v.arr!.delete(Number(sh.arith(m[2])));
          else if (v?.kind === 'assoc') v.map!.delete(m[2]);
          else if (v && (m[2] === '0' || m[2] === '@')) sh.unsetVar(m[1]);
        } else if (!isName(a)) {
          err(sh, io, `unset: \`${a}': not a valid identifier`);
          status = 1;
        } else if (sh.vars.has(a)) sh.unsetVar(a);
        else sh.funcs.delete(a);
      } catch (e) {
        if (e instanceof ExpansionError) {
          err(sh, io, e.message.replace(/^unset: /, 'unset: '));
          status = 1;
        } else throw e;
      }
    }
    return status;
  },

  read: readBuiltin,

  mapfile: async (sh, argv, io) => {
    let strip = false;
    let count = Infinity;
    let skip = 0;
    let name = 'MAPFILE';
    const args = argv.slice(1);
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-t') strip = true;
      else if (a === '-n') count = Number(args[++i]) || Infinity;
      else if (a === '-s') skip = Number(args[++i]) || 0;
      else if (a === '-d' || a === '-u' || a === '-C' || a === '-c' || a === '-O') i++;
      else name = a;
    }
    const lines: string[] = [];
    let n = 0;
    for (;;) {
      const r = await io.stdin.readLine();
      if (!r) break;
      if (n++ < skip) continue;
      lines.push(strip || !r[1] ? r[0] : r[0] + '\n');
      if (lines.length >= count) break;
    }
    sh.assignArray(name, [{ value: lines }], false);
    return 0;
  },

  test: testBuiltin,
  '[': testBuiltin,

  shift: async (sh, argv, io) => {
    const n = argv[1] !== undefined ? Number(argv[1]) : 1;
    if (!Number.isInteger(n) || n < 0) {
      err(sh, io, `shift: ${argv[1]}: numeric argument required`);
      return 1;
    }
    if (n > sh.positional.length) return 1;
    sh.positional = sh.positional.slice(n);
    return 0;
  },

  set: async (sh, argv, io) => {
    const args = argv.slice(1);
    if (!args.length) {
      for (const [k, v] of [...sh.vars.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        io.stdout.write(v.kind === 'scalar' ? `${k}=${shellQuote(v.value)}\n` : declareLine(k, v).replace(/^declare -\S+ /, '') + '\n');
      }
      return 0;
    }
    const optNames: Record<string, keyof Shell['opts']> = {
      e: 'errexit', u: 'nounset', x: 'xtrace', f: 'noglob', C: 'noclobber',
    };
    const longNames: Record<string, keyof Shell['opts']> = {
      errexit: 'errexit', nounset: 'nounset', xtrace: 'xtrace', pipefail: 'pipefail', noglob: 'noglob', noclobber: 'noclobber',
    };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--' || a === '-') {
        sh.positional = args.slice(i + 1);
        return 0;
      }
      if (/^[-+]/.test(a) && a.length > 1) {
        const on = a[0] === '-';
        for (const f of a.slice(1)) {
          if (f === 'o') {
            const name = args[++i];
            if (name === undefined) {
              for (const [ln, key] of Object.entries(longNames)) io.stdout.write(`${ln.padEnd(15)}\t${sh.opts[key] ? 'on' : 'off'}\n`);
              return 0;
            }
            const key = longNames[name];
            if (!key) {
              if (['vi', 'emacs', 'history', 'monitor', 'braceexpand', 'hashall', 'interactive-comments', 'posix'].includes(name)) continue;
              err(sh, io, `set: ${name}: invalid option name`);
              return 2;
            }
            sh.opts[key] = on;
          } else if (optNames[f]) sh.opts[optNames[f]] = on;
          else if ('vhBHmbkntaP'.includes(f)) {
            /* accepted, ignored */
          } else {
            err(sh, io, `set: ${a[0]}${f}: invalid option`);
            return 2;
          }
        }
        continue;
      }
      sh.positional = args.slice(i);
      return 0;
    }
    return 0;
  },

  shopt: async (sh, argv, io) => {
    let mode: 's' | 'u' | 'q' | null = null;
    const names: string[] = [];
    for (const a of argv.slice(1)) {
      if (a === '-s') mode = 's';
      else if (a === '-u') mode = 'u';
      else if (a === '-q') mode = 'q';
      else names.push(a);
    }
    const opts = sh.shopt as Record<string, boolean>;
    if (!names.length) {
      for (const [k, v] of Object.entries(opts)) io.stdout.write(`${k.padEnd(15)}\t${v ? 'on' : 'off'}\n`);
      return 0;
    }
    let st = 0;
    for (const n of names) {
      if (!(n in opts)) {
        err(sh, io, `shopt: ${n}: invalid shell option name`);
        st = 1;
        continue;
      }
      if (mode === 's') opts[n] = true;
      else if (mode === 'u') opts[n] = false;
      else if (mode === 'q') st = opts[n] ? st : 1;
      else io.stdout.write(`${n.padEnd(15)}\t${opts[n] ? 'on' : 'off'}\n`);
    }
    return st;
  },

  source: async (sh, argv, io) => {
    const file = argv[1];
    if (!file) {
      err(sh, io, `${argv[0]}: filename argument required`);
      return 2;
    }
    let path = normalize(file, sh.cwd);
    if (!file.includes('/') && !sh.vfs.exists(path)) path = sh.findInPath(file) ?? path;
    let src: string;
    try {
      src = sh.vfs.readFile(path, sh.cred);
    } catch (e) {
      if (e instanceof FsError) {
        err(sh, io, `${file}: ${e.message}`);
        return 1;
      }
      throw e;
    }
    const savedPos = sh.positional;
    if (argv.length > 2) sh.positional = argv.slice(2);
    sh.sourceDepth++;
    try {
      return await runInCurrent(sh, src, io, sh.scriptName ? file : null);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.status;
      throw e;
    } finally {
      sh.sourceDepth--;
      if (argv.length > 2) sh.positional = savedPos;
    }
  },

  eval: async (sh, argv, io) => {
    const src = argv.slice(1).join(' ');
    if (!src.trim()) return 0;
    return runInCurrent(sh, src, io, null);
  },

  exit: async (sh, argv, io) => {
    if (sh.interactive && !sh.scriptName) io.stderr.write('exit\n');
    let n = sh.lastStatus;
    if (argv[1] !== undefined) {
      if (!/^-?\d+$/.test(argv[1])) {
        err(sh, io, `exit: ${argv[1]}: numeric argument required`);
        n = 2;
      } else n = ((Number(argv[1]) % 256) + 256) % 256;
    }
    throw new ExitSignal(n);
  },
  logout: async (sh, _argv, io) => {
    if (sh.interactive) io.stderr.write('logout\n');
    throw new ExitSignal(sh.lastStatus);
  },

  return: async (sh, argv, io) => {
    if (!sh.inFunction() && sh.sourceDepth === 0) {
      err(sh, io, "return: can only `return' from a function or sourced script");
      return 1;
    }
    let n = sh.lastStatus;
    if (argv[1] !== undefined) {
      if (!/^-?\d+$/.test(argv[1])) {
        err(sh, io, `return: ${argv[1]}: numeric argument required`);
        n = 2;
      } else n = ((Number(argv[1]) % 256) + 256) % 256;
    }
    throw new ReturnSignal(n);
  },

  break: async (sh, argv, io) => {
    if (!sh.inLoop) {
      err(sh, io, "break: only meaningful in a `for', `while', or `until' loop");
      return 0;
    }
    const n = argv[1] ? Number(argv[1]) : 1;
    if (!Number.isInteger(n) || n < 1) {
      err(sh, io, `break: ${argv[1]}: loop count out of range`);
      return 1;
    }
    throw new BreakSignal(Math.min(n, sh.inLoop));
  },

  continue: async (sh, argv, io) => {
    if (!sh.inLoop) {
      err(sh, io, "continue: only meaningful in a `for', `while', or `until' loop");
      return 0;
    }
    const n = argv[1] ? Number(argv[1]) : 1;
    if (!Number.isInteger(n) || n < 1) {
      err(sh, io, `continue: ${argv[1]}: loop count out of range`);
      return 1;
    }
    throw new ContinueSignal(Math.min(n, sh.inLoop));
  },

  alias: async (sh, argv, io) => {
    const args = argv.slice(1).filter((a) => a !== '-p');
    if (!args.length) {
      for (const [k, v] of [...sh.aliases].sort()) io.stdout.write(`alias ${k}='${v.replace(/'/g, "'\\''")}'\n`);
      return 0;
    }
    let st = 0;
    for (const a of args) {
      const i = a.indexOf('=');
      if (i > 0) sh.aliases.set(a.slice(0, i), a.slice(i + 1));
      else if (sh.aliases.has(a)) io.stdout.write(`alias ${a}='${sh.aliases.get(a)}'\n`);
      else {
        err(sh, io, `alias: ${a}: not found`);
        st = 1;
      }
    }
    return st;
  },

  unalias: async (sh, argv, io) => {
    let st = 0;
    for (const a of argv.slice(1)) {
      if (a === '-a') sh.aliases.clear();
      else if (!sh.aliases.delete(a)) {
        err(sh, io, `unalias: ${a}: not found`);
        st = 1;
      }
    }
    return st;
  },

  type: async (sh, argv, io) => {
    let tflag = false;
    let st = 0;
    for (const a of argv.slice(1)) {
      if (a === '-t') {
        tflag = true;
        continue;
      }
      if (a.startsWith('-')) continue;
      const kind = commandKind(sh, a);
      if (!kind) {
        if (!tflag) err(sh, io, `type: ${a}: not found`);
        st = 1;
        continue;
      }
      if (tflag) {
        io.stdout.write(kind.type + '\n');
        continue;
      }
      switch (kind.type) {
        case 'alias':
          io.stdout.write(`${a} is aliased to \`${kind.detail}'\n`);
          break;
        case 'keyword':
          io.stdout.write(`${a} is a shell keyword\n`);
          break;
        case 'function':
          io.stdout.write(`${a} is a function\n`);
          break;
        case 'builtin':
          io.stdout.write(`${a} is a shell builtin\n`);
          break;
        case 'file':
          io.stdout.write(`${a} is ${kind.detail}\n`);
          break;
      }
    }
    return st;
  },

  command: async (sh, argv, io) => {
    let args = argv.slice(1);
    if (args[0] === '-v' || args[0] === '-V') {
      const verbose = args[0] === '-V';
      let st = 0;
      for (const a of args.slice(1)) {
        const k = commandKind(sh, a);
        if (!k) {
          if (verbose) err(sh, io, `command: ${a}: not found`);
          st = 1;
          continue;
        }
        if (verbose) io.stdout.write(`${a} is ${k.type === 'file' ? k.detail : 'a shell ' + k.type}\n`);
        else io.stdout.write((k.type === 'file' ? k.detail : k.type === 'alias' ? `alias ${a}='${k.detail}'` : a) + '\n');
      }
      return st;
    }
    if (args[0] === '-p') args = args.slice(1);
    if (!args.length) return 0;
    const b = BUILTINS[args[0]];
    if (b) return b(sh, args, io, new Map());
    const saved = sh.funcs;
    sh.funcs = new Map();
    try {
      return await sh.invoke(args, io);
    } finally {
      sh.funcs = saved;
    }
  },

  history: async (sh, argv, io) => {
    if (argv[1] === '-c') {
      sh.history.length = 0;
      return 0;
    }
    const n = argv[1] ? Number(argv[1]) : sh.history.length;
    const start = Math.max(0, sh.history.length - n);
    sh.history.slice(start).forEach((h, i) => io.stdout.write(`${String(start + i + 1).padStart(5)}  ${h}\n`));
    return 0;
  },

  let: async (sh, argv, io) => {
    if (argv.length < 2) {
      err(sh, io, 'let: expression expected');
      return 1;
    }
    let v = 0n;
    try {
      for (const a of argv.slice(1)) v = sh.arith(a);
    } catch (e) {
      if (e instanceof ExpansionError) {
        err(sh, io, 'let: ' + e.message);
        return 1;
      }
      throw e;
    }
    return v !== 0n ? 0 : 1;
  },

  getopts: getoptsBuiltin,

  trap: async (sh, argv, io) => {
    const args = argv.slice(1);
    if (!args.length || args[0] === '-p') {
      for (const [sig, action] of Object.entries(sh.traps)) io.stdout.write(`trap -- ${shellQuote(action)} ${sig}\n`);
      return 0;
    }
    if (args[0] === '-l') {
      io.stdout.write(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t15) SIGTERM\n');
      return 0;
    }
    let action: string | null = args[0];
    let sigs = args.slice(1);
    if (/^\d+$/.test(action) && sigs.length === 0) {
      sigs = [action];
      action = null;
    }
    if (action === '-') action = null;
    let st = 0;
    for (const s of sigs) {
      const sig = SIGNALS[s.toUpperCase()];
      if (!sig) {
        err(sh, io, `trap: ${s}: invalid signal specification`);
        st = 1;
        continue;
      }
      if (action === null) delete sh.traps[sig];
      else sh.traps[sig] = action;
    }
    return st;
  },

  wait: async () => 0,
  jobs: async () => 0,
  disown: async () => 0,
  umask: async (_sh, argv, io) => {
    if (argv.length < 2) io.stdout.write('0022\n');
    return 0;
  },

  time: async (sh, argv, io) => {
    const t0 = Date.now();
    const st = argv.length > 1 ? await sh.invoke(argv.slice(1), io) : 0;
    const secs = (Date.now() - t0) / 1000;
    io.stderr.write(`\nreal\t0m${secs.toFixed(3)}s\nuser\t0m${(secs * 0.6).toFixed(3)}s\nsys\t0m0.000s\n`);
    return st;
  },

  sudo: async (sh, argv, io) => {
    const args = argv.slice(1);
    if (!args.length || args[0] === '-h') {
      io.stderr.write('usage: sudo command [args...]\n');
      return 1;
    }
    if (args[0] === '-l') {
      io.stdout.write(`User ${sh.vfs.userName(sh.cred.uid)} may run the following commands on ${sh.hostname}:\n    (ALL : ALL) ALL\n`);
      return 0;
    }
    if (args[0] === '-i' || args[0] === '-s' || args[0] === 'su' || args[0] === 'bash') {
      io.stderr.write('sudo: interactive root shells are disabled in the simulator — prefix each command with sudo instead.\n');
      return 1;
    }
    const saved = sh.cred;
    const savedUser = sh.getVar('USER');
    sh.cred = { ...ROOT };
    sh.vars.set('USER', { kind: 'scalar', value: 'root', exported: true });
    try {
      return await sh.invoke(args, io);
    } finally {
      sh.cred = saved;
      if (savedUser) sh.vars.set('USER', savedUser);
    }
  },

  su: async (_sh, _argv, io) => {
    io.stderr.write('su: switching users is disabled in the simulator — use sudo <command>.\n');
    return 1;
  },

  exec: async (sh, argv, io) => {
    if (argv.length < 2) {
      io.stderr.write(sh.errPrefix() + 'exec: redirecting the whole shell is not available in the simulator\n');
      return 1;
    }
    const st = await sh.invoke(argv.slice(1), io);
    throw new ExitSignal(st);
  },

  bash: async (sh, argv, io) => bashBuiltin(sh, argv, io),
  sh: async (sh, argv, io) => bashBuiltin(sh, argv, io),

  help: async (_sh, _argv, io) => {
    io.stdout.write(
      'Ink & Shell simulator — GNU bash, version 5.2 compatible subset.\n' +
        'Type `man <command>` for the reference page, or open Reference in the app.\n' +
        'Builtins: cd pwd echo printf read test [ export local declare unset set shift source eval\n' +
        '          exit return break continue alias type command history let getopts trap sudo\n',
    );
    return 0;
  },
};
BUILTINS['.'] = BUILTINS.source;
BUILTINS.readarray = BUILTINS.mapfile;

async function bashBuiltin(sh: Shell, argv: string[], io: IOCtx): Promise<number> {
  const args = argv.slice(1);
  let xtrace = false;
  let errexit = false;
  let noexec = false;
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '-c') {
      const src = args[i + 1];
      if (src === undefined) {
        io.stderr.write('bash: -c: option requires an argument\n');
        return 2;
      }
      const c = sh.child(args[i + 2] ?? 'bash', args.slice(i + 3));
      c.scriptName = null;
      c.interactive = false;
      c.opts.xtrace = xtrace;
      c.opts.errexit = errexit;
      try {
        return await c.run(src, io);
      } catch (e) {
        if (e instanceof ExitSignal) return e.status;
        throw e;
      }
    }
    if (/^-[xenuv]+$/.test(a)) {
      if (a.includes('x')) xtrace = true;
      if (a.includes('e')) errexit = true;
      if (a.includes('n')) noexec = true;
      continue;
    }
    if (a === '--') {
      i++;
      break;
    }
    break;
  }
  const file = args[i];
  if (file === undefined) {
    io.stderr.write('bash: you are already in a bash shell here — run a script with `bash script.sh`.\n');
    return 0;
  }
  const abs = normalize(file, sh.cwd);
  let src: string;
  try {
    src = sh.vfs.readFile(abs, sh.cred);
  } catch (e) {
    if (e instanceof FsError) {
      io.stderr.write(`bash: ${file}: ${e.message}\n`);
      return 127;
    }
    throw e;
  }
  if (noexec) {
    try {
      new Parser(src).parseProgram();
      return 0;
    } catch (e) {
      if (e instanceof ShellSyntaxError) {
        io.stderr.write(`${file}: line ${e.line}: ${e.message}\n`);
        return 2;
      }
      if (e instanceof IncompleteInput) {
        io.stderr.write(`${file}: line ${src.split('\n').length}: syntax error: unexpected end of file\n`);
        return 2;
      }
      throw e;
    }
  }
  const c = sh.child(file, args.slice(i + 1));
  c.opts.xtrace = xtrace;
  c.opts.errexit = errexit;
  try {
    return await c.run(src, io);
  } catch (e) {
    if (e instanceof ExitSignal) return e.status;
    throw e;
  }
}

export function commandKind(sh: Shell, name: string): { type: 'alias' | 'keyword' | 'function' | 'builtin' | 'file'; detail?: string } | null {
  if (sh.aliases.has(name)) return { type: 'alias', detail: sh.aliases.get(name) };
  if (KEYWORDS.has(name)) return { type: 'keyword' };
  if (sh.funcs.has(name)) return { type: 'function' };
  if (BUILTINS[name] && !['bash', 'sh', 'sudo', 'su'].includes(name)) return { type: 'builtin' };
  if (name.includes('/')) {
    const n = sh.vfs.tryLookup(normalize(name, sh.cwd));
    return n && n.type === 'file' ? { type: 'file', detail: name } : null;
  }
  if (COMMANDS[name] || ['bash', 'sh', 'sudo', 'su'].includes(name)) {
    const dir = ['sudo', 'su'].includes(name) ? '/usr/bin' : name === 'bash' || name === 'sh' ? '/usr/bin' : '/usr/bin';
    return { type: 'file', detail: `${dir}/${name}` };
  }
  const p = sh.findInPath(name);
  if (p) return { type: 'file', detail: p };
  return null;
}
