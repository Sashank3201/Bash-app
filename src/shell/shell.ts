// The interpreter: variables, expansions, redirections, pipelines, control flow.

import type { Assign, CondExpr, Node, ParamExp, Program, Redir, Word, WordPart } from './ast';
import { ArithError, evalArith, type ArithEnv } from './arith';
import {
  BreakSignal,
  ContinueSignal,
  ExitSignal,
  ExpansionError,
  IncompleteInput,
  InterruptSignal,
  LimitSignal,
  ReturnSignal,
  ShellSyntaxError,
  UnsupportedError,
} from './errors';
import { InBuf, NullWriter, StringWriter, type Writer } from './io';
import { Parser, parse, parseAssignment, parseHeredocBody, parseWordString, wordLiteral } from './parser';
import { bashRegex, escapeGlob, globMatch, globToRegexSource, hasGlob, unescapeGlob } from './pattern';
import { FsError, ROOT, VFS, normalize, type Cred, type Inode } from './vfs';
import { BUILTINS, DECLARATION_BUILTINS } from './builtins';
import { COMMANDS, type CmdCtx } from './commands/registry';

export interface IOCtx {
  stdin: InBuf;
  stdout: Writer;
  stderr: Writer;
}

export interface Var {
  kind: 'scalar' | 'indexed' | 'assoc';
  value: string;
  arr?: Map<number, string>;
  map?: Map<string, string>;
  exported?: boolean;
  readonly?: boolean;
  integer?: boolean;
  lower?: boolean;
  upper?: boolean;
}

export interface HostHooks {
  /** `clear` */
  clear?(): void;
  /** `nano`, `vim`, `edit` — open the in-app editor. */
  openEditor?(absPath: string): Promise<void> | void;
  /** `man` — show the in-app reference. Return true if handled. */
  openManual?(topic: string): boolean;
  /** Terminal width in columns (for ls column layout). */
  cols?(): number;
}

export interface ShellOptions {
  vfs: VFS;
  user?: string;
  cwd?: string;
  hostname?: string;
  env?: Record<string, string>;
  host?: HostHooks;
  interactive?: boolean;
  maxSteps?: number;
  timeLimitMs?: number;
  /** Make `sleep` return immediately (used when grading). */
  fastSleep?: boolean;
}

interface Control {
  steps: number;
  maxSteps: number;
  deadline: number;
  aborted: boolean;
}

interface Seg {
  s: string;
  q: boolean; // quoted (no split, no glob)
  sp: boolean; // result of an unquoted expansion (subject to splitting)
}
type Piece = Seg | 'BREAK';

const DEFAULT_IFS = ' \t\n';
let procSubCounter = 0;

let yieldImpl: () => Promise<void>;
if (typeof MessageChannel !== 'undefined' && typeof window !== 'undefined') {
  const ch = new MessageChannel();
  const queue: (() => void)[] = [];
  ch.port1.onmessage = () => queue.shift()?.();
  yieldImpl = () =>
    new Promise<void>((r) => {
      queue.push(r);
      ch.port2.postMessage(0);
    });
} else if (typeof (globalThis as { setImmediate?: unknown }).setImmediate === 'function') {
  const si = (globalThis as unknown as { setImmediate: (f: () => void) => void }).setImmediate;
  yieldImpl = () => new Promise<void>((r) => si(r));
} else {
  yieldImpl = () => new Promise<void>((r) => setTimeout(r, 0));
}

export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export class Shell {
  vfs: VFS;
  vars = new Map<string, Var>();
  funcs = new Map<string, Node>();
  aliases = new Map<string, string>();
  positional: string[] = [];
  arg0 = 'bash';
  cwd = '/';
  cred: Cred = { uid: 1000, gid: 1000 };
  hostname = 'halden-ws01';
  interactive = false;
  scriptName: string | null = null;
  opts = { errexit: false, nounset: false, pipefail: false, xtrace: false, noglob: false, noclobber: false };
  shopt = { nullglob: false, dotglob: false, nocasematch: false, extglob: false, globstar: false };
  traps: Record<string, string> = {};
  history: string[] = [];
  lastStatus = 0;
  lineno = 0;
  host: HostHooks;
  ctl: Control;
  startTime = Date.now();
  fastSleep = false;

  private lastSubStatus = 0;
  private condDepth = 0;
  private localFrames: Map<string, Var | undefined>[] = [];
  private funcDepth = 0;
  funcNames: string[] = [];
  private curErr: Writer = NullWriter;
  private inTrap = false;
  sourceDepth = 0;

  constructor(o: ShellOptions) {
    this.vfs = o.vfs;
    this.host = o.host ?? {};
    this.interactive = !!o.interactive;
    this.fastSleep = !!o.fastSleep;
    this.hostname = o.hostname ?? (this.vfs.tryRead('/etc/hostname') ?? 'halden-ws01').trim();
    const userName = o.user ?? 'analyst';
    const u = this.vfs.userByName(userName);
    this.cred = u ? { uid: u.uid, gid: u.gid } : userName === 'root' ? { ...ROOT } : { uid: 1000, gid: 1000 };
    const home = u?.home ?? (userName === 'root' ? '/root' : '/home/' + userName);
    this.cwd = o.cwd ?? home;
    if (!this.vfs.exists(this.cwd)) this.cwd = '/';
    this.ctl = { steps: 0, maxSteps: o.maxSteps ?? 400_000, deadline: o.timeLimitMs ? Date.now() + o.timeLimitMs : 0, aborted: false };
    const env: Record<string, string> = {
      HOME: home,
      USER: userName,
      LOGNAME: userName,
      SHELL: '/bin/bash',
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      PWD: this.cwd,
      HOSTNAME: this.hostname,
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
      SHLVL: '1',
      ...o.env,
    };
    for (const [k, v] of Object.entries(env)) this.vars.set(k, { kind: 'scalar', value: v, exported: true });
    this.vars.set('IFS', { kind: 'scalar', value: DEFAULT_IFS });
    this.vars.set('PS1', { kind: 'scalar', value: '\\u@\\h:\\w\\$ ' });
    this.vars.set('BASH_VERSION', { kind: 'scalar', value: '5.2.21(1)-release' });
    this.vars.set('OPTIND', { kind: 'scalar', value: '1' });
    this.vars.set('UID', { kind: 'scalar', value: String(this.cred.uid), readonly: true });
    this.vars.set('EUID', { kind: 'scalar', value: String(this.cred.uid), readonly: true });
  }

  // ================================================================== public API

  /** Parse source. Throws IncompleteInput / ShellSyntaxError. */
  parse(src: string): Program {
    return parse(src, { interactive: this.interactive });
  }

  /** Run a command line / script source in this shell. Never throws (except InterruptSignal is converted). */
  async run(src: string, io: IOCtx): Promise<number> {
    try {
      const p = new Parser(src, 0, 1, { interactive: this.interactive });
      for (;;) {
        let items;
        try {
          items = p.nextLine();
        } catch (e) {
          if (e instanceof ShellSyntaxError) {
            io.stderr.write(this.errPrefix(e.line) + e.message + '\n');
            this.lastStatus = 2;
            if (!this.interactive) await this.runExitTrap(io);
            return 2;
          }
          if (e instanceof IncompleteInput) {
            io.stderr.write(this.errPrefix(p.line) + `syntax error: unexpected end of file\n`);
            this.lastStatus = 2;
            return 2;
          }
          if (e instanceof UnsupportedError) {
            io.stderr.write(this.errPrefix(p.line) + e.message + '\n');
            this.lastStatus = 2;
            return 2;
          }
          throw e;
        }
        if (!items) break;
        for (const item of items) await this.execItem(item.node, io);
      }
      if (!this.interactive) await this.runExitTrap(io);
      return this.lastStatus;
    } catch (e) {
      return this.handleTopLevel(e, io);
    }
  }

  /** Execute an already-parsed program (used by the interactive terminal). */
  async execProgram(prog: Program, io: IOCtx): Promise<number> {
    try {
      await this.execList(prog, io);
      return this.lastStatus;
    } catch (e) {
      return this.handleTopLevel(e, io);
    }
  }

  private async handleTopLevel(e: unknown, io: IOCtx): Promise<number> {
    if (e instanceof ExitSignal) {
      this.lastStatus = e.status;
      await this.runExitTrap(io);
      throw e;
    }
    if (e instanceof InterruptSignal) {
      this.lastStatus = 130;
      if (this.traps.INT && !this.inTrap) await this.runTrap('INT', io);
      return 130;
    }
    if (e instanceof LimitSignal) {
      io.stderr.write(`\n⚠ ${e.message}\n`);
      this.lastStatus = 124;
      return 124;
    }
    if (e instanceof ExpansionError) {
      io.stderr.write(this.errPrefix(this.lineno) + e.message + '\n');
      this.lastStatus = e.status;
      if (!this.interactive) {
        await this.runExitTrap(io);
        throw new ExitSignal(e.status);
      }
      return e.status;
    }
    if (e instanceof BreakSignal || e instanceof ContinueSignal) return this.lastStatus;
    if (e instanceof ReturnSignal) {
      this.lastStatus = e.status;
      return e.status;
    }
    throw e;
  }

  abort() {
    this.ctl.aborted = true;
  }

  resetAbort() {
    this.ctl.aborted = false;
    this.ctl.steps = 0;
  }

  errPrefix(line?: number): string {
    if (this.scriptName) return `${this.scriptName}: line ${line ?? this.lineno}: `;
    return 'bash: ';
  }

  // ================================================================== variables

  getVar(name: string): Var | undefined {
    return this.vars.get(name);
  }

  /** Value used by $name (special parameters handled here). */
  getScalar(name: string): string | undefined {
    switch (name) {
      case '?':
        return String(this.lastStatus);
      case '#':
        return String(this.positional.length);
      case '$':
        return '4242';
      case '!':
        return this.vars.get('!')?.value;
      case '0':
        return this.arg0;
      case '-':
        return (this.opts.errexit ? 'e' : '') + (this.opts.nounset ? 'u' : '') + (this.opts.xtrace ? 'x' : '') + 'hB' + (this.interactive ? 'i' : '');
      case '@':
      case '*':
        return this.positional.join(' ');
      case 'RANDOM':
        return String(Math.floor(Math.random() * 32768));
      case 'SECONDS':
        return String(Math.floor((Date.now() - this.startTime) / 1000));
      case 'EPOCHSECONDS':
        return String(Math.floor(this.vfs.now() / 1000));
      case 'LINENO':
        return String(this.lineno);
      case 'BASHPID':
        return '4242';
      case 'PPID':
        return '4200';
      case 'FUNCNAME':
        return this.funcNames[this.funcNames.length - 1];
    }
    if (/^[0-9]+$/.test(name)) {
      const i = Number(name);
      return i === 0 ? this.arg0 : this.positional[i - 1];
    }
    const v = this.vars.get(name);
    if (!v) return undefined;
    if (v.kind === 'indexed') return v.arr!.get(0);
    if (v.kind === 'assoc') return v.map!.get('0');
    return v.value;
  }

  isSet(name: string): boolean {
    return this.getScalar(name) !== undefined;
  }

  private checkWritable(name: string) {
    const v = this.vars.get(name);
    if (v?.readonly) throw new ExpansionError(`${name}: readonly variable`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ExpansionError(`\`${name}': not a valid identifier`);
  }

  private applyAttrs(v: Var, value: string): string {
    if (v.integer) value = String(this.arith(value));
    if (v.lower) value = value.toLowerCase();
    if (v.upper) value = value.toUpperCase();
    return value;
  }

  setVar(name: string, value: string, opts: { append?: boolean; export?: boolean } = {}) {
    this.checkWritable(name);
    let v = this.vars.get(name);
    if (!v) {
      v = { kind: 'scalar', value: '' };
      this.vars.set(name, v);
    }
    if (v.integer && opts.append) {
      const cur = v.kind === 'indexed' ? v.arr!.get(0) ?? '0' : v.value || '0';
      value = String(this.arith(`${cur}+(${value})`));
    } else {
      if (opts.append) {
        const cur = v.kind === 'indexed' ? v.arr!.get(0) ?? '' : v.kind === 'assoc' ? v.map!.get('0') ?? '' : v.value;
        value = cur + value;
      }
      value = this.applyAttrs(v, value);
    }
    if (v.kind === 'indexed') v.arr!.set(0, value);
    else if (v.kind === 'assoc') v.map!.set('0', value);
    else v.value = value;
    if (opts.export) v.exported = true;
    if (name === 'PWD') this.cwd = value;
  }

  /** Assign an element: arrays (indexed → arithmetic index, assoc → string key). */
  setElem(name: string, key: string, value: string, append = false) {
    this.checkWritable(name);
    let v = this.vars.get(name);
    if (!v) {
      v = { kind: 'indexed', value: '', arr: new Map() };
      this.vars.set(name, v);
    }
    if (v.kind === 'scalar') {
      const old = v.value;
      v.kind = 'indexed';
      v.arr = new Map([[0, old]]);
      if (old === '' && !this.isSetRaw(v)) v.arr.clear();
    }
    if (v.kind === 'assoc') {
      const cur = v.map!.get(key) ?? '';
      v.map!.set(key, this.applyAttrs(v, append ? cur + value : value));
    } else {
      let i = Number(this.arith(key));
      if (i < 0) {
        const max = v.arr!.size ? Math.max(...v.arr!.keys()) : -1;
        i = max + 1 + i;
        if (i < 0) throw new ExpansionError(`${name}[${key}]: bad array subscript`);
      }
      const cur = v.arr!.get(i) ?? '';
      if (v.integer && append) v.arr!.set(i, String(this.arith(`${cur || 0}+(${value})`)));
      else v.arr!.set(i, this.applyAttrs(v, append ? cur + value : value));
    }
  }

  private isSetRaw(_v: Var): boolean {
    return true;
  }

  unsetVar(name: string) {
    const v = this.vars.get(name);
    if (v?.readonly) throw new ExpansionError(`unset: ${name}: cannot unset: readonly variable`);
    this.vars.delete(name);
  }

  arrayValues(name: string): string[] {
    if (name === '@' || name === '*') return [...this.positional];
    const v = this.vars.get(name);
    if (!v) return [];
    if (v.kind === 'scalar') return [v.value];
    if (v.kind === 'indexed') return [...v.arr!.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    return [...v.map!.values()];
  }

  arrayKeys(name: string): string[] {
    const v = this.vars.get(name);
    if (!v) return [];
    if (v.kind === 'scalar') return ['0'];
    if (v.kind === 'indexed') return [...v.arr!.keys()].sort((a, b) => a - b).map(String);
    return [...v.map!.keys()];
  }

  /** Look up name[key] where key is the (already expanded) subscript. */
  getElem(name: string, key: string): string | undefined {
    const v = this.vars.get(name);
    if (!v) return undefined;
    if (v.kind === 'assoc') return v.map!.get(key);
    let i = Number(this.arith(key));
    if (v.kind === 'scalar') return i === 0 ? v.value : undefined;
    if (i < 0) {
      const max = v.arr!.size ? Math.max(...v.arr!.keys()) : -1;
      i = max + 1 + i;
    }
    return v.arr!.get(i);
  }

  /** Local variable support (dynamic scoping like bash). */
  declareLocal(name: string) {
    const frame = this.localFrames[this.localFrames.length - 1];
    if (!frame) throw new ExpansionError('local: can only be used in a function');
    if (!frame.has(name)) {
      const cur = this.vars.get(name);
      frame.set(name, cur ? cloneVar(cur) : undefined);
    }
    this.vars.delete(name);
  }

  inFunction(): boolean {
    return this.localFrames.length > 0;
  }

  exportedEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of this.vars) if (v.exported) env[k] = v.kind === 'scalar' ? v.value : v.arr?.get(0) ?? '';
    return env;
  }

  arithEnv(): ArithEnv {
    return {
      get: (name, index) => {
        if (index === undefined) {
          if (this.opts.nounset && !this.isSet(name)) throw new ExpansionError(`${name}: unbound variable`, 1, true);
          return this.getScalar(name);
        }
        return this.getElem(name, this.vars.get(name)?.kind === 'assoc' ? index : index);
      },
      set: (name, value, index) => {
        if (index === undefined) this.setVar(name, value.toString());
        else this.setElem(name, index, value.toString());
      },
    };
  }

  arith(expr: string): bigint {
    try {
      return evalArith(expr, this.arithEnv());
    } catch (e) {
      if (e instanceof ArithError) throw new ExpansionError(`${expr.trim()}: ${e.message}`);
      throw e;
    }
  }

  // ================================================================== expansion

  private ifs(): string {
    const v = this.vars.get('IFS');
    return v ? v.value : DEFAULT_IFS;
  }

  /** Full expansion of a word into fields (brace, tilde, params, cmd/arith subst, splitting, globbing). */
  async expandFields(w: Word): Promise<string[]> {
    const out: string[] = [];
    for (const bw of braceExpand(w)) {
      const pieces = await this.expandParts(this.tilde(bw.parts), false);
      for (const f of this.split(pieces)) {
        if (!this.opts.noglob && hasGlob(f.pattern)) {
          const matches = this.glob(f.pattern);
          if (matches.length) out.push(...matches);
          else if (!this.shopt.nullglob) out.push(f.text);
        } else out.push(f.text);
      }
    }
    return out;
  }

  /** Expansion without splitting or globbing (assignments, [[ ]], case word, here-strings). */
  async expandString(w: Word): Promise<string> {
    const pieces = await this.expandParts(this.tilde(w.parts), true, true);
    return pieces.map((p) => (p === 'BREAK' ? ' ' : p.s)).join('');
  }

  /** Expansion as a glob pattern (quoted characters are escaped). */
  async expandPattern(w: Word): Promise<string> {
    const pieces = await this.expandParts(this.tilde(w.parts), false, true);
    return pieces.map((p) => (p === 'BREAK' ? ' ' : p.q ? escapeGlob(p.s) : p.s)).join('');
  }

  /** Expansion for [[ =~ ]]: quoted parts are literal, unquoted parts are regex syntax. */
  async expandRegex(w: Word): Promise<string> {
    const pieces = await this.expandParts(w.parts, false, true);
    return pieces.map((p) => (p === 'BREAK' ? ' ' : p.q ? p.s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&') : p.s)).join('');
  }

  private tilde(parts: WordPart[]): WordPart[] {
    const first = parts[0];
    if (!first || first.t !== 'lit' || !first.v.startsWith('~')) return parts;
    const m = /^~([A-Za-z0-9_.-]*)(\/|$)/.exec(first.v);
    if (!m) return parts;
    let home: string | undefined;
    if (m[1] === '') home = this.getScalar('HOME') ?? '/';
    else if (m[1] === '+') home = this.cwd;
    else home = this.vfs.userByName(m[1])?.home;
    if (home === undefined) return parts;
    const rest = first.v.slice(1 + m[1].length);
    const np: WordPart[] = [{ t: 'q', v: home }];
    if (rest) np.push({ t: 'lit', v: rest });
    return [...np, ...parts.slice(1)];
  }

  private async expandParts(parts: WordPart[], inDq: boolean, noSplit = false): Promise<Piece[]> {
    const out: Piece[] = [];
    for (const p of parts) {
      switch (p.t) {
        case 'lit':
          out.push({ s: p.v, q: inDq, sp: false });
          break;
        case 'q':
          out.push({ s: p.v, q: true, sp: false });
          break;
        case 'dq': {
          if (p.parts.length === 0) {
            out.push({ s: '', q: true, sp: false });
            break;
          }
          const inner = await this.expandParts(p.parts, true, noSplit);
          out.push(...inner);
          break;
        }
        case 'param': {
          const r = await this.expandParam(p.p, inDq);
          if (r.multi) {
            if (inDq && r.at) {
              r.list.forEach((s, i) => {
                if (i) out.push('BREAK');
                out.push({ s, q: true, sp: false });
              });
            } else if (inDq) {
              const sep = this.vars.has('IFS') ? this.ifs().slice(0, 1) : ' ';
              out.push({ s: r.list.join(sep), q: true, sp: false });
            } else {
              r.list.forEach((s, i) => {
                if (i) out.push('BREAK');
                out.push({ s, q: false, sp: !noSplit });
              });
            }
          } else {
            out.push({ s: r.list[0] ?? '', q: inDq, sp: !inDq && !noSplit });
          }
          break;
        }
        case 'cmd': {
          const s = await this.commandSubst(p.body);
          out.push({ s, q: inDq, sp: !inDq && !noSplit });
          break;
        }
        case 'procsub': {
          out.push({ s: await this.processSubst(p.body), q: true, sp: false });
          break;
        }
        case 'arith': {
          const exprText = await this.expandString(parseWordString(p.expr));
          let v: bigint;
          try {
            v = this.arith(exprText);
          } catch (e) {
            // like bash, a bad $(( )) aborts a non-interactive shell
            if (e instanceof ExpansionError) throw new ExpansionError(e.message, 1, true);
            throw e;
          }
          out.push({ s: v.toString(), q: inDq, sp: !inDq && !noSplit });
          break;
        }
      }
    }
    return out;
  }

  private split(pieces: Piece[]): { text: string; pattern: string }[] {
    const ifs = this.ifs();
    const fields: { text: string; pattern: string }[] = [];
    const st = { text: '', pattern: '', open: false, touched: false, afterWs: false };
    const push = () => {
      fields.push({ text: st.text, pattern: st.pattern });
      st.text = '';
      st.pattern = '';
      st.open = false;
      st.touched = false;
    };
    for (const piece of pieces) {
      if (piece === 'BREAK') {
        if (st.open && st.touched) push();
        st.open = false;
        st.text = '';
        st.pattern = '';
        st.touched = false;
        st.afterWs = false;
        continue;
      }
      if (!piece.sp) {
        st.open = true;
        st.text += piece.s;
        st.pattern += piece.q ? escapeGlob(piece.s) : piece.s;
        if (piece.q || piece.s) st.touched = true;
        st.afterWs = false;
        continue;
      }
      for (const ch of piece.s) {
        if (ifs.includes(ch)) {
          if (ch === ' ' || ch === '\t' || ch === '\n') {
            if (st.open && st.touched) {
              push();
              st.afterWs = true;
            }
          } else {
            if (st.afterWs && !st.open) {
              st.afterWs = false;
              continue;
            }
            push();
            st.afterWs = false;
          }
        } else {
          st.open = true;
          st.text += ch;
          st.pattern += ch;
          st.touched = true;
          st.afterWs = false;
        }
      }
    }
    if (st.open && st.touched) push();
    return fields;
  }

  /** Pathname expansion against the virtual filesystem. */
  glob(pattern: string): string[] {
    const absolute = pattern.startsWith('/');
    const dirsOnly = pattern.endsWith('/') && pattern.length > 1;
    const comps = pattern.split('/').filter((c, i) => c !== '' || i === 0);
    let results: string[] = [absolute ? '/' : ''];
    const start = absolute ? 1 : 0;
    for (let i = start; i < comps.length; i++) {
      const comp = comps[i];
      const last = i === comps.length - 1;
      const next: string[] = [];
      for (const base of results) {
        const dirPath = base === '' ? this.cwd : base;
        if (!hasGlob(comp)) {
          const lit = unescapeGlob(comp);
          const cand = base === '' ? lit : base === '/' ? '/' + lit : base + '/' + lit;
          if (comp === '.' || comp === '..' || this.vfs.tryLookup(normalize(cand, this.cwd), true)) next.push(cand);
          continue;
        }
        let names: string[];
        try {
          const n = this.vfs.lookup(normalize(dirPath, this.cwd), { cred: this.cred });
          if (n.type !== 'dir' || !this.vfs.can(n, this.cred, 'r')) continue;
          names = [...n.children!.keys()];
        } catch {
          continue;
        }
        const re = new RegExp('^' + globToRegexSource(comp, true) + '$', this.shopt.nocasematch ? 'i' : '');
        const dotOk = comp.startsWith('.') || comp.startsWith('\\.') || this.shopt.dotglob;
        for (const name of names) {
          if (name.startsWith('.') && !dotOk) continue;
          if (!re.test(name)) continue;
          const cand = base === '' ? name : base === '/' ? '/' + name : base + '/' + name;
          if (!last || dirsOnly) {
            const n = this.vfs.tryLookup(normalize(cand, this.cwd));
            if (!n || n.type !== 'dir') continue;
          }
          next.push(cand);
        }
      }
      results = next;
      if (!results.length) break;
    }
    if (dirsOnly) results = results.map((r) => r + '/');
    return results.filter((r) => r !== '' && r !== '/').sort(cmpC);
  }

  private async expandParam(p: ParamExp, inDq: boolean): Promise<{ list: string[]; multi: boolean; at: boolean }> {
    const name = p.name;
    const idx = p.index;
    const isAll = idx === '@' || idx === '*';
    // ${!name} indirection / ${!arr[@]} keys
    if (p.indirect) {
      if (isAll) return { list: this.arrayKeys(name), multi: true, at: idx === '@' };
      const target = this.getScalar(name);
      if (target === undefined || target === '') {
        if (this.opts.nounset) throw new ExpansionError(`${name}: invalid indirect expansion`);
        return { list: [''], multi: false, at: false };
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(.*)\])?$/.exec(target);
      if (!m && !/^[0-9]+$/.test(target)) throw new ExpansionError(`${target}: invalid variable name`);
      const v = m && m[2] !== undefined ? this.getElem(m[1], await this.subscript(m[1], m[2])) : this.getScalar(target);
      return { list: [v ?? ''], multi: false, at: false };
    }
    if (p.length) {
      if (isAll) return { list: [String(this.arrayValues(name).length)], multi: false, at: false };
      if (name === '@' || name === '*' || name === '#') return { list: [String(this.positional.length)], multi: false, at: false };
      const v = idx !== undefined ? this.getElem(name, await this.subscript(name, idx)) : this.getScalar(name);
      if (v === undefined && this.opts.nounset) throw new ExpansionError(`${name}: unbound variable`, 1, true);
      return { list: [String([...(v ?? '')].length)], multi: false, at: false };
    }

    let multi = false;
    let at = false;
    let vals: string[] = [];
    let isSet: boolean;
    if (name === '@' || name === '*') {
      multi = true;
      at = name === '@';
      vals = [...this.positional];
      isSet = vals.length > 0;
    } else if (isAll) {
      multi = true;
      at = idx === '@';
      vals = this.arrayValues(name);
      isSet = vals.length > 0;
    } else {
      const v = idx !== undefined ? this.getElem(name, await this.subscript(name, idx)) : this.getScalar(name);
      isSet = v !== undefined;
      vals = [v ?? ''];
    }
    const op = p.op;
    const isNull = !isSet || (multi ? vals.length === 0 || (vals.length === 1 && vals[0] === '') : vals[0] === '');
    const display = idx !== undefined ? `${name}[${idx}]` : name;

    if (!op || op.startsWith('#') || op.startsWith('%') || op.startsWith('/') || op.startsWith('^') || op.startsWith(',') || op === ':') {
      if (!isSet && this.opts.nounset && !multi) throw new ExpansionError(`${display}: unbound variable`, 1, true);
    }

    const argStr = async () => (p.arg ? (inDq ? this.expandString(p.arg) : this.expandString(p.arg)) : '');
    switch (op) {
      case undefined:
        break;
      case ':-':
      case '-':
        if (op === ':-' ? isNull : !isSet) return { list: [await argStr()], multi: false, at: false };
        break;
      case ':=':
      case '=':
        if (op === ':=' ? isNull : !isSet) {
          if (multi || /^[0-9]/.test(name)) throw new ExpansionError(`$${name}: cannot assign in this way`);
          const v = await argStr();
          if (idx !== undefined) this.setElem(name, await this.subscript(name, idx), v);
          else this.setVar(name, v);
          return { list: [v], multi: false, at: false };
        }
        break;
      case ':+':
      case '+':
        if (op === ':+' ? isNull : !isSet) return { list: [''], multi: false, at: false };
        return { list: [await argStr()], multi: false, at: false };
      case ':?':
      case '?':
        if (op === ':?' ? isNull : !isSet) {
          const msg = (await argStr()) || (op === ':?' ? 'parameter null or not set' : 'parameter not set');
          throw new ExpansionError(`${display}: ${msg}`, 1, true);
        }
        break;
      case '#':
      case '##':
      case '%':
      case '%%': {
        const pat = p.arg ? await this.expandPattern(p.arg) : '';
        vals = vals.map((v) => trimPattern(v, pat, op));
        break;
      }
      case '/':
      case '//':
      case '/#':
      case '/%': {
        const pat = p.arg ? await this.expandPattern(p.arg) : '';
        const rep = p.arg2 ? await this.expandString(p.arg2) : '';
        vals = vals.map((v) => replacePattern(v, pat, rep, op));
        break;
      }
      case '^':
      case '^^':
        vals = vals.map((v) => (op === '^' ? v.charAt(0).toUpperCase() + v.slice(1) : v.toUpperCase()));
        break;
      case ',':
      case ',,':
        vals = vals.map((v) => (op === ',' ? v.charAt(0).toLowerCase() + v.slice(1) : v.toLowerCase()));
        break;
      case ':': {
        const offStr = p.arg ? await this.expandString(p.arg) : '0';
        let off = Number(this.arith(offStr || '0'));
        const lenStr = p.arg2 ? await this.expandString(p.arg2) : undefined;
        let len = lenStr !== undefined ? Number(this.arith(lenStr || '0')) : undefined;
        if (multi) {
          let arr = vals;
          if (name === '@' || name === '*') arr = [this.arg0, ...vals];
          if (off < 0) off = Math.max(0, arr.length + off);
          if (len !== undefined && len < 0) throw new ExpansionError(`${len}: substring expression < 0`);
          vals = arr.slice(off, len === undefined ? undefined : off + len);
        } else {
          const chars = [...vals[0]];
          if (off < 0) off = Math.max(0, chars.length + off);
          if (off > chars.length) {
            vals = [''];
          } else {
            if (len !== undefined && len < 0) {
              len = chars.length + len - off;
              if (len < 0) throw new ExpansionError(`${lenStr}: substring expression < 0`);
            }
            vals = [chars.slice(off, len === undefined ? undefined : off + len).join('')];
          }
        }
        break;
      }
    }
    return { list: vals, multi, at };
  }

  /** Expand an array subscript: arithmetic for indexed arrays, string for associative ones. */
  async subscript(_name: string, raw: string): Promise<string> {
    const s = await this.expandString(parseWordString(raw));
    return s;
  }

  private async commandSubst(body: Program): Promise<string> {
    const child = this.subshell();
    const out = new StringWriter();
    let status = 0;
    try {
      status = await child.execProgramInner(body, { stdin: InBuf.empty(), stdout: out, stderr: this.curErr });
    } catch (e) {
      if (e instanceof ExitSignal) status = e.status;
      else if (e instanceof ExpansionError) {
        this.curErr.write(this.errPrefix() + e.message + '\n');
        status = e.status;
      } else throw e;
    }
    this.lastSubStatus = status;
    return out.buf.replace(/\n+$/, '');
  }

  /** <(cmd): run it now and hand back a /dev/fd/N path holding its output. */
  private async processSubst(body: Program): Promise<string> {
    const out = new StringWriter();
    const child = this.subshell();
    try {
      await child.execProgramInner(body, { stdin: InBuf.empty(), stdout: out, stderr: this.curErr });
    } catch (e) {
      if (!(e instanceof ExitSignal)) throw e;
    }
    const n = 63 - (procSubCounter++ % 14);
    if (!this.vfs.exists('/dev/fd')) this.vfs.mkdir('/dev/fd', { parents: true });
    const path = `/dev/fd/${n}`;
    this.vfs.writeFile(path, out.buf, { mode: 0o666 });
    return path;
  }

  async execProgramInner(prog: Program, io: IOCtx): Promise<number> {
    try {
      await this.execList(prog, io);
    } catch (e) {
      if (e instanceof ExitSignal) {
        await this.runExitTrap(io);
        return e.status;
      }
      throw e;
    }
    return this.lastStatus;
  }

  // ================================================================== subshells & children

  subshell(): Shell {
    const s = Object.create(Shell.prototype) as Shell;
    Object.assign(s, this);
    s.vars = new Map();
    for (const [k, v] of this.vars) s.vars.set(k, cloneVar(v));
    s.funcs = new Map(this.funcs);
    s.aliases = new Map(this.aliases);
    s.positional = [...this.positional];
    s.opts = { ...this.opts };
    s.shopt = { ...this.shopt };
    s.traps = {};
    s.localFrames = this.localFrames.map((f) => new Map(f));
    s.funcNames = [...this.funcNames];
    s.cred = { ...this.cred };
    s.history = this.history;
    return s;
  }

  /** A new bash process for running a script: only exported variables are inherited. */
  child(scriptName: string, args: string[]): Shell {
    const s = Object.create(Shell.prototype) as Shell;
    Object.assign(s, this);
    s.vars = new Map();
    for (const [k, v] of this.vars) {
      if (v.exported || k === 'IFS' || k === 'PS1' || k === 'BASH_VERSION' || k === 'UID' || k === 'EUID') s.vars.set(k, cloneVar(v));
    }
    s.vars.set('OPTIND', { kind: 'scalar', value: '1' });
    s.funcs = new Map();
    s.aliases = new Map();
    s.positional = [...args];
    s.arg0 = scriptName;
    s.scriptName = scriptName;
    s.interactive = false;
    s.opts = { errexit: false, nounset: false, pipefail: false, xtrace: false, noglob: false, noclobber: false };
    s.shopt = { ...this.shopt, nullglob: false };
    s.traps = {};
    s.localFrames = [];
    s.funcNames = [];
    s.funcDepth = 0;
    s.condDepth = 0;
    s.cred = { ...this.cred };
    s.history = [];
    s.lastStatus = 0;
    s.startTime = Date.now();
    return s;
  }

  async runScriptSource(name: string, src: string, args: string[], io: IOCtx): Promise<number> {
    const c = this.child(name, args);
    try {
      return await c.run(src, io);
    } catch (e) {
      if (e instanceof ExitSignal) return e.status;
      throw e;
    }
  }

  // ================================================================== execution

  private async tick() {
    const c = this.ctl;
    c.steps++;
    if (c.aborted) throw new InterruptSignal();
    if (c.steps > c.maxSteps) {
      throw new LimitSignal(
        `Stopped after ${c.maxSteps.toLocaleString('en-US')} steps — this looks like an infinite loop. Check your loop condition.`,
      );
    }
    if ((c.steps & 255) === 0) {
      await yieldImpl();
      if (c.aborted) throw new InterruptSignal();
      if (c.deadline && Date.now() > c.deadline) throw new LimitSignal('Stopped: the script took too long to run.');
    }
  }

  async sleep(ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.ctl.aborted) throw new InterruptSignal();
      await new Promise((r) => setTimeout(r, Math.min(50, end - Date.now())));
    }
    if (this.ctl.aborted) throw new InterruptSignal();
  }

  private async execList(list: Program | Node, io: IOCtx): Promise<number> {
    if (list.type !== 'list') return this.exec(list, io);
    let status = 0;
    for (const item of list.items) status = await this.execItem(item.node, io);
    return status;
  }

  private async execItem(node: Node, io: IOCtx): Promise<number> {
    const { status, eligible } = await this.execTracked(node, io);
    this.lastStatus = status;
    if (eligible && status !== 0 && this.condDepth === 0) {
      if (this.traps.ERR && !this.inTrap) await this.runTrap('ERR', io);
      if (this.opts.errexit) throw new ExitSignal(status);
    }
    return status;
  }

  /** Runs a node and reports whether a failure should trigger `set -e` / ERR. */
  private async execTracked(node: Node, io: IOCtx): Promise<{ status: number; eligible: boolean }> {
    if (node.type === 'andor') {
      let status: number;
      this.condDepth++;
      try {
        status = await this.exec(node.first, io);
      } finally {
        this.condDepth--;
      }
      this.lastStatus = status;
      let ranLast = node.rest.length === 0;
      for (let i = 0; i < node.rest.length; i++) {
        const { op, node: n } = node.rest[i];
        if ((op === '&&' && status === 0) || (op === '||' && status !== 0)) {
          const isLast = i === node.rest.length - 1;
          if (!isLast) this.condDepth++;
          try {
            status = await this.exec(n, io);
          } finally {
            if (!isLast) this.condDepth--;
          }
          this.lastStatus = status;
          ranLast = isLast;
        } else {
          ranLast = false;
        }
      }
      return { status, eligible: ranLast };
    }
    if (node.type === 'pipeline' && node.negate) {
      return { status: await this.exec(node, io), eligible: false };
    }
    return { status: await this.exec(node, io), eligible: true };
  }

  async exec(node: Node, io: IOCtx): Promise<number> {
    let status: number;
    if (node.type !== 'list') this.lineno = node.line;
    switch (node.type) {
      case 'simple':
        status = await this.execSimple(node, io);
        break;
      case 'list':
        status = await this.execList(node, io);
        break;
      case 'andor': {
        status = await this.execItem(node, io);
        break;
      }
      case 'pipeline':
        status = await this.execPipeline(node, io);
        break;
      case 'func':
        this.funcs.set(node.name, node.body);
        status = 0;
        break;
      default:
        status = await this.withRedirs(node.redirs, io, (rio) => this.execCompound(node, rio));
    }
    this.lastStatus = status;
    return status;
  }

  private async withRedirs(redirs: Redir[], io: IOCtx, fn: (io: IOCtx) => Promise<number>): Promise<number> {
    if (!redirs.length) return fn(io);
    const r = await this.applyRedirs(redirs, io);
    if (!r) return 1;
    try {
      return await fn(r.io);
    } finally {
      r.finish();
    }
  }

  private async cond<T>(fn: () => Promise<T>): Promise<T> {
    this.condDepth++;
    try {
      return await fn();
    } finally {
      this.condDepth--;
    }
  }

  private async loopBody(body: Node, io: IOCtx): Promise<'break' | 'continue' | number> {
    try {
      return await this.execList(body, io);
    } catch (e) {
      if (e instanceof BreakSignal) {
        if (e.levels > 1) throw new BreakSignal(e.levels - 1);
        return 'break';
      }
      if (e instanceof ContinueSignal) {
        if (e.levels > 1) throw new ContinueSignal(e.levels - 1);
        return 'continue';
      }
      throw e;
    }
  }

  private loopDepth = 0;

  private async execCompound(node: Node, io: IOCtx): Promise<number> {
    switch (node.type) {
      case 'if': {
        for (const c of node.clauses) {
          const s = await this.cond(() => this.execList(c.cond, io));
          if (s === 0) return this.execList(c.body, io);
        }
        if (node.else) return this.execList(node.else, io);
        return 0;
      }
      case 'for': {
        const words = node.words ? (await Promise.all(node.words.map((w) => this.expandFields(w)))).flat() : [...this.positional];
        let status = 0;
        this.loopDepth++;
        try {
          for (const w of words) {
            await this.tick();
            this.setVar(node.name, w);
            const r = await this.loopBody(node.body, io);
            if (r === 'break') break;
            if (r !== 'continue') status = r;
            else status = 0;
          }
        } finally {
          this.loopDepth--;
        }
        return status;
      }
      case 'cfor': {
        const ex = async (s: string) => this.arith(await this.expandString(parseWordString(s)));
        let status = 0;
        if (node.init.trim()) await ex(node.init);
        this.loopDepth++;
        try {
          for (;;) {
            await this.tick();
            if (node.cond.trim() && (await ex(node.cond)) === 0n) break;
            const r = await this.loopBody(node.body, io);
            if (r === 'break') break;
            if (r !== 'continue') status = r;
            if (node.step.trim()) await ex(node.step);
          }
        } finally {
          this.loopDepth--;
        }
        return status;
      }
      case 'while': {
        let status = 0;
        this.loopDepth++;
        try {
          for (;;) {
            await this.tick();
            const c = await this.cond(() => this.execList(node.cond, io));
            if (node.until ? c === 0 : c !== 0) break;
            const r = await this.loopBody(node.body, io);
            if (r === 'break') break;
            if (r !== 'continue') status = r;
          }
        } finally {
          this.loopDepth--;
        }
        return status;
      }
      case 'case': {
        const word = await this.expandString(node.word);
        let fall = false;
        for (let i = 0; i < node.items.length; i++) {
          const item = node.items[i];
          let matched = fall;
          if (!matched) {
            for (const pw of item.patterns) {
              const pat = await this.expandPattern(pw);
              if (globMatch(pat, word, { nocase: this.shopt.nocasematch })) {
                matched = true;
                break;
              }
            }
          }
          if (!matched) continue;
          const status = item.body ? await this.execList(item.body, io) : 0;
          if (item.term === ';&') {
            fall = true;
            continue;
          }
          fall = false;
          if (item.term === ';;&') continue;
          return status;
        }
        return 0;
      }
      case 'group':
        return this.execList(node.body, io);
      case 'subshell': {
        const s = this.subshell();
        return s.execProgramInner(node.body as Program, io);
      }
      case 'cond': {
        this.lineno = node.line;
        await this.tick();
        try {
          const ok = await this.evalCond(node.expr);
          if (this.opts.xtrace) io.stderr.write(`+ [[ ... ]]\n`);
          return ok ? 0 : 1;
        } catch (e) {
          if (e instanceof ExpansionError && !e.fatal) {
            io.stderr.write(this.errPrefix() + e.message + '\n');
            return 2;
          }
          throw e;
        }
      }
      case 'arith': {
        this.lineno = node.line;
        await this.tick();
        try {
          const text = await this.expandString(parseWordString(node.expr));
          if (this.opts.xtrace) io.stderr.write(`+ (( ${text.trim()} ))\n`);
          return this.arith(text) !== 0n ? 0 : 1;
        } catch (e) {
          if (e instanceof ExpansionError && !e.fatal) {
            io.stderr.write(this.errPrefix() + e.message + '\n');
            return 1;
          }
          throw e;
        }
      }
    }
    return 0;
  }

  private async execPipeline(node: Node & { type: 'pipeline' }, io: IOCtx): Promise<number> {
    let status: number;
    if (node.cmds.length === 1) {
      status = await this.exec(node.cmds[0], io);
    } else {
      let input = io.stdin;
      const statuses: number[] = [];
      for (let i = 0; i < node.cmds.length; i++) {
        const last = i === node.cmds.length - 1;
        const out = last ? io.stdout : new StringWriter();
        const sub = this.subshell();
        let st: number;
        try {
          st = await sub.exec(node.cmds[i], { stdin: input, stdout: out, stderr: io.stderr });
        } catch (e) {
          if (e instanceof ExitSignal) st = e.status;
          else if (e instanceof ExpansionError) {
            io.stderr.write(this.errPrefix() + e.message + '\n');
            st = e.status;
          } else throw e;
        }
        statuses.push(st);
        if (!last) input = new InBuf((out as StringWriter).buf);
      }
      status = statuses[statuses.length - 1];
      if (this.opts.pipefail) {
        for (let i = statuses.length - 1; i >= 0; i--) {
          if (statuses[i] !== 0) {
            status = statuses[i];
            break;
          }
        }
      }
    }
    if (node.negate) status = status === 0 ? 1 : 0;
    return status;
  }

  private async execSimple(node: Node & { type: 'simple' }, io: IOCtx): Promise<number> {
    await this.tick();
    this.lineno = node.line;
    this.curErr = io.stderr;
    this.lastSubStatus = 0;
    let argv: string[] = [];
    const arrayWords = new Map<string, Assign>();
    const isDecl = node.words.length > 0 && DECLARATION_BUILTINS.has(wordLiteral(node.words[0]) ?? '');
    try {
      for (const w of node.words) {
        const da = isDecl && w !== node.words[0] ? parseAssignment(w) : null;
        if (w.arrayAssign) {
          argv.push(w.arrayAssign.name + (w.arrayAssign.append ? '+=' : '=') + '(...)');
          arrayWords.set(w.arrayAssign.name, w.arrayAssign);
        } else if (da) {
          // declaration builtins don't split/glob their assignment arguments
          const v = da.value ? await this.expandString(da.value) : '';
          argv.push(`${da.name}${da.index !== undefined ? `[${da.index}]` : ''}${da.append ? '+=' : '='}${v}`);
        } else {
          argv.push(...(await this.expandFields(w)));
        }
      }
    } catch (e) {
      if (e instanceof ExpansionError && !e.fatal) {
        io.stderr.write(this.errPrefix() + e.message + '\n');
        return 1;
      }
      throw e;
    }

    // aliases (interactive only, like bash)
    if (this.interactive && argv.length && node.words.length) {
      const lit = wordLiteral(node.words[0]);
      const al = lit !== null ? this.aliases.get(lit) : undefined;
      if (al !== undefined && lit === argv[0]) {
        const expanded = (await Promise.all(splitAliasWords(al).map((s) => this.expandFields(parseWordString(s))))).flat();
        argv = [...expanded, ...argv.slice(1)];
      }
    }

    if (!argv.length) {
      try {
        for (const a of node.assigns) await this.assign(a);
      } catch (e) {
        if (e instanceof ExpansionError && !e.fatal) {
          io.stderr.write(this.errPrefix() + e.message + '\n');
          return 1;
        }
        throw e;
      }
      if (this.opts.xtrace && node.assigns.length) {
        for (const a of node.assigns) io.stderr.write(`+ ${a.name}=${a.array ? '(...)' : this.getScalar(a.name) ?? ''}\n`);
      }
      if (node.redirs.length) {
        const r = await this.applyRedirs(node.redirs, io);
        if (!r) return 1;
        r.finish();
      }
      return this.lastSubStatus;
    }

    if (this.opts.xtrace) io.stderr.write('+ ' + argv.map(xtraceQuote).join(' ') + '\n');

    const r = await this.applyRedirs(node.redirs, io);
    if (!r) return 1;
    // temporary assignments for the duration of this command
    const saved: [string, Var | undefined][] = [];
    try {
      for (const a of node.assigns) {
        saved.push([a.name, this.vars.get(a.name) ? cloneVar(this.vars.get(a.name)!) : undefined]);
        await this.assign(a);
        const v = this.vars.get(a.name);
        if (v) v.exported = true;
      }
      return await this.invoke(argv, r.io, arrayWords);
    } catch (e) {
      if (e instanceof ExpansionError && !e.fatal) {
        r.io.stderr.write(this.errPrefix() + e.message + '\n');
        return 1;
      }
      throw e;
    } finally {
      r.finish();
      for (const [name, v] of saved.reverse()) {
        if (v) this.vars.set(name, v);
        else this.vars.delete(name);
      }
    }
  }

  /** Perform an assignment statement `name=value` / `arr=(...)` / `arr[i]=v`. */
  async assign(a: Assign, opts: { local?: boolean } = {}) {
    if (opts.local) this.declareLocal(a.name);
    if (a.array) {
      const values: { key?: string; value: string[] }[] = [];
      for (const el of a.array) {
        if (el.key !== undefined) values.push({ key: await this.subscript(a.name, el.key), value: [await this.expandString(el.value)] });
        else values.push({ value: await this.expandFields(el.value) });
      }
      this.assignArray(a.name, values, a.append);
      return;
    }
    const value = a.value ? await this.expandString(a.value) : '';
    if (a.index !== undefined) {
      if (a.index === '@' || a.index === '*') throw new ExpansionError(`${a.name}[${a.index}]: bad array subscript`);
      this.setElem(a.name, await this.subscript(a.name, a.index), value, a.append);
    } else this.setVar(a.name, value, { append: a.append });
  }

  assignArray(name: string, values: { key?: string; value: string[] }[], append: boolean) {
    this.checkWritable(name);
    let v = this.vars.get(name);
    if (v && v.kind === 'assoc') {
      if (!append) v.map = new Map();
      for (const el of values) {
        if (el.key === undefined) throw new ExpansionError(`${name}: ${el.value[0] ?? ''}: must use subscript when assigning associative array`);
        v.map!.set(el.key, this.applyAttrs(v, el.value[0] ?? ''));
      }
      return;
    }
    if (!v || v.kind === 'scalar') {
      const old = v;
      v = { kind: 'indexed', value: '', arr: new Map(), exported: old?.exported, integer: old?.integer };
      if (old && append && old.value !== '') v.arr!.set(0, old.value);
      this.vars.set(name, v);
    } else if (!append) {
      v.arr = new Map();
    }
    let next = append && v.arr!.size ? Math.max(...v.arr!.keys()) + 1 : 0;
    for (const el of values) {
      if (el.key !== undefined) {
        next = Number(this.arith(el.key));
        v.arr!.set(next, this.applyAttrs(v, el.value[0] ?? ''));
        next++;
      } else {
        for (const s of el.value) v.arr!.set(next++, this.applyAttrs(v, s));
      }
    }
  }

  /** Find & run a command by name. */
  async invoke(argv: string[], io: IOCtx, arrayWords: Map<string, Assign> = new Map()): Promise<number> {
    const name = argv[0];
    const fn = this.funcs.get(name);
    if (fn) return this.callFunction(name, fn, argv.slice(1), io);
    const b = BUILTINS[name];
    if (b) return b(this, argv, io, arrayWords);
    if (name.includes('/')) return this.execPath(name, argv, io);
    const c = COMMANDS[name];
    if (c) return this.runCommand(name, c, argv, io);
    const found = this.findInPath(name);
    if (found) return this.execPath(found, argv, io, name);
    io.stderr.write(this.errPrefix() + `${name}: command not found\n`);
    return 127;
  }

  findInPath(name: string): string | null {
    const path = this.getScalar('PATH') ?? '';
    for (const dir of path.split(':')) {
      if (!dir) continue;
      const p = normalize(name, dir);
      const n = this.vfs.tryLookup(p);
      if (n && n.type === 'file' && this.vfs.can(n, this.cred, 'x')) return p;
    }
    return null;
  }

  async runCommand(name: string, fn: (c: CmdCtx) => Promise<number> | number, argv: string[], io: IOCtx): Promise<number> {
    const ctx: CmdCtx = {
      sh: this,
      name,
      argv,
      args: argv.slice(1),
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      vfs: this.vfs,
      cwd: this.cwd,
      cred: this.cred,
      abs: (p: string) => normalize(p, this.cwd),
      err: (msg: string) => io.stderr.write(`${name}: ${msg}\n`),
    };
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof FsError) {
        io.stderr.write(`${name}: ${e.message}\n`);
        return 1;
      }
      if (e instanceof UnsupportedError) {
        io.stderr.write(`${name}: ${e.message}\n`);
        return 1;
      }
      throw e;
    }
  }

  async execPath(path: string, argv: string[], io: IOCtx, shown = path): Promise<number> {
    const abs = normalize(path, this.cwd);
    let node: Inode;
    try {
      node = this.vfs.lookup(abs, { cred: this.cred });
    } catch (e) {
      if (e instanceof FsError) {
        io.stderr.write(this.errPrefix() + `${shown}: ${e.message}\n`);
        return e.code === 'ENOENT' ? 127 : 126;
      }
      throw e;
    }
    if (node.type === 'dir') {
      io.stderr.write(this.errPrefix() + `${shown}: Is a directory\n`);
      return 126;
    }
    if (!this.vfs.can(node, this.cred, 'x') || (this.cred.uid !== 0 ? false : (node.mode & 0o111) === 0)) {
      io.stderr.write(this.errPrefix() + `${shown}: Permission denied\n`);
      return 126;
    }
    if (!this.vfs.can(node, this.cred, 'r')) {
      io.stderr.write(`bash: ${shown}: Permission denied\n`);
      return 126;
    }
    const content = node.content ?? '';
    const shebang = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(content);
    if (shebang) {
      const interp = shebang[1].endsWith('/env') ? shebang[2] ?? '' : shebang[1];
      if (!/(^|\/)(ba)?sh$/.test(interp)) {
        io.stderr.write(this.errPrefix() + `${shown}: ${interp}: interpreter not available in the simulator\n`);
        return 126;
      }
    }
    return this.runScriptSource(path, content, argv.slice(1), io);
  }

  private async callFunction(name: string, body: Node, args: string[], io: IOCtx): Promise<number> {
    if (this.funcDepth >= 200) throw new LimitSignal(`${name}: maximum function nesting level exceeded (200) — is the function calling itself forever?`);
    const savedPos = this.positional;
    this.positional = args;
    const frame = new Map<string, Var | undefined>();
    this.localFrames.push(frame);
    this.funcDepth++;
    this.funcNames.push(name);
    const savedLoop = this.loopDepth;
    this.loopDepth = 0;
    try {
      return await this.exec(body, io);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.status;
      throw e;
    } finally {
      this.loopDepth = savedLoop;
      this.localFrames.pop();
      for (const [k, v] of frame) {
        if (v) this.vars.set(k, v);
        else this.vars.delete(k);
      }
      this.funcDepth--;
      this.funcNames.pop();
      this.positional = savedPos;
    }
  }

  get inLoop(): number {
    return this.loopDepth;
  }

  // ================================================================== traps

  async runTrap(sig: string, io: IOCtx) {
    const action = this.traps[sig];
    if (!action) return;
    this.inTrap = true;
    const saved = this.lastStatus;
    const line = this.lineno;
    try {
      // $LINENO inside the trap reports the line that triggered it
      const p = new Parser(action, 0, line);
      for (let items = p.nextLine(); items; items = p.nextLine()) {
        for (const it of items) await this.exec(it.node, io);
      }
    } catch (e) {
      if (e instanceof ShellSyntaxError || e instanceof IncompleteInput) {
        io.stderr.write(this.errPrefix() + 'trap: ' + e.message + '\n');
      } else if (!(e instanceof ExitSignal)) throw e;
    } finally {
      this.inTrap = false;
      this.lineno = line;
      if (sig !== 'EXIT') this.lastStatus = saved;
    }
  }

  async runExitTrap(io: IOCtx) {
    if (this.traps.EXIT && !this.inTrap) {
      const action = this.traps.EXIT;
      delete this.traps.EXIT;
      this.inTrap = true;
      const wasInteractive = this.interactive;
      try {
        await this.run(action, io);
      } catch (e) {
        if (!(e instanceof ExitSignal)) throw e;
      } finally {
        this.inTrap = false;
        this.interactive = wasInteractive;
      }
    }
  }

  // ================================================================== redirections

  private async redirTarget(w: Word): Promise<string> {
    const f = await this.expandFields(w);
    if (f.length !== 1) throw new ExpansionError(`${w.raw}: ambiguous redirect`);
    return f[0];
  }

  /** Returns null (after printing an error) if a redirection fails. */
  async applyRedirs(redirs: Redir[], io: IOCtx): Promise<{ io: IOCtx; finish: () => void } | null> {
    const fds: [InBuf, Writer, Writer] = [io.stdin, io.stdout, io.stderr];
    let shown = '';
    try {
      for (const r of redirs) {
        const n = r.fd ?? (r.op.startsWith('<') ? 0 : 1);
        shown = r.target.raw;
        switch (r.op) {
          case '>':
          case '>|':
          case '>>':
          case '&>':
          case '&>>': {
            const path = await this.redirTarget(r.target);
            shown = path;
            const append = r.op === '>>' || r.op === '&>>';
            if (this.opts.noclobber && r.op === '>' && path !== '/dev/null' && this.vfs.exists(normalize(path, this.cwd))) {
              throw new RedirError(`${path}: cannot overwrite existing file`);
            }
            const w = this.openWrite(path, append, fds);
            if (r.op === '&>' || r.op === '&>>') {
              fds[1] = w;
              fds[2] = w;
            } else if (n === 1 || n === 2) fds[n] = w;
            break;
          }
          case '<':
          case '<>': {
            const path = await this.redirTarget(r.target);
            shown = path;
            fds[0] = new InBuf(this.readForRedir(path));
            break;
          }
          case '<<':
          case '<<-': {
            const h = r.heredoc!;
            const body = h.quoted ? h.body : await this.expandString(parseHeredocBody(h.body));
            fds[0] = new InBuf(body);
            break;
          }
          case '<<<': {
            fds[0] = new InBuf((await this.expandString(r.target)) + '\n');
            break;
          }
          case '>&':
          case '<&': {
            const t = await this.redirTarget(r.target);
            shown = t;
            if (t === '-') {
              if (n === 0) fds[0] = InBuf.empty();
              else if (n === 1 || n === 2) fds[n] = NullWriter;
            } else if (/^[0-9]+$/.test(t)) {
              const src = Number(t);
              if (src > 2 || (n === 0) !== (src === 0)) throw new RedirError(`${t}: Bad file descriptor`);
              if (n === 1 || n === 2) fds[n] = fds[src] as Writer;
            } else if (r.op === '>&') {
              const w = this.openWrite(t, false, fds);
              fds[1] = w;
              fds[2] = w;
            }
            break;
          }
        }
      }
    } catch (e) {
      if (e instanceof FsError) {
        io.stderr.write(this.errPrefix() + `${shown}: ${e.message}\n`);
        return null;
      }
      if (e instanceof RedirError || (e instanceof ExpansionError && !e.fatal)) {
        io.stderr.write(this.errPrefix() + e.message + '\n');
        return null;
      }
      throw e;
    }
    return {
      io: { stdin: fds[0], stdout: fds[1], stderr: fds[2] },
      finish: () => {},
    };
  }

  private openWrite(path: string, append: boolean, fds: [InBuf, Writer, Writer]): Writer {
    if (path === '/dev/null') return NullWriter;
    if (path === '/dev/stdout' || path === '/dev/tty') return fds[1];
    if (path === '/dev/stderr') return fds[2];
    const abs = normalize(path, this.cwd);
    // open (create / truncate) right away, like bash does
    this.vfs.writeFile(abs, '', { append, cred: this.cred });
    const vfs = this.vfs;
    const target = vfs.realpathOrSelf(abs);
    return {
      write(s: string) {
        const n = vfs.tryLookup(target);
        if (n && n.type === 'file') {
          n.content = (n.content ?? '') + s;
          n.mtime = vfs.now();
        }
      },
    };
  }

  private readForRedir(path: string): string {
    if (path === '/dev/null') return '';
    return this.vfs.readFile(normalize(path, this.cwd), this.cred);
  }

  // ================================================================== [[ ]]

  private async evalCond(e: CondExpr): Promise<boolean> {
    switch (e.t) {
      case 'and':
        return (await this.evalCond(e.l)) && (await this.evalCond(e.r));
      case 'or':
        return (await this.evalCond(e.l)) || (await this.evalCond(e.r));
      case 'not':
        return !(await this.evalCond(e.e));
      case 'word':
        return (await this.expandString(e.w)) !== '';
      case 'unary': {
        const arg = await this.expandString(e.arg);
        if (e.op === '-v') {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(.*)\])?$/.exec(arg);
          if (!m) return false;
          return m[2] !== undefined ? this.getElem(m[1], m[2]) !== undefined : this.isSet(arg);
        }
        return fileTest(this, e.op, arg);
      }
      case 'binary': {
        const l = await this.expandString(e.l);
        if (e.op === '==' || e.op === '!=') {
          const pat = await this.expandPattern(e.r);
          const m = globMatch(pat, l, { nocase: this.shopt.nocasematch });
          return e.op === '==' ? m : !m;
        }
        if (e.op === '=~') {
          const src = await this.expandRegex(e.r);
          let re: RegExp;
          try {
            re = bashRegex(src);
          } catch {
            throw new ExpansionError(`[[: invalid regular expression: ${src}`, 2);
          }
          const m = re.exec(l);
          const arr = new Map<number, string>();
          if (m) m.forEach((g, i) => arr.set(i, g ?? ''));
          this.vars.set('BASH_REMATCH', { kind: 'indexed', value: '', arr });
          return !!m;
        }
        const r = await this.expandString(e.r);
        if (e.op === '<') return l < r;
        if (e.op === '>') return l > r;
        if (['-eq', '-ne', '-lt', '-le', '-gt', '-ge'].includes(e.op)) {
          const a = this.arith(l || '0');
          const b = this.arith(r || '0');
          return intCompare(e.op, a, b);
        }
        return fileCompare(this, e.op, l, r);
      }
    }
  }
}

// ==================================================================== helpers

class RedirError extends Error {}

export function cloneVar(v: Var): Var {
  return { ...v, arr: v.arr ? new Map(v.arr) : undefined, map: v.map ? new Map(v.map) : undefined };
}

function cmpC(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function xtraceQuote(s: string): string {
  if (s === '') return "''";
  if (/^[A-Za-z0-9_./=:,@%+-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function splitAliasWords(s: string): string[] {
  const out: string[] = [];
  const re = /'[^']*'|"(?:\\.|[^"\\])*"|\S+/g;
  let m: RegExpExecArray | null;
  let cur = '';
  let last = 0;
  while ((m = re.exec(s))) {
    if (m.index > last && /\s/.test(s.slice(last, m.index)) && cur) {
      out.push(cur);
      cur = '';
    }
    cur += m[0];
    last = m.index + m[0].length;
  }
  if (cur) out.push(cur);
  return out;
}

export function intCompare(op: string, a: bigint, b: bigint): boolean {
  switch (op) {
    case '-eq': return a === b;
    case '-ne': return a !== b;
    case '-lt': return a < b;
    case '-le': return a <= b;
    case '-gt': return a > b;
    case '-ge': return a >= b;
  }
  return false;
}

export function fileTest(sh: Shell, op: string, arg: string): boolean {
  if (op === '-z') return arg === '';
  if (op === '-n') return arg !== '';
  if (op === '-o') return (sh.opts as Record<string, boolean>)[arg] ?? false;
  if (op === '-t') return false;
  const abs = normalize(arg, sh.cwd);
  if (arg === '') return false;
  const lnode = sh.vfs.tryLookup(abs, false);
  if (op === '-L' || op === '-h') return !!lnode && lnode.type === 'link';
  let n: Inode | null = null;
  try {
    n = sh.vfs.lookup(abs, { cred: sh.cred });
  } catch {
    n = null;
  }
  if (!n) return false;
  switch (op) {
    case '-e':
    case '-a':
      return true;
    case '-f':
      return n.type === 'file';
    case '-d':
      return n.type === 'dir';
    case '-s':
      return sh.vfs.size(n) > 0 && n.type === 'file' ? true : n.type === 'dir';
    case '-r':
      return sh.vfs.can(n, sh.cred, 'r');
    case '-w':
      return sh.vfs.can(n, sh.cred, 'w');
    case '-x':
      return sh.vfs.can(n, sh.cred, 'x');
    case '-u':
      return (n.mode & 0o4000) !== 0;
    case '-g':
      return (n.mode & 0o2000) !== 0;
    case '-k':
      return (n.mode & 0o1000) !== 0;
    case '-O':
      return n.uid === sh.cred.uid;
    case '-G':
      return n.gid === sh.cred.gid;
    case '-N':
      return true;
    case '-b':
    case '-c':
    case '-p':
    case '-S':
      return false;
  }
  return false;
}

export function fileCompare(sh: Shell, op: string, l: string, r: string): boolean {
  const a = sh.vfs.tryLookup(normalize(l, sh.cwd));
  const b = sh.vfs.tryLookup(normalize(r, sh.cwd));
  if (op === '-nt') return !!a && (!b || a.mtime > b.mtime);
  if (op === '-ot') return !!b && (!a || a.mtime < b.mtime);
  if (op === '-ef') return !!a && a === b;
  return false;
}

/** ${v#pat} ${v##pat} ${v%pat} ${v%%pat} */
export function trimPattern(v: string, pat: string, op: string): string {
  const re = new RegExp('^' + globToRegexSource(pat) + '$');
  if (op === '#') {
    for (let i = 0; i <= v.length; i++) if (re.test(v.slice(0, i))) return v.slice(i);
  } else if (op === '##') {
    for (let i = v.length; i >= 0; i--) if (re.test(v.slice(0, i))) return v.slice(i);
  } else if (op === '%') {
    for (let i = v.length; i >= 0; i--) if (re.test(v.slice(i))) return v.slice(0, i);
  } else if (op === '%%') {
    for (let i = 0; i <= v.length; i++) if (re.test(v.slice(i))) return v.slice(0, i);
  }
  return v;
}

/** ${v/pat/rep} ${v//pat/rep} ${v/#pat/rep} ${v/%pat/rep} */
export function replacePattern(v: string, pat: string, rep: string, op: string): string {
  if (pat === '') return v;
  const src = globToRegexSource(pat);
  if (op === '/#') {
    // longest match anchored at the start
    const re = new RegExp('^(?:' + src + ')$');
    for (let i = v.length; i >= 0; i--) if (re.test(v.slice(0, i))) return rep + v.slice(i);
    return v;
  }
  if (op === '/%') {
    const re = new RegExp('^(?:' + src + ')$');
    for (let i = 0; i <= v.length; i++) if (re.test(v.slice(i))) return v.slice(0, i) + rep;
    return v;
  }
  const re = new RegExp(src, op === '//' ? 'g' : '');
  return v.replace(re, (m) => (m === '' ? m : rep));
}

/** Brace expansion on the literal parts of a word. */
export function braceExpand(w: Word): Word[] {
  for (let pi = 0; pi < w.parts.length; pi++) {
    const part = w.parts[pi];
    if (part.t !== 'lit' || !part.v.includes('{')) continue;
    const text = part.v;
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{') continue;
      // find matching }
      let depth = 0;
      let j = i;
      let hasComma = false;
      for (; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') {
          depth--;
          if (depth === 0) break;
        } else if (text[j] === ',' && depth === 1) hasComma = true;
      }
      if (j >= text.length) break;
      const inner = text.slice(i + 1, j);
      let alts: string[] | null = null;
      if (hasComma) {
        alts = splitTop(inner);
      } else {
        const m = /^(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?$/.exec(inner);
        const mc = /^([A-Za-z])\.\.([A-Za-z])(?:\.\.(-?\d+))?$/.exec(inner);
        if (m) {
          const a = Number(m[1]);
          const b = Number(m[2]);
          let step = Math.abs(Number(m[3] ?? 1)) || 1;
          const width = /^-?0\d/.test(m[1]) || /^-?0\d/.test(m[2]) ? Math.max(m[1].length, m[2].length) : 0;
          alts = [];
          if (a > b) step = -step;
          for (let k = a; step > 0 ? k <= b : k >= b; k += step) {
            if (alts.length > 100000) break;
            const s = String(Math.abs(k)).padStart(width - (k < 0 ? 1 : 0), '0');
            alts.push((k < 0 ? '-' : '') + s);
          }
        } else if (mc) {
          const a = mc[1].charCodeAt(0);
          const b = mc[2].charCodeAt(0);
          let step = Math.abs(Number(mc[3] ?? 1)) || 1;
          if (a > b) step = -step;
          alts = [];
          for (let k = a; step > 0 ? k <= b : k >= b; k += step) alts.push(String.fromCharCode(k));
        }
      }
      if (!alts) continue;
      const pre = text.slice(0, i);
      const post = text.slice(j + 1);
      const out: Word[] = [];
      for (const alt of alts) {
        const parts = [...w.parts];
        const v = pre + alt + post;
        if (v) parts[pi] = { t: 'lit', v };
        else parts.splice(pi, 1);
        out.push(...braceExpand({ parts, raw: w.raw }));
      }
      return out;
    }
  }
  return [w];
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
