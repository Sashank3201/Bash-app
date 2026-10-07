// printf / echo -e formatting shared by builtins and awk.

/** Process backslash escapes like `echo -e` / `printf %b`. Returns [text, stop] where stop means \c was hit. */
export function echoEscapes(s: string): [string, boolean] {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i === s.length - 1) {
      out += c;
      continue;
    }
    const n = s[++i];
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case 'e':
      case 'E': out += '\x1b'; break;
      case '\\': out += '\\'; break;
      case 'c': return [out, true];
      case '0': {
        const m = /^[0-7]{0,3}/.exec(s.slice(i + 1))!;
        out += String.fromCharCode(parseInt(m[0] || '0', 8));
        i += m[0].length;
        break;
      }
      case 'x': {
        const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 1));
        if (m) {
          out += String.fromCharCode(parseInt(m[0], 16));
          i += m[0].length;
        } else out += '\\x';
        break;
      }
      default:
        out += '\\' + n;
    }
  }
  return [out, false];
}

/** Escapes allowed in a printf format string. */
function formatEscapes(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i === s.length - 1) {
      out += c;
      continue;
    }
    const n = s[++i];
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case 'e':
      case 'E': out += '\x1b'; break;
      case '\\': out += '\\'; break;
      case '"': out += '"'; break;
      case "'": out += "'"; break;
      case 'x': {
        const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 1));
        if (m) {
          out += String.fromCharCode(parseInt(m[0], 16));
          i += m[0].length;
        } else out += '\\x';
        break;
      }
      default:
        if (/[0-7]/.test(n)) {
          const m = /^[0-7]{0,2}/.exec(s.slice(i + 1))!;
          out += String.fromCharCode(parseInt(n + m[0], 8));
          i += m[0].length;
        } else out += '\\' + n;
    }
  }
  return out;
}

export function shellQuote(s: string): string {
  if (s === '') return "''";
  if (/^[A-Za-z0-9_./=:,@%+-]+$/.test(s)) return s;
  return s.replace(/[^A-Za-z0-9_./=:,@%+-]/g, (c) => (c === '\n' ? "$'\\n'" : '\\' + c));
}

/** toFixed with C-library rounding (exact binary ties round half to even). */
export function toFixedC(x: number, prec: number): string {
  if (!isFinite(x)) return String(x);
  const p = Math.min(100, prec + 30);
  const long = Math.abs(x).toFixed(p);
  const dot = long.indexOf('.');
  const rest = dot >= 0 ? long.slice(dot + 1 + prec) : '';
  if (/^50*$/.test(rest)) {
    const kept = long.slice(0, dot + 1 + prec).replace(/\.$/, '');
    const lastDigit = Number(kept[kept.length - 1]);
    if (lastDigit % 2 === 0) return (x < 0 ? '-' : '') + kept;
  }
  return x.toFixed(prec);
}

function pad(s: string, width: number, left: boolean, zero: boolean): string {
  if (s.length >= width) return s;
  if (left) return s + ' '.repeat(width - s.length);
  if (zero) {
    const sign = /^[+-]/.test(s) ? s[0] : '';
    const body = sign ? s.slice(1) : s;
    return sign + '0'.repeat(width - s.length) + body;
  }
  return ' '.repeat(width - s.length) + s;
}

export function formatExp(n: number, prec: number, upper: boolean): string {
  if (!isFinite(n)) return String(n);
  let s = n.toExponential(prec);
  s = s.replace(/e([+-])(\d)$/, 'e$10$2');
  return upper ? s.toUpperCase() : s;
}

export function formatG(n: number, prec: number, upper: boolean, alt = false): string {
  if (!isFinite(n)) return String(n);
  if (prec === 0) prec = 1;
  if (n === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(n)));
  let s: string;
  if (exp < -4 || exp >= prec) {
    s = n.toExponential(prec - 1);
    if (!alt) s = s.replace(/\.?0+e/, 'e');
    s = s.replace(/e([+-])(\d)$/, 'e$10$2');
  } else {
    s = n.toFixed(Math.max(0, prec - 1 - exp));
    if (!alt && s.includes('.')) s = s.replace(/\.?0+$/, '');
  }
  return upper ? s.toUpperCase() : s;
}

export interface PrintfResult {
  out: string;
  errors: string[];
}

function toInt(arg: string, errors: string[]): number {
  if (arg === undefined || arg === '') return 0;
  if (/^['"]/.test(arg)) return arg.length > 1 ? arg.codePointAt(1)! : 0;
  const t = arg.trim();
  let m = /^([+-]?)0[xX]([0-9a-fA-F]+)$/.exec(t);
  if (m) return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 16);
  m = /^([+-]?)0([0-7]+)$/.exec(t);
  if (m) return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 8);
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  const lead = /^[+-]?\d+/.exec(t);
  errors.push(`${arg}: invalid number`);
  return lead ? parseInt(lead[0], 10) : 0;
}

function toFloat(arg: string, errors: string[]): number {
  if (arg === undefined || arg === '') return 0;
  if (/^['"]/.test(arg)) return arg.length > 1 ? arg.codePointAt(1)! : 0;
  const t = arg.trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) || /^[+-]?(inf|infinity|nan)$/i.test(t)) return parseFloat(t);
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  errors.push(`${arg}: invalid number`);
  const lead = /^[+-]?(\d+\.?\d*|\.\d+)/.exec(t);
  return lead ? parseFloat(lead[0]) : 0;
}

/** Bash printf: the format is reused while arguments remain. */
export function printf(format: string, args: string[]): PrintfResult {
  const errors: string[] = [];
  let out = '';
  let ai = 0;
  const fmt = format;
  for (let pass = 0; ; pass++) {
    const startAi = ai;
    let i = 0;
    let stop = false;
    while (i < fmt.length) {
      const c = fmt[i];
      if (c === '\\') {
        // escape — take the escape sequence chunk
        const m = /^\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/s.exec(fmt.slice(i));
        out += formatEscapes(m ? m[0] : '\\');
        i += m ? m[0].length : 1;
        continue;
      }
      if (c !== '%') {
        out += c;
        i++;
        continue;
      }
      const m = /^%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d*))?([diouxXfFeEgGcsbq%])/.exec(fmt.slice(i));
      if (!m) {
        out += '%';
        i++;
        if (i >= fmt.length) errors.push('`%\': missing format character');
        continue;
      }
      i += m[0].length;
      const flags = m[1];
      let width = 0;
      if (m[2] === '*') width = toInt(args[ai++] ?? '', errors);
      else if (m[2]) width = Number(m[2]);
      let prec: number | undefined;
      if (m[3] !== undefined) prec = m[3] === '*' ? toInt(args[ai++] ?? '', errors) : Number(m[3] || '0');
      const left = flags.includes('-') || width < 0;
      width = Math.abs(width);
      const zero = flags.includes('0') && !left;
      const conv = m[4];
      if (conv === '%') {
        out += '%';
        continue;
      }
      const arg = args[ai++];
      let s: string;
      switch (conv) {
        case 'd':
        case 'i':
        case 'u': {
          let n = toInt(arg ?? '', errors);
          if (conv === 'u' && n < 0) n = 2 ** 64 + n;
          s = String(Math.abs(n));
          if (prec !== undefined) s = s.padStart(prec, '0');
          s = (n < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '') + s;
          out += pad(s, width, left, zero && prec === undefined);
          break;
        }
        case 'o':
        case 'x':
        case 'X': {
          let n = toInt(arg ?? '', errors);
          if (n < 0) n = 2 ** 64 + n;
          s = n.toString(conv === 'o' ? 8 : 16);
          if (conv === 'X') s = s.toUpperCase();
          if (prec !== undefined) s = s.padStart(prec, '0');
          if (flags.includes('#') && n !== 0) s = (conv === 'o' ? '0' : conv === 'x' ? '0x' : '0X') + s;
          out += pad(s, width, left, zero);
          break;
        }
        case 'f':
        case 'F':
        case 'e':
        case 'E':
        case 'g':
        case 'G': {
          const n = toFloat(arg ?? '', errors);
          const p = prec ?? 6;
          if (conv === 'f' || conv === 'F') s = toFixedC(Math.abs(n), p);
          else if (conv === 'e' || conv === 'E') s = formatExp(Math.abs(n), p, conv === 'E');
          else s = formatG(Math.abs(n), p, conv === 'G', flags.includes('#'));
          s = (n < 0 || Object.is(n, -0) ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '') + s;
          out += pad(s, width, left, zero);
          break;
        }
        case 'c':
          s = (arg ?? '').slice(0, 1);
          out += pad(s, width, left, false);
          break;
        case 's':
          s = arg ?? '';
          if (prec !== undefined) s = s.slice(0, prec);
          out += pad(s, width, left, false);
          break;
        case 'b': {
          const [t, st] = echoEscapes(arg ?? '');
          s = prec !== undefined ? t.slice(0, prec) : t;
          out += pad(s, width, left, false);
          if (st) stop = true;
          break;
        }
        case 'q':
          out += pad(shellQuote(arg ?? ''), width, left, false);
          break;
      }
      if (stop) break;
    }
    if (stop) break;
    if (ai >= args.length || ai === startAi) break;
    if (pass > 10000) break;
  }
  return { out, errors };
}
