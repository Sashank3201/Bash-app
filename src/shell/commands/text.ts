// Text processing: head tail wc sort uniq cut tr grep tee xargs diff comm paste rev nl column seq expr fold ...

import { posixRegex, posixToJs } from '../pattern';
import { InBuf, StringWriter } from '../io';
import { FsError, normalize, utf8Length } from '../vfs';
import { ansi, cmpC, inputs, joinLines, parseOpts, readText, register, splitLines, UsageError, withUsage, type CmdCtx } from './registry';

// ------------------------------------------------------------------ head / tail

function headTailArgs(c: CmdCtx): string[] {
  // `head -5` → `head -n 5`, `tail +3` → `tail -n +3` (but not when the number is the value of -n/-c)
  return c.args.map((a, i) => {
    const prev = c.args[i - 1];
    if (prev === '-n' || prev === '-c' || prev === '--lines' || prev === '--bytes') return a;
    if (/^-\d+$/.test(a)) return `-n${a.slice(1)}`;
    if (c.name === 'tail' && /^\+\d+$/.test(a)) return `-n${a}`;
    return a;
  });
}

register(
  'head',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(headTailArgs(c), { short: 'qv', withArg: 'nc', long: { lines: 'n=', bytes: 'c=', quiet: 'q', verbose: 'v' } });
    const nStr = typeof flags.n === 'string' ? flags.n : '10';
    const cStr = typeof flags.c === 'string' ? flags.c : null;
    if (!/^-?\d+$/.test(cStr ?? nStr)) {
      c.err(`invalid number of ${cStr ? 'bytes' : 'lines'}: ‘${cStr ?? nStr}’`);
      return 1;
    }
    const files = operands.length ? operands : ['-'];
    const headers = (files.length > 1 && !flags.q) || !!flags.v;
    let status = 0;
    let first = true;
    for (const f of files) {
      const t = await readText(c, f);
      if (t === null) {
        status = 1;
        continue;
      }
      if (headers) c.stdout.write(`${first ? '' : '\n'}==> ${f === '-' ? 'standard input' : f} <==\n`);
      first = false;
      if (cStr) {
        const n = Number(cStr);
        c.stdout.write(n >= 0 ? t.slice(0, n) : t.slice(0, Math.max(0, t.length + n)));
        continue;
      }
      const n = Number(nStr);
      const lines = t.split('\n');
      const endsNl = t.endsWith('\n');
      if (endsNl) lines.pop();
      const sel = n >= 0 ? lines.slice(0, n) : lines.slice(0, Math.max(0, lines.length + n));
      const lastIncluded = sel.length === lines.length;
      c.stdout.write(sel.join('\n') + (sel.length && (!lastIncluded || endsNl) ? '\n' : ''));
    }
    return status;
  }),
);

register(
  'tail',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(headTailArgs(c), { short: 'qvfF', withArg: 'nc', long: { lines: 'n=', bytes: 'c=', follow: 'f', quiet: 'q' } });
    const nStr = typeof flags.n === 'string' ? flags.n : '10';
    const cStr = typeof flags.c === 'string' ? flags.c : null;
    if (!/^[+-]?\d+$/.test(cStr ?? nStr)) {
      c.err(`invalid number of ${cStr ? 'bytes' : 'lines'}: ‘${cStr ?? nStr}’`);
      return 1;
    }
    const files = operands.length ? operands : ['-'];
    const headers = (files.length > 1 && !flags.q) || !!flags.v;
    let status = 0;
    let first = true;
    for (const f of files) {
      const t = await readText(c, f);
      if (t === null) {
        status = 1;
        continue;
      }
      if (headers) c.stdout.write(`${first ? '' : '\n'}==> ${f === '-' ? 'standard input' : f} <==\n`);
      first = false;
      if (cStr) {
        const plus = cStr.startsWith('+');
        const n = Math.abs(Number(cStr));
        c.stdout.write(plus ? t.slice(Math.max(0, n - 1)) : n === 0 ? '' : t.slice(-n));
        continue;
      }
      const plus = nStr.startsWith('+');
      const n = Math.abs(Number(nStr));
      const lines = t.split('\n');
      const endsNl = t.endsWith('\n');
      if (endsNl) lines.pop();
      const sel = plus ? lines.slice(Math.max(0, n - 1)) : n === 0 ? [] : lines.slice(-n);
      c.stdout.write(sel.join('\n') + (sel.length && endsNl ? '\n' : ''));
    }
    if (flags.f || flags.F) c.stderr.write('tail: (simulator) -f shows the file once instead of waiting for new lines\n');
    return status;
  }),
);

// ------------------------------------------------------------------ wc

register(
  'wc',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'lwcmL', long: { lines: 'l', words: 'w', bytes: 'c', chars: 'm', 'max-line-length': 'L' } });
    let sel = (['l', 'w', 'm', 'c', 'L'] as const).filter((k) => flags[k]);
    if (!sel.length) sel = ['l', 'w', 'c'];
    const rows: { counts: number[]; name: string | null }[] = [];
    const totals = sel.map(() => 0);
    let status = 0;
    let fromStdin = false;
    let totalBytes = 0;
    const files = operands.length ? operands : ['-'];
    for (const f of files) {
      const node = f === '-' ? null : c.vfs.tryLookup(c.abs(f));
      if (node && node.type === 'dir') {
        c.err(`${f}: Is a directory`);
        rows.push({ counts: sel.map(() => 0), name: f });
        status = 1;
        continue;
      }
      const t = await readText(c, f);
      if (t === null) {
        status = 1;
        continue;
      }
      if (f === '-') fromStdin = true;
      const bytes = utf8Length(t);
      totalBytes += bytes;
      const counts = sel.map((k) => {
        switch (k) {
          case 'l':
            return (t.match(/\n/g) ?? []).length;
          case 'w':
            return t.split(/[ \t\n\r\f\v]+/).filter(Boolean).length;
          case 'c':
            return bytes;
          case 'm':
            return [...t].length;
          case 'L':
            return Math.max(0, ...t.split('\n').map((l) => l.replace(/\t/g, '        ').length));
        }
      });
      counts.forEach((n, i) => (totals[i] = sel[i] === 'L' ? Math.max(totals[i], n) : totals[i] + n));
      rows.push({ counts, name: operands.length ? f : null });
    }
    if (rows.length > 1) rows.push({ counts: totals, name: 'total' });
    let width: number;
    if (sel.length === 1 && rows.length === 1) width = 1;
    else if (fromStdin) width = 7;
    else width = Math.max(1, String(totalBytes).length, ...rows.flatMap((r) => r.counts.map((n) => String(n).length)));
    for (const r of rows) c.stdout.write(r.counts.map((n) => String(n).padStart(width)).join(' ') + (r.name !== null ? ' ' + r.name : '') + '\n');
    return status;
  }),
);

// ------------------------------------------------------------------ sort

interface SortKey {
  f1: number;
  c1: number;
  f2: number;
  c2: number;
  opts: string;
}

function parseKey(spec: string, global: string): SortKey {
  const m = /^(\d+)(?:\.(\d+))?([bdfghiMnRrV]*)(?:,(\d+)(?:\.(\d+))?([bdfghiMnRrV]*))?$/.exec(spec);
  if (!m) throw new UsageError(`invalid field specification ‘${spec}’`);
  const opts = (m[3] ?? '') + (m[6] ?? '');
  return {
    f1: Number(m[1]),
    c1: m[2] ? Number(m[2]) : 1,
    f2: m[4] ? Number(m[4]) : Infinity,
    c2: m[5] ? Number(m[5]) : 0,
    opts: opts || global,
  };
}

/** GNU semantics: without -t, a field includes its leading blanks. */
function fieldStarts(line: string, sep: string | null): { start: number; end: number }[] {
  const fields: { start: number; end: number }[] = [];
  if (sep !== null) {
    let s = 0;
    for (let i = 0; i <= line.length; i++) {
      if (i === line.length || line[i] === sep) {
        fields.push({ start: s, end: i });
        s = i + 1;
      }
    }
    return fields;
  }
  let i = 0;
  while (i < line.length || fields.length === 0) {
    const start = i;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
    while (i < line.length && line[i] !== ' ' && line[i] !== '\t') i++;
    fields.push({ start, end: i });
    if (i >= line.length) break;
  }
  return fields;
}

function keyText(line: string, k: SortKey, sep: string | null): string {
  const fields = fieldStarts(line, sep);
  const fa = fields[k.f1 - 1];
  if (!fa) return '';
  let s = fa.start;
  if (k.opts.includes('b')) while (s < fa.end && (line[s] === ' ' || line[s] === '\t')) s++;
  s += k.c1 - 1;
  let e: number;
  if (k.f2 === Infinity) e = line.length;
  else {
    const fb = fields[k.f2 - 1];
    if (!fb) e = line.length;
    else if (k.c2 === 0) e = fb.end;
    else {
      let bs = fb.start;
      if (k.opts.includes('b')) while (bs < fb.end && (line[bs] === ' ' || line[bs] === '\t')) bs++;
      e = Math.min(fb.end, bs + k.c2);
    }
  }
  return s < e ? line.slice(s, e) : '';
}

const HUMAN = { K: 1, M: 2, G: 3, T: 4, P: 5, E: 6 } as Record<string, number>;
const MONTH_IDX: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

function numPrefix(s: string): number {
  const m = /^\s*(-?\d*\.?\d+|-?\d+\.?)/.exec(s);
  return m ? parseFloat(m[1]) : 0;
}

function compareBy(a: string, b: string, opts: string): number {
  if (opts.includes('f')) {
    a = a.toUpperCase();
    b = b.toUpperCase();
  }
  if (opts.includes('d')) {
    a = a.replace(/[^A-Za-z0-9 \t]/g, '');
    b = b.replace(/[^A-Za-z0-9 \t]/g, '');
  }
  if (opts.includes('n') || opts.includes('g')) {
    const x = opts.includes('g') ? parseFloat(a) || 0 : numPrefix(a);
    const y = opts.includes('g') ? parseFloat(b) || 0 : numPrefix(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (opts.includes('h')) {
    const hv = (s: string) => {
      const m = /^\s*(-?\d*\.?\d+)([KMGTPE]?)/i.exec(s);
      if (!m) return 0;
      return parseFloat(m[1]) * 1024 ** (HUMAN[m[2].toUpperCase()] ?? 0);
    };
    const x = hv(a);
    const y = hv(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (opts.includes('M')) {
    const x = MONTH_IDX[a.trim().slice(0, 3).toUpperCase()] ?? 0;
    const y = MONTH_IDX[b.trim().slice(0, 3).toUpperCase()] ?? 0;
    return x - y;
  }
  if (opts.includes('V')) {
    return a.localeCompare(b, 'en', { numeric: true });
  }
  if (opts.includes('b')) {
    a = a.replace(/^[ \t]+/, '');
    b = b.replace(/^[ \t]+/, '');
  }
  return cmpC(a, b);
}

register(
  'sort',
  withUsage(async (c) => {
    const { flags, multi, operands } = parseOpts(c.args, {
      short: 'nrufbhgsMVdcCRz',
      withArg: 'ktoST',
      long: {
        'numeric-sort': 'n', reverse: 'r', unique: 'u', 'ignore-case': 'f', 'human-numeric-sort': 'h', key: 'k=',
        'field-separator': 't=', output: 'o=', stable: 's', 'version-sort': 'V', 'month-sort': 'M', check: 'c', 'general-numeric-sort': 'g',
      },
    });
    const sep = typeof flags.t === 'string' ? (flags.t === '\\t' ? '\t' : flags.t) : null;
    if (sep !== null && sep.length !== 1) {
      c.err('multi-character tab ‘' + sep + '’');
      return 2;
    }
    const global = ['n', 'r', 'f', 'b', 'h', 'g', 'M', 'V', 'd'].filter((k) => flags[k]).join('');
    const keys = (multi.k ?? []).map((k) => parseKey(k, global));
    const nl = flags.z ? '\0' : '\n';
    let text = '';
    let status = 0;
    for await (const inp of inputs(c, operands)) {
      if (inp.text === null) {
        status = 2;
        continue;
      }
      text += inp.text && !inp.text.endsWith(nl) ? inp.text + nl : inp.text;
    }
    if (status) return status;
    const lines = text === '' ? [] : text.split(nl).slice(0, -1);
    const cmp = (a: string, b: string): number => {
      if (keys.length) {
        for (const k of keys) {
          let r = compareBy(keyText(a, k, sep), keyText(b, k, sep), k.opts);
          if (k.opts.includes('r')) r = -r;
          if (r) return r;
        }
      } else {
        let r = compareBy(a, b, global);
        if (flags.r) r = -r;
        if (r) return r;
      }
      if (flags.s || flags.u) return 0;
      // last-resort comparison
      const r = cmpC(a, b);
      return flags.r ? -r : r;
    };
    if (flags.c || flags.C) {
      for (let i = 1; i < lines.length; i++) {
        if (cmp(lines[i - 1], lines[i]) > 0 || (flags.u && cmp(lines[i - 1], lines[i]) === 0)) {
          if (!flags.C) c.stderr.write(`sort: ${operands[0] ?? '-'}:${i + 1}: disorder: ${lines[i]}\n`);
          return 1;
        }
      }
      return 0;
    }
    const sorted = lines.map((l, i) => ({ l, i })).sort((x, y) => cmp(x.l, y.l) || x.i - y.i).map((x) => x.l);
    let out = sorted;
    if (flags.u) {
      out = [];
      for (const l of sorted) if (!out.length || cmp(out[out.length - 1], l) !== 0) out.push(l);
    }
    const joined = out.map((l) => l + nl).join('');
    if (typeof flags.o === 'string') {
      try {
        c.vfs.writeFile(c.abs(flags.o), joined, { cred: c.cred });
      } catch (e) {
        c.err(`open failed: ${flags.o}: ${e instanceof FsError ? e.message : e}`);
        return 2;
      }
    } else c.stdout.write(joined);
    return 0;
  }),
);

// ------------------------------------------------------------------ uniq

register(
  'uniq',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, {
      short: 'cduiDu',
      withArg: 'fsw',
      long: { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i', 'skip-fields': 'f=', 'skip-chars': 's=', 'check-chars': 'w=' },
    });
    const input = operands[0] ?? '-';
    const t = await readText(c, input);
    if (t === null) return 1;
    const lines = splitLines(t);
    const skipF = Number(flags.f ?? 0);
    const skipC = Number(flags.s ?? 0);
    const w = flags.w !== undefined ? Number(flags.w) : Infinity;
    const keyOf = (l: string) => {
      let s = l;
      for (let i = 0; i < skipF; i++) s = s.replace(/^[ \t]*[^ \t]*/, '');
      s = s.slice(skipC);
      if (w !== Infinity) s = s.slice(0, w);
      return flags.i ? s.toLowerCase() : s;
    };
    let out = '';
    let i = 0;
    while (i < lines.length) {
      let j = i + 1;
      const k = keyOf(lines[i]);
      while (j < lines.length && keyOf(lines[j]) === k) j++;
      const count = j - i;
      const show = flags.d ? count > 1 : flags.u ? count === 1 : true;
      if (show) {
        if (flags.D) for (let x = i; x < j; x++) out += lines[x] + '\n';
        else out += (flags.c ? String(count).padStart(7) + ' ' : '') + lines[i] + '\n';
      }
      i = j;
    }
    if (operands[1]) {
      c.vfs.writeFile(c.abs(operands[1]), out, { cred: c.cred });
    } else c.stdout.write(out);
    return 0;
  }),
);

// ------------------------------------------------------------------ cut

function parseList(spec: string): ((n: number) => boolean) | null {
  const ranges: [number, number][] = [];
  for (const part of spec.split(',')) {
    const m = /^(\d*)(-?)(\d*)$/.exec(part);
    if (!m || (!m[1] && !m[3])) return null;
    const a = m[1] ? Number(m[1]) : 1;
    const b = m[2] ? (m[3] ? Number(m[3]) : Infinity) : a;
    if (a === 0) return null;
    ranges.push([a, b]);
  }
  return (n) => ranges.some(([a, b]) => n >= a && n <= b);
}

register(
  'cut',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, {
      short: 'snz',
      withArg: 'dfcb',
      long: { delimiter: 'd=', fields: 'f=', characters: 'c=', bytes: 'b=', 'only-delimited': 's', complement: 'C', 'output-delimiter': 'O=' },
    });
    const spec = (flags.f ?? flags.c ?? flags.b) as string | undefined;
    if (!spec) {
      c.err('you must specify a list of bytes, characters, or fields');
      return 1;
    }
    let sel = parseList(spec);
    if (!sel) {
      c.err(`invalid field value ‘${spec}’`);
      return 1;
    }
    if (flags.C) {
      const inner = sel;
      sel = (n) => !inner(n);
    }
    const delim = typeof flags.d === 'string' ? flags.d : '\t';
    if (flags.f && delim.length !== 1) {
      c.err('the delimiter must be a single character');
      return 1;
    }
    const outDelim = typeof flags.O === 'string' ? flags.O : flags.f ? delim : '';
    let status = 0;
    for await (const inp of inputs(c, operands)) {
      if (inp.text === null) {
        status = 1;
        continue;
      }
      let out = '';
      for (const line of splitLines(inp.text)) {
        if (flags.f) {
          if (!line.includes(delim)) {
            if (!flags.s) out += line + '\n';
            continue;
          }
          const parts = line.split(delim);
          out += parts.filter((_p, i) => sel!(i + 1)).join(outDelim) + '\n';
        } else {
          const chars = [...line];
          out += chars.filter((_ch, i) => sel!(i + 1)).join(outDelim) + '\n';
        }
      }
      c.stdout.write(out);
    }
    return status;
  }),
);

// ------------------------------------------------------------------ tr

const TR_CLASSES: Record<string, string> = {
  alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  alnum: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  space: '\t\n\v\f\r ',
  blank: '\t ',
  punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  xdigit: '0123456789ABCDEFabcdef',
  cntrl: Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('') + '\x7f',
  print: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
  graph: Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join(''),
};

function trExpand(set: string): string {
  // unescape first into tokens, then expand ranges
  const toks: string[] = [];
  for (let i = 0; i < set.length; i++) {
    const ch = set[i];
    if (ch === '\\' && i + 1 < set.length) {
      const n = set[++i];
      const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', a: '\x07', b: '\b', f: '\f', v: '\v' };
      if (/[0-7]/.test(n)) {
        const m = /^[0-7]{1,3}/.exec(set.slice(i))!;
        toks.push(String.fromCharCode(parseInt(m[0], 8)));
        i += m[0].length - 1;
      } else toks.push(map[n] ?? n);
      continue;
    }
    if (ch === '[' && set[i + 1] === ':') {
      const end = set.indexOf(':]', i + 2);
      if (end > 0) {
        const name = set.slice(i + 2, end);
        if (TR_CLASSES[name]) {
          toks.push(...TR_CLASSES[name]);
          i = end + 1;
          continue;
        }
      }
    }
    if (ch === '[' && /^\[.\*\d*\]/.test(set.slice(i))) {
      const m = /^\[(.)\*(\d*)\]/.exec(set.slice(i))!;
      toks.push(...m[1].repeat(Number(m[2] || 1)));
      i += m[0].length - 1;
      continue;
    }
    toks.push(ch);
  }
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    if (toks[i + 1] === '-' && i + 2 < toks.length && toks[i + 2].length === 1) {
      const a = toks[i].charCodeAt(0);
      const b = toks[i + 2].charCodeAt(0);
      for (let k = a; k <= b; k++) out += String.fromCharCode(k);
      i += 2;
    } else out += toks[i];
  }
  return out;
}

register(
  'tr',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'dscCt', long: { delete: 'd', 'squeeze-repeats': 's', complement: 'c', truncate: 't' } });
    if (!operands.length) {
      c.err('missing operand');
      return 1;
    }
    let set1 = trExpand(operands[0]);
    let set2 = operands[1] !== undefined ? trExpand(operands[1]) : '';
    const complement = !!(flags.c || flags.C);
    if (!flags.d && !flags.s && operands.length < 2) {
      c.err(`missing operand after ‘${operands[0]}’`);
      return 1;
    }
    const input = await c.stdin.readAll();
    const inSet1 = (ch: string) => (complement ? !set1.includes(ch) : set1.includes(ch));
    let out = '';
    if (flags.d) {
      for (const ch of input) if (!inSet1(ch)) out += ch;
      if (flags.s && set2) {
        let o2 = '';
        for (const ch of out) if (!(o2.endsWith(ch) && set2.includes(ch))) o2 += ch;
        out = o2;
      }
      c.stdout.write(out);
      return 0;
    }
    if (operands.length < 2) {
      // -s only
      for (const ch of input) if (!(out.endsWith(ch) && inSet1(ch))) out += ch;
      c.stdout.write(out);
      return 0;
    }
    if (flags.t) set1 = set1.slice(0, set2.length);
    if (set2.length < set1.length && set2.length) set2 = set2 + set2[set2.length - 1].repeat(set1.length - set2.length);
    const map = new Map<string, string>();
    if (!complement) for (let i = 0; i < set1.length; i++) map.set(set1[i], set2[i]);
    for (const ch of input) {
      let o = ch;
      if (complement) {
        if (!set1.includes(ch)) o = set2[set2.length - 1];
      } else if (map.has(ch)) o = map.get(ch)!;
      if (flags.s && out.endsWith(o) && set2.includes(o) && o !== ch + 'x') {
        if (o !== ch || map.has(ch) || complement) continue;
      }
      out += o;
    }
    c.stdout.write(out);
    return 0;
  }),
);

// ------------------------------------------------------------------ grep

register(
  ['grep', 'egrep', 'fgrep'],
  withUsage(async (c) => {
    const { flags, multi, operands } = parseOpts(c.args, {
      short: 'ivcnoEFGPrRlLwxhHqsaIzZTU',
      withArg: 'efABCm',
      long: {
        'ignore-case': 'i', 'invert-match': 'v', count: 'c', 'line-number': 'n', 'only-matching': 'o', 'extended-regexp': 'E',
        'fixed-strings': 'F', recursive: 'r', 'files-with-matches': 'l', 'files-without-match': 'L', 'word-regexp': 'w',
        'line-regexp': 'x', 'no-filename': 'h', 'with-filename': 'H', quiet: 'q', silent: 'q', 'no-messages': 's',
        regexp: 'e=', file: 'f=', 'after-context': 'A=', 'before-context': 'B=', context: 'C=', 'max-count': 'm=',
        color: 'K', colour: 'K', include: 'N=', exclude: 'X=', 'exclude-dir': 'Y=',
      },
    });
    const ops = [...operands];
    const patterns: string[] = [];
    if (multi.e) patterns.push(...multi.e);
    if (typeof flags.f === 'string') {
      const t = await readText(c, flags.f);
      if (t === null) return 2;
      patterns.push(...splitLines(t));
    }
    if (!multi.e && flags.f === undefined) {
      if (!ops.length) {
        c.stderr.write(`Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n`);
        return 2;
      }
      patterns.push(...ops.shift()!.split('\n'));
    }
    const fixed = !!flags.F || c.name === 'fgrep';
    const extended = !!flags.E || !!flags.P || c.name === 'egrep';
    const icase = !!flags.i;
    let re: RegExp;
    try {
      const parts = patterns.map((p) => (fixed ? p.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&') : posixToJsSafe(p, extended)));
      let src = parts.length === 1 ? parts[0] : parts.map((p) => `(?:${p})`).join('|');
      if (flags.w) src = `(?<![A-Za-z0-9_])(?:${src})(?![A-Za-z0-9_])`;
      if (flags.x) src = `^(?:${src})$`;
      re = new RegExp(src, icase ? 'gi' : 'g');
    } catch (e) {
      c.err(e instanceof Error ? e.message.replace(/^Invalid regular expression: /, '') : String(e));
      return 2;
    }
    const recursive = !!(flags.r || flags.R);
    if (!ops.length && recursive) ops.push('.');
    const files: string[] = [];
    let status = 1;
    let errored = false;
    const include = multi.N ?? [];
    const exclude = multi.X ?? [];
    const globOk = (name: string) => {
      const base = name.split('/').pop()!;
      const gm = (p: string) => new RegExp('^' + p.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(base);
      if (include.length && !include.some(gm)) return false;
      if (exclude.some(gm)) return false;
      return true;
    };
    for (const op of ops.length ? ops : ['-']) {
      if (op === '-') {
        files.push(op);
        continue;
      }
      const n = c.vfs.tryLookup(c.abs(op));
      if (n && n.type === 'dir') {
        if (!recursive) {
          if (!flags.s) c.err(`${op}: Is a directory`);
          errored = true;
          continue;
        }
        const walk = (p: string) => {
          const node = c.vfs.tryLookup(c.abs(p));
          if (!node) return;
          if (node.type === 'dir') {
            if (!c.vfs.can(node, c.cred, 'r')) {
              if (!flags.s) c.err(`${p}: Permission denied`);
              errored = true;
              return;
            }
            for (const k of [...node.children!.keys()].sort(cmpC)) {
              if (multi.Y?.some((d) => d === k)) continue;
              walk(p.replace(/\/$/, '') + '/' + k);
            }
          } else if (node.type === 'file' && globOk(p)) files.push(p);
        };
        walk(op);
      } else files.push(op);
    }
    const showName = !flags.h && (!!flags.H || files.length > 1 || recursive);
    const tty = !!c.stdout.isTTY;
    const after = Number(flags.A ?? flags.C ?? 0);
    const before = Number(flags.B ?? flags.C ?? 0);
    const max = flags.m !== undefined ? Number(flags.m) : Infinity;
    let out = '';
    for (const f of files) {
      let text: string | null;
      if (f === '-') text = await c.stdin.readAll();
      else {
        try {
          text = c.vfs.readFile(c.abs(f), c.cred);
        } catch (e) {
          if (!flags.s) c.err(`${f}: ${e instanceof FsError ? e.message : e}`);
          errored = true;
          continue;
        }
      }
      const name = f === '-' ? '(standard input)' : f;
      const lines = splitLines(text);
      let count = 0;
      let lastPrinted = -1;
      let pendingAfter = 0;
      const fname = (sep: string) => (showName ? (tty ? ansi.magenta(name) + `\x1b[36m${sep}\x1b[0m` : name + sep) : '');
      const lnum = (i: number, sep: string) => (flags.n ? (tty ? `\x1b[32m${i + 1}\x1b[0m\x1b[36m${sep}\x1b[0m` : `${i + 1}${sep}`) : '');
      const hl = (l: string) => (tty && !flags.v ? l.replace(re, (m) => (m ? ansi.red(m) : m)) : l);
      for (let i = 0; i < lines.length; i++) {
        if (count >= max) {
          if (pendingAfter > 0 && !flags.c && !flags.l && !flags.L && !flags.q) {
            // print trailing context after the last allowed match
          }
          break;
        }
        re.lastIndex = 0;
        const matched = re.test(lines[i]) !== !!flags.v;
        if (matched) {
          count++;
          if (flags.q) return 0;
          if (flags.c || flags.l || flags.L) continue;
          if (before || after) {
            if (lastPrinted >= 0 && i - before > lastPrinted + 1) out += tty ? '\x1b[36m--\x1b[0m\n' : '--\n';
            for (let b = Math.max(lastPrinted + 1, i - before); b < i; b++) out += fname('-') + lnum(b, '-') + lines[b] + '\n';
          }
          if (flags.o) {
            if (!flags.v) {
              re.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = re.exec(lines[i]))) {
                if (m[0] === '') {
                  re.lastIndex++;
                  continue;
                }
                out += fname(':') + lnum(i, ':') + (tty ? ansi.red(m[0]) : m[0]) + '\n';
              }
            }
          } else out += fname(':') + lnum(i, ':') + hl(lines[i]) + '\n';
          lastPrinted = i;
          pendingAfter = after;
        } else if (pendingAfter > 0 && !flags.c && !flags.l && !flags.L) {
          out += fname('-') + lnum(i, '-') + lines[i] + '\n';
          lastPrinted = i;
          pendingAfter--;
        }
      }
      if (count > 0) status = 0;
      if (flags.c) out += (showName ? (tty ? ansi.magenta(name) + '\x1b[36m:\x1b[0m' : name + ':') : '') + count + '\n';
      if (flags.l && count > 0) out += (tty ? ansi.magenta(name) : name) + '\n';
      if (flags.L && count === 0) out += (tty ? ansi.magenta(name) : name) + '\n';
    }
    c.stdout.write(out);
    if (flags.q) return status === 0 ? 0 : errored ? 2 : 1;
    if (errored && status !== 0) return 2;
    if (errored && !flags.s) return 2;
    return status;
  }),
);

function posixToJsSafe(p: string, extended: boolean): string {
  return posixRegex(p, { extended }).source;
}

// ------------------------------------------------------------------ tee

register('tee', async (c) => {
  const append = c.args.includes('-a') || c.args.includes('--append');
  const files = c.args.filter((a) => !a.startsWith('-') || a === '-');
  const input = await c.stdin.readAll();
  let status = 0;
  for (const f of files) {
    if (f === '/dev/null') continue;
    try {
      c.vfs.writeFile(c.abs(f), input, { append, cred: c.cred });
    } catch (e) {
      c.err(`${f}: ${e instanceof FsError ? e.message : e}`);
      status = 1;
    }
  }
  c.stdout.write(input);
  return status;
});

// ------------------------------------------------------------------ xargs

function xargsSplit(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
      continue;
    }
    if (ch === '\\' && i + 1 < s.length) {
      cur += s[++i];
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += ch;
  }
  if (has || cur) out.push(cur);
  return out;
}

register('xargs', async (c) => {
  const args = [...c.args];
  let n = Infinity;
  let repl: string | null = null;
  let nul = false;
  let delim: string | null = null;
  let trace = false;
  let noRunEmpty = false;
  while (args.length && args[0].startsWith('-')) {
    const a = args.shift()!;
    if (a === '--') break;
    if (a === '-n') n = Number(args.shift());
    else if (/^-n\d+$/.test(a)) n = Number(a.slice(2));
    else if (a === '-I') repl = args.shift() ?? '{}';
    else if (a.startsWith('-I')) repl = a.slice(2);
    else if (a === '-i') repl = '{}';
    else if (a === '-0' || a === '--null') nul = true;
    else if (a === '-d') delim = args.shift() ?? '\n';
    else if (a === '-t') trace = true;
    else if (a === '-r' || a === '--no-run-if-empty') noRunEmpty = true;
    else if (a === '-P' || a === '-L' || a === '-s') args.shift();
  }
  const cmd = args.length ? args : ['echo'];
  const input = await c.stdin.readAll();
  let items: string[];
  if (nul) items = input.split('\0').filter((x) => x !== '');
  else if (delim !== null) items = input.split(delim === '\\n' ? '\n' : delim).filter((x, i, arr) => !(x === '' && i === arr.length - 1));
  else if (repl !== null) items = splitLines(input).map((l) => l.trim()).filter(Boolean);
  else items = xargsSplit(input);
  const io = { stdin: InBuf.empty(), stdout: c.stdout, stderr: c.stderr };
  let status = 0;
  const run = async (argv: string[]) => {
    if (trace) c.stderr.write(argv.join(' ') + '\n');
    const st = await c.sh.invoke(argv, io);
    if (st === 127) {
      status = 127;
      return false;
    }
    if (st !== 0) status = 123;
    return true;
  };
  if (repl !== null) {
    for (const it of items) if (!(await run(cmd.map((x) => x.split(repl!).join(it))))) break;
    return status;
  }
  if (!items.length) {
    if (!noRunEmpty) await run(cmd);
    return status;
  }
  for (let i = 0; i < items.length; i += n === Infinity ? items.length : n) {
    if (!(await run([...cmd, ...items.slice(i, n === Infinity ? undefined : i + n)]))) break;
  }
  return status;
});

// ------------------------------------------------------------------ diff

type Edit = { op: '=' | '-' | '+'; a: number; b: number };

function lcsDiff(a: string[], b: string[]): Edit[] {
  const n = a.length;
  const m = b.length;
  // trim common prefix/suffix for speed
  let pre = 0;
  while (pre < n && pre < m && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) suf++;
  const A = a.slice(pre, n - suf);
  const B = b.slice(pre, m - suf);
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= A.length; i++) dp.push(new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const edits: Edit[] = [];
  for (let i = 0; i < pre; i++) edits.push({ op: '=', a: i, b: i });
  let i = 0;
  let j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) {
      edits.push({ op: '=', a: pre + i, b: pre + j });
      i++;
      j++;
    } else if (j < B.length && (i >= A.length || dp[i][j + 1] > dp[i + 1][j])) {
      edits.push({ op: '+', a: pre + i, b: pre + j });
      j++;
    } else {
      edits.push({ op: '-', a: pre + i, b: pre + j });
      i++;
    }
  }
  for (let k = 0; k < suf; k++) edits.push({ op: '=', a: n - suf + k, b: m - suf + k });
  return edits;
}

register('diff', async (c) => {
  let unified: number | null = null;
  let brief = false;
  let icase = false;
  let ignoreWs = false;
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-u') unified = 3;
    else if (/^-U\d+$/.test(a)) unified = Number(a.slice(2));
    else if (a === '-q' || a === '--brief') brief = true;
    else if (a === '-i') icase = true;
    else if (a === '-w' || a === '-b') ignoreWs = true;
    else if (a.startsWith('-') && a !== '-') {
      /* ignore */
    } else ops.push(a);
  }
  if (ops.length !== 2) {
    c.err(ops.length < 2 ? `missing operand after '${ops[0] ?? 'diff'}'` : `extra operand '${ops[2]}'`);
    return 2;
  }
  const ta = await readText(c, ops[0]);
  const tb = await readText(c, ops[1]);
  if (ta === null || tb === null) return 2;
  const la = splitLines(ta);
  const lb = splitLines(tb);
  const norm = (s: string) => {
    let x = s;
    if (icase) x = x.toLowerCase();
    if (ignoreWs) x = x.replace(/\s+/g, ' ').trim();
    return x;
  };
  const edits = lcsDiff(la.map(norm), lb.map(norm));
  if (edits.every((e) => e.op === '=')) return 0;
  if (brief) {
    c.stdout.write(`Files ${ops[0]} and ${ops[1]} differ\n`);
    return 1;
  }
  let out = '';
  if (unified !== null) {
    const ctx = unified;
    out += `--- ${ops[0]}\n+++ ${ops[1]}\n`;
    const changeIdx = edits.map((e, i) => (e.op !== '=' ? i : -1)).filter((i) => i >= 0);
    let k = 0;
    while (k < changeIdx.length) {
      let start = Math.max(0, changeIdx[k] - ctx);
      let end = Math.min(edits.length - 1, changeIdx[k] + ctx);
      while (k + 1 < changeIdx.length && changeIdx[k + 1] - ctx <= end + 1) {
        k++;
        end = Math.min(edits.length - 1, changeIdx[k] + ctx);
      }
      k++;
      const hunk = edits.slice(start, end + 1);
      const aStart = hunk.find((e) => e.op !== '+')?.a ?? hunk[0].a;
      const bStart = hunk.find((e) => e.op !== '-')?.b ?? hunk[0].b;
      const aLen = hunk.filter((e) => e.op !== '+').length;
      const bLen = hunk.filter((e) => e.op !== '-').length;
      const range = (s: number, l: number) => (l === 1 ? `${s + 1}` : `${l === 0 ? s : s + 1},${l}`);
      out += `@@ -${range(aStart, aLen)} +${range(bStart, bLen)} @@\n`;
      for (const e of hunk) out += e.op === '=' ? ' ' + la[e.a] + '\n' : e.op === '-' ? '-' + la[e.a] + '\n' : '+' + lb[e.b] + '\n';
      start = end;
    }
  } else {
    let i = 0;
    while (i < edits.length) {
      if (edits[i].op === '=') {
        i++;
        continue;
      }
      let j = i;
      while (j < edits.length && edits[j].op !== '=') j++;
      const block = edits.slice(i, j);
      const dels = block.filter((e) => e.op === '-');
      const adds = block.filter((e) => e.op === '+');
      const r = (x: number, y: number) => (x === y ? `${x}` : `${x},${y}`);
      if (dels.length && adds.length) {
        out += `${r(dels[0].a + 1, dels[dels.length - 1].a + 1)}c${r(adds[0].b + 1, adds[adds.length - 1].b + 1)}\n`;
        out += dels.map((e) => '< ' + la[e.a] + '\n').join('') + '---\n' + adds.map((e) => '> ' + lb[e.b] + '\n').join('');
      } else if (dels.length) {
        out += `${r(dels[0].a + 1, dels[dels.length - 1].a + 1)}d${dels[0].b}\n`;
        out += dels.map((e) => '< ' + la[e.a] + '\n').join('');
      } else {
        out += `${adds[0].a}a${r(adds[0].b + 1, adds[adds.length - 1].b + 1)}\n`;
        out += adds.map((e) => '> ' + lb[e.b] + '\n').join('');
      }
      i = j;
    }
  }
  c.stdout.write(out);
  return 1;
});

register('cmp', async (c) => {
  const ops = c.args.filter((a) => !a.startsWith('-') || a === '-');
  const silent = c.args.includes('-s');
  const a = await readText(c, ops[0]);
  const b = await readText(c, ops[1]);
  if (a === null || b === null) return 2;
  let line = 1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      if (silent) return 1;
      if (i >= a.length || i >= b.length) c.stderr.write(`cmp: EOF on ${i >= a.length ? ops[0] : ops[1]} after byte ${i}\n`);
      else c.stdout.write(`${ops[0]} ${ops[1]} differ: byte ${i + 1}, line ${line}\n`);
      return 1;
    }
    if (a[i] === '\n') line++;
  }
  return 0;
});

// ------------------------------------------------------------------ comm / paste / rev / nl / column / fold

register('comm', async (c) => {
  const flags = c.args.filter((a) => /^-[123]+$/.test(a)).join('');
  const ops = c.args.filter((a) => !/^-[123]+$/.test(a));
  const ta = await readText(c, ops[0] ?? '-');
  const tb = await readText(c, ops[1] ?? '-');
  if (ta === null || tb === null) return 1;
  const a = splitLines(ta);
  const b = splitLines(tb);
  const show = [!flags.includes('1'), !flags.includes('2'), !flags.includes('3')];
  const col = (k: number, s: string) => {
    let pre = '';
    for (let x = 0; x < k; x++) if (show[x]) pre += '\t';
    return pre + s + '\n';
  };
  let i = 0;
  let j = 0;
  let out = '';
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && cmpC(a[i], b[j]) < 0)) {
      if (show[0]) out += col(0, a[i]);
      i++;
    } else if (i >= a.length || cmpC(a[i], b[j]) > 0) {
      if (show[1]) out += col(1, b[j]);
      j++;
    } else {
      if (show[2]) out += col(2, a[i]);
      i++;
      j++;
    }
  }
  c.stdout.write(out);
  return 0;
});

register('paste', async (c) => {
  let delims = '\t';
  let serial = false;
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    const m = /^-(s?)d(.*)$/.exec(a) ?? /^-d(s?)(.*)$/.exec(a);
    if (a === '-s') serial = true;
    else if (m) {
      if (m[1]) serial = true;
      delims = m[2] !== '' ? m[2] : c.args[++i] ?? '\t';
    } else ops.push(a);
  }
  delims = delims.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\0/g, '');
  const files: string[][] = [];
  for (const f of ops.length ? ops : ['-']) {
    const t = await readText(c, f);
    if (t === null) return 1;
    files.push(splitLines(t));
  }
  const d = (k: number) => (delims.length ? delims[k % delims.length] : '');
  let out = '';
  if (serial) {
    for (const lines of files) out += lines.map((l, k) => (k ? d(k - 1) : '') + l).join('') + '\n';
  } else {
    const rows = Math.max(0, ...files.map((f) => f.length));
    for (let r = 0; r < rows; r++) out += files.map((f, k) => (k ? d(k - 1) : '') + (f[r] ?? '')).join('') + '\n';
  }
  c.stdout.write(out);
  return 0;
});

register('rev', async (c) => {
  let status = 0;
  for await (const inp of inputs(c, c.args)) {
    if (inp.text === null) {
      status = 1;
      continue;
    }
    c.stdout.write(splitLines(inp.text).map((l) => [...l].reverse().join('') + '\n').join(''));
  }
  return status;
});

register('nl', async (c) => {
  let all = false;
  let width = 6;
  let sep = '\t';
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-ba' || (a === '-b' && c.args[i + 1] === 'a')) {
      all = true;
      if (a === '-b') i++;
    } else if (a === '-w') width = Number(c.args[++i]);
    else if (a.startsWith('-w')) width = Number(a.slice(2));
    else if (a === '-s') sep = c.args[++i] ?? '\t';
    else ops.push(a);
  }
  let n = 0;
  let status = 0;
  for await (const inp of inputs(c, ops)) {
    if (inp.text === null) {
      status = 1;
      continue;
    }
    let out = '';
    for (const l of splitLines(inp.text)) {
      // GNU nl pads unnumbered (empty) lines with spaces in place of the number and separator
      if (l === '' && !all) out += ' '.repeat(width + sep.length) + '\n';
      else out += String(++n).padStart(width) + sep + l + '\n';
    }
    c.stdout.write(out);
  }
  return status;
});

register('column', async (c) => {
  let table = false;
  let seps: string | null = null;
  let outSep = '  ';
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-t') table = true;
    else if (a === '-s') seps = c.args[++i] ?? null;
    else if (a.startsWith('-s')) seps = a.slice(2);
    else if (a === '-o') outSep = c.args[++i] ?? '  ';
    else if (/^-[ts]+$/.test(a)) {
      if (a.includes('t')) table = true;
    } else ops.push(a);
  }
  let text = '';
  for await (const inp of inputs(c, ops)) if (inp.text !== null) text += inp.text;
  const lines = splitLines(text).filter((l) => l.trim() !== '');
  if (!table) {
    const width = c.sh.host.cols?.() ?? 80;
    const maxLen = Math.max(0, ...lines.map((l) => l.length));
    const colW = Math.ceil((maxLen + 1) / 8) * 8;
    const cols = Math.max(1, Math.floor(width / colW));
    const rows = Math.ceil(lines.length / cols);
    let out = '';
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let k = 0; k < cols; k++) {
        const idx = k * rows + r;
        if (idx >= lines.length) break;
        const isLast = (k + 1) * rows + r >= lines.length;
        line += isLast ? lines[idx] : lines[idx] + '\t'.repeat(Math.ceil((colW - lines[idx].length) / 8));
      }
      out += line + '\n';
    }
    c.stdout.write(out);
    return 0;
  }
  const splitRe = seps ? new RegExp('[' + seps.replace(/[\]\\^-]/g, '\\$&') + ']+') : /\s+/;
  const rows = lines.map((l) => (seps ? l.split(splitRe) : l.trim().split(splitRe)));
  const ncol = Math.max(0, ...rows.map((r) => r.length));
  const widths = Array.from({ length: ncol }, (_, k) => Math.max(0, ...rows.map((r) => [...(r[k] ?? '')].length)));
  c.stdout.write(rows.map((r) => r.map((cell, k) => (k === r.length - 1 ? cell : cell + ' '.repeat(widths[k] - [...cell].length))).join(outSep) + '\n').join(''));
  return 0;
});

register('fold', async (c) => {
  let width = 80;
  let spaces = false;
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-w') width = Number(c.args[++i]);
    else if (/^-w\d+$/.test(a)) width = Number(a.slice(2));
    else if (a === '-s') spaces = true;
    else if (/^-\d+$/.test(a)) width = Number(a.slice(1));
    else ops.push(a);
  }
  let out = '';
  for await (const inp of inputs(c, ops)) {
    if (inp.text === null) continue;
    for (const line of inp.text.split('\n').slice(0, inp.text.endsWith('\n') ? -1 : undefined)) {
      let l = line;
      while (l.length > width) {
        let cut = width;
        if (spaces) {
          const sp = l.lastIndexOf(' ', width - 1);
          if (sp > 0) cut = sp + 1;
        }
        out += l.slice(0, cut) + '\n';
        l = l.slice(cut);
      }
      out += l + '\n';
    }
  }
  c.stdout.write(out);
  return 0;
});

// ------------------------------------------------------------------ seq / expr / shuf / strings

register('seq', async (c) => {
  let sep = '\n';
  let equal = false;
  let fmt: string | null = null;
  const nums: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-s') sep = c.args[++i] ?? '\n';
    else if (a.startsWith('-s') && a.length > 2) sep = a.slice(2);
    else if (a === '-w') equal = true;
    else if (a === '-f') fmt = c.args[++i];
    else nums.push(a);
  }
  if (!nums.length || nums.length > 3) {
    c.err(nums.length ? `extra operand ‘${nums[3]}’` : 'missing operand');
    return 1;
  }
  for (const n of nums) {
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(n)) {
      c.err(`invalid floating point argument: ‘${n}’`);
      return 1;
    }
  }
  const [first, incr, last] = nums.length === 1 ? ['1', '1', nums[0]] : nums.length === 2 ? [nums[0], '1', nums[1]] : nums;
  const dec = Math.max(...[first, incr].map((x) => (x.includes('.') ? x.split('.')[1].length : 0)));
  const f = Number(first);
  const inc = Number(incr);
  const l = Number(last);
  if (inc === 0) {
    c.err(`invalid Zero increment value: ‘${incr}’`);
    return 1;
  }
  const out: string[] = [];
  for (let k = 0; ; k++) {
    const v = f + k * inc;
    if (inc > 0 ? v > l + 1e-9 : v < l - 1e-9) break;
    if (out.length > 1_000_000) break;
    let s = dec ? v.toFixed(dec) : String(Math.round(v));
    if (fmt) s = fmt.replace(/%[0-9.]*[fgde]/, (m) => (m.endsWith('g') ? String(v) : dec || m.includes('.') ? v.toFixed(Number(/\.(\d+)/.exec(m)?.[1] ?? 6)) : String(v)));
    out.push(s);
  }
  if (equal) {
    const w = Math.max(...out.map((s) => s.replace('-', '').length));
    for (let k = 0; k < out.length; k++) out[k] = out[k].startsWith('-') ? '-' + out[k].slice(1).padStart(w, '0') : out[k].padStart(w, '0');
  }
  if (out.length) c.stdout.write(out.join(sep) + '\n');
  return 0;
});

register('expr', async (c) => {
  const toks = c.args;
  let i = 0;
  class ExprErr extends Error {}
  const isInt = (s: string) => /^-?\d+$/.test(s);
  const orE = (): string => {
    let l = andE();
    while (toks[i] === '|') {
      i++;
      const r = andE();
      l = l !== '' && l !== '0' ? l : r !== '' && r !== '0' ? r : '0';
    }
    return l;
  };
  const andE = (): string => {
    let l = cmpE();
    while (toks[i] === '&') {
      i++;
      const r = cmpE();
      l = l !== '' && l !== '0' && r !== '' && r !== '0' ? l : '0';
    }
    return l;
  };
  const cmpE = (): string => {
    let l = addE();
    while (['=', '!=', '<', '<=', '>', '>=', '=='].includes(toks[i])) {
      const op = toks[i++];
      const r = addE();
      const both = isInt(l) && isInt(r);
      const x = both ? Number(l) - Number(r) : l < r ? -1 : l > r ? 1 : 0;
      const res = op === '=' || op === '==' ? x === 0 : op === '!=' ? x !== 0 : op === '<' ? x < 0 : op === '<=' ? x <= 0 : op === '>' ? x > 0 : x >= 0;
      l = res ? '1' : '0';
    }
    return l;
  };
  const addE = (): string => {
    let l = mulE();
    while (toks[i] === '+' || toks[i] === '-') {
      const op = toks[i++];
      const r = mulE();
      if (!isInt(l) || !isInt(r)) throw new ExprErr('non-integer argument');
      l = String(op === '+' ? BigInt(l) + BigInt(r) : BigInt(l) - BigInt(r));
    }
    return l;
  };
  const mulE = (): string => {
    let l = matchE();
    while (toks[i] === '*' || toks[i] === '/' || toks[i] === '%') {
      const op = toks[i++];
      const r = matchE();
      if (!isInt(l) || !isInt(r)) throw new ExprErr('non-integer argument');
      if ((op === '/' || op === '%') && BigInt(r) === 0n) throw new ExprErr('division by zero');
      l = String(op === '*' ? BigInt(l) * BigInt(r) : op === '/' ? BigInt(l) / BigInt(r) : BigInt(l) % BigInt(r));
    }
    return l;
  };
  const matchE = (): string => {
    let l = prim();
    while (toks[i] === ':') {
      i++;
      const r = prim();
      l = exprMatch(l, r);
    }
    return l;
  };
  const exprMatch = (s: string, re: string) => {
    const rx = new RegExp('^(?:' + posixToJs(re, false) + ')');
    const m = rx.exec(s);
    if (/\\\(/.test(re)) return m ? m[1] ?? '' : '';
    return String(m ? m[0].length : 0);
  };
  const prim = (): string => {
    const t = toks[i++];
    if (t === undefined) throw new ExprErr('syntax error: missing argument after ‘' + (toks[i - 2] ?? '') + '’');
    if (t === '(') {
      const v = orE();
      if (toks[i++] !== ')') throw new ExprErr("syntax error: expecting ')'");
      return v;
    }
    if (t === 'length') return String([...prim()].length);
    if (t === 'substr') {
      const s = prim();
      const p = Number(prim());
      const n = Number(prim());
      return p < 1 || n < 1 ? '' : [...s].slice(p - 1, p - 1 + n).join('');
    }
    if (t === 'index') {
      const s = prim();
      const chars = prim();
      const idx = [...s].findIndex((ch) => chars.includes(ch));
      return String(idx + 1);
    }
    if (t === 'match') {
      const s = prim();
      return exprMatch(s, prim());
    }
    if (t === '+') return toks[i++] ?? '';
    return t;
  };
  try {
    const v = orE();
    if (i < toks.length) throw new ExprErr(`syntax error: unexpected argument ‘${toks[i]}’`);
    c.stdout.write(v + '\n');
    return v === '' || v === '0' ? 1 : 0;
  } catch (e) {
    if (e instanceof ExprErr) {
      c.err(e.message);
      return 2;
    }
    throw e;
  }
});

register('shuf', async (c) => {
  let n = Infinity;
  const ops: string[] = [];
  let range: [number, number] | null = null;
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-n') n = Number(c.args[++i]);
    else if (a === '-i') {
      const m = /^(-?\d+)-(-?\d+)$/.exec(c.args[++i] ?? '');
      if (m) range = [Number(m[1]), Number(m[2])];
    } else ops.push(a);
  }
  let lines: string[];
  if (range) lines = Array.from({ length: range[1] - range[0] + 1 }, (_, k) => String(range![0] + k));
  else {
    const t = await readText(c, ops[0] ?? '-');
    if (t === null) return 1;
    lines = splitLines(t);
  }
  for (let k = lines.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [lines[k], lines[j]] = [lines[j], lines[k]];
  }
  c.stdout.write(joinLines(lines.slice(0, n)));
  return 0;
});

register('strings', async (c) => {
  let min = 4;
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    if (c.args[i] === '-n') min = Number(c.args[++i]);
    else ops.push(c.args[i]);
  }
  for await (const inp of inputs(c, ops)) {
    if (inp.text === null) continue;
    const re = new RegExp(`[\\x20-\\x7e\\t]{${min},}`, 'g');
    c.stdout.write((inp.text.match(re) ?? []).map((s) => s + '\n').join(''));
  }
  return 0;
});

// `yes` with a safety cap: pipelines here are buffered, so infinite output is impossible.
register('yes', async (c) => {
  const s = c.args.length ? c.args.join(' ') : 'y';
  c.stdout.write((s + '\n').repeat(1000));
  return 0;
});

export { normalize, StringWriter };
