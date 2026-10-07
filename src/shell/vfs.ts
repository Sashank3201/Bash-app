// In-memory POSIX-like filesystem: directories, files, symlinks, owners, permission bits.

export type InodeType = 'file' | 'dir' | 'link';

export interface Inode {
  type: InodeType;
  mode: number; // permission bits incl. setuid (0o4000), setgid (0o2000), sticky (0o1000)
  uid: number;
  gid: number;
  mtime: number; // ms since epoch
  content?: string; // file
  children?: Map<string, Inode>; // dir
  target?: string; // link
}

export interface User {
  name: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
}

export type FsErrorCode = 'ENOENT' | 'ENOTDIR' | 'EISDIR' | 'EACCES' | 'EEXIST' | 'ENOTEMPTY' | 'ELOOP' | 'EPERM' | 'EINVAL';

const MESSAGES: Record<FsErrorCode, string> = {
  ENOENT: 'No such file or directory',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  EACCES: 'Permission denied',
  EEXIST: 'File exists',
  ENOTEMPTY: 'Directory not empty',
  ELOOP: 'Too many levels of symbolic links',
  EPERM: 'Operation not permitted',
  EINVAL: 'Invalid argument',
};

export class FsError extends Error {
  constructor(public code: FsErrorCode) {
    super(MESSAGES[code]);
  }
}

export interface Cred {
  uid: number;
  gid: number;
  /** Supplementary groups (from /etc/group member lists). */
  groups?: number[];
}

export const ROOT: Cred = { uid: 0, gid: 0 };

export interface JsonNode {
  t: 'f' | 'd' | 'l';
  m: number;
  u: number;
  g: number;
  ts: number;
  c?: string;
  ch?: Record<string, JsonNode>;
  to?: string;
}

/** Splits an absolute path into components. */
export function splitPath(p: string): string[] {
  return p.split('/').filter((x) => x && x !== '.');
}

/** Lexically normalises a path against cwd (handles . and ..). */
export function normalize(path: string, cwd = '/'): string {
  const abs = path.startsWith('/') ? path : (cwd === '/' ? '' : cwd) + '/' + path;
  const out: string[] = [];
  for (const part of abs.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

export function dirname(p: string): string {
  if (p === '/') return '/';
  const s = p.replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return s.slice(0, i);
}

export function basename(p: string): string {
  if (p === '/') return '/';
  const s = p.replace(/\/+$/, '');
  return s.slice(s.lastIndexOf('/') + 1);
}

export class VFS {
  root: Inode;
  now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this.root = { type: 'dir', mode: 0o755, uid: 0, gid: 0, mtime: now(), children: new Map() };
  }

  // ------------------------------------------------------------------ serialization

  toJSON(): JsonNode {
    const enc = (n: Inode): JsonNode => {
      const j: JsonNode = { t: n.type === 'file' ? 'f' : n.type === 'dir' ? 'd' : 'l', m: n.mode, u: n.uid, g: n.gid, ts: n.mtime };
      if (n.type === 'file') j.c = n.content ?? '';
      if (n.type === 'link') j.to = n.target;
      if (n.type === 'dir') {
        j.ch = {};
        for (const [k, v] of n.children!) j.ch[k] = enc(v);
      }
      return j;
    };
    return enc(this.root);
  }

  static fromJSON(j: JsonNode, now?: () => number): VFS {
    const fs = new VFS(now);
    const dec = (x: JsonNode): Inode => {
      const n: Inode = { type: x.t === 'f' ? 'file' : x.t === 'd' ? 'dir' : 'link', mode: x.m, uid: x.u, gid: x.g, mtime: x.ts };
      if (x.t === 'f') n.content = x.c ?? '';
      if (x.t === 'l') n.target = x.to;
      if (x.t === 'd') {
        n.children = new Map();
        for (const k of Object.keys(x.ch ?? {})) n.children.set(k, dec(x.ch![k]));
      }
      return n;
    };
    fs.root = dec(j);
    return fs;
  }

  clone(): VFS {
    const fs = new VFS(this.now);
    const cp = (n: Inode): Inode => {
      const c: Inode = { ...n };
      if (n.children) {
        c.children = new Map();
        for (const [k, v] of n.children) c.children.set(k, cp(v));
      }
      return c;
    };
    fs.root = cp(this.root);
    return fs;
  }

  // ------------------------------------------------------------------ users

  private userCache: { src: string; users: User[] } | null = null;
  private groupCache: { src: string; groups: Map<number, string> } | null = null;

  users(): User[] {
    const src = this.tryRead('/etc/passwd') ?? '';
    if (this.userCache && this.userCache.src === src) return this.userCache.users;
    const users: User[] = [];
    for (const line of src.split('\n')) {
      const f = line.split(':');
      if (f.length < 7) continue;
      users.push({ name: f[0], uid: Number(f[2]), gid: Number(f[3]), home: f[5], shell: f[6] });
    }
    this.userCache = { src, users };
    return users;
  }

  userName(uid: number): string {
    return this.users().find((u) => u.uid === uid)?.name ?? String(uid);
  }

  userByName(name: string): User | undefined {
    return this.users().find((u) => u.name === name);
  }

  groupName(gid: number): string {
    const src = this.tryRead('/etc/group') ?? '';
    if (!this.groupCache || this.groupCache.src !== src) {
      const groups = new Map<number, string>();
      for (const line of src.split('\n')) {
        const f = line.split(':');
        if (f.length >= 3) groups.set(Number(f[2]), f[0]);
      }
      this.groupCache = { src, groups };
    }
    return this.groupCache.groups.get(gid) ?? this.users().find((u) => u.gid === gid)?.name ?? String(gid);
  }

  /** Supplementary group ids for a user, from the member lists in /etc/group. */
  memberOf(user: string): number[] {
    const out: number[] = [];
    for (const line of (this.tryRead('/etc/group') ?? '').split('\n')) {
      const f = line.split(':');
      if (f.length >= 4 && f[3].split(',').includes(user)) out.push(Number(f[2]));
    }
    return out;
  }

  /** Credentials for a named account (primary + supplementary groups). */
  credFor(user: string): Cred | undefined {
    const u = this.userByName(user);
    return u ? { uid: u.uid, gid: u.gid, groups: this.memberOf(u.name) } : undefined;
  }

  groupId(name: string): number | undefined {
    this.groupName(0);
    for (const [gid, n] of this.groupCache!.groups) if (n === name) return gid;
    return undefined;
  }

  // ------------------------------------------------------------------ permissions

  can(n: Inode, cred: Cred, perm: 'r' | 'w' | 'x'): boolean {
    const bit = perm === 'r' ? 4 : perm === 'w' ? 2 : 1;
    if (cred.uid === 0) {
      if (perm !== 'x' || n.type === 'dir') return true;
      return (n.mode & 0o111) !== 0;
    }
    let shift = 0;
    if (n.uid === cred.uid) shift = 6;
    else if (n.gid === cred.gid || cred.groups?.includes(n.gid)) shift = 3;
    return ((n.mode >> shift) & bit) !== 0;
  }

  // ------------------------------------------------------------------ lookup

  /** Resolve an absolute path to its inode. Throws FsError. */
  lookup(abs: string, opts: { follow?: boolean; cred?: Cred } = {}): Inode {
    return this.resolve(abs, opts.follow ?? true, opts.cred, 0).node;
  }

  /** Resolve the real (symlink-free) absolute path. */
  realpath(abs: string): string {
    return this.resolve(abs, true, undefined, 0).path;
  }

  private resolve(abs: string, follow: boolean, cred: Cred | undefined, depth: number): { node: Inode; path: string } {
    if (depth > 20) throw new FsError('ELOOP');
    const parts = splitPath(normalize(abs));
    let node = this.root;
    let path: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== 'dir') throw new FsError('ENOTDIR');
      if (cred && !this.can(node, cred, 'x')) throw new FsError('EACCES');
      const child = node.children!.get(parts[i]);
      if (!child) throw new FsError('ENOENT');
      const last = i === parts.length - 1;
      if (child.type === 'link' && (!last || follow)) {
        const target = child.target!.startsWith('/') ? child.target! : normalize(child.target!, '/' + path.join('/'));
        const r = this.resolve(target, true, cred, depth + 1);
        node = r.node;
        path = splitPath(r.path);
      } else {
        node = child;
        path.push(parts[i]);
      }
    }
    return { node, path: '/' + path.join('/') };
  }

  realpathOrSelf(abs: string): string {
    try {
      return this.realpath(abs);
    } catch {
      return normalize(abs);
    }
  }

  exists(abs: string): boolean {
    try {
      this.lookup(abs);
      return true;
    } catch {
      return false;
    }
  }

  tryLookup(abs: string, follow = true): Inode | null {
    try {
      return this.lookup(abs, { follow });
    } catch {
      return null;
    }
  }

  tryRead(abs: string): string | null {
    const n = this.tryLookup(abs);
    return n && n.type === 'file' ? n.content ?? '' : null;
  }

  /** Parent directory inode + leaf name for creating entries. */
  private parentOf(abs: string, cred?: Cred): { dir: Inode; name: string } {
    const norm = normalize(abs);
    if (norm === '/') throw new FsError('EEXIST');
    const dir = this.lookup(dirname(norm), { cred });
    if (dir.type !== 'dir') throw new FsError('ENOTDIR');
    return { dir, name: basename(norm) };
  }

  // ------------------------------------------------------------------ file ops

  readFile(abs: string, cred?: Cred): string {
    const n = this.lookup(abs, { cred });
    if (n.type === 'dir') throw new FsError('EISDIR');
    if (cred && !this.can(n, cred, 'r')) throw new FsError('EACCES');
    return n.content ?? '';
  }

  /** Create or overwrite (or append to) a file. */
  writeFile(abs: string, content: string, opts: { append?: boolean; cred?: Cred; mode?: number } = {}): void {
    const cred = opts.cred;
    let existing: Inode | null = null;
    try {
      existing = this.lookup(abs, { cred });
    } catch (e) {
      if (!(e instanceof FsError) || e.code !== 'ENOENT') throw e;
    }
    if (existing) {
      if (existing.type === 'dir') throw new FsError('EISDIR');
      if (cred && !this.can(existing, cred, 'w')) throw new FsError('EACCES');
      existing.content = opts.append ? (existing.content ?? '') + content : content;
      existing.mtime = this.now();
      return;
    }
    const { dir, name } = this.parentOf(this.followDanglingLink(abs), cred);
    if (cred && !this.can(dir, cred, 'w')) throw new FsError('EACCES');
    dir.children!.set(name, {
      type: 'file',
      mode: opts.mode ?? 0o644,
      uid: cred?.uid ?? 0,
      gid: cred?.gid ?? 0,
      mtime: this.now(),
      content,
    });
    dir.mtime = this.now();
  }

  private followDanglingLink(abs: string): string {
    const n = this.tryLookup(abs, false);
    if (n && n.type === 'link') return n.target!.startsWith('/') ? n.target! : normalize(n.target!, dirname(normalize(abs)));
    return abs;
  }

  mkdir(abs: string, opts: { parents?: boolean; cred?: Cred; mode?: number } = {}): void {
    const norm = normalize(abs);
    if (opts.parents) {
      let cur = '';
      for (const part of splitPath(norm)) {
        cur += '/' + part;
        const n = this.tryLookup(cur);
        if (n) {
          if (n.type !== 'dir') throw new FsError('ENOTDIR');
          continue;
        }
        this.mkdir(cur, { cred: opts.cred, mode: opts.mode });
      }
      return;
    }
    const { dir, name } = this.parentOf(norm, opts.cred);
    if (dir.children!.has(name)) throw new FsError('EEXIST');
    if (opts.cred && !this.can(dir, opts.cred, 'w')) throw new FsError('EACCES');
    dir.children!.set(name, {
      type: 'dir',
      mode: opts.mode ?? 0o755,
      uid: opts.cred?.uid ?? 0,
      gid: opts.cred?.gid ?? 0,
      mtime: this.now(),
      children: new Map(),
    });
    dir.mtime = this.now();
  }

  readdir(abs: string, cred?: Cred): string[] {
    const n = this.lookup(abs, { cred });
    if (n.type !== 'dir') throw new FsError('ENOTDIR');
    if (cred && !this.can(n, cred, 'r')) throw new FsError('EACCES');
    return [...n.children!.keys()].sort(cmpC);
  }

  /** Remove a file, link, or (empty unless recursive) directory. */
  remove(abs: string, opts: { recursive?: boolean; cred?: Cred } = {}): void {
    const { dir, name } = this.parentOf(abs, opts.cred);
    const n = dir.children!.get(name);
    if (!n) throw new FsError('ENOENT');
    if (opts.cred && !this.can(dir, opts.cred, 'w')) throw new FsError('EACCES');
    if (n.type === 'dir' && n.children!.size && !opts.recursive) throw new FsError('ENOTEMPTY');
    dir.children!.delete(name);
    dir.mtime = this.now();
  }

  symlink(target: string, abs: string, cred?: Cred): void {
    const { dir, name } = this.parentOf(abs, cred);
    if (dir.children!.has(name)) throw new FsError('EEXIST');
    dir.children!.set(name, { type: 'link', mode: 0o777, uid: cred?.uid ?? 0, gid: cred?.gid ?? 0, mtime: this.now(), target });
  }

  /** Move/rename an entry. */
  rename(from: string, to: string, cred?: Cred): void {
    const src = this.parentOf(from, cred);
    const node = src.dir.children!.get(src.name);
    if (!node) throw new FsError('ENOENT');
    if (cred && !this.can(src.dir, cred, 'w')) throw new FsError('EACCES');
    const dst = this.parentOf(to, cred);
    if (cred && !this.can(dst.dir, cred, 'w')) throw new FsError('EACCES');
    if (node.type === 'dir') {
      // refuse to move a directory inside itself
      const a = normalize(from) + '/';
      if ((normalize(to) + '/').startsWith(a)) throw new FsError('EINVAL');
    }
    const existing = dst.dir.children!.get(dst.name);
    if (existing && existing.type === 'dir' && node.type !== 'dir') throw new FsError('EISDIR');
    src.dir.children!.delete(src.name);
    dst.dir.children!.set(dst.name, node);
    src.dir.mtime = dst.dir.mtime = this.now();
  }

  /** Deep-copy a node (used by cp). */
  static copyNode(n: Inode, cred: Cred | undefined, now: number, preserve = false): Inode {
    const c: Inode = { ...n, mtime: preserve ? n.mtime : now };
    if (!preserve && cred) {
      c.uid = cred.uid;
      c.gid = cred.gid;
      c.mode = n.mode & 0o777;
    }
    if (n.children) {
      c.children = new Map();
      for (const [k, v] of n.children) c.children.set(k, VFS.copyNode(v, cred, now, preserve));
    }
    return c;
  }

  /** Place a node at a path (creating or replacing). */
  put(abs: string, node: Inode, cred?: Cred): void {
    const { dir, name } = this.parentOf(abs, cred);
    if (cred && !this.can(dir, cred, 'w')) throw new FsError('EACCES');
    dir.children!.set(name, node);
    dir.mtime = this.now();
  }

  size(n: Inode): number {
    if (n.type === 'dir') return 4096;
    if (n.type === 'link') return n.target!.length;
    return utf8Length(n.content ?? '');
  }
}

/** Byte-order (C locale) string comparison. */
export function cmpC(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function modeString(n: Inode): string {
  const t = n.type === 'dir' ? 'd' : n.type === 'link' ? 'l' : '-';
  const m = n.mode;
  const trip = (r: number, w: number, x: number, special: boolean, ch: string) =>
    (m & r ? 'r' : '-') + (m & w ? 'w' : '-') + (special ? (m & x ? ch : ch.toUpperCase()) : m & x ? 'x' : '-');
  return (
    t +
    trip(0o400, 0o200, 0o100, (m & 0o4000) !== 0, 's') +
    trip(0o040, 0o020, 0o010, (m & 0o2000) !== 0, 's') +
    trip(0o004, 0o002, 0o001, (m & 0o1000) !== 0, 't')
  );
}
