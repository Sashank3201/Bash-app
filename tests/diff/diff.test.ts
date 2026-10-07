// Runs every case in real bash (when available) and in the simulator, comparing stdout + exit status.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runSource, VFS } from '../../src/shell';
import { CASES } from './cases';
import { CASES2 } from './cases2';

let hasBash = false;
try {
  execFileSync('bash', ['-c', 'true']);
  hasBash = true;
} catch {
  hasBash = false;
}

function baseVfs(files: Record<string, string>): VFS {
  const vfs = new VFS(() => Date.UTC(2026, 2, 14, 9, 30, 0));
  vfs.mkdir('/etc', {});
  vfs.writeFile('/etc/passwd', 'root:x:0:0:root:/root:/bin/bash\nanalyst:x:1000:1000:Analyst:/home/analyst:/bin/bash\n');
  vfs.writeFile('/etc/group', 'root:x:0:\nanalyst:x:1000:\n');
  vfs.mkdir('/tmp', { mode: 0o1777 });
  vfs.mkdir('/home/analyst', { parents: true });
  const home = vfs.lookup('/home/analyst');
  home.uid = 1000;
  home.gid = 1000;
  for (const [p, content] of Object.entries(files)) {
    const abs = '/home/analyst/' + p;
    vfs.mkdir(abs.slice(0, abs.lastIndexOf('/')), { parents: true, cred: { uid: 1000, gid: 1000 } });
    vfs.writeFile(abs, content, { cred: { uid: 1000, gid: 1000 } });
  }
  return vfs;
}

function runReal(src: string, files: Record<string, string>, stdin: string, args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'inkshell-'));
  try {
    for (const [p, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), content);
    }
    writeFileSync(join(dir, '.case.sh'), src);
    const r = spawnSync('bash', ['--norc', '--noprofile', '.case.sh', ...args], {
      cwd: dir,
      input: stdin,
      env: { PATH: process.env.PATH, HOME: dir, LC_ALL: 'C.UTF-8', TZ: 'UTC', USER: 'analyst' },
      encoding: 'utf8',
    });
    return { stdout: r.stdout.split(dir).join('/home/analyst').replace(/\.case\.sh/g, 'script.sh'), status: r.status ?? -1, stderr: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!hasBash)('differential: simulator vs real bash', () => {
  for (const c of [...CASES, ...CASES2]) {
    it(c.name, async () => {
      const files = c.files ?? {};
      const real = runReal(c.src, files, c.stdin ?? '', c.args ?? []);
      const sim = await runSource(c.src, {
        vfs: baseVfs(files),
        stdin: c.stdin ?? '',
        args: c.args ?? [],
        scriptName: 'script.sh',
        cwd: '/home/analyst',
      });
      expect({ stdout: sim.stdout, status: sim.status }, `stderr(sim): ${sim.stderr}\nstderr(real): ${real.stderr}`).toEqual({
        stdout: real.stdout,
        status: real.status,
      });
    });
  }
});
