// The simulated Halden Security workstation every mission starts from.

import '../../shell/commands';
import { COMMANDS } from '../../shell/commands/registry';
import { VFS, normalize, type Inode } from '../../shell/vfs';
import { authLog, accessLog, STORY_END, sysLog } from './gen';

export const UID = { root: 0, daemon: 1, bin: 2, sys: 3, www: 33, backup: 34, syslog: 104, sshd: 105, analyst: 1000, mara: 1001, raj: 1002, nobody: 65534 };
export const GID = { root: 0, adm: 4, shadow: 42, sudo: 27, www: 33, backup: 34, crontab: 105, syslog: 110, analyst: 1000, mara: 1001, raj: 1002, staff: 50, nogroup: 65534 };

const PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
syslog:x:104:110::/home/syslog:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
analyst:x:1000:1000:Intern Analyst,,,:/home/analyst:/bin/bash
mara:x:1001:1001:Mara Okafor,,,:/home/mara:/bin/bash
raj:x:1002:1002:Raj Menon,,,:/home/raj:/bin/bash
`;

const GROUP = `root:x:0:
daemon:x:1:
bin:x:2:
sys:x:3:
adm:x:4:syslog,analyst,mara
sudo:x:27:mara,analyst
www-data:x:33:
backup:x:34:
shadow:x:42:
staff:x:50:
crontab:x:105:
syslog:x:110:
analyst:x:1000:
mara:x:1001:
raj:x:1002:
nogroup:x:65534:
`;

const SHADOW = `root:*:19800:0:99999:7:::
daemon:*:19800:0:99999:7:::
bin:*:19800:0:99999:7:::
sys:*:19800:0:99999:7:::
www-data:*:19800:0:99999:7:::
backup:*:19800:0:99999:7:::
nobody:*:19800:0:99999:7:::
syslog:!:19800::::::
sshd:!:19800::::::
analyst:$y$j9T$Xq2Lmm0vRkqQ1lYgH0fAc.$intern-hash-placeholder-not-real:20500:0:99999:7:::
mara:$y$j9T$7vPtQ9WkqB0fH3m1Lr6Zp/$senior-hash-placeholder-not-real:20480:0:99999:7:::
raj:$y$j9T$d0Kf8mWzP1aQe5rT2nC4x.$analyst-hash-placeholder-not-real:20470:0:99999:7:::
`;

const BASHRC = `# ~/.bashrc for the Halden Security workstation
alias ll='ls -alF'
alias la='ls -A'
alias grep='grep --color=auto'
export EDITOR=nano
`;

const SSHD_CONFIG = `# Halden Security baseline — /etc/ssh/sshd_config
Port 22
PermitRootLogin prohibit-password
PasswordAuthentication yes
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 6
AllowUsers analyst mara raj
`;

const CRONTAB = `# /etc/crontab: system-wide crontab
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# m h dom mon dow user  command
17 *    * * *   root    cd / && run-parts --report /etc/cron.hourly
25 6    * * *   root    test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily
30 2    * * *   backup  /usr/local/bin/nightly-backup.sh
`;

export interface Ctx {
  vfs: VFS;
  now: number;
}

/** Create a file, making parent directories as needed. */
export function put(vfs: VFS, path: string, content: string, o: { mode?: number; uid?: number; gid?: number; mtime?: number } = {}) {
  const dir = path.slice(0, path.lastIndexOf('/')) || '/';
  if (!vfs.exists(dir)) vfs.mkdir(dir, { parents: true });
  vfs.writeFile(path, content);
  const n = vfs.lookup(path, { follow: false });
  n.mode = o.mode ?? 0o644;
  n.uid = o.uid ?? 0;
  n.gid = o.gid ?? 0;
  if (o.mtime !== undefined) n.mtime = o.mtime;
}

export function dir(vfs: VFS, path: string, o: { mode?: number; uid?: number; gid?: number; mtime?: number } = {}) {
  if (!vfs.exists(path)) vfs.mkdir(path, { parents: true });
  const n = vfs.lookup(path);
  n.mode = o.mode ?? 0o755;
  n.uid = o.uid ?? 0;
  n.gid = o.gid ?? 0;
  if (o.mtime !== undefined) n.mtime = o.mtime;
}

/** Files owned by the analyst inside their home (path relative to ~). */
export function home(vfs: VFS, rel: string, content: string, mode = 0o644, mtime?: number) {
  put(vfs, '/home/analyst/' + rel, content, { mode, uid: UID.analyst, gid: GID.analyst, mtime });
  // make sure intermediate dirs are owned by analyst
  let p = '/home/analyst';
  for (const part of rel.split('/').slice(0, -1)) {
    p += '/' + part;
    const n = vfs.lookup(p);
    n.uid = UID.analyst;
    n.gid = GID.analyst;
  }
}

export function homeDir(vfs: VFS, rel: string) {
  let p = '/home/analyst';
  for (const part of rel.split('/')) {
    p += '/' + part;
    if (!vfs.exists(p)) vfs.mkdir(p);
    const n = vfs.lookup(p);
    n.uid = UID.analyst;
    n.gid = GID.analyst;
  }
}

/** Set every inode's mtime under a path (fixtures should look lived-in, not "just created"). */
function ageTree(n: Inode, t: number) {
  n.mtime = t;
  if (n.children) for (const ch of n.children.values()) ageTree(ch, t);
}

export function baseSystem(now: number = Date.now()): VFS {
  const vfs = new VFS(() => Date.now());
  const old = Date.UTC(2026, 0, 20, 10, 0, 0);
  for (const d of ['/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/media', '/mnt', '/opt', '/proc', '/root', '/run', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/var']) {
    if (d === '/bin' || d === '/sbin' || d === '/lib') continue;
    dir(vfs, d);
  }
  dir(vfs, '/root', { mode: 0o700 });
  dir(vfs, '/tmp', { mode: 0o1777 });
  for (const d of ['/usr/bin', '/usr/sbin', '/usr/lib', '/usr/local/bin', '/usr/local/sbin', '/usr/share', '/var/log', '/var/www/html', '/var/backups', '/var/lib/sim', '/var/spool/cron', '/etc/ssh', '/etc/cron.d', '/etc/cron.daily', '/etc/cron.hourly', '/run/sshd']) dir(vfs, d);
  vfs.symlink('usr/bin', '/bin');
  vfs.symlink('usr/sbin', '/sbin');
  vfs.symlink('usr/lib', '/lib');
  dir(vfs, '/var/spool/cron/crontabs', { mode: 0o1730, gid: GID.crontab });

  // command placeholders so `ls /usr/bin`, `which` and `/usr/bin/ls` behave
  for (const name of [...Object.keys(COMMANDS), 'bash', 'sh', 'sudo', 'su', 'kill']) {
    if (name.includes('/')) continue;
    put(vfs, `/usr/bin/${name}`, `#!/sim/builtin ${name}\n`, { mode: name === 'sudo' ? 0o4755 : 0o755, mtime: old });
  }
  put(vfs, '/usr/bin/passwd', '#!/sim/builtin passwd\n', { mode: 0o4755, mtime: old });
  put(vfs, '/usr/bin/chsh', '#!/sim/builtin chsh\n', { mode: 0o4755, mtime: old });
  put(vfs, '/usr/bin/mount', '#!/sim/builtin mount\n', { mode: 0o4755, mtime: old });
  put(vfs, '/usr/bin/crontab', '#!/sim/builtin crontab\n', { mode: 0o2755, gid: GID.crontab, mtime: old });

  // identity
  put(vfs, '/etc/passwd', PASSWD, { mtime: old });
  put(vfs, '/etc/group', GROUP, { mtime: old });
  put(vfs, '/etc/shadow', SHADOW, { mode: 0o640, gid: GID.shadow, mtime: old });
  put(vfs, '/etc/sudoers', 'root ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL\n', { mode: 0o440, mtime: old });
  put(vfs, '/etc/hostname', 'halden-ws01\n', { mtime: old });
  put(vfs, '/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\thalden-ws01\n10.20.0.21\tweb01.halden.internal web01\n10.20.0.22\tdb01.halden.internal db01\n', { mtime: old });
  put(vfs, '/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04 LTS (Noble Numbat)"\nID=ubuntu\n', { mtime: old });
  put(vfs, '/etc/shells', '/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/dash\n', { mtime: old });
  put(vfs, '/etc/motd', 'Welcome to Halden Security. Authorized use only. Activity is logged.\n', { mtime: old });
  put(vfs, '/etc/ssh/sshd_config', SSHD_CONFIG, { mtime: old });
  put(vfs, '/etc/crontab', CRONTAB, { mtime: old });
  put(vfs, '/etc/cron.daily/logrotate', '#!/bin/sh\n/usr/sbin/logrotate /etc/logrotate.conf\n', { mode: 0o755, mtime: old });

  // logs
  put(vfs, '/var/log/auth.log', authLog({ attackers: [{ ip: '203.0.113.7', count: 14, users: ['root'], at: Date.UTC(2026, 2, 13, 2, 10) }] }), { mode: 0o640, uid: UID.syslog, gid: GID.adm, mtime: STORY_END });
  put(vfs, '/var/log/syslog', sysLog(), { mode: 0o640, uid: UID.syslog, gid: GID.adm, mtime: STORY_END });
  dir(vfs, '/var/log/apache2', { mode: 0o750, gid: GID.adm });
  put(vfs, '/var/log/apache2/access.log', accessLog(), { mode: 0o640, gid: GID.adm, mtime: STORY_END });
  put(vfs, '/var/log/apache2/error.log', '[Sat Mar 14 08:02:11.120 2026] [mpm_event:notice] [pid 610] AH00489: Apache/2.4.58 (Ubuntu) configured -- resuming normal operations\n', { mode: 0o640, gid: GID.adm, mtime: STORY_END });
  put(vfs, '/var/log/dpkg.log', '2026-03-10 06:12:44 upgrade openssl:amd64 3.0.13-0ubuntu3.1 3.0.13-0ubuntu3.4\n2026-03-10 06:12:47 upgrade openssh-server:amd64 1:9.6p1-3ubuntu13.4 1:9.6p1-3ubuntu13.5\n', { mtime: STORY_END });
  put(vfs, '/var/www/html/index.html', '<!doctype html>\n<title>Halden Security</title>\n<h1>Halden Security</h1>\n', { uid: UID.www, gid: GID.www, mtime: old });

  // homes
  dir(vfs, '/home/analyst', { mode: 0o750, uid: UID.analyst, gid: GID.analyst });
  dir(vfs, '/home/mara', { mode: 0o750, uid: UID.mara, gid: GID.mara });
  dir(vfs, '/home/raj', { mode: 0o755, uid: UID.raj, gid: GID.raj });
  home(vfs, '.bashrc', BASHRC, 0o644, old);
  home(vfs, '.profile', '# ~/.profile\nif [ -n "$BASH_VERSION" ] && [ -f "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi\n', 0o644, old);
  put(vfs, '/home/mara/.bashrc', BASHRC, { uid: UID.mara, gid: GID.mara, mtime: old });
  put(vfs, '/home/mara/notes.txt', 'Remember: never paste credentials into tickets.\n', { mode: 0o600, uid: UID.mara, gid: GID.mara, mtime: old });
  put(vfs, '/home/raj/README', 'Raj\'s scratch space. Shared on purpose — ask before editing.\n', { uid: UID.raj, gid: GID.raj, mtime: old });
  put(vfs, '/root/.bashrc', BASHRC, { mode: 0o644, mtime: old });

  ageTree(vfs.lookup('/usr'), old);
  void now;
  return vfs;
}

export { normalize };
