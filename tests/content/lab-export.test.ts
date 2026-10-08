// Exports the Lab fixture into a directory for the Real Linux Lab image (scripts/linux-image/build.sh).
//   LAB_EXPORT=/path/to/rootfs npx vitest run tests/content/lab-export.test.ts
// Writes the files plus <dir>/.lab-manifest: "mode uid gid path" per entry, for the cpio builder.
import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { buildFixture } from '../../src/content';
import type { Inode } from '../../src/shell/vfs';

const OUT = process.env.LAB_EXPORT;

// What the image takes from the simulated workstation; everything else comes from Ubuntu packages.
const KEEP = [/^\/home(\/|$)/, /^\/root\/\.bashrc$/, /^\/var\/log(\/|$)/, /^\/var\/www(\/|$)/, /^\/var\/backups$/, /^\/srv(\/|$)/, /^\/opt(\/|$)/, /^\/etc\/(passwd|group|shadow|hosts|motd|crontab|shells|sudoers)$/, /^\/etc\/ssh(\/|$)/, /^\/etc\/cron\.[a-z]+(\/|$)/];

it.skipIf(!OUT)('export the lab fixture', () => {
  const vfs = buildFixture('lab');
  const manifest: string[] = [];
  const walk = (node: Inode, path: string) => {
    if (path !== '/' && !KEEP.some((re) => re.test(path))) {
      // still descend: a kept path may live below a skipped parent (e.g. /etc/ssh under /etc)
      if (node.type === 'dir') for (const [name, child] of node.children!) walk(child, (path === '/' ? '' : path) + '/' + name);
      return;
    }
    const dest = join(OUT!, path);
    if (node.type === 'dir') {
      mkdirSync(dest, { recursive: true });
      if (path !== '/') manifest.push(`${(node.mode & 0o7777).toString(8)} ${node.uid} ${node.gid} ${path}`);
      for (const [name, child] of node.children!) walk(child, (path === '/' ? '' : path) + '/' + name);
      utimesSync(dest, node.mtime / 1000, node.mtime / 1000);
    } else if (node.type === 'file') {
      mkdirSync(join(dest, '..'), { recursive: true });
      writeFileSync(dest, node.content ?? '');
      utimesSync(dest, node.mtime / 1000, node.mtime / 1000);
      manifest.push(`${(node.mode & 0o7777).toString(8)} ${node.uid} ${node.gid} ${path}`);
    } else if (node.type === 'link') {
      mkdirSync(join(dest, '..'), { recursive: true });
      symlinkSync(node.target!, dest);
    }
  };
  walk(vfs.lookup('/'), '/');
  writeFileSync(join(OUT!, '.lab-manifest'), manifest.join('\n') + '\n');
});
