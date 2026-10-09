// Encoding & integrity: base64, xxd, hexdump, md5sum, sha1sum, sha256sum, sha512sum

import { md5, sha1, sha256, sha512 } from 'hash-wasm';
import { readText, register, splitLines, type CmdCtx } from './registry';

const enc = new TextEncoder();

/** File contents are JS strings; text is UTF-8, decoded binary keeps one char per byte. */
export function toBytes(s: string): Uint8Array {
  // strings produced by binary decoding are marked by containing only \u0000-ÿ and invalid utf8 when re-decoded;
  // we keep it simple: if every char is < 256 and the string came from bytes, latin1 == bytes.
  if (BINARY.has(s)) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  return enc.encode(s);
}

/** Strings we produced from non-UTF-8 bytes (so hashing/encoding them round-trips). */
const BINARY = new Set<string>();

export function fromBytes(b: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    if (BINARY.size > 500) BINARY.clear();
    BINARY.add(s);
    return s;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return out;
}

export function base64Decode(s: string, ignoreGarbage = false): Uint8Array | null {
  let clean = s.replace(/[\r\n\t ]/g, '');
  if (ignoreGarbage) clean = clean.replace(/[^A-Za-z0-9+/=]/g, '');
  if (/[^A-Za-z0-9+/=]/.test(clean)) return null;
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    if (ch === '=') break;
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  if (clean.length % 4 !== 0 && !ignoreGarbage) return null;
  return new Uint8Array(bytes);
}

register('base64', async (c) => {
  let decode = false;
  let wrap = 76;
  let ignore = false;
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-d' || a === '--decode' || a === '-D') decode = true;
    else if (a === '-i' || a === '--ignore-garbage') ignore = true;
    else if (a === '-w') wrap = Number(c.args[++i]);
    else if (/^-w\d+$/.test(a)) wrap = Number(a.slice(2));
    else if (a.startsWith('--wrap=')) wrap = Number(a.slice(7));
    else if (/^-[di]+$/.test(a)) {
      if (a.includes('d')) decode = true;
      if (a.includes('i')) ignore = true;
    } else ops.push(a);
  }
  const t = await readText(c, ops[0] ?? '-');
  if (t === null) return 1;
  if (decode) {
    const b = base64Decode(t, ignore);
    if (!b) {
      // GNU prints what it could decode, then the error
      // (only the valid prefix — decoding stops at the first bad character)
      const prefix = /^[A-Za-z0-9+/]*/.exec(t.replace(/[\r\n]/g, ''))![0];
      const partial = base64Decode(prefix, true);
      if (partial?.length) c.stdout.write(fromBytes(partial));
      c.err('invalid input');
      return 1;
    }
    c.stdout.write(fromBytes(b));
    return 0;
  }
  const e = base64Encode(toBytes(t));
  const lines = wrap > 0 ? e.match(new RegExp(`.{1,${wrap}}`, 'g')) ?? [] : [e];
  c.stdout.write(lines.length && e ? lines.join('\n') + '\n' : e ? e + '\n' : '');
  return 0;
});

function printable(x: number) {
  return x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '.';
}

register('xxd', async (c) => {
  let plain = false;
  let reverse = false;
  let cols = 16;
  let len = Infinity;
  let upper = false;
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-p' || a === '-ps' || a === '-plain') plain = true;
    else if (a === '-r' || a === '-revert') reverse = true;
    else if (a === '-rp' || a === '-pr') {
      reverse = true;
      plain = true;
    } else if (a === '-c') cols = Number(c.args[++i]);
    else if (a === '-l') len = Number(c.args[++i]);
    else if (a === '-u') upper = true;
    else ops.push(a);
  }
  const t = await readText(c, ops[0] ?? '-');
  if (t === null) return 1;
  if (reverse) {
    let hex: string;
    if (plain) hex = t.replace(/[^0-9a-fA-F]/g, '');
    else hex = splitLines(t).map((l) => l.replace(/^[0-9a-fA-F]+:\s*/, '').split('  ')[0].replace(/[^0-9a-fA-F]/g, '')).join('');
    const bytes = new Uint8Array(Math.floor(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    c.stdout.write(fromBytes(bytes));
    return 0;
  }
  let b = toBytes(t);
  if (len !== Infinity) b = b.slice(0, len);
  const hx = (x: number) => {
    const s = x.toString(16).padStart(2, '0');
    return upper ? s.toUpperCase() : s;
  };
  let out = '';
  if (plain) {
    const all = [...b].map(hx).join('');
    out = (all.match(/.{1,60}/g) ?? []).join('\n') + (all ? '\n' : '');
  } else {
    for (let off = 0; off < b.length; off += cols) {
      const chunk = b.slice(off, off + cols);
      let hexPart = '';
      for (let i = 0; i < cols; i++) {
        hexPart += i < chunk.length ? hx(chunk[i]) : '  ';
        if (i % 2 === 1) hexPart += ' ';
      }
      out += `${off.toString(16).padStart(8, '0')}: ${hexPart} ${[...chunk].map(printable).join('')}\n`;
    }
  }
  c.stdout.write(out);
  return 0;
});

register(['hexdump', 'hd'], async (c) => {
  const ops = c.args.filter((a) => !a.startsWith('-'));
  const t = await readText(c, ops[0] ?? '-');
  if (t === null) return 1;
  const b = toBytes(t);
  let out = '';
  for (let off = 0; off < b.length; off += 16) {
    const chunk = b.slice(off, off + 16);
    const hex = [...chunk].map((x) => x.toString(16).padStart(2, '0'));
    const left = hex.slice(0, 8).join(' ').padEnd(23);
    const right = hex.slice(8).join(' ').padEnd(23);
    out += `${off.toString(16).padStart(8, '0')}  ${left}  ${right}  |${[...chunk].map(printable).join('')}|\n`;
  }
  out += b.length.toString(16).padStart(8, '0') + '\n';
  c.stdout.write(out);
  return 0;
});

const HASHES: Record<string, (d: Uint8Array) => Promise<string>> = {
  md5sum: (d) => md5(d),
  sha1sum: (d) => sha1(d),
  sha256sum: (d) => sha256(d),
  sha512sum: (d) => sha512(d),
};

async function hashCmd(c: CmdCtx): Promise<number> {
  const fn = HASHES[c.name];
  let check = false;
  let quiet = false;
  let status = false;
  const ops: string[] = [];
  for (const a of c.args) {
    if (a === '-c' || a === '--check') check = true;
    else if (a === '--quiet') quiet = true;
    else if (a === '--status') status = true;
    else if (a === '-b' || a === '-t' || a === '--tag') {
      /* ignore */
    } else ops.push(a);
  }
  if (check) {
    let failed = 0;
    let missing = 0;
    let rc = 0;
    for (const f of ops.length ? ops : ['-']) {
      const t = await readText(c, f);
      if (t === null) return 1;
      for (const line of splitLines(t)) {
        const m = /^([0-9a-fA-F]+) [ *](.+)$/.exec(line);
        if (!m) continue;
        const target = m[2];
        const content = await readTextQuiet(c, target);
        if (content === null) {
          if (!status) c.stdout.write(`${target}: FAILED open or read\n`);
          c.stderr.write(`${c.name}: ${target}: No such file or directory\n`);
          missing++;
          rc = 1;
          continue;
        }
        const h = await fn(toBytes(content));
        const ok = h.toLowerCase() === m[1].toLowerCase();
        if (!ok) {
          failed++;
          rc = 1;
        }
        if (!status && (!quiet || !ok)) c.stdout.write(`${target}: ${ok ? 'OK' : 'FAILED'}\n`);
      }
    }
    // GNU reports unreadable files before mismatches
    if (missing && !status) c.stderr.write(`${c.name}: WARNING: ${missing} listed file${missing > 1 ? 's' : ''} could not be read\n`);
    if (failed && !status) c.stderr.write(`${c.name}: WARNING: ${failed} computed checksum${failed > 1 ? 's' : ''} did NOT match\n`);
    return rc;
  }
  let rc = 0;
  for (const f of ops.length ? ops : ['-']) {
    const n = f === '-' ? null : c.vfs.tryLookup(c.abs(f));
    if (n?.type === 'dir') {
      c.err(`${f}: Is a directory`);
      rc = 1;
      continue;
    }
    const t = await readText(c, f);
    if (t === null) {
      rc = 1;
      continue;
    }
    c.stdout.write(`${await fn(toBytes(t))}  ${f}\n`);
  }
  return rc;
}

async function readTextQuiet(c: CmdCtx, path: string): Promise<string | null> {
  try {
    return c.vfs.readFile(c.abs(path), c.cred);
  } catch {
    return null;
  }
}

register(Object.keys(HASHES), hashCmd);
