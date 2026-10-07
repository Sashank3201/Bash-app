// Bash arithmetic: $(( )), (( )), let, array subscripts. 64-bit signed integers via BigInt.

export class ArithError extends Error {}

export interface ArithEnv {
  /** Raw string value of a variable (or array element). */
  get(name: string, index?: string): string | undefined;
  set(name: string, value: bigint, index?: string): void;
}

type AExpr =
  | { k: 'num'; v: bigint }
  | { k: 'var'; name: string; index?: string }
  | { k: 'un'; op: string; e: AExpr }
  | { k: 'bin'; op: string; l: AExpr; r: AExpr }
  | { k: 'assign'; op: string; target: AExpr & { k: 'var' }; e: AExpr }
  | { k: 'pre'; op: string; target: AExpr & { k: 'var' } }
  | { k: 'post'; op: string; target: AExpr & { k: 'var' } }
  | { k: 'tern'; c: AExpr; a: AExpr; b: AExpr }
  | { k: 'comma'; l: AExpr; r: AExpr };

type Tok = { t: 'num'; v: bigint; s: string } | { t: 'id'; name: string; index?: string; s: string } | { t: 'op'; v: string; s: string };

const OPS = [
  '<<=', '>>=', '**', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '^=', '|=',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '~', '&', '^', '|', '?', ':', ',', '(', ')',
];

const wrap = (x: bigint) => BigInt.asIntN(64, x);

/** Parse an integer constant the way bash does (decimal, 0x hex, 0 octal, base#digits). */
export function parseIntLiteral(s: string): bigint | null {
  const t = s.trim();
  let m = /^([+-]?)0[xX]([0-9a-fA-F]+)$/.exec(t);
  if (m) return wrap(BigInt((m[1] === '-' ? '-' : '') + '0x' + m[2]) * 1n);
  m = /^([+-]?)(\d+)#([0-9a-zA-Z@_]+)$/.exec(t);
  if (m) {
    const base = Number(m[2]);
    if (base < 2 || base > 64) throw new ArithError(`${t}: invalid arithmetic base (error token is "${t}")`);
    let v = 0n;
    for (const ch of m[3]) {
      let d: number;
      if (/[0-9]/.test(ch)) d = ch.charCodeAt(0) - 48;
      else if (/[a-z]/.test(ch)) d = ch.charCodeAt(0) - 97 + 10;
      else if (/[A-Z]/.test(ch)) d = base <= 36 ? ch.charCodeAt(0) - 65 + 10 : ch.charCodeAt(0) - 65 + 36;
      else if (ch === '@') d = 62;
      else d = 63;
      if (d >= base) throw new ArithError(`${t}: value too great for base (error token is "${t}")`);
      v = v * BigInt(base) + BigInt(d);
    }
    return wrap(m[1] === '-' ? -v : v);
  }
  m = /^([+-]?)0([0-9]+)$/.exec(t);
  if (m) {
    if (/[89]/.test(m[2])) throw new ArithError(`${t}: value too great for base (error token is "${t}")`);
    const v = BigInt('0o' + m[2]);
    return wrap(m[1] === '-' ? -v : v);
  }
  m = /^([+-]?)(\d+)$/.exec(t);
  if (m) return wrap(BigInt(t));
  return null;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^(0[xX][0-9a-fA-F]+|\d+#[0-9a-zA-Z@_]+|\d+)/.exec(src.slice(i))!;
      const lit = m[0];
      // reject things like 12abc
      if (/[A-Za-z_]/.test(src[i + lit.length] ?? '')) {
        const bad = /^[0-9A-Za-z_]+/.exec(src.slice(i))![0];
        throw new ArithError(`${bad}: value too great for base (error token is "${bad}")`);
      }
      const v = parseIntLiteral(lit);
      toks.push({ t: 'num', v: v!, s: lit });
      i += lit.length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const name = src.slice(i, j);
      let index: string | undefined;
      if (src[j] === '[') {
        let depth = 0;
        let k = j;
        for (; k < src.length; k++) {
          if (src[k] === '[') depth++;
          else if (src[k] === ']') {
            depth--;
            if (depth === 0) break;
          }
        }
        if (k >= src.length) throw new ArithError(`${src.slice(i)}: bad array subscript`);
        index = src.slice(j + 1, k);
        j = k + 1;
      }
      toks.push({ t: 'id', name, index, s: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ArithError(`syntax error: invalid arithmetic operator (error token is "${src.slice(i)}")`);
    toks.push({ t: 'op', v: op, s: op });
    i += op.length;
  }
  return toks;
}

const BIN_PREC: Record<string, number> = {
  '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8, '==': 9, '!=': 9,
  '<': 10, '>': 10, '<=': 10, '>=': 10, '<<': 11, '>>': 11,
  '+': 12, '-': 12, '*': 13, '/': 13, '%': 13, '**': 14,
};
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '^=', '|=']);

class ArithParser {
  i = 0;
  constructor(
    private toks: Tok[],
    private src: string,
  ) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  private rest(): string {
    const t = this.toks.slice(this.i);
    return t.map((x) => x.s).join(' ');
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'op' && t.v === v;
  }

  parse(): AExpr {
    if (!this.toks.length) return { k: 'num', v: 0n };
    const e = this.comma();
    if (this.i < this.toks.length) throw new ArithError(`syntax error in expression (error token is "${this.rest()}")`);
    return e;
  }

  private comma(): AExpr {
    let l = this.assign();
    while (this.isOp(',')) {
      this.i++;
      l = { k: 'comma', l, r: this.assign() };
    }
    return l;
  }

  private assign(): AExpr {
    const t = this.peek();
    const n = this.toks[this.i + 1];
    if (t && t.t === 'id' && n && n.t === 'op' && ASSIGN_OPS.has(n.v)) {
      this.i += 2;
      return { k: 'assign', op: n.v, target: { k: 'var', name: t.name, index: t.index }, e: this.assign() };
    }
    return this.ternary();
  }

  private ternary(): AExpr {
    const c = this.binary(4);
    if (this.isOp('?')) {
      this.i++;
      const a = this.assign();
      if (!this.isOp(':')) throw new ArithError(`syntax error in expression (error token is "${this.rest()}")`);
      this.i++;
      const b = this.assign();
      return { k: 'tern', c, a, b };
    }
    return c;
  }

  private binary(minPrec: number): AExpr {
    let l = this.unary();
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'op') break;
      const p = BIN_PREC[t.v];
      if (p === undefined || p < minPrec) break;
      this.i++;
      const r = t.v === '**' ? this.binary(p) : this.binary(p + 1);
      l = { k: 'bin', op: t.v, l, r };
    }
    return l;
  }

  private unary(): AExpr {
    const t = this.peek();
    if (!t) throw new ArithError(`syntax error: operand expected (error token is "${this.src.trim()}")`);
    if (t.t === 'op') {
      if (t.v === '++' || t.v === '--') {
        this.i++;
        const v = this.peek();
        if (!v || v.t !== 'id') throw new ArithError(`syntax error: operand expected (error token is "${this.rest()}")`);
        this.i++;
        return { k: 'pre', op: t.v, target: { k: 'var', name: v.name, index: v.index } };
      }
      if (t.v === '!' || t.v === '~' || t.v === '-' || t.v === '+') {
        this.i++;
        return { k: 'un', op: t.v, e: this.unary() };
      }
      if (t.v === '(') {
        this.i++;
        const e = this.comma();
        if (!this.isOp(')')) throw new ArithError(`missing \`)' (error token is "${this.rest()}")`);
        this.i++;
        return e;
      }
      throw new ArithError(`syntax error: operand expected (error token is "${this.rest()}")`);
    }
    this.i++;
    if (t.t === 'num') return { k: 'num', v: t.v };
    const target = { k: 'var' as const, name: t.name, index: t.index };
    const n = this.peek();
    if (n && n.t === 'op' && (n.v === '++' || n.v === '--')) {
      this.i++;
      return { k: 'post', op: n.v, target };
    }
    return target;
  }
}

export function evalArith(src: string, env: ArithEnv, depth = 0): bigint {
  if (depth > 16) throw new ArithError(`${src}: expression recursion level exceeded`);
  const ast = new ArithParser(tokenize(src), src).parse();
  return evalNode(ast, env, depth);
}

function readVar(name: string, index: string | undefined, env: ArithEnv, depth: number): bigint {
  const raw = env.get(name, index);
  if (raw === undefined || raw.trim() === '') return 0n;
  const lit = parseIntLiteral(raw);
  if (lit !== null) return lit;
  return evalArith(raw, env, depth + 1);
}

function evalNode(e: AExpr, env: ArithEnv, depth: number): bigint {
  switch (e.k) {
    case 'num':
      return e.v;
    case 'var':
      return readVar(e.name, e.index, env, depth);
    case 'un': {
      const v = evalNode(e.e, env, depth);
      if (e.op === '!') return v === 0n ? 1n : 0n;
      if (e.op === '~') return wrap(~v);
      if (e.op === '-') return wrap(-v);
      return v;
    }
    case 'pre':
    case 'post': {
      const old = readVar(e.target.name, e.target.index, env, depth);
      const nv = wrap(e.op === '++' ? old + 1n : old - 1n);
      env.set(e.target.name, nv, e.target.index);
      return e.k === 'pre' ? nv : old;
    }
    case 'assign': {
      const rhs = evalNode(e.e, env, depth);
      let v = rhs;
      if (e.op !== '=') {
        const cur = readVar(e.target.name, e.target.index, env, depth);
        v = binop(e.op.slice(0, -1), cur, rhs);
      }
      env.set(e.target.name, v, e.target.index);
      return v;
    }
    case 'tern':
      return evalNode(e.c, env, depth) !== 0n ? evalNode(e.a, env, depth) : evalNode(e.b, env, depth);
    case 'comma':
      evalNode(e.l, env, depth);
      return evalNode(e.r, env, depth);
    case 'bin': {
      if (e.op === '&&') return evalNode(e.l, env, depth) !== 0n && evalNode(e.r, env, depth) !== 0n ? 1n : 0n;
      if (e.op === '||') return evalNode(e.l, env, depth) !== 0n || evalNode(e.r, env, depth) !== 0n ? 1n : 0n;
      return binop(e.op, evalNode(e.l, env, depth), evalNode(e.r, env, depth));
    }
  }
}

function binop(op: string, a: bigint, b: bigint): bigint {
  switch (op) {
    case '+': return wrap(a + b);
    case '-': return wrap(a - b);
    case '*': return wrap(a * b);
    case '/':
      if (b === 0n) throw new ArithError('division by 0 (error token is "0")');
      return wrap(a / b);
    case '%':
      if (b === 0n) throw new ArithError('division by 0 (error token is "0")');
      return wrap(a % b);
    case '**':
      if (b < 0n) throw new ArithError('exponent less than 0 (error token is "' + b + '")');
      return wrap(a ** b);
    case '<<': return wrap(a << (b & 63n));
    case '>>': return wrap(a >> (b & 63n));
    case '<': return a < b ? 1n : 0n;
    case '>': return a > b ? 1n : 0n;
    case '<=': return a <= b ? 1n : 0n;
    case '>=': return a >= b ? 1n : 0n;
    case '==': return a === b ? 1n : 0n;
    case '!=': return a !== b ? 1n : 0n;
    case '&': return wrap(a & b);
    case '^': return wrap(a ^ b);
    case '|': return wrap(a | b);
  }
  throw new ArithError(`unknown operator ${op}`);
}
