import { defineFixture } from '../fixtures';
import { GID, UID, dir, home, homeDir, put } from '../fixtures/base';
import type { Mission } from '../types';

defineFixture('day06', (vfs) => {
  home(vfs, 'reports/q1.txt', 'Q1 incident summary — draft\n');
  home(vfs, 'scripts/check.sh', '#!/bin/bash\necho "Checking disk space..."\necho "All good: /var is 61% full"\n', 0o644);
  home(vfs, 'secret.key', '-----BEGIN DEMO KEY-----\nthis-is-not-a-real-key\n-----END DEMO KEY-----\n', 0o644);
  homeDir(vfs, 'reports');
  dir(vfs, '/srv/shared', { mode: 0o2775, gid: GID.adm });
  put(vfs, '/srv/shared/handover.txt', 'Shift handover notes. Group adm can edit.\n', { mode: 0o664, uid: UID.mara, gid: GID.adm });
});

export const day06: Mission = {
  day: 6,
  week: 1,
  title: 'Keys to the Building',
  topic: 'Users, groups & permissions',
  minutes: 40,
  fixture: 'day06',
  briefing: `Quick quiz: why could you read \`/var/log/auth.log\` yesterday when it’s owned by another account?

The answer is **permissions** — the locks and keys of a Linux system. Every file says who owns it, which group it belongs to, and what each kind of user may do with it.

This matters twice over in security. You need permissions to do your job, and **bad** permissions are one of the most common ways attackers climb from a normal account to root. Today you learn to read them, change them, and spot the dangerous ones.`,
  objectives: ['Read users and groups with id and /etc/passwd', 'Decode every column of ls -l', 'Change permissions with chmod (symbolic and octal)', 'Use sudo — and understand why it’s logged'],
  lesson: [
    {
      kind: 'read',
      id: 'users',
      title: 'Users and groups',
      md: `Every process runs as a **user**. Users belong to one or more **groups**, which make sharing easy: give the group access and everyone in it gets it.

Accounts are listed in \`/etc/passwd\`, one per line, fields separated by colons:

\`\`\`text
analyst:x:1000:1000:Intern Analyst,,,:/home/analyst:/bin/bash
name    pw UID  GID  description       home           shell
\`\`\`

**UID 0 is root** — the all-powerful administrator, whatever the account is called.`,
    },
    {
      kind: 'task',
      id: 'id',
      md: 'Run `id` to see your user ID and every group you belong to.',
      check: { output: 'reference', uses: ['id'] },
      solution: 'id',
      hints: ['Just `id`.'],
      explain: 'You’re in **adm** — the group allowed to read system logs. That’s why `auth.log` was readable. You’re also in **sudo**.',
    },
    {
      kind: 'task',
      id: 'passwd',
      md: 'Show your own line from `/etc/passwd` using `grep`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep analyst /etc/passwd',
      hints: ['`grep analyst /etc/passwd`'],
    },
    {
      kind: 'read',
      id: 'lsl',
      title: 'Reading ls -l',
      md: `\`\`\`text
-rw-r----- 1 syslog adm 18210 Mar 14 12:00 auth.log
│└┬┘└┬┘└┬┘   └owner┘└grp┘
│ │  │  └── others: ---  (nothing)
│ │  └───── group:  r--  (read)
│ └──────── owner:  rw-  (read, write)
└────────── type: - file, d directory, l link
\`\`\`

For files, **r** = read, **w** = change, **x** = run as a program. For directories, **r** = list, **w** = create/delete inside, **x** = enter.`,
    },
    {
      kind: 'widget',
      id: 'bits',
      md: 'Each permission is a bit: r = 4, w = 2, x = 1. Add them up per column and you get the **octal** mode. Flip some bits.',
      widget: 'permissions',
      props: { start: 0o640 },
    },
    {
      kind: 'task',
      id: 'ls-shadow',
      md: 'Compare two important files: list `/etc/passwd` and `/etc/shadow` in long format with one command.',
      check: { output: 'reference', uses: ['ls'] },
      solution: 'ls -l /etc/passwd /etc/shadow',
      hints: ['`ls -l` accepts several paths.'],
      explain: '`passwd` is world-readable (644). `shadow` holds password hashes, so only root and the `shadow` group may read it (640).',
    },
    {
      kind: 'task',
      id: 'cat-shadow',
      md: 'Try to read `/etc/shadow` with `cat`. (It should fail — that’s the point.)',
      check: { uses: ['cat'], status: 1 },
      solution: 'cat /etc/shadow',
      hints: ['`cat /etc/shadow`'],
      explain: '“Permission denied” is the system working as intended. Good security means most accounts **can’t** read secrets.',
    },
    {
      kind: 'read',
      id: 'chmod',
      title: 'Changing permissions with chmod',
      md: `Two ways to say the same thing:

**Symbolic** — who (\`u\` owner, \`g\` group, \`o\` others, \`a\` all), then \`+\` add / \`-\` remove / \`=\` set, then the bits:
\`chmod +x script.sh\` · \`chmod go-w report.txt\` · \`chmod u=rw,go= secret.key\`

**Octal** — three digits for owner, group, others:
\`chmod 755 script.sh\` (rwxr-xr-x) · \`chmod 644 notes.txt\` (rw-r--r--) · \`chmod 600 secret.key\` (rw-------)`,
    },
    {
      kind: 'task',
      id: 'chmod-x',
      md: '`~/scripts/check.sh` is a script, but it isn’t executable yet. Add execute permission.',
      check: { fs: [{ path: '~/scripts/check.sh', executable: true }], uses: ['chmod'] },
      solution: 'chmod +x scripts/check.sh',
      hints: ['`chmod +x FILE`'],
    },
    {
      kind: 'task',
      id: 'run-script',
      md: 'Now run it directly with `./`.',
      check: { output: 'reference' },
      solution: './scripts/check.sh',
      hints: ['`./scripts/check.sh` — the `./` tells bash the program is at this path, not in the system folders.'],
    },
    {
      kind: 'task',
      id: 'chmod-600',
      md: '`~/secret.key` is readable by **everyone** (644). Lock it down so only you can read and write it.',
      check: { fs: [{ path: '~/secret.key', mode: 0o600 }], uses: ['chmod'] },
      solution: 'chmod 600 secret.key',
      hints: ['Owner rw = 6, group 0, others 0.', '`chmod 600 secret.key`'],
      explain: 'SSH refuses to use private keys that others can read, for exactly this reason.',
    },
    {
      kind: 'quiz',
      id: 'q-750',
      q: 'A directory has mode `750`. Who can enter it?',
      options: ['Only the owner', 'The owner and members of its group', 'Everyone', 'Nobody — 0 means locked'],
      answer: 1,
      explain: '7 = rwx for the owner, 5 = r-x for the group (x lets them enter), 0 = nothing for others.',
    },
    {
      kind: 'read',
      id: 'sudo',
      title: 'sudo: borrowing root, on the record',
      md: `\`sudo COMMAND\` runs one command as root — if the system’s sudoers policy allows you. You’re in the \`sudo\` group, so you can.

Two rules: use it **only when you need it**, and know that **every sudo use is logged** to \`auth.log\`. That’s a feature: when you investigate an incident, those log lines tell you exactly who did what as root.`,
    },
    {
      kind: 'task',
      id: 'sudo-shadow',
      md: 'Read `/etc/shadow` again — this time with `sudo`.',
      check: { output: 'reference', uses: ['sudo', 'cat'] },
      solution: 'sudo cat /etc/shadow',
      hints: ['Put `sudo` in front of the command that failed.'],
      explain: 'The second field holds password hashes (here, harmless placeholders). `*` and `!` mean the account can’t log in with a password.',
    },
    {
      kind: 'predict',
      id: 'p-stat',
      md: 'What does this print?',
      code: "touch f; chmod 640 f; stat -c '%a %A' f",
      options: ['640 -rw-r-----', '644 -rw-r--r--', '640 -rwxr-----', '0640 rw-r-----'],
      answer: 0,
      explain: '6 = rw-, 4 = r--, 0 = ---. `stat -c` prints exactly the fields you ask for: `%a` octal, `%A` symbolic.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-gw',
      md: '**Drill 1.** Let your group edit `~/reports/q1.txt`: add write permission for the group.',
      check: { fs: [{ path: '~/reports/q1.txt', mode: 0o664 }], uses: ['chmod'] },
      solution: 'chmod g+w reports/q1.txt',
      hints: ['Symbolic: `g+w`.'],
    },
    {
      kind: 'task',
      id: 'd-groups',
      md: '**Drill 2.** List the groups you belong to (there’s a command named exactly that).',
      check: { output: 'reference', uses: ['groups'] },
      solution: 'groups',
      hints: ['`groups`'],
    },
    {
      kind: 'task',
      id: 'd-ork',
      md: '**Drill 3.** Take **all** permissions away from “others” on the `~/reports` directory.',
      check: { fs: [{ path: '~/reports', mode: 0o750 }], uses: ['chmod'] },
      solution: 'chmod o-rwx reports',
      hints: ['Symbolic: `o-rwx`. Or work out the octal: it’s currently 755.'],
    },
    {
      kind: 'task',
      id: 'd-owner',
      md: '**Drill 4.** Who owns `/srv/shared/handover.txt`, and which group? Show it with `ls -l`.',
      check: { output: 'reference', uses: ['ls'] },
      solution: 'ls -l /srv/shared/handover.txt',
      hints: ['`ls -l` + the path.'],
    },
  ],
  debrief: {
    summary: [
      'Users have a UID; UID 0 is root. Groups share access. `id` shows yours.',
      '`ls -l` shows type, owner/group/others permissions, owner and group.',
      'r=4 w=2 x=1 → `chmod 755`, `644`, `600`; or symbolic `chmod u+x,go-w`.',
      '`sudo` runs one command as root — and leaves a record in `auth.log`.',
    ],
    cards: ['c-uid0', 'c-passwd', 'c-rwx', 'c-octal', 'c-chmodx', 'c-600', 'c-sudo', 'c-dirx'],
  },
};
