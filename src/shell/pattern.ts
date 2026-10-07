// Glob patterns (bash) and POSIX regular expressions (grep/sed/awk) → JavaScript RegExp.

const CLASSES: Record<string, string> = {
  alpha: 'A-Za-z',
  digit: '0-9',
  alnum: 'A-Za-z0-9',
  upper: 'A-Z',
  lower: 'a-z',
  space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~',
  xdigit: '0-9A-Fa-f',
  word: 'A-Za-z0-9_',
  cntrl: '\\x00-\\x1f\\x7f',
  print: '\\x20-\\x7e',
  graph: '\\x21-\\x7e',
};

function escapeRe(ch: string): string {
  return /[\\^$.*+?()[\]{}|/-]/.test(ch) ? '\\' + ch : ch;
}

/**
 * Parse a bracket expression starting at s[i] === '['. Returns [jsClass, nextIndex] or null if unterminated.
 * In globs `!` negates; in regex `^` negates (globs accept both).
 */
function bracket(s: string, i: number, glob: boolean): [string, number] | null {
  let j = i + 1;
  let neg = false;
  if (s[j] === '^' || (glob && s[j] === '!')) {
    neg = true;
    j++;
  }
  let out = '';
  let first = true;
  while (j < s.length) {
    const c = s[j];
    if (c === ']' && !first) {
      return ['[' + (neg ? '^' : '') + out + ']', j + 1];
    }
    first = false;
    if (c === '[' && s[j + 1] === ':') {
      const end = s.indexOf(':]', j + 2);
      if (end > 0) {
        const name = s.slice(j + 2, end);
        out += CLASSES[name] ?? '';
        j = end + 2;
        continue;
      }
    }
    if (glob && c === '\\' && j + 1 < s.length) {
      out += escapeRe(s[j + 1]);
      j += 2;
      continue;
    }
    if (c === '-' && out && s[j + 1] !== ']' && j + 1 < s.length) {
      out += '-';
      j++;
      continue;
    }
    out += c === '\\' || c === ']' || c === '[' || c === '^' || c === '-' ? '\\' + c : c;
    j++;
  }
  return null;
}

/**
 * Glob → regex source (unanchored). Backslash escapes the next char.
 * `pathname`: `*` and `?` don't match `/`.
 */
export function globToRegexSource(pat: string, pathname = false): string {
  let re = '';
  const any = pathname ? '[^/]' : '[\\s\\S]';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\') {
      if (i + 1 < pat.length) {
        re += escapeRe(pat[i + 1]);
        i++;
      } else re += '\\\\';
    } else if (c === '*') {
      re += any + '*';
      while (pat[i + 1] === '*') i++;
    } else if (c === '?') {
      re += any;
    } else if (c === '[') {
      const b = bracket(pat, i, true);
      if (b) {
        re += b[0];
        i = b[1] - 1;
      } else re += '\\[';
    } else re += escapeRe(c);
  }
  return re;
}

export function globMatch(pat: string, s: string, opts: { nocase?: boolean; pathname?: boolean } = {}): boolean {
  try {
    return new RegExp('^' + globToRegexSource(pat, opts.pathname) + '$', opts.nocase ? 'i' : '').test(s);
  } catch {
    return pat === s;
  }
}

export function hasGlob(pat: string): boolean {
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '*' || c === '?') return true;
    if (c === '[' && bracket(pat, i, true)) return true;
  }
  return false;
}

/** Remove glob escapes (used when a pattern matched nothing). */
export function unescapeGlob(pat: string): string {
  return pat.replace(/\\(.)/g, '$1');
}

/** Escape a literal so it is matched literally inside a glob. */
export function escapeGlob(s: string): string {
  return s.replace(/[\\*?[\]]/g, '\\$&');
}

export interface PosixRegexOpts {
  extended: boolean;
  icase?: boolean;
  global?: boolean;
}

/** Convert a POSIX BRE/ERE (with common GNU extensions) to a JS RegExp. Throws on invalid patterns. */
export function posixRegex(pat: string, opts: PosixRegexOpts): RegExp {
  return new RegExp(posixToJs(pat, opts.extended), (opts.icase ? 'i' : '') + (opts.global ? 'g' : ''));
}

export function posixToJs(pat: string, extended: boolean): string {
  let re = '';
  let i = 0;
  // position tracking for "start of expression" (where * and ^ have special rules in BRE)
  let atStart = true;
  while (i < pat.length) {
    const c = pat[i];
    if (c === '[') {
      const b = bracket(pat, i, false);
      if (!b) throw new Error('Unmatched [');
      re += b[0];
      i = b[1];
      atStart = false;
      continue;
    }
    if (c === '\\') {
      const n = pat[i + 1];
      i += 2;
      if (n === undefined) throw new Error('Trailing backslash');
      if (!extended && '(){}|+?'.includes(n)) {
        re += n;
        atStart = n === '(' || n === '|';
        continue;
      }
      if (n === '<' || n === '>') {
        re += '\\b';
        continue;
      }
      if ('wWsSbB'.includes(n)) {
        re += '\\' + n;
        atStart = false;
        continue;
      }
      if (/[1-9]/.test(n)) {
        re += '\\' + n;
        atStart = false;
        continue;
      }
      if (n === 'n') {
        re += '\\n';
        continue;
      }
      if (n === 't') {
        re += '\\t';
        continue;
      }
      re += escapeRe(n);
      atStart = false;
      continue;
    }
    if (extended) {
      if (c === '{' && !/^\{[0-9]+(,[0-9]*)?\}/.test(pat.slice(i))) {
        re += '\\{';
      } else if (c === '}' && !/\{[0-9]+(,[0-9]*)?$/.test(pat.slice(0, i))) {
        re += '\\}';
      } else if ((c === '*' || c === '+' || c === '?') && atStart) {
        re += '\\' + c;
      } else {
        re += c === '/' ? '\\/' : c;
      }
      atStart = c === '(' || c === '|';
      i++;
      continue;
    }
    // BRE
    if ('(){}|+?'.includes(c)) {
      re += '\\' + c;
    } else if (c === '*' && atStart) {
      re += '\\*';
    } else if (c === '^' && !atStart) {
      re += '\\^';
    } else if (c === '$' && i !== pat.length - 1 && !pat.startsWith('\\)', i + 1) && !pat.startsWith('\\|', i + 1)) {
      re += '\\$';
    } else if (c === '/') {
      re += '\\/';
    } else {
      re += c;
    }
    atStart = c === '^' && atStart;
    i++;
  }
  return re;
}

/** Build a RegExp from a bash [[ =~ ]] pattern (ERE). */
export function bashRegex(pat: string): RegExp {
  return new RegExp(posixToJs(pat, true));
}
