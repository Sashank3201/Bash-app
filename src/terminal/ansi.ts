// Minimal ANSI SGR parser → styled spans.

export interface Span {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function color256(n: number): string {
  if (n < 16) return `var(--ansi-${n})`;
  if (n < 232) {
    const i = n - 16;
    const conv = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `rgb(${conv(Math.floor(i / 36))},${conv(Math.floor((i % 36) / 6))},${conv(i % 6)})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g},${g},${g})`;
}

export function parseAnsi(input: string): Span[] {
  const spans: Span[] = [];
  let style: Omit<Span, 'text'> = {};
  let inverse = false;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const st = inverse ? { ...style, fg: style.bg ?? 'var(--term-bg)', bg: style.fg ?? 'var(--term-fg)' } : style;
    spans.push({ text: buf, ...st });
    buf = '';
  };
  // eslint-disable-next-line no-control-regex
  const re = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b\(B|\x1b[=>]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    buf += input.slice(last, m.index);
    last = re.lastIndex;
    if (m[2] !== 'm') continue;
    flush();
    const codes = (m[1] || '0').split(';').map((x) => Number(x) || 0);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) {
        style = {};
        inverse = false;
      } else if (c === 1) style.bold = true;
      else if (c === 2) style.dim = true;
      else if (c === 3) style.italic = true;
      else if (c === 4) style.underline = true;
      else if (c === 7) inverse = true;
      else if (c === 22) {
        style.bold = false;
        style.dim = false;
      } else if (c === 23) style.italic = false;
      else if (c === 24) style.underline = false;
      else if (c === 27) inverse = false;
      else if (c >= 30 && c <= 37) style.fg = `var(--ansi-${c - 30})`;
      else if (c >= 90 && c <= 97) style.fg = `var(--ansi-${c - 90 + 8})`;
      else if (c >= 40 && c <= 47) style.bg = `var(--ansi-${c - 40})`;
      else if (c >= 100 && c <= 107) style.bg = `var(--ansi-${c - 100 + 8})`;
      else if (c === 39) style.fg = undefined;
      else if (c === 49) style.bg = undefined;
      else if ((c === 38 || c === 48) && codes[i + 1] === 5) {
        const col = color256(codes[i + 2] ?? 0);
        if (c === 38) style.fg = col;
        else style.bg = col;
        i += 2;
      } else if ((c === 38 || c === 48) && codes[i + 1] === 2) {
        const col = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
        if (c === 38) style.fg = col;
        else style.bg = col;
        i += 4;
      }
    }
  }
  buf += input.slice(last);
  flush();
  return spans;
}

export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\(B|\x1b[=>]/g, '');
}

/** Apply carriage returns (progress bars) so "50%\r100%" shows "100%". */
export function applyCR(text: string): string {
  if (!text.includes('\r')) return text;
  return text
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const parts = line.split('\r');
      let cur = '';
      for (const p of parts) cur = p + cur.slice(p.length);
      return cur;
    })
    .join('\n');
}
