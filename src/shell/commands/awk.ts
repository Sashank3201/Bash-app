// A compact POSIX awk (+ a few gawk conveniences) — enough for real log analysis.

import { posixRegex } from '../pattern';
import { InBuf, StringWriter } from '../io';
import { FsError } from '../vfs';
import { formatExp, formatG, toFixedC } from '../format';
import { readText, register, type CmdCtx } from './registry';
import { strftime } from './time';

// ------------------------------------------------------------------ values

class StrNum {
  constructor(public s: string) {}
}
const UNINIT = Symbol('uninit');
type Val = number | string | StrNum | typeof UNINIT;

const NUM_RE = /^[ \t\n]*[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|0[xX][0-9a-fA-F]+)[ \t\n]*$/;

function looksNumeric(s: string): boolean {
  return NUM_RE.test(s) && !/0[xX]/.test(s);
}

function strToNum(s: string): number {
  const m = /^[ \t\n]*([+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?))/.exec(s);
  return m ? parseFloat(m[1]) : 0;
}

function numToStr(n: number, fmt = '%.6g'): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return String(n);
  if (!isFinite(n)) return n > 0 ? 'inf' : n < 0 ? '-inf' : 'nan';
  return sprintf(fmt, [n]);
}

function isNumLike(v: Val): boolean {
  if (typeof v === 'number' || v === UNINIT) return true;
  if (v instanceof StrNum) return looksNumeric(v.s);
  return false;
}

// ------------------------------------------------------------------ sprintf

export function sprintf(fmt: string, args: Val[], conv: (v: Val) => string = (v) => toStrPlain(v), num: (v: Val) => number = toNumPlain): string {
  let out = '';
  let ai = 0;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== '%') {
      out += c;
      continue;
    }
    const m = /^%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d*))?([diouxXfFeEgGcs%])/.exec(fmt.slice(i));
    if (!m) {
      out += c;
      continue;
    }
    i += m[0].length - 1;
    if (m[4] === '%') {
      out += '%';
      continue;
    }
    const flags = m[1];
    let width = m[2] === '*' ? num(args[ai++] ?? UNINIT) : Number(m[2] ?? 0);
    const prec: number | undefined = m[3] === undefined ? undefined : m[3] === '*' ? num(args[ai++] ?? UNINIT) : Number(m[3] || 0);
    const left = flags.includes('-') || width < 0;
    width = Math.abs(width);
    const arg = args[ai++] ?? UNINIT;
    let s: string;
    const sign = (n: number) => (n < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '');
    switch (m[4]) {
      case 'd':
      case 'i': {
        const n = Math.trunc(num(arg));
        s = String(Math.abs(n));
        if (prec !== undefined) s = s.padStart(prec, '0');
        s = sign(n) + s;
        break;
      }
      case 'o':
      case 'x':
      case 'X':
      case 'u': {
        let n = Math.trunc(num(arg));
        if (n < 0) n = 2 ** 32 + n;
        s = m[4] === 'u' ? String(n) : n.toString(m[4] === 'o' ? 8 : 16);
        if (m[4] === 'X') s = s.toUpperCase();
        if (prec !== undefined) s = s.padStart(prec, '0');
        break;
      }
      case 'f':
      case 'F': {
        const n = num(arg);
        s = sign(n) + toFixedC(Math.abs(n), prec ?? 6);
        break;
      }
      case 'e':
      case 'E': {
        const n = num(arg);
        s = sign(n) + formatExp(Math.abs(n), prec ?? 6, m[4] === 'E');
        break;
      }
      case 'g':
      case 'G': {
        const n = num(arg);
        s = sign(n) + formatG(Math.abs(n), prec ?? 6, m[4] === 'G', flags.includes('#'));
        break;
      }
      case 'c':
        s = typeof arg === 'number' ? String.fromCharCode(arg) : conv(arg).slice(0, 1);
        break;
      default:
        s = conv(arg);
        if (prec !== undefined) s = s.slice(0, prec);
    }
    if (s.length < width) {
      if (left) s = s + ' '.repeat(width - s.length);
      else if (flags.includes('0') && /[diouxXfFeEgG]/.test(m[4])) {
        const sg = /^[+ -]/.test(s) ? s[0] : '';
        s = sg + '0'.repeat(width - s.length) + s.slice(sg.length);
      } else s = ' '.repeat(width - s.length) + s;
    }
    out += s;
  }
  return out;
}

function toStrPlain(v: Val): string {
  if (v === UNINIT) return '';
  if (typeof v === 'number') return numToStr(v);
  if (v instanceof StrNum) return v.s;
  return v;
}

function toNumPlain(v: Val): number {
  if (v === UNINIT) return 0;
  if (typeof v === 'number') return v;
  return strToNum(v instanceof StrNum ? v.s : v);
}

// ------------------------------------------------------------------ lexer

type TT =
  | 'num' | 'str' | 'ere' | 'name' | 'funcname' | 'builtin' | 'kw' | 'op' | 'nl' | 'eof';
interface Tok {
  t: TT;
  v: string;
  n?: number;
  line: number;
}

const KEYWORDS = new Set(['BEGIN', 'END', 'function', 'func', 'if', 'else', 'while', 'for', 'do', 'break', 'continue', 'next', 'nextfile', 'exit', 'return', 'delete', 'getline', 'print', 'printf', 'in']);
const BUILTINS = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'sprintf', 'sin', 'cos', 'atan2', 'exp', 'log', 'sqrt', 'int', 'rand', 'srand', 'tolower', 'toupper', 'system', 'close', 'fflush', 'systime', 'strftime', 'gensub']);
const OPS = ['+=', '-=', '*=', '/=', '%=', '^=', '**=', '==', '<=', '>=', '!=', '++', '--', '&&', '||', '>>', '!~', '**', '+', '-', '*', '/', '%', '^', '!', '>', '<', '|', '?', ':', '~', '$', '=', '(', ')', '[', ']', '{', '}', ',', ';'];

class AwkSyntaxError extends Error {}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  const prevAllowsDiv = () => {
    const p = toks[toks.length - 1];
    if (!p) return false;
    if (p.t === 'num' || p.t === 'str' || p.t === 'name' || p.t === 'builtin') return true;
    if (p.t === 'op' && (p.v === ')' || p.v === ']' || p.v === '$' || p.v === '++' || p.v === '--')) return true;
    return false;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '\\' && src[i + 1] === '\n') {
      i += 2;
      line++;
      continue;
    }
    if (c === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '\n') {
      toks.push({ t: 'nl', v: '\n', line });
      line++;
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?\.?|\d+\.)/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: m[0], n: Number(m[0]), line });
      i += m[0].length;
      continue;
    }
    if (c === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) {
          const n = src[++i];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', '/': '/', a: '\x07', b: '\b', f: '\f', v: '\v' };
          if (map[n] !== undefined) s += map[n];
          else if (/[0-7]/.test(n)) {
            const m = /^[0-7]{1,3}/.exec(src.slice(i))!;
            s += String.fromCharCode(parseInt(m[0], 8));
            i += m[0].length - 1;
          } else if (n === '\n') line++;
          else s += '\\' + n;
          i++;
          continue;
        }
        if (src[i] === '\n') throw new AwkSyntaxError(`newline in string ${s}... at source line ${line}`);
        s += src[i++];
      }
      if (i >= src.length) throw new AwkSyntaxError(`non-terminated string ${s.slice(0, 10)}... at source line ${line}`);
      i++;
      toks.push({ t: 'str', v: s, line });
      continue;
    }
    if (c === '/' && !prevAllowsDiv()) {
      let s = '';
      i++;
      let inBr = false;
      while (i < src.length && (src[i] !== '/' || inBr)) {
        if (src[i] === '\n') throw new AwkSyntaxError(`newline in regex at source line ${line}`);
        if (src[i] === '\\' && i + 1 < src.length) {
          if (src[i + 1] === '/') s += '/';
          else s += src[i] + src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === '[' && !inBr) {
          inBr = true;
          s += src[i++];
          if (src[i] === '^') s += src[i++];
          if (src[i] === ']') s += src[i++];
          continue;
        }
        if (src[i] === ']' && inBr) inBr = false;
        s += src[i++];
      }
      if (i >= src.length) throw new AwkSyntaxError(`non-terminated regular expression ${s.slice(0, 10)}... at source line ${line}`);
      i++;
      toks.push({ t: 'ere', v: s, line });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      const w = m[0];
      i += w.length;
      if (KEYWORDS.has(w)) toks.push({ t: 'kw', v: w === 'func' ? 'function' : w, line });
      else if (BUILTINS.has(w)) toks.push({ t: 'builtin', v: w, line });
      else if (src[i] === '(') toks.push({ t: 'funcname', v: w, line });
      else toks.push({ t: 'name', v: w, line });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new AwkSyntaxError(`syntax error at source line ${line}: unexpected character '${c}'`);
    toks.push({ t: 'op', v: op === '**' ? '^' : op === '**=' ? '^=' : op, line });
    i += op.length;
  }
  toks.push({ t: 'eof', v: '', line });
  return toks;
}

// ------------------------------------------------------------------ AST

type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 're'; src: string }
  | { k: 'var'; name: string }
  | { k: 'idx'; name: string; subs: Expr[] }
  | { k: 'field'; e: Expr }
  | { k: 'assign'; op: string; target: Expr; e: Expr }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr }
  | { k: 'and' | 'or'; l: Expr; r: Expr }
  | { k: 'in'; subs: Expr[]; name: string }
  | { k: 'match'; neg: boolean; l: Expr; r: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'cat'; l: Expr; r: Expr }
  | { k: 'un'; op: string; e: Expr }
  | { k: 'incdec'; op: string; prefix: boolean; target: Expr }
  | { k: 'call'; name: string; args: Expr[] }
  | { k: 'builtin'; name: string; args: Expr[] }
  | { k: 'getline'; target?: Expr; file?: Expr; cmd?: Expr }
  | { k: 'group'; e: Expr; list?: Expr[] };

type Stmt =
  | { k: 'expr'; e: Expr }
  | { k: 'print'; args: Expr[]; redir?: { op: string; e: Expr } }
  | { k: 'printf'; args: Expr[]; redir?: { op: string; e: Expr } }
  | { k: 'if'; c: Expr; a: Stmt; b?: Stmt }
  | { k: 'while'; c: Expr; body: Stmt }
  | { k: 'do'; c: Expr; body: Stmt }
  | { k: 'for'; init?: Stmt; c?: Expr; step?: Stmt; body: Stmt }
  | { k: 'forin'; v: string; arr: string; body: Stmt }
  | { k: 'block'; body: Stmt[] }
  | { k: 'next' }
  | { k: 'nextfile' }
  | { k: 'exit'; e?: Expr }
  | { k: 'return'; e?: Expr }
  | { k: 'break' }
  | { k: 'continue' }
  | { k: 'delete'; name: string; subs?: Expr[] }
  | { k: 'getline'; e: Expr };

interface Rule {
  kind: 'begin' | 'end' | 'main';
  pattern?: Expr;
  range?: [Expr, Expr];
  action?: Stmt;
}

interface Func {
  params: string[];
  body: Stmt;
}

// ------------------------------------------------------------------ parser

class AwkParser {
  i = 0;
  funcs = new Map<string, Func>();
  rules: Rule[] = [];
  private noIn = 0;
  private noGt = 0;
  constructor(private toks: Tok[]) {}

  private peek(o = 0) {
    return this.toks[this.i + o];
  }
  private next() {
    return this.toks[this.i++];
  }
  private is(v: string, t: TT = 'op') {
    const p = this.peek();
    return p.t === t && p.v === v;
  }
  private isKw(v: string) {
    return this.is(v, 'kw');
  }
  private expect(v: string, t: TT = 'op') {
    const p = this.next();
    if (p.t !== t || p.v !== v) throw this.err(p, `expected '${v}'`);
    return p;
  }
  private err(p: Tok, msg = 'syntax error') {
    return new AwkSyntaxError(`syntax error at source line ${p.line}: ${msg}${p.t === 'eof' ? ' (unexpected end of program)' : ` near '${p.v === '\n' ? 'newline' : p.v}'`}`);
  }
  private skipNl() {
    while (this.peek().t === 'nl') this.i++;
  }
  private skipTerms() {
    while (this.peek().t === 'nl' || this.is(';')) this.i++;
  }

  parse() {
    this.skipTerms();
    while (this.peek().t !== 'eof') {
      this.item();
      this.skipTerms();
    }
    return { rules: this.rules, funcs: this.funcs };
  }

  private item() {
    const p = this.peek();
    if (p.t === 'kw' && p.v === 'function') {
      this.next();
      const nameTok = this.next();
      if (nameTok.t !== 'funcname' && nameTok.t !== 'name') throw this.err(nameTok, 'expected function name');
      this.expect('(');
      const params: string[] = [];
      while (!this.is(')')) {
        const n = this.next();
        if (n.t !== 'name') throw this.err(n);
        params.push(n.v);
        if (this.is(',')) {
          this.next();
          this.skipNl();
        }
      }
      this.expect(')');
      this.skipNl();
      this.funcs.set(nameTok.v, { params, body: this.block() });
      return;
    }
    if (p.t === 'kw' && (p.v === 'BEGIN' || p.v === 'END')) {
      this.next();
      this.skipNl();
      if (!this.is('{')) throw this.err(this.peek(), `${p.v} blocks must have an action part`);
      this.rules.push({ kind: p.v === 'BEGIN' ? 'begin' : 'end', action: this.block() });
      return;
    }
    let pattern: Expr | undefined;
    let range: [Expr, Expr] | undefined;
    if (!this.is('{')) {
      pattern = this.expr();
      if (this.is(',')) {
        this.next();
        this.skipNl();
        range = [pattern, this.expr()];
        pattern = undefined;
      }
    }
    const action = this.is('{') ? this.block() : undefined;
    this.rules.push({ kind: 'main', pattern, range, action });
  }

  private block(): Stmt {
    this.expect('{');
    const body: Stmt[] = [];
    this.skipTerms();
    while (!this.is('}')) {
      if (this.peek().t === 'eof') throw this.err(this.peek(), "missing '}'");
      body.push(this.stmt());
      this.skipTerms();
    }
    this.expect('}');
    return { k: 'block', body };
  }

  private simpleEnd() {
    // statement terminator: ; newline } or eof
    if (this.is(';') || this.peek().t === 'nl') {
      this.next();
      return;
    }
    if (this.is('}') || this.peek().t === 'eof') return;
    throw this.err(this.peek());
  }

  private stmtBody(): Stmt {
    this.skipNl();
    if (this.is(';')) {
      this.next();
      return { k: 'block', body: [] };
    }
    return this.stmt();
  }

  private stmt(): Stmt {
    const p = this.peek();
    if (this.is('{')) return this.block();
    if (p.t === 'kw') {
      switch (p.v) {
        case 'if': {
          this.next();
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          const a = this.stmtBody();
          const save = this.i;
          this.skipTerms();
          if (this.isKw('else')) {
            this.next();
            return { k: 'if', c, a, b: this.stmtBody() };
          }
          this.i = save;
          return { k: 'if', c, a };
        }
        case 'while': {
          this.next();
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          if (this.is(';')) {
            this.next();
            return { k: 'while', c, body: { k: 'block', body: [] } };
          }
          return { k: 'while', c, body: this.stmtBody() };
        }
        case 'do': {
          this.next();
          const body = this.stmtBody();
          this.skipTerms();
          if (!this.isKw('while')) throw this.err(this.peek(), "expected 'while'");
          this.next();
          this.expect('(');
          const c = this.expr();
          this.expect(')');
          this.simpleEnd();
          return { k: 'do', c, body };
        }
        case 'for': {
          this.next();
          this.expect('(');
          if (this.peek().t === 'name' && this.peek(1).t === 'kw' && this.peek(1).v === 'in' && this.peek(2).t === 'name' && this.peek(3).t === 'op' && this.peek(3).v === ')') {
            const v = this.next().v;
            this.next();
            const arr = this.next().v;
            this.expect(')');
            return { k: 'forin', v, arr, body: this.stmtBody() };
          }
          const init = this.is(';') ? undefined : this.simpleStmt();
          this.expect(';');
          this.skipNl();
          const c = this.is(';') ? undefined : this.expr();
          this.expect(';');
          this.skipNl();
          const step = this.is(')') ? undefined : this.simpleStmt();
          this.expect(')');
          if (this.is(';')) {
            this.next();
            return { k: 'for', init, c, step, body: { k: 'block', body: [] } };
          }
          return { k: 'for', init, c, step, body: this.stmtBody() };
        }
        case 'next':
        case 'nextfile':
        case 'break':
        case 'continue':
          this.next();
          this.simpleEnd();
          return { k: p.v } as Stmt;
        case 'exit':
        case 'return': {
          this.next();
          let e: Expr | undefined;
          if (!this.is(';') && !this.is('}') && this.peek().t !== 'nl' && this.peek().t !== 'eof') e = this.expr();
          this.simpleEnd();
          return { k: p.v, e } as Stmt;
        }
        case 'delete': {
          this.next();
          const n = this.next();
          if (n.t !== 'name') throw this.err(n);
          let subs: Expr[] | undefined;
          if (this.is('[')) {
            this.next();
            subs = this.exprList(']');
            this.expect(']');
          }
          this.simpleEnd();
          return { k: 'delete', name: n.v, subs };
        }
      }
    }
    const s = this.simpleStmt();
    this.simpleEnd();
    return s;
  }

  private simpleStmt(): Stmt {
    if (this.isKw('print') || this.isKw('printf')) {
      const kind = this.next().v as 'print' | 'printf';
      let args: Expr[] = [];
      this.noGt++;
      if (this.is('(')) {
        // print (a,b) > "file"  vs  print (a)(b)
        const save = this.i;
        this.next();
        const list = this.exprList(')');
        this.expect(')');
        if (this.is(';') || this.is('}') || this.is('>') || this.is('>>') || this.is('|') || this.peek().t === 'nl' || this.peek().t === 'eof') {
          args = list;
        } else {
          this.i = save;
          args = this.exprList();
        }
      } else if (!this.is(';') && !this.is('}') && this.peek().t !== 'nl' && this.peek().t !== 'eof' && !this.is('>') && !this.is('|') && !this.is('>>')) {
        args = this.exprList();
      }
      this.noGt--;
      let redir: { op: string; e: Expr } | undefined;
      if (this.is('>') || this.is('>>') || this.is('|')) {
        const op = this.next().v;
        redir = { op, e: this.concat() };
      }
      return { k: kind, args, redir };
    }
    return { k: 'expr', e: this.expr() };
  }

  private exprList(end?: string): Expr[] {
    const list: Expr[] = [];
    if (end && this.is(end)) return list;
    list.push(this.expr());
    while (this.is(',')) {
      this.next();
      this.skipNl();
      list.push(this.expr());
    }
    return list;
  }

  expr(): Expr {
    return this.ternary();
  }

  private ternary(): Expr {
    const c = this.or();
    if (this.is('?')) {
      this.next();
      this.skipNl();
      const a = this.ternary();
      this.skipNl();
      this.expect(':');
      this.skipNl();
      const b = this.ternary();
      return { k: 'cond', c, a, b };
    }
    if (this.peek().t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '^='].includes(this.peek().v) && isLvalue(c)) {
      const op = this.next().v;
      this.skipNl();
      return { k: 'assign', op, target: c, e: this.ternary() };
    }
    return c;
  }

  private or(): Expr {
    let l = this.and();
    while (this.is('||')) {
      this.next();
      this.skipNl();
      l = { k: 'or', l, r: this.and() };
    }
    return l;
  }

  private and(): Expr {
    let l = this.inExpr();
    while (this.is('&&')) {
      this.next();
      this.skipNl();
      l = { k: 'and', l, r: this.inExpr() };
    }
    return l;
  }

  private inExpr(): Expr {
    let l = this.matchExpr();
    while (this.isKw('in') && !this.noIn) {
      this.next();
      const n = this.next();
      if (n.t !== 'name') throw this.err(n);
      l = { k: 'in', subs: l.k === 'group' && l.list ? l.list : [l], name: n.v };
    }
    return l;
  }

  private matchExpr(): Expr {
    let l = this.comparison();
    while (this.is('~') || this.is('!~')) {
      const neg = this.next().v === '!~';
      l = { k: 'match', neg, l, r: this.comparison() };
    }
    return l;
  }

  private comparison(): Expr {
    const l = this.concat();
    const p = this.peek();
    if (p.t === 'op' && ['<', '<=', '!=', '==', '>=', '>'].includes(p.v)) {
      if (p.v === '>' && this.noGt) return l;
      this.next();
      return { k: 'bin', op: p.v, l, r: this.concat() };
    }
    return l;
  }

  private concat(): Expr {
    let l = this.additive();
    for (;;) {
      const p = this.peek();
      const starts =
        p.t === 'num' || p.t === 'str' || p.t === 'ere' || p.t === 'name' || p.t === 'funcname' || p.t === 'builtin' ||
        (p.t === 'op' && ['$', '(', '++', '--'].includes(p.v));
      if (!starts) return l;
      l = { k: 'cat', l, r: this.additive() };
    }
  }

  private additive(): Expr {
    let l = this.mult();
    while (this.is('+') || this.is('-')) {
      const op = this.next().v;
      l = { k: 'bin', op, l, r: this.mult() };
    }
    return l;
  }

  private mult(): Expr {
    let l = this.unary();
    while (this.is('*') || this.is('/') || this.is('%')) {
      const op = this.next().v;
      l = { k: 'bin', op, l, r: this.unary() };
    }
    return l;
  }

  private unary(): Expr {
    if (this.is('!')) {
      this.next();
      return { k: 'un', op: '!', e: this.unary() };
    }
    if (this.is('-') || this.is('+')) {
      const op = this.next().v;
      return { k: 'un', op, e: this.unary() };
    }
    return this.power();
  }

  private power(): Expr {
    const base = this.postfix();
    if (this.is('^')) {
      this.next();
      return { k: 'bin', op: '^', l: base, r: this.unaryPow() };
    }
    return base;
  }

  private unaryPow(): Expr {
    if (this.is('-') || this.is('+') || this.is('!')) {
      const op = this.next().v;
      return { k: 'un', op, e: this.unaryPow() };
    }
    return this.power();
  }

  private postfix(): Expr {
    if (this.is('++') || this.is('--')) {
      const op = this.next().v;
      const target = this.postfix();
      if (!isLvalue(target)) throw this.err(this.peek(), 'invalid operand for ' + op);
      return { k: 'incdec', op, prefix: true, target };
    }
    const e = this.primary();
    if ((this.is('++') || this.is('--')) && isLvalue(e)) {
      const op = this.next().v;
      return { k: 'incdec', op, prefix: false, target: e };
    }
    // simple getline from command: "cmd" | getline [var]
    if (this.is('|') && this.peek(1).t === 'kw' && this.peek(1).v === 'getline') {
      this.next();
      this.next();
      const target = this.peek().t === 'name' || this.is('$') ? this.primary() : undefined;
      return { k: 'getline', cmd: e, target };
    }
    return e;
  }

  private primary(): Expr {
    const p = this.next();
    switch (p.t) {
      case 'num':
        return { k: 'num', v: p.n! };
      case 'str':
        return { k: 'str', v: p.v };
      case 'ere':
        return { k: 're', src: p.v };
      case 'name':
        if (this.is('[')) {
          this.next();
          this.noIn++;
          const subs = this.exprList(']');
          this.noIn--;
          this.expect(']');
          return { k: 'idx', name: p.v, subs };
        }
        return { k: 'var', name: p.v };
      case 'funcname': {
        this.expect('(');
        const args = this.exprList(')');
        this.expect(')');
        return { k: 'call', name: p.v, args };
      }
      case 'builtin': {
        let args: Expr[] = [];
        if (this.is('(')) {
          this.next();
          const g = this.noGt;
          this.noGt = 0;
          args = this.exprList(')');
          this.noGt = g;
          this.expect(')');
        } else if (p.v !== 'length') throw this.err(this.peek(), `expected '(' after ${p.v}`);
        return { k: 'builtin', name: p.v, args };
      }
      case 'kw':
        if (p.v === 'getline') {
          let target: Expr | undefined;
          if (this.peek().t === 'name' || this.is('$')) target = this.primary();
          let file: Expr | undefined;
          if (this.is('<')) {
            this.next();
            file = this.primary();
          }
          return { k: 'getline', target, file };
        }
        break;
      case 'op':
        if (p.v === '$') {
          const e = this.is('++') || this.is('--') ? this.postfix() : this.primary();
          return { k: 'field', e };
        }
        if (p.v === '(') {
          const save = this.noGt;
          this.noGt = 0;
          const first = this.expr();
          if (this.is(',')) {
            // grouping for (a,b) in arr
            const list = [first];
            while (this.is(',')) {
              this.next();
              list.push(this.expr());
            }
            this.expect(')');
            this.noGt = save;
            return { k: 'group', e: first, list };
          }
          this.expect(')');
          this.noGt = save;
          return { k: 'group', e: first };
        }
        if (p.v === '-' || p.v === '+' || p.v === '!') {
          return { k: 'un', op: p.v, e: this.unary() };
        }
    }
    throw this.err(p);
  }
}

function isLvalue(e: Expr): boolean {
  return e.k === 'var' || e.k === 'idx' || e.k === 'field';
}

// ------------------------------------------------------------------ interpreter

class NextSig {}
class NextFileSig {}
class ExitSig {
  constructor(public code: number) {}
}
class ReturnSig {
  constructor(public v: Val) {}
}
class BreakSig {}
class ContinueSig {}
class AwkRuntimeError extends Error {}

interface InputSource {
  name: string;
  text: string;
  records: string[] | null; // split lazily so BEGIN can change RS
  pos: number;
}

class Awk {
  globals = new Map<string, Val | Map<string, Val>>();
  frames: Map<string, Val | Map<string, Val>>[] = [];
  fields: string[] = [];
  nf = 0;
  record = '';
  fieldsValid = true;
  recordValid = true;
  out = '';
  outputs = new Map<string, { kind: '>' | '>>' | '|'; buf: string }>();
  steps = 0;
  rangeActive: boolean[] = [];
  regexCache = new Map<string, RegExp>();
  inputs: InputSource[] = [];
  current: InputSource | null = null;
  fileReaders = new Map<string, { lines: string[]; pos: number }>();
  rand = mulberry32(0);
  seed = 0;
  pendingCmds: { cmd: string; input: string }[] = [];
  uninitFns: Func[] = [];

  constructor(
    public prog: { rules: Rule[]; funcs: Map<string, Func> },
    public c: CmdCtx,
  ) {
    const set = (k: string, v: Val) => this.globals.set(k, v);
    set('FS', ' ');
    set('OFS', ' ');
    set('ORS', '\n');
    set('RS', '\n');
    set('NR', 0);
    set('NF', 0);
    set('FNR', 0);
    set('SUBSEP', '\x1c');
    set('CONVFMT', '%.6g');
    set('OFMT', '%.6g');
    set('RSTART', 0);
    set('RLENGTH', -1);
    set('FILENAME', '');
    const env = new Map<string, Val>();
    for (const [k, v] of Object.entries(c.sh.exportedEnv())) env.set(k, new StrNum(v));
    this.globals.set('ENVIRON', env);
  }

  tick() {
    if (++this.steps > 3_000_000) throw new AwkRuntimeError('program ran too long (possible infinite loop) — stopped by the simulator');
  }

  // ---- variables

  private scopeFor(name: string): Map<string, Val | Map<string, Val>> {
    const f = this.frames[this.frames.length - 1];
    if (f && f.has(name)) return f;
    return this.globals;
  }

  getVar(name: string): Val {
    if (name === 'NF') {
      this.splitIfNeeded();
      return this.nf;
    }
    const v = this.scopeFor(name).get(name);
    if (v instanceof Map) throw new AwkRuntimeError(`attempt to use array \`${name}' in a scalar context`);
    return v ?? UNINIT;
  }

  setVar(name: string, v: Val) {
    if (name === 'NF') {
      this.splitIfNeeded();
      const n = Math.trunc(this.num(v));
      this.nf = n;
      this.fields.length = n;
      for (let i = 0; i < n; i++) if (this.fields[i] === undefined) this.fields[i] = '';
      this.recordValid = false;
      return;
    }
    const scope = this.scopeFor(name);
    if (scope.get(name) instanceof Map) throw new AwkRuntimeError(`attempt to use array \`${name}' in a scalar context`);
    scope.set(name, v);
  }

  getArray(name: string): Map<string, Val> {
    const scope = this.scopeFor(name);
    let a = scope.get(name);
    if (a === undefined || a === UNINIT) {
      a = new Map();
      scope.set(name, a);
      // if this was an uninitialised local passed by caller, fall through
    }
    if (!(a instanceof Map)) throw new AwkRuntimeError(`attempt to use scalar \`${name}' as an array`);
    return a;
  }

  // ---- conversions

  str(v: Val): string {
    if (v === UNINIT) return '';
    if (typeof v === 'number') return numToStr(v, this.sget('CONVFMT'));
    if (v instanceof StrNum) return v.s;
    return v;
  }

  outStr(v: Val): string {
    if (typeof v === 'number') return numToStr(v, this.sget('OFMT'));
    return this.str(v);
  }

  num(v: Val): number {
    return toNumPlain(v);
  }

  bool(v: Val): boolean {
    if (v === UNINIT) return false;
    if (typeof v === 'number') return v !== 0;
    if (v instanceof StrNum) return looksNumeric(v.s) ? strToNum(v.s) !== 0 : v.s !== '';
    return v !== '';
  }

  private sget(name: string): string {
    const v = this.globals.get(name);
    return v instanceof Map || v === undefined ? '' : this.str(v);
  }

  // ---- records & fields

  setRecord(s: string) {
    this.record = s;
    this.recordValid = true;
    this.fieldsValid = false;
  }

  splitIfNeeded() {
    if (this.fieldsValid) return;
    this.fields = this.splitFields(this.record, this.sget('FS'));
    this.nf = this.fields.length;
    this.fieldsValid = true;
  }

  splitFields(s: string, fs: string): string[] {
    if (fs === ' ') {
      const t = s.replace(/^[ \t\n]+|[ \t\n]+$/g, '');
      return t === '' ? [] : t.split(/[ \t\n]+/);
    }
    if (s === '') return [];
    if (fs === '') return [...s];
    const paragraph = this.sget('RS') === '';
    if (fs.length === 1 && fs !== '\\') {
      const parts = s.split(fs === '\t' ? '\t' : fs);
      if (paragraph) return parts.flatMap((p) => p.split('\n'));
      return parts;
    }
    const re = this.regex(fs);
    return s.split(new RegExp(re.source + (paragraph ? '|\\n' : ''), re.flags.replace('g', '')));
  }

  getField(i: number): Val {
    if (i < 0) throw new AwkRuntimeError(`attempt to access field ${i}`);
    if (i === 0) {
      this.rebuildIfNeeded();
      return new StrNum(this.record);
    }
    this.splitIfNeeded();
    const f = this.fields[i - 1];
    return f === undefined ? UNINIT : new StrNum(f);
  }

  setField(i: number, v: string) {
    if (i === 0) {
      this.setRecord(v);
      return;
    }
    this.splitIfNeeded();
    while (this.fields.length < i) this.fields.push('');
    this.fields[i - 1] = v;
    this.nf = this.fields.length;
    this.recordValid = false;
  }

  rebuildIfNeeded() {
    if (this.recordValid) return;
    this.record = this.fields.slice(0, this.nf).join(this.sget('OFS'));
    this.recordValid = true;
  }

  regex(src: string): RegExp {
    let r = this.regexCache.get(src);
    if (!r) {
      try {
        r = posixRegex(src, { extended: true });
      } catch {
        throw new AwkRuntimeError(`invalid regular expression: /${src}/`);
      }
      this.regexCache.set(src, r);
    }
    return r;
  }

  toRegex(e: Expr): RegExp {
    if (e.k === 're') return this.regex(e.src);
    return this.regex(this.str(this.eval(e)));
  }

  // ---- input

  readRecord(src: InputSource): string | null {
    if (src.records === null) src.records = this.splitRecords(src.text);
    if (src.pos >= src.records.length) return null;
    return src.records[src.pos++];
  }

  splitRecords(text: string): string[] {
    const rs = this.sget('RS');
    if (rs === '\n') {
      const lines = text.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      return lines;
    }
    if (rs === '') {
      return text
        .replace(/^\n+/, '')
        .split(/\n\n+/)
        .map((r) => r.replace(/\n+$/, ''))
        .filter((r) => r !== '');
    }
    const parts = rs.length === 1 ? text.split(rs) : text.split(this.regex(rs));
    if (parts[parts.length - 1] === '' || parts[parts.length - 1] === '\n') parts.pop();
    return parts;
  }

  nextMainRecord(): boolean {
    for (;;) {
      if (!this.current) {
        const src = this.inputs.shift();
        if (!src) return false;
        this.current = src;
        this.globals.set('FILENAME', src.name === '-' ? '' : src.name);
        this.globals.set('FNR', 0);
      }
      const r = this.readRecord(this.current);
      if (r === null) {
        this.current = null;
        continue;
      }
      this.setRecord(r);
      this.globals.set('NR', this.num(this.getVar('NR')) + 1);
      this.globals.set('FNR', this.num(this.getVar('FNR')) + 1);
      return true;
    }
  }

  // ---- evaluation

  eval(e: Expr): Val {
    this.tick();
    switch (e.k) {
      case 'num':
        return e.v;
      case 'str':
        return e.v;
      case 're':
        return this.regex(e.src).test(this.str(this.getField(0))) ? 1 : 0;
      case 'group':
        return this.eval(e.e);
      case 'var':
        return this.getVar(e.name);
      case 'idx': {
        const a = this.getArray(e.name);
        const key = this.subKey(e.subs);
        const v = a.get(key);
        if (v === undefined) {
          a.set(key, UNINIT);
          return UNINIT;
        }
        return v;
      }
      case 'field':
        return this.getField(Math.trunc(this.num(this.eval(e.e))));
      case 'assign': {
        let v: Val = this.eval(e.e);
        if (e.op !== '=') {
          const cur = this.num(this.eval(e.target));
          const r = this.num(v);
          v = arith(e.op.slice(0, -1), cur, r);
        } else if (v === UNINIT) v = UNINIT;
        else if (v instanceof StrNum) v = new StrNum(v.s);
        this.assign(e.target, v);
        return v;
      }
      case 'cond':
        return this.bool(this.eval(e.c)) ? this.eval(e.a) : this.eval(e.b);
      case 'and':
        return this.bool(this.eval(e.l)) && this.bool(this.eval(e.r)) ? 1 : 0;
      case 'or':
        return this.bool(this.eval(e.l)) || this.bool(this.eval(e.r)) ? 1 : 0;
      case 'in':
        return this.getArray(e.name).has(this.subKey(e.subs)) ? 1 : 0;
      case 'match': {
        const s = this.str(this.eval(e.l));
        const m = this.toRegex(e.r).test(s);
        return m !== e.neg ? 1 : 0;
      }
      case 'bin': {
        const l = this.eval(e.l);
        const r = this.eval(e.r);
        if (['<', '<=', '>', '>=', '==', '!='].includes(e.op)) return this.compare(e.op, l, r) ? 1 : 0;
        return arith(e.op, this.num(l), this.num(r));
      }
      case 'cat':
        return this.str(this.eval(e.l)) + this.str(this.eval(e.r));
      case 'un': {
        const v = this.eval(e.e);
        if (e.op === '!') return this.bool(v) ? 0 : 1;
        if (e.op === '-') return -this.num(v);
        return this.num(v);
      }
      case 'incdec': {
        const old = this.num(this.eval(e.target));
        const nv = e.op === '++' ? old + 1 : old - 1;
        this.assign(e.target, nv);
        return e.prefix ? nv : old;
      }
      case 'call':
        return this.callFunc(e.name, e.args);
      case 'builtin':
        return this.builtin(e.name, e.args);
      case 'getline':
        return this.getline(e);
    }
  }

  subKey(subs: Expr[]): string {
    if (subs.length === 1) {
      const v = this.eval(subs[0]);
      return typeof v === 'number' && Number.isInteger(v) ? String(v) : this.str(v);
    }
    return subs.map((s) => this.str(this.eval(s))).join(this.sget('SUBSEP'));
  }

  assign(target: Expr, v: Val) {
    if (target.k === 'var') this.setVar(target.name, v);
    else if (target.k === 'idx') this.getArray(target.name).set(this.subKey(target.subs), v);
    else if (target.k === 'field') this.setField(Math.trunc(this.num(this.eval(target.e))), this.str(v));
    else if (target.k === 'group') this.assign(target.e, v);
  }

  compare(op: string, l: Val, r: Val): boolean {
    let x: number;
    if (isNumLike(l) && isNumLike(r)) {
      const a = this.num(l);
      const b = this.num(r);
      x = a < b ? -1 : a > b ? 1 : 0;
    } else {
      const a = this.str(l);
      const b = this.str(r);
      x = a < b ? -1 : a > b ? 1 : 0;
    }
    switch (op) {
      case '<': return x < 0;
      case '<=': return x <= 0;
      case '>': return x > 0;
      case '>=': return x >= 0;
      case '==': return x === 0;
      default: return x !== 0;
    }
  }

  callFunc(name: string, args: Expr[]): Val {
    const f = this.prog.funcs.get(name);
    if (!f) throw new AwkRuntimeError(`calling undefined function ${name}`);
    if (this.frames.length > 500) throw new AwkRuntimeError('function call nesting too deep');
    const frame = new Map<string, Val | Map<string, Val>>();
    f.params.forEach((p, i) => {
      const a = args[i];
      if (!a) {
        frame.set(p, UNINIT);
        return;
      }
      // arrays are passed by reference
      if (a.k === 'var') {
        const scope = this.scopeFor(a.name);
        const cur = scope.get(a.name);
        if (cur instanceof Map) {
          frame.set(p, cur);
          return;
        }
        if (cur === undefined && this.paramUsedAsArray(f, p)) {
          const m = new Map<string, Val>();
          scope.set(a.name, m);
          frame.set(p, m);
          return;
        }
      }
      const v = this.eval(a);
      frame.set(p, v instanceof StrNum ? new StrNum(v.s) : v);
    });
    this.frames.push(frame);
    try {
      this.exec(f.body);
      return UNINIT;
    } catch (e) {
      if (e instanceof ReturnSig) return e.v;
      throw e;
    } finally {
      this.frames.pop();
    }
  }

  private arrayParamCache = new Map<Func, Set<string>>();
  /** Does the function use parameter `p` as an array? (decides pass-by-reference for unset args) */
  paramUsedAsArray(f: Func, p: string): boolean {
    let used = this.arrayParamCache.get(f);
    if (!used) {
      const set = new Set<string>();
      const visit = (x: unknown): void => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) {
          x.forEach(visit);
          return;
        }
        const o = x as Record<string, unknown>;
        if ((o.k === 'idx' || o.k === 'in' || o.k === 'delete') && typeof o.name === 'string') set.add(o.name);
        if (o.k === 'forin' && typeof o.arr === 'string') set.add(o.arr);
        if (o.k === 'builtin' && o.name === 'split') {
          const a = (o.args as Expr[])[1];
          if (a?.k === 'var') set.add(a.name);
        }
        for (const v of Object.values(o)) visit(v);
      };
      visit(f.body);
      used = set;
      this.arrayParamCache.set(f, used);
    }
    return used.has(p);
  }

  builtin(name: string, args: Expr[]): Val {
    const a = (i: number) => (args[i] ? this.eval(args[i]) : UNINIT);
    switch (name) {
      case 'length': {
        if (!args.length) return [...this.str(this.getField(0))].length;
        const e = args[0];
        if (e.k === 'var') {
          const v = this.scopeFor(e.name).get(e.name);
          if (v instanceof Map) return v.size;
        }
        return [...this.str(a(0))].length;
      }
      case 'substr': {
        const s = [...this.str(a(0))];
        let m = Math.round(this.num(a(1)));
        let n = args[2] ? Math.round(this.num(a(2))) : Infinity;
        if (m < 1) {
          n = n + m - 1;
          m = 1;
        }
        if (n <= 0) return '';
        return s.slice(m - 1, n === Infinity ? undefined : m - 1 + n).join('');
      }
      case 'index': {
        const s = this.str(a(0));
        const t = this.str(a(1));
        return s.indexOf(t) + 1;
      }
      case 'split': {
        const s = this.str(a(0));
        const arrExpr = args[1];
        if (!arrExpr || arrExpr.k !== 'var') throw new AwkRuntimeError('split: second argument must be an array');
        const arr = this.getArray(arrExpr.name);
        arr.clear();
        let parts: string[];
        if (args[2]) {
          if (args[2].k === 're') parts = s === '' ? [] : s.split(this.regex(args[2].src));
          else parts = this.splitFields(s, this.str(a(2)));
        } else parts = this.splitFields(s, this.sget('FS'));
        parts.forEach((p, i) => arr.set(String(i + 1), new StrNum(p)));
        return parts.length;
      }
      case 'sub':
      case 'gsub': {
        const re = this.toRegex(args[0]);
        const repl = this.str(a(1));
        const target = args[2] ?? { k: 'field', e: { k: 'num', v: 0 } };
        const s = this.str(this.eval(target));
        let count = 0;
        const g = new RegExp(re.source, re.flags.replace('g', '') + (name === 'gsub' ? 'g' : ''));
        const out = s.replace(g, (m) => {
          count++;
          let r = '';
          for (let i = 0; i < repl.length; i++) {
            if (repl[i] === '\\' && repl[i + 1] === '&') {
              r += '&';
              i++;
            } else if (repl[i] === '\\' && repl[i + 1] === '\\') {
              r += '\\';
              i++;
            } else if (repl[i] === '&') r += m;
            else r += repl[i];
          }
          return r;
        });
        if (count) this.assign(target, out);
        return count;
      }
      case 'match': {
        const s = this.str(a(0));
        const re = this.toRegex(args[1]);
        const m = new RegExp(re.source, re.flags.replace('g', '')).exec(s);
        const rstart = m ? [...s.slice(0, m.index)].length + 1 : 0;
        const rlen = m ? [...m[0]].length : -1;
        this.globals.set('RSTART', rstart);
        this.globals.set('RLENGTH', rlen);
        if (args[2] && args[2].k === 'var') {
          const arr = this.getArray(args[2].name);
          arr.clear();
          if (m) m.forEach((g, i) => arr.set(String(i), new StrNum(g ?? '')));
        }
        return rstart;
      }
      case 'sprintf': {
        if (!args.length) return '';
        const vals = args.slice(1).map((x) => this.eval(x));
        return sprintf(this.str(a(0)), vals, (v) => this.str(v), (v) => this.num(v));
      }
      case 'tolower':
        return this.str(a(0)).toLowerCase();
      case 'toupper':
        return this.str(a(0)).toUpperCase();
      case 'int':
        return Math.trunc(this.num(a(0)));
      case 'sqrt':
        return Math.sqrt(this.num(a(0)));
      case 'exp':
        return Math.exp(this.num(a(0)));
      case 'log':
        return Math.log(this.num(a(0)));
      case 'sin':
        return Math.sin(this.num(a(0)));
      case 'cos':
        return Math.cos(this.num(a(0)));
      case 'atan2':
        return Math.atan2(this.num(a(0)), this.num(a(1)));
      case 'rand':
        return this.rand();
      case 'srand': {
        const prev = this.seed;
        this.seed = args.length ? this.num(a(0)) : Math.floor(this.c.vfs.now() / 1000);
        this.rand = mulberry32(this.seed);
        return prev;
      }
      case 'systime':
        return Math.floor(this.c.vfs.now() / 1000);
      case 'strftime': {
        const fmt = args.length ? this.str(a(0)) : '%a %b %e %H:%M:%S %Z %Y';
        const ts = args.length > 1 ? this.num(a(1)) : Math.floor(this.c.vfs.now() / 1000);
        return strftime(ts * 1000, fmt);
      }
      case 'close': {
        const k = this.str(a(0));
        const o = this.outputs.get(k);
        if (o) {
          this.flushOutput(k, o);
          this.outputs.delete(k);
        }
        this.fileReaders.delete(k);
        return 0;
      }
      case 'fflush':
        return 0;
      case 'system': {
        const cmd = this.str(a(0));
        this.pendingCmds.push({ cmd, input: '' });
        this.out += `\u0000CMD${this.pendingCmds.length - 1}\u0000`;
        return 0;
      }
      case 'gensub': {
        const re = this.toRegex(args[0]);
        const repl = this.str(a(1));
        const how = this.str(a(2));
        const target = args[3] ? this.str(a(3)) : this.str(this.getField(0));
        const global = /^[gG]/.test(how);
        const which = global ? 0 : Math.max(1, Math.trunc(this.num(a(2))) || 1);
        let n = 0;
        const g = new RegExp(re.source, re.flags.replace('g', '') + 'g');
        return target.replace(g, (...m) => {
          n++;
          if (!global && n !== which) return m[0];
          return repl.replace(/\\(\d)|&/g, (x, d) => (x === '&' ? m[0] : d === '0' ? m[0] : (m[Number(d)] as string) ?? ''));
        });
      }
    }
    throw new AwkRuntimeError(`function ${name} not supported`);
  }

  getline(e: Expr & { k: 'getline' }): Val {
    if (e.cmd) throw new AwkRuntimeError('"cmd" | getline is not available in the simulator');
    if (e.file) {
      const name = this.str(this.eval(e.file));
      let r = this.fileReaders.get(name);
      if (!r) {
        let text: string;
        try {
          text = name === '-' || name === '/dev/stdin' ? '' : this.c.vfs.readFile(this.c.abs(name), this.c.cred);
        } catch {
          return -1;
        }
        r = { lines: this.splitRecords(text), pos: 0 };
        this.fileReaders.set(name, r);
      }
      if (r.pos >= r.lines.length) return 0;
      const line = r.lines[r.pos++];
      if (e.target) this.assign(e.target, new StrNum(line));
      else {
        this.setRecord(line);
      }
      return 1;
    }
    // from main input
    if (!this.current) {
      const src = this.inputs.shift();
      if (!src) return 0;
      this.current = src;
      this.globals.set('FILENAME', src.name === '-' ? '' : src.name);
    }
    const r = this.readRecord(this.current);
    if (r === null) {
      this.current = null;
      return this.getline(e);
    }
    this.globals.set('NR', this.num(this.getVar('NR')) + 1);
    this.globals.set('FNR', this.num(this.getVar('FNR')) + 1);
    if (e.target) this.assign(e.target, new StrNum(r));
    else this.setRecord(r);
    return 1;
  }

  write(s: string, redir?: { op: string; e: Expr }) {
    if (!redir) {
      this.out += s;
      return;
    }
    const key = this.str(this.eval(redir.e));
    if (key === '/dev/stdout' || key === '-') {
      this.out += s;
      return;
    }
    if (key === '/dev/stderr') {
      this.c.stderr.write(s);
      return;
    }
    let o = this.outputs.get(key);
    if (!o) {
      o = { kind: redir.op as '>' | '>>' | '|', buf: '' };
      this.outputs.set(key, o);
      if (redir.op === '>') {
        try {
          this.c.vfs.writeFile(this.c.abs(key), '', { cred: this.c.cred });
        } catch (er) {
          throw new AwkRuntimeError(`can't redirect to \`${key}' (${er instanceof FsError ? er.message : er})`);
        }
      }
    }
    if (o.kind === '|') o.buf += s;
    else {
      try {
        this.c.vfs.writeFile(this.c.abs(key), s, { append: true, cred: this.c.cred });
      } catch (er) {
        throw new AwkRuntimeError(`can't redirect to \`${key}' (${er instanceof FsError ? er.message : er})`);
      }
    }
  }

  flushOutput(key: string, o: { kind: string; buf: string }) {
    if (o.kind === '|') {
      this.pendingCmds.push({ cmd: key, input: o.buf });
      this.out += `\u0000CMD${this.pendingCmds.length - 1}\u0000`;
    }
  }

  exec(s: Stmt): void {
    this.tick();
    switch (s.k) {
      case 'block':
        for (const x of s.body) this.exec(x);
        return;
      case 'expr':
        this.eval(s.e);
        return;
      case 'print': {
        const ofs = this.sget('OFS');
        const ors = this.sget('ORS');
        const text = s.args.length ? s.args.map((x) => this.outStr(this.eval(x))).join(ofs) : this.str(this.getField(0));
        this.write(text + ors, s.redir);
        return;
      }
      case 'printf': {
        if (!s.args.length) throw new AwkRuntimeError('printf: no format');
        const vals = s.args.map((x) => this.eval(x));
        this.write(
          sprintf(this.str(vals[0]), vals.slice(1), (v) => this.str(v), (v) => this.num(v)),
          s.redir,
        );
        return;
      }
      case 'if':
        if (this.bool(this.eval(s.c))) this.exec(s.a);
        else if (s.b) this.exec(s.b);
        return;
      case 'while':
        while (this.bool(this.eval(s.c))) {
          try {
            this.exec(s.body);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
        }
        return;
      case 'do':
        do {
          try {
            this.exec(s.body);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
        } while (this.bool(this.eval(s.c)));
        return;
      case 'for':
        if (s.init) this.exec(s.init);
        while (!s.c || this.bool(this.eval(s.c))) {
          try {
            this.exec(s.body);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (!(e instanceof ContinueSig)) throw e;
          }
          if (s.step) this.exec(s.step);
        }
        return;
      case 'forin': {
        const arr = this.getArray(s.arr);
        for (const k of [...arr.keys()]) {
          if (!arr.has(k)) continue;
          this.setVar(s.v, new StrNum(k));
          try {
            this.exec(s.body);
          } catch (e) {
            if (e instanceof BreakSig) break;
            if (e instanceof ContinueSig) continue;
            throw e;
          }
        }
        return;
      }
      case 'next':
        throw new NextSig();
      case 'nextfile':
        throw new NextFileSig();
      case 'exit':
        throw new ExitSig(s.e ? Math.trunc(this.num(this.eval(s.e))) : -1);
      case 'return':
        throw new ReturnSig(s.e ? this.eval(s.e) : UNINIT);
      case 'break':
        throw new BreakSig();
      case 'continue':
        throw new ContinueSig();
      case 'delete': {
        const arr = this.getArray(s.name);
        if (s.subs) arr.delete(this.subKey(s.subs));
        else arr.clear();
        return;
      }
      case 'getline':
        this.eval(s.e);
        return;
    }
  }

  run(): number {
    let code = 0;
    let exiting = false;
    const rules = this.prog.rules;
    const begins = rules.filter((r) => r.kind === 'begin');
    const ends = rules.filter((r) => r.kind === 'end');
    const mains = rules.filter((r) => r.kind === 'main');
    try {
      for (const r of begins) this.exec(r.action!);
    } catch (e) {
      if (e instanceof ExitSig) {
        exiting = true;
        if (e.code >= 0) code = e.code;
      } else throw e;
    }
    if (!exiting && (mains.length || ends.length)) {
      try {
        while (this.nextMainRecord()) {
          try {
            mains.forEach((r, idx) => {
              let matched: boolean;
              if (r.range) {
                if (!this.rangeActive[idx]) {
                  if (this.bool(this.eval(r.range[0]))) {
                    matched = true;
                    this.rangeActive[idx] = !this.bool(this.eval(r.range[1]));
                  } else matched = false;
                } else {
                  matched = true;
                  if (this.bool(this.eval(r.range[1]))) this.rangeActive[idx] = false;
                }
              } else matched = r.pattern ? this.bool(this.eval(r.pattern)) : true;
              if (!matched) return;
              if (r.action) this.exec(r.action);
              else this.out += this.str(this.getField(0)) + this.sget('ORS');
            });
          } catch (e) {
            if (e instanceof NextSig) continue;
            if (e instanceof NextFileSig) {
              this.current = null;
              continue;
            }
            throw e;
          }
        }
      } catch (e) {
        if (e instanceof ExitSig) {
          if (e.code >= 0) code = e.code;
        } else throw e;
      }
    }
    try {
      for (const r of ends) this.exec(r.action!);
    } catch (e) {
      if (e instanceof ExitSig) {
        if (e.code >= 0) code = e.code;
      } else throw e;
    }
    for (const [k, o] of this.outputs) this.flushOutput(k, o);
    this.outputs.clear();
    return code;
  }
}

function arith(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) throw new AwkRuntimeError('division by zero');
      return a / b;
    case '%':
      if (b === 0) throw new AwkRuntimeError('division by zero in %');
      return a % b;
    case '^': return a ** b;
  }
  return 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function unescapeAssign(s: string): string {
  return s.replace(/\\(n|t|\\|")/g, (_m, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
}

// ------------------------------------------------------------------ command

register(['awk', 'gawk', 'mawk', 'nawk'], async (c) => {
  const args = [...c.args];
  let fs: string | null = null;
  const assigns: [string, string][] = [];
  let progSrc: string | null = null;
  while (args.length) {
    const a = args[0];
    if (a === '--') {
      args.shift();
      break;
    }
    if (a === '-F') {
      args.shift();
      fs = args.shift() ?? ' ';
    } else if (a.startsWith('-F')) {
      args.shift();
      fs = a.slice(2);
    } else if (a === '-v') {
      args.shift();
      const kv = args.shift() ?? '';
      const i = kv.indexOf('=');
      if (i <= 0) {
        c.err(`\`${kv}' argument to \`-v' not in \`var=value' form`);
        return 2;
      }
      assigns.push([kv.slice(0, i), kv.slice(i + 1)]);
    } else if (a.startsWith('-v') && a.includes('=')) {
      args.shift();
      const kv = a.slice(2);
      const i = kv.indexOf('=');
      assigns.push([kv.slice(0, i), kv.slice(i + 1)]);
    } else if (a === '-f') {
      args.shift();
      const f = args.shift();
      if (!f) {
        c.err('option requires an argument -- f');
        return 2;
      }
      const t = await readText(c, f);
      if (t === null) return 2;
      progSrc = (progSrc ?? '') + t + '\n';
    } else if (a.startsWith('-') && a.length > 1 && progSrc === null) {
      c.err(`unknown option ${a} ignored`);
      args.shift();
    } else break;
  }
  if (progSrc === null) {
    const p = args.shift();
    if (p === undefined) {
      c.stderr.write("usage: awk [-F fs][-v var=value][prog | -f progfile][file ...]\n");
      return 2;
    }
    progSrc = p;
  }
  let prog;
  try {
    prog = new AwkParser(lex(progSrc)).parse();
  } catch (e) {
    if (e instanceof AwkSyntaxError) {
      c.stderr.write(`awk: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  const awk = new Awk(prog, c);
  if (fs !== null) awk.globals.set('FS', fs === 't' ? '\t' : unescapeAssign(fs));
  for (const [k, v] of assigns) awk.globals.set(k, new StrNum(unescapeAssign(v)));
  // operands: files and var=value assignments (processed in order before reading that file)
  const needsInput = prog.rules.some((r) => r.kind !== 'begin');
  let status = 0;
  const operands = args;
  const argv = new Map<string, Val>([['0', 'awk']]);
  operands.forEach((o, i) => argv.set(String(i + 1), new StrNum(o)));
  awk.globals.set('ARGV', argv);
  awk.globals.set('ARGC', operands.length + 1);
  if (needsInput) {
    const fileOps = operands.filter((o) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(o));
    for (const o of operands) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(o);
      if (m) {
        // simplification: apply assignment up front
        awk.globals.set(m[1], new StrNum(unescapeAssign(m[2])));
        continue;
      }
    }
    const sources = fileOps.length ? fileOps : ['-'];
    for (const f of sources) {
      let text: string | null;
      if (f === '-' || f === '/dev/stdin') text = await c.stdin.readAll();
      else {
        const node = c.vfs.tryLookup(c.abs(f));
        if (node && node.type === 'dir') {
          c.stderr.write(`awk: warning: command line argument \`${f}' is a directory: skipped\n`);
          continue;
        }
        try {
          text = c.vfs.readFile(c.abs(f), c.cred);
        } catch (e) {
          c.stderr.write(`awk: cannot open "${f}" (${e instanceof FsError ? e.message : e})\n`);
          status = 2;
          continue;
        }
      }
      awk.inputs.push({ name: f, text, records: null, pos: 0 });
    }
  }
  let code: number;
  try {
    code = awk.run();
  } catch (e) {
    if (e instanceof AwkRuntimeError) {
      c.stdout.write(awk.out.replace(/\u0000CMD\d+\u0000/g, ''));
      const nr = String(awk.globals.get('NR') ?? 0);
      const fname = awk.str((awk.globals.get('FILENAME') as Val) ?? '') || '-';
      c.stderr.write(`awk: cmd. line:1: (FILENAME=${fname} FNR=${nr}) fatal: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
  // replay output, running piped commands / system() in order
  const pieces = awk.out.split(/\u0000CMD(\d+)\u0000/);
  for (let i = 0; i < pieces.length; i++) {
    if (i % 2 === 0) {
      if (pieces[i]) c.stdout.write(pieces[i]);
    } else {
      const p = awk.pendingCmds[Number(pieces[i])];
      const sub = c.sh.subshell();
      const out = new StringWriter();
      await sub.run(p.cmd, { stdin: new InBuf(p.input), stdout: out, stderr: c.stderr });
      c.stdout.write(out.buf);
    }
  }
  return code || status;
});
