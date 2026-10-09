// Filesystem commands: ls cat touch mkdir rm cp mv ln find chmod chown stat file tree ...

import { posixRegex, globMatch } from '../pattern';
import { FsError, VFS, basename, ctimeOf, dirname, modeString, normalize, type Inode } from '../vfs';
import { ansi, cmpC, parseOpts, readText, register, splitLines, withUsage, type CmdCtx } from './registry';
import { lsTime, parseDate, strftime } from './time';

// ------------------------------------------------------------------ helpers

function lookup(c: CmdCtx, p: string, follow = true): Inode | null {
  try {
    return c.vfs.lookup(c.abs(p), { follow, cred: c.cred });
  } catch {
    return null;
  }
}

function fsMsg(e: unknown): string {
  return e instanceof FsError ? e.message : String(e);
}

export function humanSize(n: number): string {
  if (n < 1024) return String(n);
  const units = ['K', 'M', 'G', 'T'];
  let v = n;
  let u = -1;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  if (v < 10) return (Math.ceil(v * 10) / 10).toFixed(1) + units[u];
  return Math.ceil(v) + units[u];
}

function blocks1k(vfs: VFS, n: Inode): number {
  if (n.type === 'dir') return 4;
  if (n.type === 'link') return 0;
  const size = vfs.size(n);
  return Math.ceil(size / 4096) * 4;
}

function linkCount(n: Inode): number {
  if (n.type !== 'dir') return 1;
  let k = 2;
  for (const ch of n.children!.values()) if (ch.type === 'dir') k++;
  return k;
}

function colorName(name: string, n: Inode, tty: boolean): string {
  if (!tty) return name;
  if (n.type === 'dir') return n.mode & 0o002 && n.mode & 0o1000 ? `\x1b[30;42m${name}\x1b[0m` : ansi.blue(name);
  if (n.type === 'link') return ansi.cyan(name);
  if (n.mode & 0o4000) return ansi.redBg(name);
  if (n.mode & 0o111) return ansi.green(name);
  return name;
}

function classify(n: Inode): string {
  if (n.type === 'dir') return '/';
  if (n.type === 'link') return '@';
  if (n.mode & 0o111) return '*';
  return '';
}

/** Lay out names in columns for a terminal of `width` columns (GNU-style vertical fill). */
function columns(items: { plain: string; shown: string }[], width: number): string {
  if (!items.length) return '';
  const maxLen = Math.max(...items.map((i) => i.plain.length));
  const colW = maxLen + 2;
  const cols = Math.max(1, Math.floor((width + 2) / colW));
  const rows = Math.ceil(items.length / cols);
  let out = '';
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const idx = col * rows + r;
      if (idx >= items.length) break;
      const it = items[idx];
      const isLast = (col + 1) * rows + r >= items.length;
      line += it.shown + (isLast ? '' : ' '.repeat(colW - it.plain.length));
    }
    out += line + '\n';
  }
  return out;
}

// ------------------------------------------------------------------ ls

register(
  ['ls', 'dir'],
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, {
      short: 'lahAR1dtrSFinUG',
      long: { all: 'a', 'almost-all': 'A', 'human-readable': 'h', recursive: 'R', directory: 'd', reverse: 'r', classify: 'F', color: '', 'group-directories-first': '' },
    });
    const tty = !!c.stdout.isTTY;
    const long = !!flags.l || !!flags.n;
    const now = c.vfs.now();
    const width = c.sh.host.cols?.() ?? 80;
    let status = 0;
    const targets = operands.length ? operands : ['.'];

    const sortEntries = (entries: { name: string; node: Inode }[]) => {
      if (flags.U) return entries;
      entries.sort((a, b) => cmpC(a.name, b.name));
      if (flags.t) entries.sort((a, b) => b.node.mtime - a.node.mtime || cmpC(a.name, b.name));
      if (flags.S) entries.sort((a, b) => c.vfs.size(b.node) - c.vfs.size(a.node) || cmpC(a.name, b.name));
      if (flags.r) entries.reverse();
      return entries;
    };

    const render = (entries: { name: string; node: Inode; link?: Inode | null }[], showTotal: boolean): string => {
      if (!long) {
        const items = entries.map((e) => {
          const suffix = flags.F ? classify(e.node) : '';
          return { plain: e.name + suffix, shown: colorName(e.name, e.node, tty) + suffix };
        });
        if (tty && !flags['1']) return columns(items, width);
        return items.map((i) => i.shown + '\n').join('');
      }
      const rows = entries.map((e) => {
        const n = e.node;
        const owner = flags.n ? String(n.uid) : c.vfs.userName(n.uid);
        const group = flags.n ? String(n.gid) : c.vfs.groupName(n.gid);
        const size = flags.h ? humanSize(c.vfs.size(n)) : String(c.vfs.size(n));
        let name = colorName(e.name, n, tty) + (flags.F ? classify(n) : '');
        if (n.type === 'link') name += ' -> ' + n.target;
        return { mode: modeString(n), links: String(linkCount(n)), owner, group, size, time: lsTime(n.mtime, now), name };
      });
      const w = (k: 'links' | 'owner' | 'group' | 'size') => Math.max(0, ...rows.map((r) => r[k].length));
      const wl = w('links');
      const wo = w('owner');
      const wg = w('group');
      const ws = w('size');
      let out = '';
      if (showTotal) {
        const total = entries.reduce((s, e) => s + blocks1k(c.vfs, e.node), 0);
        out += `total ${flags.h ? humanSize(total * 1024) : total}\n`;
      }
      for (const r of rows) {
        out += `${r.mode} ${r.links.padStart(wl)} ${r.owner.padEnd(wo)} ${flags.G ? '' : r.group.padEnd(wg) + ' '}${r.size.padStart(ws)} ${r.time} ${r.name}\n`;
      }
      return out;
    };

    const files: { name: string; node: Inode }[] = [];
    const dirs: { name: string; node: Inode }[] = [];
    for (const t of targets) {
      let n: Inode;
      try {
        n = c.vfs.lookup(c.abs(t), { cred: c.cred, follow: !(long && !t.endsWith('/') && c.vfs.tryLookup(c.abs(t), false)?.type === 'link') });
      } catch (e) {
        c.err(`cannot access '${t}': ${fsMsg(e)}`);
        status = 2;
        continue;
      }
      if (n.type === 'dir' && !flags.d) dirs.push({ name: t, node: n });
      else files.push({ name: t, node: n });
    }
    let out = '';
    sortEntries(files);
    if (files.length) out += render(files, false);
    const sortedDirs = flags.U ? dirs : dirs.sort((a, b) => cmpC(a.name, b.name));
    const multi = targets.length > 1 || !!flags.R;
    let first = !files.length;

    const listDir = (label: string, path: string, node: Inode) => {
      if (!c.vfs.can(node, c.cred, 'r')) {
        c.err(`cannot open directory '${label}': Permission denied`);
        status = 2;
        return;
      }
      let entries = [...node.children!.entries()].map(([name, nd]) => ({ name, node: nd }));
      if (!flags.a && !flags.A) entries = entries.filter((e) => !e.name.startsWith('.'));
      if (flags.a) {
        entries.push({ name: '.', node });
        let parent = node;
        try {
          parent = c.vfs.lookup(dirname(path));
        } catch {}
        entries.push({ name: '..', node: parent });
      }
      sortEntries(entries);
      if (multi) out += (first ? '' : '\n') + label + ':\n';
      first = false;
      out += render(entries, true);
      if (flags.R) {
        for (const e of entries) {
          if (e.node.type === 'dir' && e.name !== '.' && e.name !== '..') {
            const sub = label === '/' ? '/' + e.name : label + '/' + e.name;
            listDir(sub, normalize(e.name, path), e.node);
          }
        }
      }
    };
    for (const d of sortedDirs) listDir(d.name, c.abs(d.name), d.node);
    c.stdout.write(out);
    return status;
  }),
);

// ------------------------------------------------------------------ cat / tac / less

register(
  'cat',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, {
      short: 'nbsEAvTeu',
      long: { number: 'n', 'number-nonblank': 'b', 'squeeze-blank': 's', 'show-ends': 'E', 'show-all': 'A', 'show-tabs': 'T' },
    });
    let status = 0;
    let lineNo = 0;
    const files = operands.length ? operands : ['-'];
    for (const f of files) {
      const node = f === '-' ? null : lookup(c, f);
      if (node && node.type === 'dir') {
        c.err(`${f}: Is a directory`);
        status = 1;
        continue;
      }
      const text = await readText(c, f);
      if (text === null) {
        status = 1;
        continue;
      }
      if (!flags.n && !flags.b && !flags.s && !flags.E && !flags.A && !flags.T && !flags.e) {
        c.stdout.write(text);
        continue;
      }
      const lines = text.split('\n');
      const endsNl = text.endsWith('\n');
      if (endsNl) lines.pop();
      let out = '';
      let prevBlank = false;
      lines.forEach((l, i) => {
        const blank = l === '';
        if (flags.s && blank && prevBlank) return;
        prevBlank = blank;
        let s = l;
        if (flags.T || flags.A) s = s.replace(/\t/g, '^I');
        if (flags.E || flags.A || flags.e) s += '$';
        if (flags.b ? !blank : flags.n) s = String(++lineNo).padStart(6) + '\t' + s;
        out += s + (i < lines.length - 1 || endsNl ? '\n' : '');
      });
      c.stdout.write(out);
    }
    return status;
  }),
);

register('tac', async (c) => {
  let status = 0;
  for (const f of c.args.length ? c.args : ['-']) {
    const t = await readText(c, f);
    if (t === null) {
      status = 1;
      continue;
    }
    const lines = splitLines(t);
    c.stdout.write(lines.reverse().map((l) => l + '\n').join(''));
  }
  return status;
});

register(['less', 'more', 'most'], async (c) => {
  const files = c.args.filter((a) => !a.startsWith('-'));
  let status = 0;
  for (const f of files.length ? files : ['-']) {
    const t = await readText(c, f);
    if (t === null) status = 1;
    else c.stdout.write(t);
  }
  return status;
});

// ------------------------------------------------------------------ touch / mkdir / rmdir / rm

register(
  'touch',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'acm', withArg: 'dtr', long: { 'no-create': 'c', date: 'd=' } });
    if (!operands.length) {
      c.err('missing file operand');
      return 1;
    }
    let when = c.vfs.now();
    if (typeof flags.d === 'string') {
      const t = parseDate(flags.d, when);
      if (t === null) {
        c.err(`invalid date format ‘${flags.d}’`);
        return 1;
      }
      when = t;
    } else if (typeof flags.t === 'string') {
      const m = /^(\d{2})?(\d{2})?(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{2}))?$/.exec(flags.t);
      if (!m) {
        c.err(`invalid date format ‘${flags.t}’`);
        return 1;
      }
      const year = m[2] ? Number((m[1] ?? '20') + m[2]) : new Date(when).getUTCFullYear();
      when = Date.UTC(year, +m[3] - 1, +m[4], +m[5], +m[6], +(m[7] ?? 0));
    } else if (typeof flags.r === 'string') {
      try {
        when = c.vfs.lookup(c.abs(flags.r), { cred: c.cred }).mtime;
      } catch (e) {
        c.err(`failed to get attributes of '${flags.r}': ${fsMsg(e)}`);
        return 1;
      }
    }
    let status = 0;
    for (const f of operands) {
      const abs = c.abs(f);
      try {
        const n = c.vfs.tryLookup(abs);
        if (n) {
          if (c.cred.uid !== 0 && n.uid !== c.cred.uid && !c.vfs.can(n, c.cred, 'w')) throw new FsError('EACCES');
          n.mtime = when;
          n.ctime = c.vfs.now(); // any metadata change moves ctime, even when mtime is backdated
        } else if (!flags.c) {
          c.vfs.writeFile(abs, '', { cred: c.cred });
          const created = c.vfs.lookup(abs);
          created.mtime = when;
          created.ctime = c.vfs.now();
        }
      } catch (e) {
        c.err(`cannot touch '${f}': ${fsMsg(e)}`);
        status = 1;
      }
    }
    return status;
  }),
);

register(
  'mkdir',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'pv', withArg: 'm', long: { parents: 'p', verbose: 'v', mode: 'm=' } });
    if (!operands.length) {
      c.err('missing operand');
      return 1;
    }
    let status = 0;
    const mode = typeof flags.m === 'string' ? parseInt(flags.m, 8) : undefined;
    for (const d of operands) {
      try {
        if (flags.p && c.vfs.tryLookup(c.abs(d))?.type === 'dir') continue;
        c.vfs.mkdir(c.abs(d), { parents: !!flags.p, cred: c.cred, mode });
        if (flags.v) c.stdout.write(`mkdir: created directory '${d}'\n`);
      } catch (e) {
        c.err(`cannot create directory ‘${d}’: ${fsMsg(e)}`);
        status = 1;
      }
    }
    return status;
  }),
);

register(
  'rmdir',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'pv', long: { parents: 'p', verbose: 'v' } });
    let status = 0;
    for (const d of operands) {
      try {
        const n = c.vfs.lookup(c.abs(d), { follow: false });
        if (n.type !== 'dir') throw new FsError('ENOTDIR');
        if (n.children!.size) throw new FsError('ENOTEMPTY');
        c.vfs.remove(c.abs(d), { cred: c.cred });
        if (flags.v) c.stdout.write(`rmdir: removing directory, '${d}'\n`);
      } catch (e) {
        c.err(`failed to remove '${d}': ${fsMsg(e)}`);
        status = 1;
      }
    }
    return status;
  }),
);

register(
  'rm',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, {
      short: 'rRfivd',
      long: { recursive: 'r', force: 'f', verbose: 'v', interactive: 'i', dir: 'd', 'no-preserve-root': 'P' },
    });
    const recursive = !!(flags.r || flags.R);
    if (!operands.length) {
      if (flags.f) return 0;
      c.err('missing operand');
      return 1;
    }
    let status = 0;
    for (const f of operands) {
      const abs = c.abs(f);
      if (abs === '/' && recursive) {
        c.err("it is dangerous to operate recursively on '/'");
        c.err('use --no-preserve-root to override this failsafe');
        status = 1;
        continue;
      }
      const n = c.vfs.tryLookup(abs, false);
      if (!n) {
        if (!flags.f) {
          c.err(`cannot remove '${f}': No such file or directory`);
          status = 1;
        }
        continue;
      }
      if (n.type === 'dir' && !recursive && !(flags.d && n.children!.size === 0)) {
        c.err(`cannot remove '${f}': Is a directory`);
        status = 1;
        continue;
      }
      try {
        c.vfs.remove(abs, { recursive, cred: c.cred });
        if (flags.v) c.stdout.write(n.type === 'dir' ? `removed directory '${f}'\n` : `removed '${f}'\n`);
      } catch (e) {
        c.err(`cannot remove '${f}': ${fsMsg(e)}`);
        status = 1;
      }
    }
    return status;
  }),
);

// ------------------------------------------------------------------ cp / mv / ln

register(
  'cp',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, {
      short: 'rRpvifnaul',
      long: { recursive: 'r', preserve: 'p', verbose: 'v', force: 'f', archive: 'a', 'no-clobber': 'n' },
    });
    const recursive = !!(flags.r || flags.R || flags.a);
    const preserve = !!(flags.p || flags.a);
    if (operands.length < 2) {
      c.err(operands.length ? `missing destination file operand after '${operands[0]}'` : 'missing file operand');
      return 1;
    }
    const dest = operands[operands.length - 1];
    const sources = operands.slice(0, -1);
    const destNode = lookup(c, dest);
    const destIsDir = destNode?.type === 'dir';
    if (sources.length > 1 && !destIsDir) {
      c.err(`target '${dest}' is not a directory`);
      return 1;
    }
    let status = 0;
    for (const s of sources) {
      const src = lookup(c, s);
      if (!src) {
        c.err(`cannot stat '${s}': No such file or directory`);
        status = 1;
        continue;
      }
      if (src.type === 'dir' && !recursive) {
        c.err(`-r not specified; omitting directory '${s}'`);
        status = 1;
        continue;
      }
      if (!c.vfs.can(src, c.cred, 'r')) {
        c.err(`cannot open '${s}' for reading: Permission denied`);
        status = 1;
        continue;
      }
      const target = destIsDir ? normalize(basename(s), c.abs(dest)) : c.abs(dest);
      if (target === c.abs(s)) {
        c.err(`'${s}' and '${dest}' are the same file`);
        status = 1;
        continue;
      }
      if (src.type === 'dir' && (target + '/').startsWith(c.abs(s) + '/')) {
        c.err(`cannot copy a directory, '${s}', into itself, '${dest}'`);
        status = 1;
        continue;
      }
      try {
        const existing = c.vfs.tryLookup(target);
        if (existing && flags.n) continue;
        if (existing && existing.type === 'file' && src.type === 'file') {
          c.vfs.writeFile(target, src.content ?? '', { cred: c.cred });
          if (preserve) existing.mode = src.mode;
        } else if (existing && existing.type === 'dir' && src.type === 'dir') {
          // merge: copy children
          for (const [k, v] of src.children!) existing.children!.set(k, VFS.copyNode(v, c.cred, c.vfs.now(), preserve));
        } else {
          c.vfs.put(target, VFS.copyNode(src, c.cred, c.vfs.now(), preserve), c.cred);
        }
        if (flags.v) c.stdout.write(`'${s}' -> '${destIsDir ? dest.replace(/\/$/, '') + '/' + basename(s) : dest}'\n`);
      } catch (e) {
        c.err(`cannot create regular file '${dest}': ${fsMsg(e)}`);
        status = 1;
      }
    }
    return status;
  }),
);

register(
  'mv',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'vfinu', long: { verbose: 'v', force: 'f', 'no-clobber': 'n' } });
    if (operands.length < 2) {
      c.err(operands.length ? `missing destination file operand after '${operands[0]}'` : 'missing file operand');
      return 1;
    }
    const dest = operands[operands.length - 1];
    const sources = operands.slice(0, -1);
    const destIsDir = lookup(c, dest)?.type === 'dir';
    if (sources.length > 1 && !destIsDir) {
      c.err(`target '${dest}' is not a directory`);
      return 1;
    }
    let status = 0;
    for (const s of sources) {
      if (!c.vfs.tryLookup(c.abs(s), false)) {
        c.err(`cannot stat '${s}': No such file or directory`);
        status = 1;
        continue;
      }
      const target = destIsDir ? normalize(basename(s), c.abs(dest)) : c.abs(dest);
      if (flags.n && c.vfs.exists(target)) continue;
      try {
        if (target === c.abs(s)) throw new FsError('EINVAL');
        c.vfs.rename(c.abs(s), target, c.cred);
        if (flags.v) c.stdout.write(`renamed '${s}' -> '${destIsDir ? dest.replace(/\/$/, '') + '/' + basename(s) : dest}'\n`);
      } catch (e) {
        if (e instanceof FsError && e.code === 'EINVAL') c.err(`cannot move '${s}' to a subdirectory of itself, '${dest}'`);
        else c.err(`cannot move '${s}' to '${dest}': ${fsMsg(e)}`);
        status = 1;
      }
    }
    return status;
  }),
);

register(
  'ln',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'sfvn', long: { symbolic: 's', force: 'f', verbose: 'v' } });
    if (operands.length < 1) {
      c.err('missing file operand');
      return 1;
    }
    const target = operands[0];
    let link = operands[1] ?? basename(target);
    if (lookup(c, link)?.type === 'dir') link = normalize(basename(target), c.abs(link));
    const abs = c.abs(link);
    try {
      if (c.vfs.tryLookup(abs, false)) {
        if (!flags.f) throw new FsError('EEXIST');
        c.vfs.remove(abs, { cred: c.cred });
      }
      if (flags.s) c.vfs.symlink(target, abs, c.cred);
      else {
        const n = c.vfs.lookup(c.abs(target));
        if (n.type === 'dir') {
          c.err(`${target}: hard link not allowed for directory`);
          return 1;
        }
        c.vfs.put(abs, n, c.cred);
      }
      if (flags.v) c.stdout.write(`'${link}' -> '${target}'\n`);
    } catch (e) {
      c.err(`failed to create ${flags.s ? 'symbolic ' : 'hard '}link '${link}': ${fsMsg(e)}`);
      return 1;
    }
    return 0;
  }),
);

// ------------------------------------------------------------------ chmod / chown / chgrp

export function applyMode(mode: number, spec: string, isDir: boolean): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let m = mode;
  for (const clause of spec.split(',')) {
    const r = /^([ugoa]*)([-+=])([rwxXst]*|[ugo])$/.exec(clause);
    if (!r) return null;
    const who = r[1] || 'a';
    const op = r[2];
    const perms = r[3];
    let bits = 0;
    const has = (w: string) => who.includes(w) || who.includes('a');
    if (/^[ugo]$/.test(perms)) {
      const shift = perms === 'u' ? 6 : perms === 'g' ? 3 : 0;
      const p = (m >> shift) & 7;
      if (has('u')) bits |= p << 6;
      if (has('g')) bits |= p << 3;
      if (has('o')) bits |= p;
    } else {
      for (const p of perms) {
        let v = 0;
        if (p === 'r') v = 4;
        else if (p === 'w') v = 2;
        else if (p === 'x' || (p === 'X' && (isDir || m & 0o111))) v = 1;
        if (v) {
          if (has('u')) bits |= v << 6;
          if (has('g')) bits |= v << 3;
          if (has('o')) bits |= v;
        }
        if (p === 's') {
          if (has('u')) bits |= 0o4000;
          if (has('g')) bits |= 0o2000;
        }
        if (p === 't') bits |= 0o1000;
      }
    }
    // without u/g/o/a the umask (022) protects group/other write bits
    if (!r[1] && op !== '=') bits &= ~0o022;
    if (op === '+') m |= bits;
    else if (op === '-') m &= ~bits;
    else {
      let mask = 0;
      if (has('u')) mask |= 0o4700;
      if (has('g')) mask |= 0o2070;
      if (has('o')) mask |= 0o1007;
      m = (m & ~mask) | bits;
    }
  }
  return m;
}

function walk(vfs: VFS, abs: string, fn: (path: string, n: Inode) => void) {
  const n = vfs.tryLookup(abs, false);
  if (!n) return;
  fn(abs, n);
  if (n.type === 'dir') for (const k of [...n.children!.keys()].sort(cmpC)) walk(vfs, abs === '/' ? '/' + k : abs + '/' + k, fn);
}

register(
  'chmod',
  withUsage(async (c) => {
    const args = [...c.args];
    let recursive = false;
    let verbose = false;
    const rest: string[] = [];
    for (const a of args) {
      if (a === '-R' || a === '--recursive') recursive = true;
      else if (a === '-v' || a === '-c' || a === '--verbose') verbose = true;
      else rest.push(a);
    }
    if (rest.length < 2) {
      c.err(rest.length ? `missing operand after ‘${rest[0]}’` : 'missing operand');
      return 1;
    }
    const spec = rest[0];
    if (applyMode(0o644, spec, false) === null) {
      c.err(`invalid mode: ‘${spec}’`);
      return 1;
    }
    let status = 0;
    for (const f of rest.slice(1)) {
      const abs = c.abs(f);
      if (!c.vfs.exists(abs)) {
        c.err(`cannot access '${f}': No such file or directory`);
        status = 1;
        continue;
      }
      const apply = (p: string, n: Inode) => {
        if (n.type === 'link') return;
        if (c.cred.uid !== 0 && n.uid !== c.cred.uid) {
          c.err(`changing permissions of '${p === abs ? f : p}': Operation not permitted`);
          status = 1;
          return;
        }
        const old = n.mode;
        n.mode = applyMode(n.mode, spec, n.type === 'dir')!;
        n.ctime = c.vfs.now();
        if (verbose) {
          const o = { ...n, mode: old };
          c.stdout.write(`mode of '${p === abs ? f : p}' changed from ${(old & 0o7777).toString(8).padStart(4, '0')} (${modeString(o).slice(1)}) to ${(n.mode & 0o7777).toString(8).padStart(4, '0')} (${modeString(n).slice(1)})\n`);
        }
      };
      if (recursive) walk(c.vfs, c.vfs.realpathOrSelf(abs), apply);
      else apply(abs, c.vfs.lookup(abs));
    }
    return status;
  }),
);

function chownLike(kind: 'chown' | 'chgrp') {
  return withUsage(async (c: CmdCtx) => {
    let recursive = false;
    let verbose = false;
    const rest: string[] = [];
    for (const a of c.args) {
      if (a === '-R') recursive = true;
      else if (a === '-v') verbose = true;
      else rest.push(a);
    }
    if (rest.length < 2) {
      c.err('missing operand');
      return 1;
    }
    const spec = rest[0];
    let uid: number | undefined;
    let gid: number | undefined;
    if (kind === 'chown') {
      const [u, g] = spec.split(/[:.]/);
      if (u) {
        const user = c.vfs.userByName(u) ?? (/^\d+$/.test(u) ? { uid: Number(u), gid: Number(u) } : undefined);
        if (!user) {
          c.err(`invalid user: ‘${spec}’`);
          return 1;
        }
        uid = user.uid;
      }
      if (g !== undefined && g !== '') {
        gid = c.vfs.groupId(g) ?? (/^\d+$/.test(g) ? Number(g) : undefined);
        if (gid === undefined) {
          c.err(`invalid group: ‘${spec}’`);
          return 1;
        }
      }
    } else {
      gid = c.vfs.groupId(spec) ?? (/^\d+$/.test(spec) ? Number(spec) : undefined);
      if (gid === undefined) {
        c.err(`invalid group: ‘${spec}’`);
        return 1;
      }
    }
    let status = 0;
    for (const f of rest.slice(1)) {
      const abs = c.abs(f);
      if (!c.vfs.exists(abs)) {
        c.err(`cannot access '${f}': No such file or directory`);
        status = 1;
        continue;
      }
      const apply = (p: string, n: Inode) => {
        if (c.cred.uid !== 0) {
          c.err(`changing ${kind === 'chown' && uid !== undefined ? 'ownership' : 'group'} of '${p === abs ? f : p}': Operation not permitted`);
          status = 1;
          return;
        }
        if (uid !== undefined) n.uid = uid;
        if (gid !== undefined) n.gid = gid;
        n.ctime = c.vfs.now();
        if (verbose) c.stdout.write(`changed ownership of '${p === abs ? f : p}' to ${spec}\n`);
      };
      if (recursive) walk(c.vfs, abs, apply);
      else apply(abs, c.vfs.lookup(abs));
    }
    return status;
  });
}
register('chown', chownLike('chown'));
register('chgrp', chownLike('chgrp'));

// ------------------------------------------------------------------ stat / file

function fileType(n: Inode): string {
  if (n.type === 'dir') return 'directory';
  if (n.type === 'link') return 'symbolic link';
  return (n.content ?? '') === '' ? 'regular empty file' : 'regular file';
}

register(
  'stat',
  withUsage(async (c) => {
    const { flags, operands } = parseOpts(c.args, { short: 'Lt', withArg: 'c', long: { format: 'c=', printf: 'c=' } });
    let status = 0;
    for (const f of operands) {
      const n = lookup(c, f, !!flags.L);
      if (!n) {
        c.err(`cannot statx '${f}': No such file or directory`);
        status = 1;
        continue;
      }
      const owner = c.vfs.userName(n.uid);
      const group = c.vfs.groupName(n.gid);
      const size = c.vfs.size(n);
      const perm = (n.mode & 0o7777).toString(8);
      if (typeof flags.c === 'string') {
        const out = flags.c.replace(/%([a-zA-Z%])/g, (_m, k: string) => {
          switch (k) {
            case 'n': return f;
            case 'N': return n.type === 'link' ? `'${f}' -> '${n.target}'` : `'${f}'`;
            case 's': return String(size);
            case 'a': return perm;
            case 'A': return modeString(n);
            case 'U': return owner;
            case 'G': return group;
            case 'u': return String(n.uid);
            case 'g': return String(n.gid);
            case 'F': return fileType(n);
            case 'h': return String(linkCount(n));
            case 'y': return strftime(n.mtime, '%Y-%m-%d %H:%M:%S.000000000 +0000');
            case 'Y': return String(Math.floor(n.mtime / 1000));
            case 'z': return strftime(ctimeOf(n), '%Y-%m-%d %H:%M:%S.000000000 +0000');
            case 'Z': return String(Math.floor(ctimeOf(n) / 1000));
            case 'b': return String(blocks1k(c.vfs, n) * 2);
            case 'i': return '1048577';
            case '%': return '%';
          }
          return '?';
        });
        c.stdout.write(out + '\n');
        continue;
      }
      const ts = strftime(n.mtime, '%Y-%m-%d %H:%M:%S.000000000 +0000');
      c.stdout.write(
        `  File: ${n.type === 'link' ? `${f} -> ${n.target}` : f}\n` +
          `  Size: ${String(size).padEnd(10)}\tBlocks: ${String(blocks1k(c.vfs, n) * 2).padEnd(10)} IO Block: 4096   ${fileType(n)}\n` +
          `Device: 802h/2050d\tInode: 1048577     Links: ${linkCount(n)}\n` +
          `Access: (${perm.padStart(4, '0')}/${modeString(n)})  Uid: (${String(n.uid).padStart(5)}/${owner.padStart(8)})   Gid: (${String(n.gid).padStart(5)}/${group.padStart(8)})\n` +
          `Access: ${ts}\nModify: ${ts}\nChange: ${strftime(ctimeOf(n), '%Y-%m-%d %H:%M:%S.000000000 +0000')}\n Birth: -\n`,
      );
    }
    return status;
  }),
);

function describeElf(content: string): string {
  const cls = content.charCodeAt(4) === 2 ? '64-bit' : '32-bit';
  const lsb = content.charCodeAt(5) !== 2;
  const half = (o: number) => (lsb ? content.charCodeAt(o) | (content.charCodeAt(o + 1) << 8) : (content.charCodeAt(o) << 8) | content.charCodeAt(o + 1));
  const type = ({ 1: 'relocatable', 2: 'executable', 3: 'shared object', 4: 'core file' } as Record<number, string>)[half(16)];
  const machine = half(18);
  const arch = ({ 3: 'Intel 80386', 0x3e: 'x86-64', 0x28: 'ARM', 0xb7: 'ARM aarch64' } as Record<number, string>)[machine];
  const head = `ELF ${cls} ${lsb ? 'LSB' : 'MSB'}${type ? ' ' + type : ''}`;
  return arch ? `${head}, ${arch}, version 1 (SYSV)` : `${head} *unknown arch 0x${machine.toString(16)}*`;
}

export function describeContent(content: string): string {
  if (content === '') return 'empty';
  const first = content.split('\n')[0];
  if (/^#!.*\bbash\b/.test(first)) return 'Bourne-Again shell script, ASCII text executable';
  if (/^#!.*\bsh\b/.test(first)) return 'POSIX shell script, ASCII text executable';
  if (/^#!.*python/.test(first)) return 'Python script, ASCII text executable';
  const pdf = /^%PDF-(\d\.\d)/.exec(content);
  if (pdf) return `PDF document, version ${pdf[1]}`;
  if (content.startsWith('\x7fELF')) return describeElf(content);
  if (content.startsWith('MZ') && content.length >= 64) {
    // e_lfanew (offset 0x3c) points at the PE header in a real Windows executable
    const at = content.charCodeAt(0x3c) | (content.charCodeAt(0x3d) << 8);
    if (at > 0 && content.slice(at, at + 4) === 'PE\x00\x00') return 'PE32 executable, for MS Windows';
  }
  // libmagic only says "MZ for MS-DOS" once the header is complete (64 bytes)
  if (content.startsWith('MZ') && /[\x00-\x08]/.test(content)) return content.length >= 64 ? 'MS-DOS executable, MZ for MS-DOS' : 'MS-DOS executable';
  if (content.startsWith('PK\x03\x04')) return 'Zip archive data, at least v2.0 to extract';
  if (content.startsWith('\x89PNG')) return 'PNG image data';
  if (/[\x00-\x08\x0e-\x1f\x7f]/.test(content)) return 'data';
  if (/^\s*[{[]/.test(content) && /[}\]]\s*$/.test(content)) {
    try {
      JSON.parse(content);
      return 'JSON text data';
    } catch {}
  }
  const ascii = /^[\x09\x0a\x0d\x20-\x7e]*$/.test(content);
  const long = content.split('\n').some((l) => l.length > 300) ? ', with very long lines' : '';
  const crlf = content.includes('\r\n') ? ', with CRLF line terminators' : '';
  const noNl = content.endsWith('\n') ? '' : ', with no line terminators';
  return (ascii ? 'ASCII text' : 'Unicode text, UTF-8 text') + long + crlf + (content.includes('\n') ? '' : noNl);
}

register('file', async (c) => {
  const operands = c.args.filter((a) => !a.startsWith('-'));
  const brief = c.args.includes('-b');
  if (!operands.length) {
    c.stderr.write('Usage: file [-b] file...\n');
    return 1;
  }
  for (const f of operands) {
    const ln = lookup(c, f, false);
    let desc: string;
    if (!ln) desc = `cannot open \`${f}' (No such file or directory)`;
    else if (ln.type === 'link') desc = `symbolic link to ${ln.target}`;
    else if (ln.type === 'dir') desc = 'directory';
    else if (!c.vfs.can(ln, c.cred, 'r')) desc = `regular file, no read permission`;
    else {
      desc = describeContent(ln.content ?? '');
      if (ln.mode & 0o4000) desc = 'setuid ' + desc;
    }
    // GNU file pads after the colon so every description starts in the same column
    const width = Math.max(...operands.map((o) => o.length)) + 1;
    c.stdout.write(brief ? desc + '\n' : `${(f + ':').padEnd(width)} ${desc}\n`);
  }
  return 0;
});

// ------------------------------------------------------------------ path utilities

register('basename', async (c) => {
  let args = [...c.args];
  let multiple = false;
  let suffix = '';
  if (args[0] === '-a') {
    multiple = true;
    args = args.slice(1);
  }
  if (args[0] === '-s') {
    suffix = args[1] ?? '';
    multiple = true;
    args = args.slice(2);
  }
  if (!args.length) {
    c.err('missing operand');
    return 1;
  }
  if (!multiple && args.length === 2) {
    suffix = args[1];
    args = [args[0]];
  }
  for (const a of args) {
    let b = basename(a);
    if (suffix && b !== suffix && b.endsWith(suffix)) b = b.slice(0, -suffix.length);
    c.stdout.write(b + '\n');
  }
  return 0;
});

register('mktemp', async (c) => {
  const { flags, operands } = parseOpts(c.args, { short: 'duq', withArg: 'p', long: { directory: 'd', 'dry-run': 'u', quiet: 'q', tmpdir: 'p=' } });
  const template = operands[0] ?? 'tmp.XXXXXXXXXX';
  const xs = /X{3,}$/.exec(template);
  if (!xs) {
    c.err(`too few X's in template ‘${template}’`);
    return 1;
  }
  const dir = typeof flags.p === 'string' ? flags.p : template.includes('/') ? '' : '/tmp';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let rnd = '';
    for (let i = 0; i < xs[0].length; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
    const name = template.slice(0, xs.index) + rnd;
    const path = dir ? normalize(name, c.abs(dir)) : c.abs(name);
    if (c.vfs.tryLookup(path, false)) continue;
    try {
      if (!flags.u) {
        if (flags.d) c.vfs.mkdir(path, { cred: c.cred, mode: 0o700 });
        else c.vfs.writeFile(path, '', { cred: c.cred, mode: 0o600 });
        c.vfs.lookup(path).mode = flags.d ? 0o700 : 0o600;
      }
    } catch (e) {
      if (!flags.q) c.err(`failed to create ${flags.d ? 'directory' : 'file'} via template ‘${template}’: ${fsMsg(e)}`);
      return 1;
    }
    c.stdout.write(path + '\n');
    return 0;
  }
  return 1;
});

register('dirname', async (c) => {
  if (!c.args.length) {
    c.err('missing operand');
    return 1;
  }
  for (const a of c.args) c.stdout.write(dirname(a) + '\n');
  return 0;
});

register(['realpath', 'readlink'], async (c) => {
  const flags = c.args.filter((a) => a.startsWith('-'));
  const ops = c.args.filter((a) => !a.startsWith('-'));
  const resolve = c.name === 'realpath' || flags.some((f) => /[fem]/.test(f));
  let status = 0;
  for (const p of ops) {
    if (!resolve) {
      const n = c.vfs.tryLookup(c.abs(p), false);
      if (n?.type === 'link') c.stdout.write(n.target + '\n');
      else status = 1;
      continue;
    }
    try {
      c.stdout.write(c.vfs.realpath(c.abs(p)) + '\n');
    } catch (e) {
      if (flags.some((f) => f.includes('m'))) c.stdout.write(c.abs(p) + '\n');
      else {
        if (c.name === 'realpath') c.err(`${p}: ${fsMsg(e)}`);
        status = 1;
      }
    }
  }
  return status;
});

// ------------------------------------------------------------------ tree / du / df

register('tree', async (c) => {
  let all = false;
  let dirsOnly = false;
  let maxLevel = Infinity;
  const ops: string[] = [];
  for (let i = 0; i < c.args.length; i++) {
    const a = c.args[i];
    if (a === '-a') all = true;
    else if (a === '-d') dirsOnly = true;
    else if (a === '-L') maxLevel = Number(c.args[++i]) || Infinity;
    else ops.push(a);
  }
  const root = ops[0] ?? '.';
  const node = lookup(c, root);
  if (!node || node.type !== 'dir') {
    c.stdout.write(`${root}  [error opening dir]\n\n0 directories, 0 files\n`);
    return 2;
  }
  let nd = 0;
  let nf = 0;
  let out = (c.stdout.isTTY ? ansi.blue(root) : root) + '\n';
  const rec = (n: Inode, prefix: string, level: number) => {
    if (level > maxLevel) return;
    let entries = [...n.children!.entries()].sort((a, b) => cmpC(a[0].toLowerCase(), b[0].toLowerCase()) || cmpC(a[0], b[0]));
    if (!all) entries = entries.filter(([k]) => !k.startsWith('.'));
    if (dirsOnly) entries = entries.filter(([, v]) => v.type === 'dir');
    entries.forEach(([name, ch], i) => {
      const last = i === entries.length - 1;
      const shown = colorName(name, ch, !!c.stdout.isTTY) + (ch.type === 'link' ? ` -> ${ch.target}` : '');
      out += prefix + (last ? '└── ' : '├── ') + shown + '\n';
      if (ch.type === 'dir') {
        nd++;
        if (c.vfs.can(ch, c.cred, 'r')) rec(ch, prefix + (last ? '    ' : '│   '), level + 1);
      } else nf++;
    });
  };
  rec(node, '', 1);
  out += `\n${nd} director${nd === 1 ? 'y' : 'ies'}${dirsOnly ? '' : `, ${nf} file${nf === 1 ? '' : 's'}`}\n`;
  c.stdout.write(out);
  return 0;
});

register('du', async (c) => {
  let summarize = false;
  let human = false;
  let all = false;
  const ops: string[] = [];
  for (const a of c.args) {
    if (/^-[shac]+$/.test(a)) {
      if (a.includes('s')) summarize = true;
      if (a.includes('h')) human = true;
      if (a.includes('a')) all = true;
    } else ops.push(a);
  }
  const fmt = (k: number) => (human ? (k === 0 ? '0' : humanSize(k * 1024)) : String(k));
  let status = 0;
  for (const p of ops.length ? ops : ['.']) {
    const n = lookup(c, p);
    if (!n) {
      c.err(`cannot access '${p}': No such file or directory`);
      status = 1;
      continue;
    }
    const rec = (node: Inode, path: string): number => {
      let total = blocks1k(c.vfs, node);
      if (node.type === 'dir') {
        for (const [k, ch] of [...node.children!.entries()].sort((a, b) => cmpC(a[0], b[0]))) {
          const sub = path.replace(/\/$/, '') + '/' + k;
          const s = rec(ch, sub);
          total += s;
          if (!summarize && (ch.type === 'dir' || all)) {
            /* printed inside rec */
          }
        }
        if (!summarize) c.stdout.write(`${fmt(total)}\t${path}\n`);
      } else if (all && !summarize) c.stdout.write(`${fmt(total)}\t${path}\n`);
      return total;
    };
    const total = rec(n, p);
    if (summarize) c.stdout.write(`${fmt(total)}\t${p}\n`);
  }
  return status;
});

register('df', async (c) => {
  const h = c.args.some((a) => a.includes('h'));
  c.stdout.write(
    h
      ? 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        40G   12G   26G  32% /\ntmpfs           2.0G     0  2.0G   0% /dev/shm\n'
      : 'Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/sda1       41152736 12582912  26453952  32% /\ntmpfs            2097152        0   2097152   0% /dev/shm\n',
  );
  return 0;
});

// ------------------------------------------------------------------ find

type FindExpr =
  | { t: 'and' | 'or'; l: FindExpr; r: FindExpr }
  | { t: 'not'; e: FindExpr }
  | { t: 'test'; fn: (path: string, n: Inode, depth: number) => boolean }
  | { t: 'action'; kind: 'print' | 'print0' | 'delete' | 'exec' | 'printf' | 'ls' | 'prune' | 'quit'; args?: string[]; plus?: boolean; fmt?: string };

register('find', async (c) => {
  const args = [...c.args];
  const paths: string[] = [];
  while (args.length && !args[0].startsWith('-') && args[0] !== '!' && args[0] !== '(') paths.push(args.shift()!);
  if (!paths.length) paths.push('.');
  let maxDepth = Infinity;
  let minDepth = 0;
  let hasAction = false;
  let status = 0;
  const now = c.vfs.now();
  const execBatches: { args: string[]; files: string[] }[] = [];

  const parseNum = (s: string): ((v: number) => boolean) => {
    const m = /^([+-]?)(\d+)$/.exec(s);
    if (!m) throw new Error(`invalid argument \`${s}'`);
    const n = Number(m[2]);
    return m[1] === '+' ? (v) => v > n : m[1] === '-' ? (v) => v < n : (v) => v === n;
  };

  let i = 0;
  let firstTest = -1;
  // GNU find: options like -maxdepth and -xdev apply globally, and it says so if they come after a test
  const globalOpt = (opt: string) => {
    if (firstTest >= 0) c.err(`warning: you have specified the global option ${opt} after the argument ${args[firstTest]}, but global options are not positional, i.e., ${opt} affects tests specified before it as well as those specified after it.  Please specify global options before other arguments.`);
  };
  const peek = () => args[i];
  const parseOr = (): FindExpr => {
    let l = parseAnd();
    while (peek() === '-o' || peek() === '-or') {
      i++;
      l = { t: 'or', l, r: parseAnd() };
    }
    return l;
  };
  const parseAnd = (): FindExpr => {
    let l = parseNot();
    for (;;) {
      const p = peek();
      if (p === undefined || p === '-o' || p === '-or' || p === ')') return l;
      if (p === '-a' || p === '-and') i++;
      l = { t: 'and', l, r: parseNot() };
    }
  };
  const parseNot = (): FindExpr => {
    if (peek() === '!' || peek() === '-not') {
      i++;
      return { t: 'not', e: parseNot() };
    }
    return parsePrimary();
  };
  const need = (opt: string) => {
    const v = args[i++];
    if (v === undefined) throw new Error(`missing argument to \`${opt}'`);
    return v;
  };
  const parsePrimary = (): FindExpr => {
    const a = args[i++];
    if (firstTest < 0 && a !== undefined && a.startsWith('-') && !['-maxdepth', '-mindepth', '-xdev', '-mount', '-depth', '-follow', '-noleaf'].includes(a)) firstTest = i - 1;
    switch (a) {
      case '(': {
        const e = parseOr();
        if (args[i++] !== ')') throw new Error("invalid expression; I was expecting to find a ')' somewhere");
        return e;
      }
      case '-name':
      case '-iname': {
        const pat = need(a);
        return { t: 'test', fn: (p) => globMatch(pat, p === '/' ? '/' : basename(p), { nocase: a === '-iname' }) };
      }
      case '-path':
      case '-wholename':
      case '-ipath': {
        const pat = need(a);
        return { t: 'test', fn: (p) => globMatch(pat, p, { nocase: a === '-ipath' }) };
      }
      case '-regex':
      case '-iregex': {
        const re = posixRegex('^(' + need(a) + ')$', { extended: true, icase: a === '-iregex' });
        return { t: 'test', fn: (p) => re.test(p) };
      }
      case '-type': {
        const t = need(a);
        return { t: 'test', fn: (_p, n) => t.split(',').some((x) => (x === 'f' && n.type === 'file') || (x === 'd' && n.type === 'dir') || (x === 'l' && n.type === 'link')) };
      }
      case '-perm': {
        const spec = need(a);
        const mode = (s: string) => {
          const m = applyMode(0, s, false);
          if (m === null) throw new Error(`invalid mode ‘${s}’`);
          return m;
        };
        if (spec.startsWith('-')) {
          const m = mode(spec.slice(1));
          return { t: 'test', fn: (_p, n) => (n.mode & m) === m };
        }
        if (spec.startsWith('/')) {
          const m = mode(spec.slice(1));
          return { t: 'test', fn: (_p, n) => m === 0 || (n.mode & m) !== 0 };
        }
        const m = mode(spec);
        return { t: 'test', fn: (_p, n) => (n.mode & 0o7777) === m };
      }
      case '-user':
      case '-uid': {
        const u = need(a);
        const uid = /^\d+$/.test(u) ? Number(u) : c.vfs.userByName(u)?.uid;
        if (uid === undefined) throw new Error(`‘${u}’ is not the name of a known user`);
        return { t: 'test', fn: (_p, n) => n.uid === uid };
      }
      case '-group':
      case '-gid': {
        const g = need(a);
        const gid = /^\d+$/.test(g) ? Number(g) : c.vfs.groupId(g);
        if (gid === undefined) throw new Error(`‘${g}’ is not the name of an existing group`);
        return { t: 'test', fn: (_p, n) => n.gid === gid };
      }
      case '-nouser':
        return { t: 'test', fn: (_p, n) => !c.vfs.users().some((u) => u.uid === n.uid) };
      case '-size': {
        const s = need(a);
        const m = /^([+-]?)(\d+)([ckMGb]?)$/.exec(s);
        if (!m) throw new Error(`invalid -size type`);
        const unit = m[3] === 'c' ? 1 : m[3] === 'k' ? 1024 : m[3] === 'M' ? 1048576 : m[3] === 'G' ? 1073741824 : 512;
        const cmp = parseNum(m[1] + m[2]);
        return { t: 'test', fn: (_p, n) => n.type !== 'dir' && cmp(Math.ceil(c.vfs.size(n) / unit)) };
      }
      case '-mtime':
      case '-mmin':
      case '-ctime':
      case '-cmin': {
        const cmp = parseNum(need(a));
        const div = a === '-mtime' || a === '-ctime' ? 86400000 : 60000;
        const when = a[1] === 'c' ? ctimeOf : (n: Inode) => n.mtime;
        return { t: 'test', fn: (_p, n) => cmp(Math.floor((now - when(n)) / div)) };
      }
      case '-newer': {
        const ref = lookup(c, need(a));
        if (!ref) throw new Error(`cannot stat reference file`);
        return { t: 'test', fn: (_p, n) => n.mtime > ref.mtime };
      }
      case '-empty':
        return { t: 'test', fn: (_p, n) => (n.type === 'dir' ? n.children!.size === 0 : n.type === 'file' && (n.content ?? '') === '') };
      case '-executable':
        return { t: 'test', fn: (_p, n) => c.vfs.can(n, c.cred, 'x') };
      case '-readable':
        return { t: 'test', fn: (_p, n) => c.vfs.can(n, c.cred, 'r') };
      case '-writable':
        return { t: 'test', fn: (_p, n) => c.vfs.can(n, c.cred, 'w') };
      case '-true':
        return { t: 'test', fn: () => true };
      case '-false':
        return { t: 'test', fn: () => false };
      case '-maxdepth':
        globalOpt(a);
        maxDepth = Number(need(a));
        return { t: 'test', fn: () => true };
      case '-mindepth':
        globalOpt(a);
        minDepth = Number(need(a));
        return { t: 'test', fn: () => true };
      case '-xdev':
      case '-mount':
        // one filesystem in the simulator: nothing to skip
        globalOpt(a);
        return { t: 'test', fn: () => true };
      case '-print':
      case '-print0':
      case '-delete':
      case '-ls':
      case '-prune':
      case '-quit':
        if (a !== '-prune') hasAction = true;
        return { t: 'action', kind: a.slice(1) as 'print' };
      case '-printf':
        hasAction = true;
        return { t: 'action', kind: 'printf', fmt: need(a) };
      case '-exec':
      case '-ok': {
        hasAction = true;
        const cmd: string[] = [];
        while (i < args.length && args[i] !== ';' && !(args[i] === '+' && args[i - 1] === '{}')) cmd.push(args[i++]);
        if (i >= args.length) throw new Error(`missing argument to \`${a}'`);
        const plus = args[i] === '+';
        i++;
        return { t: 'action', kind: 'exec', args: cmd, plus };
      }
      default:
        if (a === undefined) throw new Error('expected an expression');
        throw new Error(`unknown predicate \`${a}'`);
    }
  };

  let expr: FindExpr | null = null;
  try {
    if (args.length) expr = parseOr();
    if (i < args.length) throw new Error(`paths must precede expression: \`${args[i]}'`);
  } catch (e) {
    c.err(e instanceof Error ? e.message : String(e));
    return 1;
  }

  let quit = false;
  const printfFmt = (fmt: string, p: string, n: Inode) =>
    fmt
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/%([pfshmMugTkdy%])|%T([a-zA-Z@+])/g, (_m, k: string | undefined, tk: string | undefined) => {
        if (tk) return strftime(n.mtime, tk === '+' ? '%Y-%m-%d+%H:%M:%S' : tk === '@' ? '%s' : '%' + tk);
        switch (k) {
          case 'p': return p;
          case 'f': return basename(p);
          case 'h': return dirname(p);
          case 's': return String(c.vfs.size(n));
          case 'm': return (n.mode & 0o7777).toString(8);
          case 'M': return modeString(n);
          case 'u': return c.vfs.userName(n.uid);
          case 'g': return c.vfs.groupName(n.gid);
          case 'k': return String(blocks1k(c.vfs, n));
          case 'y': return n.type === 'dir' ? 'd' : n.type === 'link' ? 'l' : 'f';
          case 'd': return '0';
          case '%': return '%';
        }
        return '';
      });

  // Evaluated in walk order, like GNU find: output streams as it goes, and `-exec … ;` runs on the
  // spot with its exit status as the test's truth value.
  const evalE = async (e: FindExpr, p: string, n: Inode, depth: number, prune: { v: boolean }): Promise<boolean> => {
    switch (e.t) {
      case 'and':
        return (await evalE(e.l, p, n, depth, prune)) && (await evalE(e.r, p, n, depth, prune));
      case 'or':
        return (await evalE(e.l, p, n, depth, prune)) || (await evalE(e.r, p, n, depth, prune));
      case 'not':
        return !(await evalE(e.e, p, n, depth, prune));
      case 'test':
        return e.fn(p, n, depth);
      case 'action':
        switch (e.kind) {
          case 'print':
            c.stdout.write(p + '\n');
            return true;
          case 'print0':
            c.stdout.write(p + '\0');
            return true;
          case 'printf':
            c.stdout.write(printfFmt(e.fmt!, p, n));
            return true;
          case 'ls':
            c.stdout.write(`  1048577      ${blocks1k(c.vfs, n)} ${modeString(n)}   1 ${c.vfs.userName(n.uid).padEnd(8)} ${c.vfs.groupName(n.gid).padEnd(8)} ${String(c.vfs.size(n)).padStart(8)} ${lsTime(n.mtime, now)} ${p}\n`);
            return true;
          case 'delete':
            try {
              c.vfs.remove(c.abs(p), { recursive: false, cred: c.cred });
            } catch (er) {
              c.err(`cannot delete ‘${p}’: ${fsMsg(er)}`);
              status = 1;
            }
            return true;
          case 'prune':
            prune.v = true;
            return true;
          case 'quit':
            quit = true;
            return true;
          case 'exec': {
            if (e.plus) {
              let b = execBatches.find((x) => x.args === e.args);
              if (!b) execBatches.push((b = { args: e.args!, files: [] }));
              b.files.push(p);
              return true;
            }
            const st = await c.sh.invoke(
              e.args!.map((x) => x.replace(/\{\}/g, p)),
              { stdin: c.stdin, stdout: c.stdout, stderr: c.stderr },
            );
            return st === 0;
          }
        }
    }
    return false;
  };

  const results: { p: string; n: Inode; depth: number; denied?: boolean }[] = [];
  for (const start of paths) {
    const abs = c.abs(start);
    const n = c.vfs.tryLookup(abs);
    if (!n) {
      c.err(`‘${start}’: No such file or directory`);
      status = 1;
      continue;
    }
    const rec = (p: string, node: Inode, depth: number) => {
      results.push({ p, n: node, depth });
      if (node.type === 'dir' && depth < maxDepth) {
        if (!c.vfs.can(node, c.cred, 'r') || !c.vfs.can(node, c.cred, 'x')) {
          results.push({ p, n: node, depth, denied: true });
          return;
        }
        for (const k of [...node.children!.keys()].sort(cmpC)) {
          const ch = node.children!.get(k)!;
          rec(p === '/' ? '/' + k : p.replace(/\/$/, '') + '/' + k, ch, depth + 1);
        }
      }
    };
    rec(start, n, 0);
  }

  // Walk order; -prune is handled by skipping the pruned path's descendants.
  const pruned: string[] = [];
  for (const r of results) {
    if (quit) break;
    if (r.denied) {
      c.err(`‘${r.p}’: Permission denied`);
      status = 1;
      continue;
    }
    if (pruned.some((pp) => r.p.startsWith(pp + '/'))) continue;
    if (r.depth < minDepth) continue;
    const prune = { v: false };
    const ok = expr ? await evalE(expr, r.p, r.n, r.depth, prune) : true;
    if (prune.v) pruned.push(r.p);
    if (ok && !hasAction) c.stdout.write(r.p + '\n');
  }

  for (const b of execBatches) {
    const idx = b.args.indexOf('{}');
    const cmd = [...b.args.slice(0, idx), ...b.files, ...b.args.slice(idx + 1)];
    const st = await c.sh.invoke(cmd, { stdin: c.stdin, stdout: c.stdout, stderr: c.stderr });
    if (st !== 0) status = 1;
  }
  return status;
});

export { blocks1k };
