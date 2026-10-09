import { defineFixture } from '../fixtures';
import { GID, UID, dir, home, homeDir, put } from '../fixtures/base';
import type { Challenge } from '../types';

// Arena: Files & navigation (days 1–3, 5–6). See docs/CONTENT_GUIDE.md.

const TOPIC = 'Files & navigation';
const ANALYST = { uid: UID.analyst, gid: GID.analyst };
const at = (mon: number, day: number, h: number, m: number, s = 0) => Date.UTC(2026, mon - 1, day, h, m, s);

/** Set a path's mtime after its contents were written (writing a child bumps the parent). */
function stamp(vfs: Parameters<typeof home>[0], path: string, mtime: number) {
  vfs.lookup(path).mtime = mtime;
}

// ------------------------------------------------------------------ fixtures

const NIGHT_NOTE = `Night shift handover - Sat 14 Mar, 06:40
web01 quiet since 02:41. The block on 203.0.113.7 is still holding.
If it comes back, reopen ticket HS-2291 and page Mara.
`;

defineFixture('arena-files-dotfile', (vfs) => {
  home(vfs, 'handover-template.txt', 'Shift:\nIncidents:\nOpen tickets:\nNotes:\n', 0o644, at(3, 2, 9, 0));
  home(vfs, '.night-shift', NIGHT_NOTE, 0o644, at(3, 14, 6, 40));
  homeDir(vfs, 'cases');
  home(vfs, 'cases/README', 'Case files go here.\n', 0o644, at(3, 2, 9, 5));
});

const STAGE = `training sample - left by an intruder, not a working tool
staged: copies of /etc/passwd and /etc/hosts
pending upload to 198.51.100.77
`;

defineFixture('arena-files-tmp', (vfs) => {
  dir(vfs, '/tmp/.X11-unix', { mode: 0o1777 });
  dir(vfs, '/tmp/.ICE-unix', { mode: 0o1777 });
  dir(vfs, '/tmp/.font-unix', { mode: 0o1777 });
  dir(vfs, '/tmp/systemd-private-3f9c0e-apache2.service-Qx1Lw2', { mode: 0o700 });
  put(vfs, '/tmp/apt-check.log', 'Reading package lists... Done\n0 upgraded, 0 newly installed, 0 to remove.\n', { mtime: at(3, 13, 6, 25) });
  dir(vfs, '/tmp/...', { uid: UID.www, gid: GID.www });
  put(vfs, '/tmp/.../stage.txt', STAGE, { uid: UID.www, gid: GID.www, mtime: at(3, 13, 23, 54) });
});

defineFixture('arena-files-ssh', (vfs) => {
  put(vfs, '/etc/ssh/ssh_config', '# Halden client defaults\nHost *\n    HashKnownHosts yes\n    ForwardAgent no\n', { mtime: at(1, 20, 10, 0) });
  put(vfs, '/etc/ssh/ssh_host_ed25519_key.pub', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHaldenDemoHostKeyNotReal root@halden-ws01\n', { mtime: at(1, 20, 10, 0) });
  put(vfs, '/etc/ssh/sshd_config.d/50-cloud-init.conf', 'PasswordAuthentication yes\n', { mtime: at(1, 20, 10, 0) });
});

const CASE_LOG = `Mar 13 23:05:12 web01 sshd[4112]: Failed password for raj from 198.51.100.23 port 51022 ssh2
Mar 13 23:05:19 web01 sshd[4115]: Failed password for raj from 198.51.100.23 port 51040 ssh2
Mar 13 23:05:27 web01 sshd[4119]: Failed password for raj from 198.51.100.23 port 51063 ssh2
Mar 13 23:51:02 web01 sshd[4630]: Accepted password for raj from 198.51.100.23 port 52211 ssh2
`;

defineFixture('arena-files-mv', (vfs) => {
  home(vfs, 'archive', CASE_LOG, 0o644, at(3, 14, 0, 12));
  home(vfs, 'todo.txt', 'File the web01 log from last night.\n', 0o644, at(3, 14, 0, 10));
});

defineFixture('arena-files-core', (vfs) => {
  for (const pid of ['1187', '2203', '40915']) home(vfs, `crash/core.${pid}`, `core dump of pid ${pid} - training sample\n`, 0o600, at(3, 14, 3, 12));
  home(vfs, 'crash/core.conf', '# crash handler settings\nkeep_dumps=no\nmax_size=64M\n', 0o644, at(1, 20, 10, 0));
  home(vfs, 'crash/core.log', 'Mar 14 03:12:40 apache2[1187] dumped core\nMar 14 03:12:41 apache2[2203] dumped core\nMar 14 03:14:02 php-fpm[40915] dumped core\n', 0o644, at(3, 14, 3, 14));
  home(vfs, 'crash/README', 'Crash dumps land here. Delete them once triaged.\n', 0o644, at(1, 20, 10, 0));
});

defineFixture('arena-files-dump', (vfs) => {
  const t = at(3, 14, 1, 30);
  home(vfs, 'dump/auth.log', CASE_LOG, 0o644, t);
  home(vfs, 'dump/error.log', '[Fri Mar 13 23:58:09.412 2026] [php:warn] [pid 4711] status-check.php: unexpected parameter\n', 0o644, t);
  home(vfs, 'dump/access.log.1', '198.51.100.23 - - [13/Mar/2026:23:58:12 +0000] "GET /status-check.php HTTP/1.1" 200 41 "-" "curl/8.5.0"\n', 0o644, t);
  home(vfs, 'dump/login page.png', '(image data)\n', 0o644, t);
  home(vfs, 'dump/Screenshot 2026-03-13 at 23.52.png', '(image data)\n', 0o644, t);
  home(vfs, 'dump/notes.txt', 'raj says he never logged in after 22:00\n', 0o644, t);
  home(vfs, 'dump/.timeline.txt', '23:05 failures start\n23:51 accepted password for raj\n23:58 status-check.php requested\n', 0o644, t);
  home(vfs, 'dump/upload.tmp', 'partial\n', 0o644, t);
  home(vfs, 'dump/upload (1).tmp', 'partial\n', 0o644, t);
});

defineFixture('arena-files-webroot', (vfs) => {
  home(vfs, 'web01-www/index.html', '<!doctype html>\n<title>Halden Security</title>\n<h1>Halden Security</h1>\n<script src="//files.cdn-share.example/x.js"></script>\n', 0o644, at(3, 13, 23, 56, 41));
  home(vfs, 'web01-www/about.html', '<!doctype html>\n<title>About Halden</title>\n', 0o644, at(2, 2, 10, 14));
  home(vfs, 'web01-www/contact.html', '<!doctype html>\n<title>Contact</title>\n', 0o644, at(2, 27, 16, 3));
  home(vfs, 'web01-www/robots.txt', 'User-agent: *\nDisallow: /login\n', 0o644, at(3, 10, 9, 12));
  home(vfs, 'web01-www/status-check.php', '<?php /* training sample: stands in for a dropped web shell, not working code */ ?>\n', 0o644, at(3, 13, 23, 58, 7));
  home(vfs, 'web01-www/assets/site.css', 'body { font-family: serif; }\n', 0o644, at(3, 2, 11, 0));
  home(vfs, 'web01-www/blog/index.html', '<!doctype html>\n<title>Blog</title>\n', 0o644, at(3, 2, 11, 5));
  stamp(vfs, '/home/analyst/web01-www/assets', at(3, 2, 11, 0));
  stamp(vfs, '/home/analyst/web01-www/blog', at(3, 2, 11, 5));
});

const PRIV = (host: string) => `-----BEGIN DEMO KEY-----\nnot-a-real-key-${host}-deploy\n-----END DEMO KEY-----\n`;
const PUB = (host: string) => `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoKeyNotReal ${host}-deploy@halden.example\n`;

defineFixture('arena-files-keys', (vfs) => {
  for (const h of ['web01', 'db01', 'mail01']) {
    home(vfs, `keys/${h}.key`, PRIV(h), 0o644, at(3, 9, 9, 0));
    home(vfs, `keys/${h}.pub`, PUB(h), 0o644, at(3, 9, 9, 0));
  }
});

defineFixture('arena-files-cron', (vfs) => {
  put(vfs, '/etc/cron.d/e2scrub_all', '30 3 * * 0 root test -e /run/systemd/system || /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all_cron\n', { mtime: at(1, 20, 10, 0) });
  put(vfs, '/etc/cron.d/halden-backup', '# Nightly evidence backup\n30 2 * * * backup /usr/local/bin/nightly-backup.sh\n', { mode: 0o666, mtime: at(3, 11, 15, 20) });
  put(vfs, '/etc/cron.d/sysstat', '5-55/10 * * * * root command -v debian-sa1 > /dev/null && debian-sa1 1 1\n', { mtime: at(1, 20, 10, 0) });
});

defineFixture('arena-files-vault', (vfs) => {
  const t = at(3, 9, 9, 30);
  home(vfs, 'vault/README', 'Team vault. Secrets only; nothing here leaves the workstation.\n', 0o644, t);
  home(vfs, 'vault/api-token.txt', 'HALDEN-DEMO-TOKEN-not-real-0000\n', 0o600, t);
  home(vfs, 'vault/vpn.conf', 'remote vpn.halden.example 1194\nauth-user-pass\n# demo secret: not-a-real-psk\n', 0o644, t);
  home(vfs, 'vault/db-backup.sql', '-- demo dump of db01 users table, training sample\nINSERT INTO users VALUES (1, \'mara\');\n', 0o664, t);
  home(vfs, 'vault/wifi.psk', 'halden-office: demo-psk-not-real\n', 0o604, t);
});

defineFixture('arena-files-handoff', (vfs) => {
  home(vfs, 'handoff/brief.txt', 'Handoff for the 14 Mar night shift: watch web01 for 198.51.100.23.\n', 0o666, at(3, 14, 18, 0));
  dir(vfs, '/home/analyst/handoff', { mode: 0o777, ...ANALYST, mtime: at(3, 14, 18, 0) });
});

// ------------------------------------------------------------------ challenges

export const challenges: Challenge[] = [
  {
    id: 'files-night-note',
    title: 'Note in the Dark',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 1,
    md: 'The night shift swears they left you a handover note in your home folder, but a plain `ls` shows only the blank template. Their note is **hidden**: its name starts with a dot. Find it and print its contents. (`.bashrc` and `.profile` are standard on every account — it’s neither of those.)',
    fixture: 'arena-files-dotfile',
    check: { output: NIGHT_NOTE },
    solution: 'cat ~/.night-shift',
    hints: ['`ls` skips names that start with a dot. Which option shows **all** files?', '`ls -a` lists everything. Look for a dot-name that isn’t `.bashrc` or `.profile`.', 'It’s `.night-shift`: `cat .night-shift`.'],
    xp: 40,
  },
  {
    id: 'files-three-dots',
    title: 'Three Dots',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 2,
    md: 'Intruders love `/tmp`: anyone can write there, and nobody looks. Someone has made a folder in `/tmp` on this workstation with a name built to slide past a quick glance at `ls -a`. Find it and print the contents of the one file inside it.',
    fixture: 'arena-files-tmp',
    check: { output: STAGE },
    solution: 'cat /tmp/.../stage.txt',
    hints: [
      '`ls -a /tmp` shows every name, hidden ones included. Every folder lists `.` and `..` — read the start of that list slowly.',
      '`..` is the parent. A folder called `...` (three dots) is not normal. Look inside: `ls -a /tmp/...`',
      '`cat /tmp/.../stage.txt`',
    ],
    xp: 70,
  },
  {
    id: 'files-ssh-snapshot',
    title: 'Snapshot Before Surgery',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 3,
    md: 'Halden rule: before anyone hardens SSH, you snapshot its config. Copy the whole `/etc/ssh` folder so that its files sit directly inside `~/backup/ssh-before` (so `~/backup/ssh-before/sshd_config` exists). `~/backup` doesn’t exist yet.',
    fixture: 'arena-files-ssh',
    check: {
      fs: [
        { path: '~/backup/ssh-before/sshd_config', contains: 'PermitRootLogin prohibit-password' },
        { path: '~/backup/ssh-before/sshd_config.d/50-cloud-init.conf', contains: 'PasswordAuthentication yes' },
        { path: '~/backup/ssh-before/ssh_host_ed25519_key.pub', exists: true },
        { path: '~/backup/ssh-before/ssh', exists: false },
      ],
    },
    solution: 'mkdir -p ~/backup && cp -r /etc/ssh ~/backup/ssh-before',
    hints: [
      'Two jobs: make the `~/backup` folder, then copy a folder — which needs `-r`.',
      'If the destination **doesn’t** exist, `cp -r` creates it as the copy. If it **does** exist, the copy lands inside it as `ssh-before/ssh`. So don’t create `ssh-before` yourself.',
      '`mkdir -p ~/backup && cp -r /etc/ssh ~/backup/ssh-before`',
    ],
    xp: 40,
  },
  {
    id: 'files-wrong-turn',
    title: 'Wrong Turn',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 3,
    md: 'Last night Raj typed `mv case-0313.log archive` to file a log away. There was no folder called `archive`, so `mv` did what it does with a name that isn’t a folder: it **renamed** the log. `~/archive` is now that log. Put it right: `~/archive` must be a folder holding the log under its real name, `case-0313.log`, with no stray copy left in your home.',
    fixture: 'arena-files-mv',
    check: {
      fs: [
        { path: '~/archive', type: 'dir' },
        { path: '~/archive/case-0313.log', content: CASE_LOG },
        { path: '~/case-0313.log', exists: false },
      ],
    },
    solution: 'mv ~/archive ~/case-0313.log && mkdir ~/archive && mv ~/case-0313.log ~/archive/',
    hints: [
      'A file and a folder can’t share a name in the same place. Get the file out of the way first — by giving it back its real name.',
      '`mv archive case-0313.log` undoes the rename. Then make the folder and move the log into it. (End folder destinations with `/`: then `mv` refuses instead of renaming when the folder is missing.)',
      '`mv archive case-0313.log && mkdir archive && mv case-0313.log archive/`',
    ],
    xp: 70,
  },
  {
    id: 'files-core-sweep',
    title: 'Core Dump Sweep',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 3,
    md: 'A **core dump** is a snapshot of a crashed program’s memory, so it can hold passwords and session keys. Delete every core dump in `~/crash` — the files named `core.` followed by a process ID, digits only — and keep everything else. Preview your pattern with `ls` before you swap in `rm`: there’s a trap.',
    fixture: 'arena-files-core',
    check: {
      fs: [
        { path: '~/crash/core.1187', exists: false },
        { path: '~/crash/core.2203', exists: false },
        { path: '~/crash/core.40915', exists: false },
        { path: '~/crash/core.conf', exists: true },
        { path: '~/crash/core.log', exists: true },
        { path: '~/crash/README', exists: true },
      ],
    },
    solution: 'rm ~/crash/core.[0-9]*',
    hints: [
      'Try patterns with `ls` first. What does `ls ~/crash/core.????` match — only dumps?',
      '`?` matches **any** one character, letters too (hello, `core.conf`), and not every PID has four digits. Say “the first character after the dot is a digit” with `[0-9]`.',
      '`rm ~/crash/core.[0-9]*`',
    ],
    xp: 70,
  },
  {
    id: 'files-evidence-locker',
    title: 'Evidence Locker, Properly',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 3,
    md: 'Raj tipped a USB stick’s worth of evidence into `~/dump`. File it under `~/case-0314`: every log (any name containing `.log`, rotated ones too) into `logs/`, every `.png` into `images/`, and every `.txt` — **including the hidden one** — into `notes/`. Move, don’t copy. The `.tmp` files are junk: delete them. Finish by removing `~/dump` itself with `rmdir`, which refuses if you missed anything.',
    fixture: 'arena-files-dump',
    check: {
      fs: [
        { path: '~/case-0314/logs/auth.log', content: CASE_LOG },
        { path: '~/case-0314/logs/error.log', exists: true },
        { path: '~/case-0314/logs/access.log.1', exists: true },
        { path: '~/case-0314/images/login page.png', exists: true },
        { path: '~/case-0314/images/Screenshot 2026-03-13 at 23.52.png', exists: true },
        { path: '~/case-0314/notes/notes.txt', exists: true },
        { path: '~/case-0314/notes/.timeline.txt', exists: true },
        { path: '~/dump', exists: false },
      ],
    },
    solution: `mkdir -p ~/case-0314/logs ~/case-0314/images ~/case-0314/notes
mv ~/dump/*.log* ~/case-0314/logs/
mv ~/dump/*.png ~/case-0314/images/
mv ~/dump/*.txt ~/dump/.*.txt ~/case-0314/notes/
rm ~/dump/*.tmp
rmdir ~/dump`,
    hints: [
      '`mkdir -p` takes several paths, so one command builds all three folders. Then `ls -a ~/dump` to see exactly what you’re dealing with.',
      'Globs keep names with spaces in one piece, so `mv ~/dump/*.png …` is safe. `*.log*` catches `access.log.1`. But `*` never matches a leading dot: the hidden note needs `.*.txt` (or its own name).',
      'mkdir -p, then `mv ~/dump/*.log* ~/case-0314/logs/`, the same for `*.png` and for `*.txt .*.txt`, then `rm ~/dump/*.tmp` and `rmdir ~/dump`.',
    ],
    xp: 120,
  },
  {
    id: 'files-last-touch',
    title: 'Last Touch',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 5,
    md: 'Raj’s account logged in to web01 at 23:51 on 13 March. If the intruder changed the website, the timestamps will show it. Raj copied web01’s web root, timestamps intact, to `~/web01-www`. Print the names of the **three** most recently modified entries in it, newest first, one per line and nothing else. `ls` has an option that sorts by modification time: find it in `man ls`.',
    fixture: 'arena-files-webroot',
    check: { output: 'status-check.php\nindex.html\nrobots.txt\n' },
    solution: 'ls -t ~/web01-www | head -n 3',
    hints: [
      '`man ls` lists the sort options. One sorts by time, newest first.',
      '`ls -t` sorts by modification time. Into a pipe, `ls` prints one name per line — then keep the top three.',
      '`ls -t ~/web01-www | head -n 3`',
    ],
    xp: 70,
  },
  {
    id: 'files-key-lockdown',
    title: 'Keys Under Lock',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 6,
    md: 'Someone unpacked the deploy keys into `~/keys` and left every one readable by everybody. Set each **private** key (`*.key`) to `600`: owner reads and writes, nobody else gets anything. The public halves (`*.pub`) are meant to be shared, so they stay `644`.',
    fixture: 'arena-files-keys',
    check: {
      fs: [
        { path: '~/keys/web01.key', mode: 0o600 },
        { path: '~/keys/db01.key', mode: 0o600 },
        { path: '~/keys/mail01.key', mode: 0o600 },
        { path: '~/keys/web01.pub', mode: 0o644 },
        { path: '~/keys/db01.pub', mode: 0o644 },
        { path: '~/keys/mail01.pub', mode: 0o644 },
      ],
    },
    solution: 'chmod 600 ~/keys/*.key',
    hints: ['`chmod` accepts several files at once — and a glob can pick them for you.', 'Octal `600` = read and write for the owner, nothing for group or others. `*.key` matches only the private keys.', '`chmod 600 ~/keys/*.key`'],
    xp: 40,
  },
  {
    id: 'files-cron-open',
    title: 'Anyone’s Cron',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 6,
    md: 'Audit finding: `/etc/cron.d/halden-backup` is world-**writable**. Cron runs every line in that folder as the user the line names — root included — so anyone on this machine could add a line and run it as root. Set the file to `644`. It belongs to root, so you’ll need to borrow root’s powers for one command.',
    fixture: 'arena-files-cron',
    check: { fs: [{ path: '/etc/cron.d/halden-backup', mode: 0o644 }] },
    solution: 'sudo chmod 644 /etc/cron.d/halden-backup',
    hints: ['Look first: `ls -l /etc/cron.d`. The `w` in the last trio is the problem.', 'Only a file’s owner — or root — may `chmod` it. Put `sudo` in front.', '`sudo chmod 644 /etc/cron.d/halden-backup`'],
    xp: 40,
  },
  {
    id: 'files-open-vault',
    title: 'Open Vault',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 6,
    md: 'Audit of `~/vault`: apart from `README`, which is public on purpose, **others** must have no access to anything in it. Fix every offender, and change nothing else — owner and group permissions stay exactly as they are. Start with `ls -l` and read the last trio on every line.',
    fixture: 'arena-files-vault',
    check: {
      fs: [
        { path: '~/vault/README', mode: 0o644 },
        { path: '~/vault/api-token.txt', mode: 0o600 },
        { path: '~/vault/vpn.conf', mode: 0o640 },
        { path: '~/vault/db-backup.sql', mode: 0o660 },
        { path: '~/vault/wifi.psk', mode: 0o600 },
      ],
    },
    solution: 'chmod o-rwx ~/vault/vpn.conf ~/vault/db-backup.sql ~/vault/wifi.psk',
    hints: [
      'In `ls -l ~/vault`, the last three permission characters are “others”. Three files besides `README` have an `r` there — one hides it behind an empty group trio.',
      'Symbolic mode changes only what you name: `o-rwx` strips others and leaves owner and group alone. With octal you’d have to work each file out separately.',
      '`chmod o-rwx ~/vault/vpn.conf ~/vault/db-backup.sql ~/vault/wifi.psk`',
    ],
    xp: 70,
  },
  {
    id: 'files-blind-drop',
    title: 'Blind Drop',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 6,
    md: 'Mara wants `~/handoff` to be a blind drop. Right now it’s wide open: the folder is `777` and `brief.txt` inside is `666`. Set the **folder** so that you have full control, its group can open a file inside if they know the exact name but can’t list the folder or create or delete anything in it, and everyone else gets nothing. Set **`brief.txt`** so you read and write, the group only reads, and others get nothing.',
    fixture: 'arena-files-handoff',
    check: {
      fs: [
        { path: '~/handoff', mode: 0o710 },
        { path: '~/handoff/brief.txt', mode: 0o640 },
      ],
    },
    solution: 'chmod 640 ~/handoff/brief.txt && chmod 710 ~/handoff',
    hints: [
      'On a folder, `r` lets you list it, `w` lets you create or delete inside it, and `x` lets you pass through it to reach the files.',
      'The group may pass through but not list or change: that’s `x` alone, which is 1. Owner `rwx` is 7, others 0. The file is the familiar rw / r / nothing.',
      '`chmod 640 ~/handoff/brief.txt && chmod 710 ~/handoff`',
    ],
    xp: 120,
  },
];
