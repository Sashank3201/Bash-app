// Public entry point for the Bash simulator.
import './commands';
import { InBuf, StringWriter } from './io';
import { Shell, type HostHooks } from './shell';
import { VFS } from './vfs';
import { ExitSignal } from './errors';

export { Shell, VFS, InBuf, StringWriter };
export type { HostHooks };
export { parse, Parser } from './parser';
export { IncompleteInput, ShellSyntaxError, ExitSignal } from './errors';
export { COMMANDS } from './commands/registry';
export { BUILTINS } from './builtins';

export interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
  vfs: VFS;
  shell: Shell;
}

export interface RunOptions {
  vfs?: VFS;
  stdin?: string;
  user?: string;
  cwd?: string;
  /** Positional parameters ($1, $2 ...) when running as a script. */
  args?: string[];
  /** Run as a script file with this name (affects $0 and error prefixes). */
  scriptName?: string;
  env?: Record<string, string>;
  maxSteps?: number;
  timeLimitMs?: number;
  fastSleep?: boolean;
}

/** Run source code non-interactively and capture everything. */
export async function runSource(src: string, o: RunOptions = {}): Promise<RunResult> {
  const vfs = o.vfs ?? new VFS();
  const sh = new Shell({
    vfs,
    user: o.user,
    cwd: o.cwd,
    env: o.env,
    maxSteps: o.maxSteps,
    timeLimitMs: o.timeLimitMs ?? 15000,
    fastSleep: o.fastSleep ?? true,
  });
  const stdout = new StringWriter();
  const stderr = new StringWriter();
  let status: number;
  if (o.scriptName) {
    sh.scriptName = o.scriptName;
    sh.arg0 = o.scriptName;
  }
  sh.positional = o.args ?? [];
  try {
    status = await sh.run(src, { stdin: new InBuf(o.stdin ?? ''), stdout, stderr });
  } catch (e) {
    if (e instanceof ExitSignal) status = e.status;
    else throw e;
  }
  return { stdout: stdout.buf, stderr: stderr.buf, status, vfs, shell: sh };
}
