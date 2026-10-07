// A terminal session: one Shell + its scrollback, history, and input modes. UI-agnostic.

import type { Program } from '../shell/ast';
import { ExitSignal, IncompleteInput, ShellSyntaxError, UnsupportedError } from '../shell/errors';
import { InBuf, type Writer } from '../shell/io';
import { Shell, type HostHooks } from '../shell/shell';
import type { VFS } from '../shell/vfs';
import '../shell/commands';
import { coachHint } from './coach';

export type EntryKind = 'cmd' | 'out' | 'err' | 'coach' | 'banner' | 'note';

export interface Entry {
  id: number;
  kind: EntryKind;
  text: string;
  prompt?: string;
}

export interface CommandRecord {
  src: string;
  stdout: string;
  stderr: string;
  status: number;
  vfsBefore: VFS;
  cwdBefore: string;
  shell: Shell;
}

export type Mode = 'prompt' | 'cont' | 'stdin' | 'busy';

export interface SessionOptions {
  vfs: VFS;
  user?: string;
  cwd?: string;
  banner?: string;
  coach?: boolean;
  hasManual?: (topic: string) => boolean;
}

const MAX_ENTRIES = 1200;

export function normalizeInput(s: string): string {
  return s.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/—/g, '--').replace(/–/g, '-').replace(/ /g, ' ');
}

export class TerminalSession {
  shell: Shell;
  vfs: VFS;
  entries: Entry[] = [];
  mode: Mode = 'prompt';
  history: string[] = [];
  version = 0;
  coach: boolean;
  cols = 40;
  /** While true, editor/manual requests are ignored (used when silently replaying a mission). */
  quiet = false;

  /** Requests the UI should fulfil. */
  editing: { path: string; done: () => void } | null = null;
  manual: string | null = null;

  onCommand?: (r: CommandRecord) => void | Promise<void>;
  onStats?: (r: CommandRecord, prog: Program) => void;

  private nextId = 1;
  private buffer: string[] = [];
  private listeners = new Set<() => void>();
  private stdinResolve: ((v: string | null) => void) | null = null;
  private notifyQueued = false;
  private opts: SessionOptions;

  constructor(o: SessionOptions) {
    this.opts = o;
    this.vfs = o.vfs;
    this.coach = o.coach ?? true;
    this.shell = this.makeShell();
    if (o.banner) this.push('banner', o.banner);
  }

  private makeShell(): Shell {
    const host: HostHooks = {
      clear: () => this.clear(),
      cols: () => this.cols,
      openEditor: (path) =>
        new Promise<void>((resolve) => {
          if (this.quiet) {
            resolve();
            return;
          }
          this.editing = {
            path,
            done: () => {
              this.editing = null;
              this.notify();
              resolve();
            },
          };
          this.notify();
        }),
      openManual: (topic) => {
        if (this.opts.hasManual && !this.opts.hasManual(topic)) return false;
        if (this.quiet) return true;
        this.manual = topic;
        this.notify();
        return true;
      },
    };
    const sh = new Shell({ vfs: this.vfs, user: this.opts.user ?? 'analyst', cwd: this.opts.cwd, interactive: true, host });
    sh.aliases.set('ll', 'ls -alF');
    sh.aliases.set('la', 'ls -A');
    return sh;
  }

  // ------------------------------------------------------------------ store plumbing

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.version;

  notify() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    const run = () => {
      this.notifyQueued = false;
      this.version++;
      this.listeners.forEach((l) => l());
    };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  push(kind: EntryKind, text: string, prompt?: string) {
    const last = this.entries[this.entries.length - 1];
    if (last && last.kind === kind && (kind === 'out' || kind === 'err')) {
      last.text += text;
      this.entries[this.entries.length - 1] = { ...last };
    } else {
      this.entries.push({ id: this.nextId++, kind, text, prompt });
      if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.notify();
  }

  print(text: string) {
    this.push('note', text);
  }

  clear() {
    this.entries = [];
    this.notify();
  }

  // ------------------------------------------------------------------ prompt

  promptParts(): { user: string; host: string; path: string; sigil: string } {
    const sh = this.shell;
    const user = sh.vfs.userName(sh.cred.uid);
    const home = sh.getScalar('HOME') ?? '';
    let path = sh.cwd;
    if (home && (path === home || path.startsWith(home + '/'))) path = '~' + path.slice(home.length);
    return { user, host: sh.hostname, path, sigil: sh.cred.uid === 0 ? '#' : '$' };
  }

  promptText(): string {
    const p = this.promptParts();
    return `${p.user}@${p.host}:${p.path}${p.sigil} `;
  }

  // ------------------------------------------------------------------ input

  async submit(raw: string): Promise<void> {
    const line = normalizeInput(raw);
    if (this.mode === 'stdin') {
      this.push('cmd', line, '');
      const r = this.stdinResolve;
      this.stdinResolve = null;
      this.mode = 'busy';
      r?.(line + '\n');
      return;
    }
    if (this.mode === 'busy') return;
    this.push('cmd', line, this.mode === 'cont' ? '> ' : this.promptText());
    this.buffer.push(line);
    const src = this.buffer.join('\n');
    if (!src.trim()) {
      this.buffer = [];
      this.mode = 'prompt';
      this.notify();
      return;
    }
    let prog: Program;
    try {
      prog = this.shell.parse(src);
    } catch (e) {
      if (e instanceof IncompleteInput) {
        this.mode = 'cont';
        this.notify();
        return;
      }
      this.buffer = [];
      this.mode = 'prompt';
      this.remember(src);
      if (e instanceof ShellSyntaxError || e instanceof UnsupportedError) {
        const msg = `bash: ${e.message}\n`;
        this.push('err', msg);
        this.shell.lastStatus = 2;
        if (this.coach) {
          const hint = coachHint(src, msg, 2);
          if (hint) this.push('coach', hint);
        }
        await this.onCommand?.({ src, stdout: '', stderr: msg, status: 2, vfsBefore: this.vfs, cwdBefore: this.shell.cwd, shell: this.shell });
        this.notify();
        return;
      }
      throw e;
    }
    this.buffer = [];
    this.remember(src);
    await this.execute(src, prog);
  }

  private remember(src: string) {
    if (src.trim() && this.history[this.history.length - 1] !== src) this.history.push(src);
    this.shell.history.push(src);
    if (this.history.length > 500) this.history.shift();
  }

  /** Run a command as if the user typed it (used by "Try it" buttons). */
  async run(src: string) {
    if (this.mode === 'busy' || this.mode === 'stdin') return;
    this.buffer = [];
    this.mode = 'prompt';
    await this.submit(src);
  }

  private async execute(src: string, prog: Program) {
    this.mode = 'busy';
    this.notify();
    const vfsBefore = this.vfs.clone();
    const cwdBefore = this.shell.cwd;
    let out = '';
    let err = '';
    const stdout: Writer = {
      isTTY: true,
      write: (s: string) => {
        out += s;
        this.push('out', s);
      },
    };
    const stderr: Writer = {
      isTTY: true,
      write: (s: string) => {
        err += s;
        this.push('err', s);
      },
    };
    const stdin = new InBuf('', () => this.waitStdin());
    this.shell.resetAbort();
    let status: number;
    try {
      status = await this.shell.execProgram(prog, { stdin, stdout, stderr });
    } catch (e) {
      if (e instanceof ExitSignal) {
        status = e.status;
        this.push('note', 'logout — starting a fresh shell\n');
        const cwd = this.shell.cwd;
        this.shell = this.makeShell();
        this.shell.cwd = cwd;
      } else {
        status = 1;
        this.push('err', `internal error: ${e instanceof Error ? e.message : String(e)}\n`);
        console.error(e);
      }
    }
    if (this.shell.ctl.aborted) this.push('note', '^C\n');
    // keep the prompt on its own line, like a real terminal does visually
    const rec: CommandRecord = { src, stdout: out, stderr: err, status, vfsBefore, cwdBefore, shell: this.shell };
    this.onStats?.(rec, prog);
    if (this.coach && status !== 0 && err) {
      const hint = coachHint(src, err, status);
      if (hint) this.push('coach', hint);
    }
    this.mode = 'prompt';
    this.notify();
    await this.onCommand?.(rec);
  }

  private waitStdin(): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.shell.ctl.aborted) {
        resolve(null);
        return;
      }
      this.mode = 'stdin';
      this.stdinResolve = resolve;
      this.notify();
    });
  }

  interrupt() {
    if (this.mode === 'busy' || this.mode === 'stdin') {
      this.shell.abort();
      if (this.stdinResolve) {
        const r = this.stdinResolve;
        this.stdinResolve = null;
        this.mode = 'busy';
        r(null);
      }
      return;
    }
    if (this.mode === 'cont' || this.buffer.length) {
      this.buffer = [];
      this.mode = 'prompt';
      this.push('note', '^C\n');
      return;
    }
  }

  /** Ctrl-D */
  eof() {
    if (this.mode === 'stdin' && this.stdinResolve) {
      const r = this.stdinResolve;
      this.stdinResolve = null;
      this.mode = 'busy';
      r(null);
      this.notify();
    }
  }

  /** Run commands silently against this session's shell (used to restore mission state). */
  async replay(srcs: string[]) {
    this.quiet = true;
    try {
      for (const src of srcs) {
        try {
          await this.shell.run(src, { stdin: InBuf.empty(), stdout: { write() {} }, stderr: { write() {} } });
        } catch (e) {
          if (!(e instanceof ExitSignal)) throw e;
        }
      }
    } finally {
      this.quiet = false;
      this.shell.resetAbort();
    }
  }

  /** Swap in a different filesystem (e.g. when a mission resets). */
  reset(vfs: VFS, banner?: string) {
    this.vfs = vfs;
    this.shell = this.makeShell();
    this.entries = [];
    this.buffer = [];
    this.mode = 'prompt';
    if (banner) this.push('banner', banner);
    this.notify();
  }
}
