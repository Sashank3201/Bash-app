// GNU sed subset: addresses, ranges, s///, y///, p d n N P D q h H g G x a i c = b t T : r w l {}

import { posixRegex } from '../pattern';
import { FsError } from '../vfs';
import { readText, register, splitLines, type CmdCtx } from './registry';

type Addr = { t: 'line'; n: number } | { t: 'last' } | { t: 're'; re: RegExp | null; src: string } | { t: 'step'; first: number; step: number };

interface Cmd {
  a1?: Addr;
  a2?: Addr | { t: 'plus'; n: number };
  neg: boolean;
  name: string;
  // s
  re?: RegExp | null;
  reSrc?: string;
  repl?: string;
  global?: boolean;
  nth?: number;
  print?: boolean;
  wfile?: string;
  // y
  from?: string;
  to?: string;
  text?: string;
  label?: string;
  file?: string;
  code?: number;
  block?: Cmd[];
  // range state
  active?: boolean;
  endLine?: number;
}

class SedError extends Error {}

class SedParser {
  i = 0;
  constructor(
    private s: string,
    private extended: boolean,
  ) {}

  private ws() {
    while (this.i < this.s.length && /[ \t]/.test(this.s[this.i])) this.i++;
  }

  private delimited(delim: string): string {
    let out = '';
    while (this.i < this.s.length && this.s[this.i] !== delim) {
      if (this.s[this.i] === '\\' && this.i + 1 < this.s.length) {
        const n = this.s[this.i + 1];
        if (n === delim) out += delim === '/' || !/[.*[\]^$\\+?(){}|]/.test(delim) ? delim : '\\' + delim;
        else if (n === 'n') out += '\n';
        else out += '\\' + n;
        this.i += 2;
        continue;
      }
      if (this.s[this.i] === '\n' && delim !== '\n') throw new SedError('unterminated `s\' command');
      out += this.s[this.i++];
    }
    if (this.i >= this.s.length) throw new SedError(`unterminated address regex`);
    this.i++;
    return out;
  }

  private mkRe(src: string, flags: string): RegExp | null {
    if (src === '') return null;
    try {
      return posixRegex(src, { extended: this.extended, icase: flags.includes('I') || flags.includes('i') });
    } catch (e) {
      throw new SedError(`-e expression #1, char ${this.i}: ${e instanceof Error ? e.message : e}`);
    }
  }

  private addr(): Addr | undefined {
    const c = this.s[this.i];
    if (c === undefined) return undefined;
    if (/[0-9]/.test(c)) {
      const m = /^(\d+)(?:~(\d+))?/.exec(this.s.slice(this.i))!;
      this.i += m[0].length;
      if (m[2] !== undefined) return { t: 'step', first: Number(m[1]), step: Number(m[2]) };
      return { t: 'line', n: Number(m[1]) };
    }
    if (c === '$') {
      this.i++;
      return { t: 'last' };
    }
    if (c === '/' || c === '\\') {
      let delim = '/';
      if (c === '\\') {
        delim = this.s[this.i + 1];
        this.i += 2;
      } else this.i++;
      const src = this.delimited(delim);
      let flags = '';
      while (this.s[this.i] === 'I' || this.s[this.i] === 'M') flags += this.s[this.i++];
      return { t: 're', re: this.mkRe(src, flags), src };
    }
    return undefined;
  }

  parse(end?: string): Cmd[] {
    const cmds: Cmd[] = [];
    for (;;) {
      while (this.i < this.s.length && /[ \t\n;]/.test(this.s[this.i])) this.i++;
      if (this.i >= this.s.length) {
        if (end) throw new SedError('unmatched `{\'');
        return cmds;
      }
      if (this.s[this.i] === '#') {
        while (this.i < this.s.length && this.s[this.i] !== '\n') this.i++;
        continue;
      }
      if (end && this.s[this.i] === end) {
        this.i++;
        return cmds;
      }
      const cmd: Cmd = { neg: false, name: '' };
      cmd.a1 = this.addr();
      if (cmd.a1 && this.s[this.i] === ',') {
        this.i++;
        if (this.s[this.i] === '+') {
          const m = /^\+(\d+)/.exec(this.s.slice(this.i))!;
          this.i += m[0].length;
          cmd.a2 = { t: 'plus', n: Number(m[1]) };
        } else {
          cmd.a2 = this.addr();
          if (!cmd.a2) throw new SedError('unexpected `,\'');
        }
      }
      this.ws();
      while (this.s[this.i] === '!') {
        cmd.neg = true;
        this.i++;
        this.ws();
      }
      const name = this.s[this.i++];
      if (name === undefined) throw new SedError('missing command');
      cmd.name = name;
      switch (name) {
        case '{':
          cmd.block = this.parse('}');
          break;
        case 's': {
          const delim = this.s[this.i++];
          const src = this.delimited(delim);
          let repl = '';
          while (this.i < this.s.length && this.s[this.i] !== delim) {
            if (this.s[this.i] === '\\' && this.i + 1 < this.s.length) {
              repl += this.s[this.i] + this.s[this.i + 1];
              this.i += 2;
              continue;
            }
            repl += this.s[this.i++];
          }
          if (this.i >= this.s.length) throw new SedError("unterminated `s' command");
          this.i++;
          let flags = '';
          while (this.i < this.s.length && /[gpiIme0-9w]/.test(this.s[this.i])) {
            if (this.s[this.i] === 'w') {
              this.i++;
              this.ws();
              const m = /^[^\n;]*/.exec(this.s.slice(this.i))!;
              cmd.wfile = m[0].trim();
              this.i += m[0].length;
              break;
            }
            flags += this.s[this.i++];
          }
          cmd.reSrc = src;
          cmd.re = this.mkRe(src, flags);
          cmd.repl = repl;
          cmd.global = flags.includes('g');
          cmd.print = flags.includes('p');
          const nth = /\d+/.exec(flags);
          cmd.nth = nth ? Number(nth[0]) : 1;
          break;
        }
        case 'y': {
          const delim = this.s[this.i++];
          const unesc = (x: string) => x.replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
          cmd.from = unesc(this.delimited(delim));
          cmd.to = unesc(this.delimited(delim));
          if ([...cmd.from].length !== [...cmd.to].length) throw new SedError("strings for `y' command are different lengths");
          break;
        }
        case 'a':
        case 'i':
        case 'c': {
          this.ws();
          if (this.s[this.i] === '\\') {
            this.i++;
            if (this.s[this.i] === '\n') this.i++;
          }
          let text = '';
          while (this.i < this.s.length && this.s[this.i] !== '\n') {
            if (this.s[this.i] === '\\' && this.s[this.i + 1] === '\n') {
              text += '\n';
              this.i += 2;
              continue;
            }
            if (this.s[this.i] === '\\' && this.i + 1 < this.s.length) {
              text += this.s[this.i + 1] === 't' ? '\t' : this.s[this.i + 1];
              this.i += 2;
              continue;
            }
            text += this.s[this.i++];
          }
          cmd.text = text;
          break;
        }
        case ':': {
          this.ws();
          const m = /^[^\n;]*/.exec(this.s.slice(this.i))!;
          cmd.label = m[0].trim();
          this.i += m[0].length;
          break;
        }
        case 'b':
        case 't':
        case 'T': {
          this.ws();
          const m = /^[^\n;}]*/.exec(this.s.slice(this.i))!;
          cmd.label = m[0].trim();
          this.i += m[0].length;
          break;
        }
        case 'r':
        case 'R':
        case 'w':
        case 'W': {
          this.ws();
          const m = /^[^\n]*/.exec(this.s.slice(this.i))!;
          cmd.file = m[0].trim();
          this.i += m[0].length;
          break;
        }
        case 'q':
        case 'Q': {
          this.ws();
          const m = /^\d*/.exec(this.s.slice(this.i))!;
          cmd.code = m[0] ? Number(m[0]) : 0;
          this.i += m[0].length;
          break;
        }
        case 'l':
        case 'L': {
          this.ws();
          const m = /^\d*/.exec(this.s.slice(this.i))!;
          this.i += m[0].length;
          break;
        }
        case 'p':
        case 'P':
        case 'd':
        case 'D':
        case 'n':
        case 'N':
        case 'g':
        case 'G':
        case 'h':
        case 'H':
        case 'x':
        case '=':
        case 'z':
        case 'F':
          break;
        case '}':
          throw new SedError("unexpected `}'");
        default:
          throw new SedError(`-e expression #1, char ${this.i}: unknown command: \`${name}'`);
      }
      cmds.push(cmd);
      this.ws();
      if (this.i < this.s.length && !/[;\n}#]/.test(this.s[this.i]) && !end) {
        throw new SedError(`-e expression #1, char ${this.i + 1}: extra characters after command`);
      }
    }
  }
}

function caseConvert(s: string): string {
  // handle \U \L \E \u \l markers produced during replacement
  let out = '';
  let mode: 'U' | 'L' | '' = '';
  let once: 'u' | 'l' | '' = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\u0001' && i + 1 < s.length) {
      const m = s[++i];
      if (m === 'U' || m === 'L') mode = m;
      else if (m === 'E') mode = '';
      else once = m as 'u' | 'l';
      continue;
    }
    let ch = s[i];
    if (mode === 'U') ch = ch.toUpperCase();
    else if (mode === 'L') ch = ch.toLowerCase();
    if (once) {
      ch = once === 'u' ? ch.toUpperCase() : ch.toLowerCase();
      once = '';
    }
    out += ch;
  }
  return out;
}

function expandRepl(repl: string, m: RegExpExecArray): string {
  let out = '';
  let hasCase = false;
  for (let i = 0; i < repl.length; i++) {
    const ch = repl[i];
    if (ch === '\\' && i + 1 < repl.length) {
      const n = repl[++i];
      if (/[0-9]/.test(n)) out += m[Number(n)] ?? '';
      else if (n === 'n') out += '\n';
      else if (n === 't') out += '\t';
      else if (n === '&') out += '&';
      else if ('ULEul'.includes(n)) {
        out += '\u0001' + n;
        hasCase = true;
      } else out += n;
      continue;
    }
    if (ch === '&') out += m[0];
    else out += ch;
  }
  return hasCase ? caseConvert(out) : out;
}

async function runSed(c: CmdCtx, script: Cmd[], inputsText: { name: string; text: string }[], opts: { quiet: boolean; inPlace: string | null; separate: boolean }): Promise<number> {
  let exitCode = 0;
  let lastRe: RegExp | null = null;
  const labels = new Map<string, { list: Cmd[]; idx: number }>();
  const collectLabels = (list: Cmd[]) =>
    list.forEach((cmd, idx) => {
      if (cmd.name === ':') labels.set(cmd.label!, { list, idx });
      if (cmd.block) collectLabels(cmd.block);
    });
  collectLabels(script);
  const wfiles = new Map<string, string>();

  const groups = opts.inPlace !== null || opts.separate ? inputsText.map((x) => [x]) : [inputsText];
  for (const group of groups) {
    const lines: string[] = [];
    let trailingNl = true;
    for (const inp of group) {
      const ls = splitLines(inp.text);
      lines.push(...ls);
      trailingNl = inp.text.endsWith('\n') || inp.text === '';
    }
    let out = '';
    let lineNo = 0;
    let idx = 0;
    let hold = '';
    let quit = false;
    const isLast = () => idx >= lines.length;
    const matchAddr = (a: Addr, ps: string): boolean => {
      switch (a.t) {
        case 'line':
          return lineNo === a.n;
        case 'last':
          return isLast();
        case 'step':
          return a.step <= 0 ? lineNo === a.first : lineNo >= a.first && (lineNo - a.first) % a.step === 0;
        case 're': {
          const re = a.re ?? lastRe;
          if (!re) throw new SedError('no previous regular expression');
          if (a.re) lastRe = a.re;
          re.lastIndex = 0;
          return new RegExp(re.source, re.flags.replace('g', '')).test(ps);
        }
      }
    };
    const selected = (cmd: Cmd, ps: string): boolean => {
      let r: boolean;
      if (!cmd.a1) r = true;
      else if (!cmd.a2) r = matchAddr(cmd.a1, ps);
      else if (cmd.active) {
        if (cmd.a2.t === 'plus') {
          if (lineNo >= cmd.endLine!) cmd.active = false;
        } else if (cmd.a2.t === 'line') {
          if (lineNo >= cmd.a2.n) cmd.active = false;
        } else if (matchAddr(cmd.a2 as Addr, ps)) cmd.active = false;
        r = true;
      } else if (matchAddr(cmd.a1, ps)) {
        r = true;
        if (cmd.a2.t === 'plus') {
          cmd.endLine = lineNo + cmd.a2.n;
          cmd.active = cmd.a2.n > 0;
        } else if (cmd.a2.t === 'line') cmd.active = cmd.a2.n > lineNo;
        else cmd.active = true;
      } else r = false;
      return r !== cmd.neg;
    };

    let ps = '';
    let appendQueue = '';
    const flushAppend = () => {
      out += appendQueue;
      appendQueue = '';
    };
    const readNext = (): boolean => {
      if (idx >= lines.length) return false;
      ps = lines[idx++];
      lineNo++;
      return true;
    };

    cycle: while (!quit && readNext()) {
      let tFlag = false;
      let deleted = false;
      let restartWithoutRead = false;
      const exec = async (list: Cmd[], startIdx = 0): Promise<'next' | 'jump' | void> => {
        for (let k = startIdx; k < list.length; k++) {
          const cmd = list[k];
          if (cmd.name === ':') continue;
          if (!selected(cmd, ps)) continue;
          switch (cmd.name) {
            case '{': {
              const r = await exec(cmd.block!);
              if (r) return r;
              break;
            }
            case 's': {
              const re = cmd.re ?? lastRe;
              if (!re) throw new SedError('no previous regular expression');
              if (cmd.re) lastRe = cmd.re;
              const g = new RegExp(re.source, re.flags.replace('g', '') + 'g');
              let count = 0;
              let changed = false;
              let result = '';
              let last = 0;
              let m: RegExpExecArray | null;
              while ((m = g.exec(ps))) {
                count++;
                if (count >= cmd.nth! && (cmd.global || count === cmd.nth)) {
                  result += ps.slice(last, m.index) + expandRepl(cmd.repl!, m);
                  last = m.index + m[0].length;
                  changed = true;
                  if (!cmd.global) break;
                }
                if (m[0] === '') g.lastIndex++;
              }
              if (changed) {
                ps = result + ps.slice(last);
                tFlag = true;
                if (cmd.print) out += ps + '\n';
                if (cmd.wfile) wfiles.set(cmd.wfile, (wfiles.get(cmd.wfile) ?? '') + ps + '\n');
              }
              break;
            }
            case 'y': {
              const from = [...cmd.from!];
              const to = [...cmd.to!];
              ps = [...ps].map((ch) => {
                const i = from.indexOf(ch);
                return i >= 0 ? to[i] : ch;
              }).join('');
              break;
            }
            case 'p':
              out += ps + '\n';
              break;
            case 'P':
              out += ps.split('\n')[0] + '\n';
              break;
            case 'd':
              deleted = true;
              return 'next';
            case 'D': {
              const nl = ps.indexOf('\n');
              if (nl < 0) {
                deleted = true;
                return 'next';
              }
              ps = ps.slice(nl + 1);
              restartWithoutRead = true;
              return 'next';
            }
            case 'n':
              if (!opts.quiet) out += ps + '\n';
              flushAppend();
              if (!readNext()) {
                deleted = true;
                quit = true;
                return 'next';
              }
              break;
            case 'N':
              if (idx >= lines.length) {
                // GNU: print pattern space and exit
                break;
              }
              ps += '\n' + lines[idx++];
              lineNo++;
              break;
            case 'h':
              hold = ps;
              break;
            case 'H':
              hold += '\n' + ps;
              break;
            case 'g':
              ps = hold;
              break;
            case 'G':
              ps += '\n' + hold;
              break;
            case 'x':
              [ps, hold] = [hold, ps];
              break;
            case 'a':
              appendQueue += cmd.text + '\n';
              break;
            case 'i':
              out += cmd.text + '\n';
              break;
            case 'c':
              if (!cmd.a2 || !cmd.active) out += cmd.text + '\n';
              deleted = true;
              return 'next';
            case '=':
              out += lineNo + '\n';
              break;
            case 'l':
              out += ps.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n') + '$\n';
              break;
            case 'z':
              ps = '';
              break;
            case 'F':
              out += (group[0].name === '-' ? '-' : group[0].name) + '\n';
              break;
            case 'q':
              exitCode = cmd.code ?? 0;
              quit = true;
              return 'next';
            case 'Q':
              exitCode = cmd.code ?? 0;
              quit = true;
              deleted = true;
              return 'next';
            case 'r': {
              try {
                appendQueue += c.vfs.readFile(c.abs(cmd.file!), c.cred);
              } catch {}
              break;
            }
            case 'w':
              wfiles.set(cmd.file!, (wfiles.get(cmd.file!) ?? '') + ps + '\n');
              break;
            case 'b':
            case 't':
            case 'T': {
              const jump = cmd.name === 'b' || (cmd.name === 't' ? tFlag : !tFlag);
              if (cmd.name !== 'b') tFlag = false;
              if (!jump) break;
              if (!cmd.label) return 'next';
              const target = labels.get(cmd.label);
              if (!target) throw new SedError(`can't find label for jump to \`${cmd.label}'`);
              const r = await exec(target.list, target.idx + 1);
              return r ?? 'jump';
            }
          }
        }
      };
      do {
        restartWithoutRead = false;
        deleted = false;
        await exec(script);
        if (!deleted && !opts.quiet) out += ps + '\n';
        flushAppend();
        if (restartWithoutRead) {
          // D with remaining text: start next cycle without reading input
          continue;
        }
        break;
      } while (!quit);
      if (quit) break cycle;
    }
    if (!trailingNl && out.endsWith('\n') && !quit) out = out.slice(0, -1);
    if (opts.inPlace !== null) {
      const name = group[0].name;
      if (opts.inPlace) c.vfs.writeFile(c.abs(name + opts.inPlace), group[0].text, { cred: c.cred });
      c.vfs.writeFile(c.abs(name), out, { cred: c.cred });
    } else c.stdout.write(out);
  }
  for (const [f, content] of wfiles) {
    if (f === '/dev/stdout') c.stdout.write(content);
    else c.vfs.writeFile(c.abs(f), content, { cred: c.cred });
  }
  return exitCode;
}

register('sed', async (c) => {
  const args = [...c.args];
  let quiet = false;
  let extended = false;
  let inPlace: string | null = null;
  let separate = false;
  const scripts: string[] = [];
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      files.push(...args.slice(i + 1));
      break;
    }
    if (a === '-n' || a === '--quiet' || a === '--silent') quiet = true;
    else if (a === '-E' || a === '-r' || a === '--regexp-extended') extended = true;
    else if (a === '-s' || a === '--separate') separate = true;
    else if (a === '-e') scripts.push(args[++i] ?? '');
    else if (a.startsWith('--expression=')) scripts.push(a.slice(13));
    else if (a === '-f') {
      const t = await readText(c, args[++i] ?? '');
      if (t === null) return 1;
      scripts.push(t);
    } else if (a === '-i' || a === '--in-place') inPlace = '';
    else if (a.startsWith('-i') && a.length > 2 && !/^-i[nEr]+$/.test(a)) inPlace = a.slice(2);
    else if (/^-[nErsi]+$/.test(a)) {
      if (a.includes('n')) quiet = true;
      if (a.includes('E') || a.includes('r')) extended = true;
      if (a.includes('s')) separate = true;
      if (a.includes('i')) inPlace = '';
    } else if (a.startsWith('-') && a.length > 1) {
      c.err(`invalid option -- '${a.slice(1)}'`);
      return 1;
    } else if (!scripts.length) scripts.push(a);
    else files.push(a);
  }
  if (!scripts.length) {
    c.stderr.write('Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n');
    return 1;
  }
  let script: Cmd[];
  try {
    script = new SedParser(scripts.join('\n'), extended).parse();
  } catch (e) {
    if (e instanceof SedError) {
      c.err(e.message.startsWith('-e') ? e.message : `-e expression #1: ${e.message}`);
      return 1;
    }
    throw e;
  }
  if (inPlace !== null && !files.length) {
    c.err('no input files');
    return 1;
  }
  const inputsText: { name: string; text: string }[] = [];
  let status = 0;
  for (const f of files.length ? files : ['-']) {
    if (f !== '-') {
      const n = c.vfs.tryLookup(c.abs(f));
      if (n?.type === 'dir') {
        c.err(`couldn't edit ${f}: not a regular file`);
        status = 4;
        continue;
      }
    }
    const t = await readText(c, f);
    if (t === null) {
      c.stderr.write('');
      status = 2;
      continue;
    }
    inputsText.push({ name: f, text: t });
  }
  try {
    const code = await runSed(c, script, inputsText, { quiet, inPlace, separate });
    return code || status;
  } catch (e) {
    if (e instanceof SedError) {
      c.err(e.message);
      return 1;
    }
    if (e instanceof FsError) {
      c.err(e.message);
      return 4;
    }
    throw e;
  }
});
