// Hand-written recursive-descent parser for a large Bash subset.
// Lexing is on demand so the parser can switch modes for $( ), (( )), [[ =~ ]], heredocs, etc.

import type { Assign, CondExpr, Node, ParamExp, Program, Redir, RedirOp, Word, WordPart } from './ast';
import { IncompleteInput, ShellSyntaxError, UnsupportedError } from './errors';

type Tok =
  | { k: 'word'; w: Word; start: number; line: number; arr?: ArrayLit }
  | { k: 'op'; v: string; fd?: number; start: number; line: number }
  | { k: 'nl'; start: number; line: number }
  | { k: 'eof'; start: number; line: number };

interface ArrayLit {
  name: string;
  append: boolean;
  elems: { key?: string; value: Word }[];
}

interface Stops {
  words?: string[];
  ops?: string[];
}

const OPS = [
  ';;&', '<<<', '<<-', '&>>',
  '&&', '||', ';;', ';&', '|&', '<<', '>>', '&>', '>&', '<&', '<>', '>|',
  '|', '&', ';', '(', ')', '<', '>',
];
const REDIR_OPS = new Set(['>', '>>', '<', '<<', '<<-', '<<<', '>&', '<&', '&>', '&>>', '>|', '<>']);
const META = new Set([' ', '\t', '\n', '\r', '|', '&', ';', '(', ')', '<', '>']);
const COND_UNARY = new Set([
  '-a', '-b', '-c', '-d', '-e', '-f', '-g', '-h', '-k', '-p', '-r', '-s', '-t', '-u', '-w', '-x',
  '-G', '-L', '-N', '-O', '-S', '-z', '-n', '-v', '-o',
]);
const COND_BINARY = new Set(['==', '=', '!=', '=~', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-nt', '-ot', '-ef']);
const TERMINATOR_WORDS = new Set(['then', 'elif', 'else', 'fi', 'do', 'done', 'esac', '}', 'in']);

export interface ParseOptions {
  /** In interactive mode an unterminated heredoc is "incomplete" rather than silently closed. */
  interactive?: boolean;
}

/** Literal text of a word if it is a plain unquoted literal, else null. */
export function wordLiteral(w: Word): string | null {
  if (w.parts.length === 1 && w.parts[0].t === 'lit') return w.parts[0].v;
  return null;
}

/** The word with all quoting removed, ignoring expansions (used for heredoc delimiters). */
function wordText(w: Word): string {
  let s = '';
  const walk = (parts: WordPart[]) => {
    for (const p of parts) {
      if (p.t === 'lit' || p.t === 'q') s += p.v;
      else if (p.t === 'dq') walk(p.parts);
      else if (p.t === 'param') s += '$' + p.p.name;
      else if (p.t === 'cmd') s += '$(' + p.src + ')';
      else if (p.t === 'arith') s += '$((' + p.expr + '))';
      else if (p.t === 'procsub') s += '<(' + p.src + ')';
    }
  };
  walk(w.parts);
  return s;
}

function hasQuoting(w: Word): boolean {
  return w.parts.some((p) => p.t === 'q' || p.t === 'dq');
}

function tokDisplay(t: Tok): string {
  if (t.k === 'op') return t.v;
  if (t.k === 'word') return t.w.raw;
  if (t.k === 'nl') return 'newline';
  return 'EOF';
}

export class Parser {
  pos: number;
  line: number;
  private buf: Tok | null = null;
  private pending: { redir: Redir; delim: string; strip: boolean }[] = [];
  private readonly len: number;

  constructor(
    private readonly src: string,
    start = 0,
    line = 1,
    private readonly opts: ParseOptions = {},
  ) {
    this.pos = start;
    this.line = line;
    this.len = src.length;
  }

  // ------------------------------------------------------------------ entry points

  parseProgram(): Program {
    const list = this.parseList({});
    const t = this.peek();
    if (t.k !== 'eof') throw this.unexpected(t);
    this.finishHeredocsAtEof();
    return list;
  }

  /**
   * Parse one input line at a time (like bash reading a script): a syntax error on line 10
   * only surfaces after lines 1–9 have run. Returns null at end of input.
   */
  nextLine(): { node: Node; bg: boolean }[] | null {
    this.skipNewlines();
    if (this.peek().k === 'eof') {
      this.finishHeredocsAtEof();
      return null;
    }
    const items: { node: Node; bg: boolean }[] = [];
    for (;;) {
      const node = this.parseAndOr();
      let bg = false;
      const s = this.peek();
      if (s.k === 'op' && (s.v === ';' || s.v === '&')) {
        this.next();
        bg = s.v === '&';
        items.push({ node, bg });
        const n = this.peek();
        if (n.k === 'nl') {
          this.next();
          return items;
        }
        if (n.k === 'eof') return items;
        continue;
      }
      items.push({ node, bg });
      if (s.k === 'nl') {
        this.next();
        return items;
      }
      if (s.k === 'eof') return items;
      throw this.unexpected(s);
    }
  }

  /** Parse the body of $( ... ) — stops after the matching ')'. */
  parseCommandSubstitution(): Program {
    const list = this.parseList({ ops: [')'] });
    const t = this.peek();
    if (t.k === 'eof') throw new IncompleteInput('$(');
    if (t.k !== 'op' || t.v !== ')') throw this.unexpected(t);
    this.next();
    return list;
  }

  // ------------------------------------------------------------------ tokens

  private peek(): Tok {
    if (!this.buf) this.buf = this.readToken();
    return this.buf;
  }

  private next(): Tok {
    const t = this.peek();
    this.buf = null;
    if (t.k === 'nl' && this.pending.length) this.readHeredocBodies();
    return t;
  }

  /** Drop a peeked token so raw reading can restart from its first character. */
  private unpeek() {
    if (this.buf) {
      this.pos = this.buf.start;
      this.line = this.buf.line;
      this.buf = null;
    }
  }

  private skipNewlines() {
    while (this.peek().k === 'nl') this.next();
  }

  private isWord(t: Tok, v: string): boolean {
    return t.k === 'word' && wordLiteral(t.w) === v;
  }

  private isStop(t: Tok, stops: Stops): boolean {
    if (t.k === 'word' && stops.words) {
      const lit = wordLiteral(t.w);
      if (lit !== null && stops.words.includes(lit)) return true;
    }
    if (t.k === 'op' && stops.ops && stops.ops.includes(t.v)) return true;
    return false;
  }

  private unexpected(t: Tok): Error {
    if (t.k === 'eof') return new IncompleteInput('command');
    const shown = tokDisplay(t);
    return new ShellSyntaxError(`syntax error near unexpected token \`${shown}'`, t.line, shown);
  }

  private skipBlanks() {
    for (;;) {
      const c = this.src[this.pos];
      if (c === ' ' || c === '\t' || c === '\r') {
        this.pos++;
      } else if (c === '\\' && this.src[this.pos + 1] === '\n') {
        this.pos += 2;
        this.line++;
      } else if (c === '\\' && this.pos + 1 >= this.len) {
        throw new IncompleteInput('\\');
      } else if (c === '#') {
        while (this.pos < this.len && this.src[this.pos] !== '\n') this.pos++;
      } else {
        return;
      }
    }
  }

  private readToken(): Tok {
    this.skipBlanks();
    const start = this.pos;
    const line = this.line;
    if (this.pos >= this.len) return { k: 'eof', start, line };
    const c = this.src[this.pos];
    if (c === '\n') {
      this.pos++;
      this.line++;
      return { k: 'nl', start, line };
    }
    let fd: number | undefined;
    const m = /^[0-9]+(?=[<>])/.exec(this.src.slice(this.pos, this.pos + 6));
    if (m) {
      fd = Number(m[0]);
      this.pos += m[0].length;
    }
    if (fd === undefined && this.src.startsWith('>(', this.pos)) throw new UnsupportedError('Output process substitution >(...)');
    if (fd === undefined && this.src.startsWith('<(', this.pos)) {
      return { k: 'word', w: this.readWord((ch) => META.has(ch)), start, line };
    }
    for (const op of OPS) {
      if (this.src.startsWith(op, this.pos)) {
        this.pos += op.length;
        return { k: 'op', v: op, fd, start, line };
      }
    }
    if (fd !== undefined) {
      // digits that turned out not to be followed by an operator we know
      this.pos = start;
    }
    const w = this.readWord((ch) => META.has(ch));
    const lit = wordLiteral(w);
    const am = lit !== null ? /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=$/.exec(lit) : null;
    if (am && this.src[this.pos] === '(') {
      const arr = this.readArrayLiteral(am[1], am[2] === '+');
      return { k: 'word', w: { parts: [{ t: 'lit', v: this.src.slice(start, this.pos) }], raw: this.src.slice(start, this.pos) }, start, line, arr };
    }
    return { k: 'word', w, start, line };
  }

  private readArrayLiteral(name: string, append: boolean): ArrayLit {
    this.pos++; // (
    const elems: ArrayLit['elems'] = [];
    for (;;) {
      while (this.pos < this.len && /[ \t\r\n]/.test(this.src[this.pos])) {
        if (this.src[this.pos] === '\n') this.line++;
        this.pos++;
      }
      if (this.src[this.pos] === '#') {
        while (this.pos < this.len && this.src[this.pos] !== '\n') this.pos++;
        continue;
      }
      if (this.pos >= this.len) throw new IncompleteInput('(');
      if (this.src[this.pos] === ')') {
        this.pos++;
        break;
      }
      let key: string | undefined;
      const km = /^\[([^\]]*)\]=/.exec(this.src.slice(this.pos));
      if (km) {
        key = km[1];
        this.pos += km[0].length;
      }
      const value = this.readWord((ch) => META.has(ch));
      elems.push({ key, value });
    }
    return { name, append, elems };
  }

  // ------------------------------------------------------------------ words

  /**
   * Read word parts until `stop(ch)` is true for an unquoted character.
   * `braceMode` tracks literal braces so `${x:-{a}}` stops at the right `}`.
   */
  readWord(stop: (ch: string) => boolean, braceMode = false): Word {
    const start = this.pos;
    const parts: WordPart[] = [];
    let lit = '';
    let depth = 0;
    const flush = () => {
      if (lit) {
        parts.push({ t: 'lit', v: lit });
        lit = '';
      }
    };
    while (this.pos < this.len) {
      const c = this.src[this.pos];
      if (c === '\\') {
        const n = this.src[this.pos + 1];
        if (n === undefined) throw new IncompleteInput('\\');
        if (n === '\n') {
          this.pos += 2;
          this.line++;
          continue;
        }
        flush();
        parts.push({ t: 'q', v: n });
        this.pos += 2;
        continue;
      }
      if (c === '<' && this.src[this.pos + 1] === '(') {
        // process substitution <( ... )
        flush();
        const sub = new Parser(this.src, this.pos + 2, this.line, this.opts);
        const body = sub.parseCommandSubstitution();
        parts.push({ t: 'procsub', src: this.src.slice(this.pos + 2, sub.pos - 1), body });
        this.pos = sub.pos;
        this.line = sub.line;
        continue;
      }
      if (braceMode) {
        if (c === '{') depth++;
        else if (c === '}') {
          if (depth === 0) break;
          depth--;
        }
      }
      if (stop(c)) break;
      if (c === "'") {
        const end = this.src.indexOf("'", this.pos + 1);
        if (end < 0) throw new IncompleteInput("'");
        flush();
        const v = this.src.slice(this.pos + 1, end);
        this.line += countNl(v);
        parts.push({ t: 'q', v });
        this.pos = end + 1;
        continue;
      }
      if (c === '"') {
        flush();
        this.pos++;
        parts.push(this.readDoubleBody(false));
        continue;
      }
      if (c === '`') {
        flush();
        parts.push(this.readBacktick());
        continue;
      }
      if (c === '$') {
        const p = this.readDollar(false);
        if (p) {
          flush();
          parts.push(p);
          continue;
        }
        lit += '$';
        this.pos++;
        continue;
      }
      if (c === '\n') this.line++;
      lit += c;
      this.pos++;
    }
    flush();
    return { parts, raw: this.src.slice(start, this.pos) };
  }

  /** Body of a double-quoted string; `toEof` is used for heredoc bodies. Position is after the opening quote. */
  readDoubleBody(toEof: boolean): WordPart & { t: 'dq' } {
    const parts: WordPart[] = [];
    let lit = '';
    const flush = () => {
      if (lit) {
        parts.push({ t: 'q', v: lit });
        lit = '';
      }
    };
    for (;;) {
      if (this.pos >= this.len) {
        if (toEof) break;
        throw new IncompleteInput('"');
      }
      const c = this.src[this.pos];
      if (c === '"' && !toEof) {
        this.pos++;
        break;
      }
      if (c === '\\') {
        const n = this.src[this.pos + 1];
        if (n === undefined) {
          if (toEof) {
            lit += '\\';
            this.pos++;
            continue;
          }
          throw new IncompleteInput('"');
        }
        const escapable = toEof ? '$`\\\n' : '$`"\\\n';
        if (escapable.includes(n)) {
          if (n === '\n') {
            this.line++;
          } else lit += n;
          this.pos += 2;
          continue;
        }
        lit += '\\';
        this.pos++;
        continue;
      }
      if (c === '$') {
        const p = this.readDollar(true);
        if (p) {
          flush();
          parts.push(p);
          continue;
        }
        lit += '$';
        this.pos++;
        continue;
      }
      if (c === '`') {
        flush();
        parts.push(this.readBacktick());
        continue;
      }
      if (c === '\n') this.line++;
      lit += c;
      this.pos++;
    }
    flush();
    return { t: 'dq', parts };
  }

  private readBacktick(): WordPart {
    this.pos++; // `
    let text = '';
    for (;;) {
      if (this.pos >= this.len) throw new IncompleteInput('`');
      const c = this.src[this.pos];
      if (c === '`') {
        this.pos++;
        break;
      }
      if (c === '\\' && '`$\\'.includes(this.src[this.pos + 1] ?? '')) {
        text += this.src[this.pos + 1];
        this.pos += 2;
        continue;
      }
      if (c === '\n') this.line++;
      text += c;
      this.pos++;
    }
    const body = new Parser(text, 0, 1, this.opts).parseProgram();
    return { t: 'cmd', src: text, body };
  }

  /** Read something starting with `$`. Returns null when the `$` is literal. */
  private readDollar(inDq: boolean): WordPart | null {
    const n = this.src[this.pos + 1];
    if (n === '(') {
      if (this.src[this.pos + 2] === '(') {
        this.pos += 3;
        return { t: 'arith', expr: this.readArithBody() };
      }
      const sub = new Parser(this.src, this.pos + 2, this.line, this.opts);
      const body = sub.parseCommandSubstitution();
      const text = this.src.slice(this.pos + 2, sub.pos - 1);
      this.pos = sub.pos;
      this.line = sub.line;
      return { t: 'cmd', src: text, body };
    }
    if (n === '{') return this.readBraceParam();
    if (!inDq && n === "'") {
      this.pos += 2;
      return { t: 'q', v: this.readAnsiC() };
    }
    if (!inDq && n === '"') {
      this.pos += 2;
      return this.readDoubleBody(false);
    }
    if (n !== undefined && /[A-Za-z_]/.test(n)) {
      let j = this.pos + 1;
      while (j < this.len && /[A-Za-z0-9_]/.test(this.src[j])) j++;
      const name = this.src.slice(this.pos + 1, j);
      this.pos = j;
      return { t: 'param', p: { name, braced: false } };
    }
    if (n !== undefined && /[0-9@*#?$!-]/.test(n)) {
      this.pos += 2;
      return { t: 'param', p: { name: n, braced: false } };
    }
    return null;
  }

  private readAnsiC(): string {
    let out = '';
    for (;;) {
      if (this.pos >= this.len) throw new IncompleteInput("$'");
      const c = this.src[this.pos];
      if (c === "'") {
        this.pos++;
        return out;
      }
      if (c === '\\') {
        const n = this.src[this.pos + 1];
        this.pos += 2;
        switch (n) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case 'a': out += '\x07'; break;
          case 'b': out += '\b'; break;
          case 'e':
          case 'E': out += '\x1b'; break;
          case 'f': out += '\f'; break;
          case 'v': out += '\v'; break;
          case '\\': out += '\\'; break;
          case "'": out += "'"; break;
          case '"': out += '"'; break;
          case '?': out += '?'; break;
          case 'x': {
            const m = /^[0-9a-fA-F]{1,2}/.exec(this.src.slice(this.pos));
            if (m) {
              out += String.fromCharCode(parseInt(m[0], 16));
              this.pos += m[0].length;
            } else out += '\\x';
            break;
          }
          case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
            const m = /^[0-7]{0,2}/.exec(this.src.slice(this.pos))!;
            out += String.fromCharCode(parseInt(n + m[0], 8));
            this.pos += m[0].length;
            break;
          }
          case undefined:
            throw new IncompleteInput("$'");
          default:
            out += '\\' + n;
        }
        continue;
      }
      if (c === '\n') this.line++;
      out += c;
      this.pos++;
    }
  }

  /** Reads arithmetic text up to the matching `))`. Position is just after `((`. */
  private readArithBody(): string {
    const start = this.pos;
    let depth = 0;
    while (this.pos < this.len) {
      const c = this.src[this.pos];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) {
          if (this.src[this.pos + 1] === ')') {
            const expr = this.src.slice(start, this.pos);
            this.pos += 2;
            return expr;
          }
          throw new ShellSyntaxError("syntax error near unexpected token `)'", this.line, ')');
        }
        depth--;
      } else if (c === '\n') this.line++;
      else if (c === "'" || c === '"') {
        const end = this.src.indexOf(c, this.pos + 1);
        if (end < 0) throw new IncompleteInput(c);
        this.pos = end;
      }
      this.pos++;
    }
    throw new IncompleteInput('((');
  }

  private readBraceParam(): WordPart {
    const startPos = this.pos;
    this.pos += 2; // ${
    const p: ParamExp = { name: '', braced: true };
    const s = this.src;
    if (s[this.pos] === '#' && /[A-Za-z_0-9@*]/.test(s[this.pos + 1] ?? '')) {
      p.length = true;
      this.pos++;
    } else if (s[this.pos] === '!' && s[this.pos + 1] !== '}') {
      p.indirect = true;
      this.pos++;
    }
    const c = s[this.pos];
    if (c !== undefined && /[A-Za-z_]/.test(c)) {
      let j = this.pos;
      while (j < this.len && /[A-Za-z0-9_]/.test(s[j])) j++;
      p.name = s.slice(this.pos, j);
      this.pos = j;
    } else if (c !== undefined && /[0-9]/.test(c)) {
      let j = this.pos;
      while (j < this.len && /[0-9]/.test(s[j])) j++;
      p.name = s.slice(this.pos, j);
      this.pos = j;
    } else if (c !== undefined && '@*#?$!-'.includes(c)) {
      p.name = c;
      this.pos++;
    } else {
      if (this.pos >= this.len) throw new IncompleteInput('${');
      throw this.badSubstitution(startPos);
    }
    if (s[this.pos] === '[') {
      let depth = 0;
      let j = this.pos;
      for (; j < this.len; j++) {
        if (s[j] === '[') depth++;
        else if (s[j] === ']') {
          depth--;
          if (depth === 0) break;
        }
      }
      if (j >= this.len) throw new IncompleteInput('${');
      p.index = s.slice(this.pos + 1, j);
      this.pos = j + 1;
    }
    if (s[this.pos] === '}') {
      this.pos++;
      return { t: 'param', p };
    }
    if (this.pos >= this.len) throw new IncompleteInput('${');
    if (p.length) throw this.badSubstitution(startPos);
    const ops = [':-', ':=', ':+', ':?', '##', '%%', '//', '/#', '/%', '^^', ',,', '-', '=', '+', '?', '#', '%', '/', '^', ',', ':'];
    const op = ops.find((o) => s.startsWith(o, this.pos));
    if (!op) throw this.badSubstitution(startPos);
    p.op = op;
    this.pos += op.length;
    if (op === ':') {
      p.arg = this.readWord((ch) => ch === ':' || ch === '}', true);
      if (s[this.pos] === ':') {
        this.pos++;
        p.arg2 = this.readWord((ch) => ch === '}', true);
      }
    } else if (op === '/' || op === '//' || op === '/#' || op === '/%') {
      p.arg = this.readWord((ch) => ch === '/' || ch === '}', true);
      if (s[this.pos] === '/') {
        this.pos++;
        p.arg2 = this.readWord((ch) => ch === '}', true);
      }
    } else {
      p.arg = this.readWord((ch) => ch === '}', true);
    }
    if (s[this.pos] !== '}') throw new IncompleteInput('${');
    this.pos++;
    return { t: 'param', p };
  }

  private badSubstitution(start: number): Error {
    let end = this.src.indexOf('}', start);
    if (end < 0) end = this.len - 1;
    return new ShellSyntaxError(`${this.src.slice(start, end + 1)}: bad substitution`, this.line);
  }

  // ------------------------------------------------------------------ heredocs

  private readHeredocBodies() {
    const pending = this.pending;
    this.pending = [];
    for (const h of pending) {
      const lines: string[] = [];
      let closed = false;
      while (this.pos < this.len) {
        const eol = this.src.indexOf('\n', this.pos);
        const raw = eol < 0 ? this.src.slice(this.pos) : this.src.slice(this.pos, eol);
        this.pos = eol < 0 ? this.len : eol + 1;
        this.line++;
        const text = h.strip ? raw.replace(/^\t+/, '') : raw;
        if (text === h.delim) {
          closed = true;
          break;
        }
        lines.push(text);
      }
      if (!closed && this.opts.interactive) throw new IncompleteInput('heredoc');
      h.redir.heredoc!.body = lines.length ? lines.join('\n') + '\n' : '';
    }
  }

  private finishHeredocsAtEof() {
    if (!this.pending.length) return;
    if (this.opts.interactive) throw new IncompleteInput('heredoc');
    for (const h of this.pending) h.redir.heredoc!.body = '';
    this.pending = [];
  }

  // ------------------------------------------------------------------ grammar

  private parseList(stops: Stops): Program {
    const items: { node: Node; bg: boolean }[] = [];
    this.skipNewlines();
    const line = this.peek().line;
    for (;;) {
      const t = this.peek();
      if (t.k === 'eof' || this.isStop(t, stops)) break;
      const node = this.parseAndOr();
      let bg = false;
      const s = this.peek();
      if (s.k === 'op' && (s.v === ';' || s.v === '&')) {
        this.next();
        bg = s.v === '&';
      } else if (s.k === 'nl') {
        this.next();
      } else if (!(s.k === 'eof' || this.isStop(s, stops))) {
        throw this.unexpected(s);
      }
      items.push({ node, bg });
      this.skipNewlines();
    }
    return { type: 'list', items, line };
  }

  private parseAndOr(): Node {
    const first = this.parsePipeline();
    const rest: { op: '&&' | '||'; node: Node }[] = [];
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && (t.v === '&&' || t.v === '||')) {
        this.next();
        this.skipNewlines();
        rest.push({ op: t.v, node: this.parsePipeline() });
      } else break;
    }
    if (!rest.length) return first;
    return { type: 'andor', first, rest, line: lineOf(first) };
  }

  private parsePipeline(): Node {
    let negate = false;
    const t0 = this.peek();
    if (this.isWord(t0, '!')) {
      this.next();
      negate = true;
    }
    const cmds = [this.parseCommand()];
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && (t.v === '|' || t.v === '|&')) {
        this.next();
        if (t.v === '|&') addRedir(cmds[cmds.length - 1], { fd: 2, op: '>&', target: { parts: [{ t: 'lit', v: '1' }], raw: '1' } });
        this.skipNewlines();
        cmds.push(this.parseCommand());
      } else break;
    }
    if (cmds.length === 1 && !negate) return cmds[0];
    return { type: 'pipeline', cmds, negate, line: t0.line };
  }

  private parseCommand(): Node {
    const t = this.peek();
    if (t.k === 'eof') throw new IncompleteInput('command');
    if (t.k === 'nl') throw this.unexpected(t);
    if (t.k === 'op') {
      if (t.v === '(') {
        if (this.src.startsWith('((', t.start)) {
          this.unpeek();
          this.pos += 2;
          const expr = this.readArithBody();
          return { type: 'arith', expr, redirs: this.parseRedirs(), line: t.line };
        }
        this.next();
        const body = this.parseList({ ops: [')'] });
        this.expectOp(')', body);
        return { type: 'subshell', body, redirs: this.parseRedirs(), line: t.line };
      }
      if (REDIR_OPS.has(t.v)) return this.parseSimple();
      throw this.unexpected(t);
    }
    const lit = wordLiteral(t.w);
    if (lit !== null) {
      switch (lit) {
        case 'if':
          return this.parseIf();
        case 'for':
          return this.parseFor();
        case 'while':
        case 'until':
          return this.parseWhile(lit === 'until');
        case 'case':
          return this.parseCase();
        case '{': {
          this.next();
          const body = this.parseList({ words: ['}'] });
          this.expectWord('}', body);
          return { type: 'group', body, redirs: this.parseRedirs(), line: t.line };
        }
        case '[[':
          return this.parseCond();
        case 'function':
          return this.parseFunctionKeyword();
        case 'select':
          throw new UnsupportedError('`select` menus');
      }
      if (TERMINATOR_WORDS.has(lit) || lit === ']]') throw this.unexpected(t);
      const fm = /^([A-Za-z_][A-Za-z0-9_.:-]*)[ \t]*\([ \t]*\)/.exec(this.src.slice(t.start, t.start + 200));
      if (fm) {
        this.buf = null;
        this.pos = t.start + fm[0].length;
        this.skipNewlines();
        const body = this.parseFunctionBody();
        return { type: 'func', name: fm[1], body, line: t.line };
      }
    }
    return this.parseSimple();
  }

  private parseFunctionKeyword(): Node {
    const kw = this.next();
    const nameTok = this.next();
    if (nameTok.k !== 'word') throw this.unexpected(nameTok);
    const name = wordLiteral(nameTok.w) ?? nameTok.w.raw;
    // optional ()
    const t = this.peek();
    if (t.k === 'op' && t.v === '(') {
      this.next();
      const c = this.next();
      if (c.k !== 'op' || c.v !== ')') throw this.unexpected(c);
    }
    this.skipNewlines();
    const body = this.parseFunctionBody();
    return { type: 'func', name, body, line: kw.line };
  }

  private parseFunctionBody(): Node {
    const t = this.peek();
    if (t.k === 'eof') throw new IncompleteInput('function body');
    const isCompound =
      (t.k === 'op' && t.v === '(') ||
      (t.k === 'word' && ['{', 'if', 'for', 'while', 'until', 'case', '[['].includes(wordLiteral(t.w) ?? ''));
    if (!isCompound) throw this.unexpected(t);
    return this.parseCommand();
  }

  private expectWord(w: string, before?: Program) {
    const t = this.peek();
    if (this.isWord(t, w)) {
      if (before && before.items.length === 0) throw this.unexpected(t);
      this.next();
      return;
    }
    if (t.k === 'eof') throw new IncompleteInput(w);
    throw this.unexpected(t);
  }

  private expectOp(op: string, before?: Program) {
    const t = this.peek();
    if (t.k === 'op' && t.v === op) {
      if (before && before.items.length === 0) throw this.unexpected(t);
      this.next();
      return;
    }
    if (t.k === 'eof') throw new IncompleteInput(op);
    throw this.unexpected(t);
  }

  private parseIf(): Node {
    const kw = this.next();
    const clauses: { cond: Node; body: Node }[] = [];
    let elseBody: Node | undefined;
    const cond = this.parseList({ words: ['then'] });
    this.expectWord('then', cond);
    const body = this.parseList({ words: ['elif', 'else', 'fi'] });
    if (body.items.length === 0) throw this.unexpected(this.peek());
    clauses.push({ cond, body });
    for (;;) {
      const t = this.peek();
      if (this.isWord(t, 'elif')) {
        this.next();
        const c = this.parseList({ words: ['then'] });
        this.expectWord('then', c);
        const b = this.parseList({ words: ['elif', 'else', 'fi'] });
        if (b.items.length === 0) throw this.unexpected(this.peek());
        clauses.push({ cond: c, body: b });
      } else if (this.isWord(t, 'else')) {
        this.next();
        elseBody = this.parseList({ words: ['fi'] });
        this.expectWord('fi', elseBody as Program);
        break;
      } else {
        this.expectWord('fi');
        break;
      }
    }
    return { type: 'if', clauses, else: elseBody, redirs: this.parseRedirs(), line: kw.line };
  }

  private parseDoBody(): Program {
    this.skipNewlines();
    const t = this.peek();
    if (!this.isWord(t, 'do')) {
      if (t.k === 'eof') throw new IncompleteInput('do');
      throw this.unexpected(t);
    }
    this.next();
    const body = this.parseList({ words: ['done'] });
    this.expectWord('done', body);
    return body;
  }

  private parseFor(): Node {
    const kw = this.next();
    const t = this.peek();
    if (t.k === 'op' && t.v === '(' && this.src.startsWith('((', t.start)) {
      this.unpeek();
      this.pos += 2;
      const expr = this.readArithBody();
      const parts = splitTopLevel(expr, ';');
      if (parts.length !== 3) throw new ShellSyntaxError("syntax error: `((...))' needs three parts separated by ';'", kw.line);
      const sep = this.peek();
      if (sep.k === 'op' && sep.v === ';') this.next();
      const body = this.parseDoBody();
      return { type: 'cfor', init: parts[0], cond: parts[1], step: parts[2], body, redirs: this.parseRedirs(), line: kw.line };
    }
    const nameTok = this.next();
    if (nameTok.k !== 'word') throw this.unexpected(nameTok);
    const name = wordLiteral(nameTok.w);
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new ShellSyntaxError(`\`${nameTok.w.raw}': not a valid identifier`, nameTok.line);
    }
    let words: Word[] | undefined;
    this.skipNewlinesIfFollowedBy('in');
    const t2 = this.peek();
    if (this.isWord(t2, 'in')) {
      this.next();
      words = [];
      for (;;) {
        const w = this.peek();
        if (w.k === 'word') {
          this.next();
          words.push(w.w);
        } else break;
      }
      const sep = this.peek();
      if (sep.k === 'op' && sep.v === ';') this.next();
      else if (sep.k === 'nl') this.next();
      else if (sep.k === 'eof') throw new IncompleteInput('do');
      else throw this.unexpected(sep);
    } else if (t2.k === 'op' && t2.v === ';') {
      this.next();
    }
    const body = this.parseDoBody();
    return { type: 'for', name, words, body, redirs: this.parseRedirs(), line: kw.line };
  }

  private skipNewlinesIfFollowedBy(word: string) {
    // `for x\nin a b` is legal; only skip newlines when `in` follows.
    const save = { pos: this.pos, line: this.line, buf: this.buf };
    let t = this.peek();
    let skipped = false;
    while (t.k === 'nl') {
      this.buf = null;
      skipped = true;
      t = this.peek();
    }
    if (skipped && !this.isWord(t, word)) {
      this.pos = save.pos;
      this.line = save.line;
      this.buf = save.buf;
    }
  }

  private parseWhile(until: boolean): Node {
    const kw = this.next();
    const cond = this.parseList({ words: ['do'] });
    if (cond.items.length === 0) throw this.unexpected(this.peek());
    const body = this.parseDoBody();
    return { type: 'while', until, cond, body, redirs: this.parseRedirs(), line: kw.line };
  }

  private parseCase(): Node {
    const kw = this.next();
    const wt = this.next();
    if (wt.k !== 'word') {
      if (wt.k === 'eof') throw new IncompleteInput('case');
      throw this.unexpected(wt);
    }
    this.skipNewlines();
    const inTok = this.peek();
    if (!this.isWord(inTok, 'in')) {
      if (inTok.k === 'eof') throw new IncompleteInput('in');
      throw this.unexpected(inTok);
    }
    this.next();
    this.skipNewlines();
    const items: { patterns: Word[]; body?: Node; term: ';;' | ';&' | ';;&' }[] = [];
    for (;;) {
      let t = this.peek();
      if (this.isWord(t, 'esac')) {
        this.next();
        break;
      }
      if (t.k === 'eof') throw new IncompleteInput('esac');
      if (t.k === 'op' && t.v === '(') {
        this.next();
        t = this.peek();
      }
      const patterns: Word[] = [];
      for (;;) {
        const p = this.next();
        if (p.k !== 'word') {
          if (p.k === 'eof') throw new IncompleteInput('esac');
          throw this.unexpected(p);
        }
        patterns.push(p.w);
        const sep = this.peek();
        if (sep.k === 'op' && sep.v === '|') {
          this.next();
          continue;
        }
        if (sep.k === 'op' && sep.v === ')') {
          this.next();
          break;
        }
        if (sep.k === 'eof') throw new IncompleteInput('esac');
        throw this.unexpected(sep);
      }
      const body = this.parseList({ words: ['esac'], ops: [';;', ';&', ';;&'] });
      const end = this.peek();
      let term: ';;' | ';&' | ';;&' = ';;';
      if (end.k === 'op' && (end.v === ';;' || end.v === ';&' || end.v === ';;&')) {
        this.next();
        term = end.v;
        this.skipNewlines();
      } else if (!this.isWord(end, 'esac')) {
        if (end.k === 'eof') throw new IncompleteInput('esac');
        throw this.unexpected(end);
      }
      items.push({ patterns, body: body.items.length ? body : undefined, term });
    }
    return { type: 'case', word: wt.w, items, redirs: this.parseRedirs(), line: kw.line };
  }

  // ---- [[ ... ]]

  private parseCond(): Node {
    const kw = this.next();
    const expr = this.parseCondOr();
    const t = this.peek();
    if (!this.isWord(t, ']]')) {
      if (t.k === 'eof') throw new IncompleteInput(']]');
      throw new ShellSyntaxError(`syntax error in conditional expression: unexpected token \`${tokDisplay(t)}'`, t.line);
    }
    this.next();
    return { type: 'cond', expr, redirs: this.parseRedirs(), line: kw.line };
  }

  private condSkipNl() {
    while (this.peek().k === 'nl') this.next();
  }

  private parseCondOr(): CondExpr {
    let l = this.parseCondAnd();
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && t.v === '||') {
        this.next();
        this.condSkipNl();
        l = { t: 'or', l, r: this.parseCondAnd() };
      } else return l;
    }
  }

  private parseCondAnd(): CondExpr {
    let l = this.parseCondNot();
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && t.v === '&&') {
        this.next();
        this.condSkipNl();
        l = { t: 'and', l, r: this.parseCondNot() };
      } else return l;
    }
  }

  private parseCondNot(): CondExpr {
    this.condSkipNl();
    const t = this.peek();
    if (this.isWord(t, '!')) {
      this.next();
      return { t: 'not', e: this.parseCondNot() };
    }
    return this.parseCondPrimary();
  }

  private parseCondPrimary(): CondExpr {
    const t = this.next();
    if (t.k === 'op' && t.v === '(') {
      const e = this.parseCondOr();
      const c = this.next();
      if (c.k !== 'op' || c.v !== ')') throw new ShellSyntaxError('syntax error in conditional expression', c.line);
      return e;
    }
    if (t.k === 'eof') throw new IncompleteInput(']]');
    if (t.k !== 'word' || this.isWord(t, ']]')) {
      throw new ShellSyntaxError(`syntax error in conditional expression: unexpected token \`${tokDisplay(t)}'`, t.line);
    }
    const lit = wordLiteral(t.w);
    const nx = this.peek();
    if (lit !== null && COND_UNARY.has(lit) && nx.k === 'word' && !this.isWord(nx, ']]')) {
      const nlit = wordLiteral(nx.w);
      if (!(nlit !== null && COND_BINARY.has(nlit))) {
        this.next();
        return { t: 'unary', op: lit, arg: nx.w };
      }
    }
    if (nx.k === 'op' && (nx.v === '<' || nx.v === '>')) {
      this.next();
      const r = this.next();
      if (r.k !== 'word') throw new ShellSyntaxError('syntax error in conditional expression', r.line);
      return { t: 'binary', op: nx.v, l: t.w, r: r.w };
    }
    if (nx.k === 'word') {
      const op = wordLiteral(nx.w);
      if (op !== null && COND_BINARY.has(op)) {
        this.next();
        if (op === '=~') {
          this.unpeek();
          return { t: 'binary', op, l: t.w, r: this.readCondRegex() };
        }
        const r = this.next();
        if (r.k !== 'word') {
          if (r.k === 'eof') throw new IncompleteInput(']]');
          throw new ShellSyntaxError(`syntax error in conditional expression: unexpected token \`${tokDisplay(r)}'`, r.line);
        }
        return { t: 'binary', op: op === '=' ? '==' : op, l: t.w, r: r.w };
      }
    }
    return { t: 'word', w: t.w };
  }

  private readCondRegex(): Word {
    this.skipBlanks();
    let depth = 0;
    const w = this.readWord((ch) => {
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) return true;
        depth--;
      }
      return ch === ' ' || ch === '\t' || ch === '\n';
    });
    if (!w.parts.length) throw new ShellSyntaxError('syntax error in conditional expression', this.line);
    return w;
  }

  // ---- simple commands & redirections

  private parseRedirs(): Redir[] {
    const redirs: Redir[] = [];
    for (;;) {
      const t = this.peek();
      if (t.k === 'op' && REDIR_OPS.has(t.v)) {
        this.next();
        redirs.push(this.parseRedirTarget(t));
      } else return redirs;
    }
  }

  private parseRedirTarget(t: Tok & { k: 'op' }): Redir {
    const tw = this.next();
    if (tw.k !== 'word') {
      if (tw.k === 'eof') throw new IncompleteInput('redirect');
      throw this.unexpected(tw);
    }
    const r: Redir = { fd: t.fd, op: t.v as RedirOp, target: tw.w };
    if (t.v === '<<' || t.v === '<<-') {
      r.heredoc = { body: '', quoted: hasQuoting(tw.w) };
      this.pending.push({ redir: r, delim: wordText(tw.w), strip: t.v === '<<-' });
    }
    return r;
  }

  private parseSimple(): Node {
    const assigns: Assign[] = [];
    const words: Word[] = [];
    const redirs: Redir[] = [];
    const line = this.peek().line;
    for (;;) {
      const t = this.peek();
      if (t.k === 'op') {
        if (REDIR_OPS.has(t.v)) {
          this.next();
          redirs.push(this.parseRedirTarget(t));
          continue;
        }
        if (t.v === '(' && words.length) {
          throw this.unexpected(t);
        }
        break;
      }
      if (t.k !== 'word') break;
      this.next();
      if (t.arr) {
        const a: Assign = {
          name: t.arr.name,
          append: t.arr.append,
          array: t.arr.elems,
        };
        if (words.length === 0) assigns.push(a);
        else words.push({ ...t.w, arrayAssign: a });
        continue;
      }
      if (words.length === 0) {
        const a = parseAssignment(t.w, this.opts);
        if (a) {
          assigns.push(a);
          continue;
        }
      }
      words.push(t.w);
    }
    if (!assigns.length && !words.length && !redirs.length) throw this.unexpected(this.peek());
    return { type: 'simple', assigns, words, redirs, line };
  }
}

// ------------------------------------------------------------------ helpers

function countNl(s: string): number {
  let n = 0;
  for (const ch of s) if (ch === '\n') n++;
  return n;
}

function lineOf(n: Node): number {
  return n.line;
}

function addRedir(n: Node, r: Redir) {
  if ('redirs' in n) n.redirs.push(r);
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** `NAME=value`, `NAME+=value`, `NAME[idx]=value` at the start of a simple command. */
export function parseAssignment(w: Word, opts: ParseOptions = {}): Assign | null {
  const first = w.parts[0];
  if (!first || first.t !== 'lit') return null;
  const m = /^([A-Za-z_][A-Za-z0-9_]*)(\[([^\]]*)\])?(\+)?=/.exec(w.raw);
  if (!m) return null;
  if (!first.v.startsWith(m[1])) return null;
  const valueRaw = w.raw.slice(m[0].length);
  return {
    name: m[1],
    index: m[3],
    append: !!m[4],
    value: parseWordString(valueRaw, opts),
  };
}

/** Parse a string as the parts of one word (no splitting at spaces? — spaces are kept literal). */
export function parseWordString(s: string, opts: ParseOptions = {}): Word {
  return new Parser(s, 0, 1, opts).readWord(() => false);
}

/** Parse a heredoc body (unquoted delimiter) into an expandable word. */
export function parseHeredocBody(body: string): Word {
  const dq = new Parser(body, 0, 1).readDoubleBody(true);
  return { parts: [dq], raw: body };
}

export function parse(src: string, opts: ParseOptions = {}): Program {
  return new Parser(src, 0, 1, opts).parseProgram();
}
