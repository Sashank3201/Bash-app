import { defineFixture } from '../fixtures';
import { GID, home, homeDir, put, UID } from '../fixtures/base';
import { appLog, syslogTime } from '../fixtures/gen';
import type { Challenge } from '../types';

// Arena: Functions, arrays & strings (days 12, 15, 19). See docs/CONTENT_GUIDE.md.

const TOPIC = 'Functions, arrays & strings';
const at = (mon: number, day: number, h: number, m: number, s = 0) => Date.UTC(2026, mon - 1, day, h, m, s);

// ------------------------------------------------------------------ log helpers

/** Accounts that exist on Halden's servers; any other name is logged as an "invalid user". */
const REAL_USERS = new Set(['root', 'backup', 'analyst', 'mara', 'raj']);

/** A process id that rises through the day, like real ones. */
const pidAt = (t: number) => 1200 + Math.floor((t % 86_400_000) / 4_000);

/** One sshd failure as it appears in auth.log (two lines for a name that doesn't exist). */
function failed(t: number, host: string, user: string, ip: string, port: number): string[] {
  const pid = pidAt(t);
  const head = `${syslogTime(t)} ${host} sshd[${pid}]: `;
  if (REAL_USERS.has(user)) return [`${head}Failed password for ${user} from ${ip} port ${port} ssh2`];
  return [`${head}Invalid user ${user} from ${ip} port ${port}`, `${head}Failed password for invalid user ${user} from ${ip} port ${port} ssh2`];
}

interface Ev {
  t: number;
  lines: string[];
}

/** `users` tried one after another from `ip`, `gapSec` apart, starting at `start`. */
function attempts(host: string, ip: string, users: string[], start: number, gapSec: number, port0: number): Ev[] {
  return users.map((u, i) => {
    const t = start + i * gapSec * 1000;
    return { t, lines: failed(t, host, u, ip, port0 + i * 23) };
  });
}

function cron(host: string, t: number): Ev {
  const head = `${syslogTime(t)} ${host} CRON[${pidAt(t)}]: pam_unix(cron:session): session `;
  return { t, lines: [`${head}opened for user root(uid=0) by (uid=0)`, `${head}closed for user root`] };
}

function keyLogin(host: string, t: number, user: string, uid: number): Ev {
  const head = `${syslogTime(t)} ${host} sshd[${pidAt(t)}]: `;
  return { t, lines: [`${head}Accepted publickey for ${user} from 10.20.0.15 port 55102 ssh2: ED25519 SHA256:DemoKeyNotReal`, `${head}pam_unix(sshd:session): session opened for user ${user}(uid=${uid}) by (uid=0)`] };
}

/** Events in time order, one log line per line. */
function render(evs: Ev[]): string {
  return [...evs].sort((a, b) => a.t - b.t).flatMap((e) => e.lines).join('\n') + '\n';
}

const MZ = 'MZ\x00\x00PE\x00\x00 training sample: inert stand-in for a Windows program\n';

// ------------------------------------------------------------------ fixtures

defineFixture('arena-scripting-leavers', (vfs) => {
  // web02's account list: the workstation's accounts, plus contractors and a service account
  const extra = [
    'daniel:x:1003:1003:Daniel Brandt,,,:/home/daniel:/bin/bash',
    'jlee:x:1004:1004:Jamie Lee (contractor),,,:/home/jlee:/bin/bash',
    'pnair:x:1005:1005:Priya Nair (contractor),,,:/home/pnair:/bin/bash',
    'svc-report:x:1010:1010:weekly report job - owner tkaur,,,:/var/lib/report:/usr/sbin/nologin',
  ];
  home(vfs, 'audit/web02.passwd', vfs.readFile('/etc/passwd') + extra.join('\n') + '\n', 0o644, at(3, 14, 7, 5));
  home(vfs, 'tickets/leavers.txt', 'dan\njlee\nsvoss\npnair\ntkaur\n', 0o644, at(3, 13, 17, 0));
});

defineFixture('arena-scripting-quarantine', (vfs) => {
  const t = at(3, 13, 9, 40);
  home(vfs, 'quarantine/cleanup.py', '# cleanup.py - training sample, never run quarantined files\nprint("training sample")\n', 0o600, t);
  home(vfs, 'quarantine/invoice.pdf.exe', MZ, 0o600, t);
  home(vfs, 'quarantine/notes.txt', 'Quarantined by the mail gateway, Mar 13. Do not open on a workstation.\n', 0o600, t);
  home(vfs, 'quarantine/payroll.xlsx.scr', MZ, 0o600, t);
  home(vfs, 'quarantine/report.pdf', '%PDF-1.4 training sample\n', 0o600, t);
  home(vfs, 'quarantine/setup.exe', MZ, 0o600, t);
  home(vfs, 'quarantine/update.sh', '#!/bin/sh\n# training sample - never run quarantined files\necho "training sample"\n', 0o600, t);
});

/** Raj's counter: the function's `n` and the script's `n` are the same variable. */
const LEAKY = `#!/bin/bash
# attacked.sh - failed logins per server log, then how many servers were attacked
cd ~/collected || exit 1
n=0    # servers with at least one failed login

fails() {
  n=$(grep -c "Failed password" "$1")
  echo "$1: $n failed"
  [ "$n" -gt 0 ]
}

for f in *.log; do
  if fails "$f"; then
    n=$((n + 1))
  fi
done
echo "Servers attacked: $n"
`;

defineFixture('arena-scripting-leaky', (vfs) => {
  const pulled = at(3, 14, 8, 10);
  const night = (h: number, m: number, s = 0) => at(3, 13, h, m, s);
  home(vfs, 'collected/db01.log', render([cron('db01', night(22, 17, 1)), ...attempts('db01', '192.0.2.66', ['root', 'postgres'], night(23, 12, 40), 31, 40210), keyLogin('db01', night(23, 58, 2), 'mara', 1001)]), 0o644, pulled);
  home(vfs, 'collected/mail01.log', render([cron('mail01', night(22, 17, 1)), keyLogin('mail01', night(22, 40, 12), 'mara', 1001), cron('mail01', night(23, 17, 1))]), 0o644, pulled);
  home(vfs, 'collected/web01.log', render([...attempts('web01', '198.51.100.23', ['root', 'admin', 'raj', 'root', 'raj', 'backup', 'raj', 'admin', 'raj'], night(23, 5, 12), 41, 51022), cron('web01', night(23, 17, 1))]), 0o644, pulled);
  home(vfs, 'collected/web02.log', render([...attempts('web02', '203.0.113.7', ['root', 'root', 'admin', 'root', 'ubuntu'], night(22, 48, 3), 19, 44100), cron('web02', night(23, 17, 1))]), 0o644, pulled);
  home(vfs, 'tools/attacked.sh', LEAKY, 0o755, at(3, 13, 17, 30));
});

const ALERTS = `web01 disk /var at 91%
db01 replication lag 45s
mail01 queue at 5000 messages
web03 certificate expires in 3 days
web02 upstream returned 502
`;

defineFixture('arena-scripting-oncall', (vfs) => {
  home(vfs, 'alerts/today.txt', ALERTS, 0o644, at(3, 14, 7, 0));
});

defineFixture('arena-scripting-keys', (vfs) => {
  home(
    vfs,
    'audit/found-keys.txt',
    `BACKUP_KEY=hdn-demo-7Q2LX9-training-4F1A
SMTP_PASSWORD=not-a-real-password-8c2e
DASHBOARD_TOKEN=demo_token_training_only_b77d
DB_REPLICA_PASS=Tr41ning-Only-0e9f
`,
    0o600,
    at(3, 14, 10, 15),
  );
});

defineFixture('arena-scripting-archive', (vfs) => {
  const restored = at(3, 14, 11, 0);
  const files: [string, string, number][] = [
    ['db01', '20260312', at(3, 12, 6, 25, 1)],
    ['mail01', '20260311', at(3, 11, 6, 25, 1)],
    ['web01', '20260313', at(3, 13, 6, 25, 1)],
    ['web01', '20260314', at(3, 14, 6, 25, 1)],
    ['web02', '20260309', at(3, 9, 6, 25, 1)],
  ];
  for (const [host, day, t] of files) {
    home(vfs, `archive/${host}_auth_${day}.log`, render([cron(host, t)]), 0o644, restored);
  }
});

defineFixture('arena-scripting-cronpath', (vfs) => {
  const t = at(3, 12, 3, 4);
  put(
    vfs,
    '/etc/cron.d/halden-backup',
    `# /etc/cron.d/halden-backup - nightly evidence backup (owner: mara)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/tmp/.cache:/usr/sbin:/usr/bin:/sbin:/bin:.
MAILTO=mara@halden.example

30 2 * * * root backup-evidence --target /srv/backup
`,
    { mtime: t },
  );
  put(vfs, '/usr/local/bin/backup-evidence', '#!/bin/bash\n# backup-evidence - copies /srv/evidence to the backup volume\ntar -czf "/srv/backup/evidence-$(date +%F).tar.gz" /srv/evidence\n', { mode: 0o755, mtime: at(1, 20, 10, 0) });
  // found by the job before /usr/bin/tar; written by the web server account
  put(vfs, '/tmp/.cache/tar', '#!/bin/sh\n# training sample - a planted stand-in for tar, never run it\n', { mode: 0o755, uid: UID.www, gid: GID.www, mtime: t });
});

defineFixture('arena-scripting-spray', (vfs) => {
  const night = (h: number, m: number, s = 0) => at(3, 13, h, m, s);
  const evs: Ev[] = [
    cron('mail01', night(1, 17, 1)),
    ...attempts('mail01', '198.51.100.212', ['admin', 'backup', 'deploy', 'git', 'oracle', 'test', 'ubuntu'], night(1, 12, 5), 360, 40112),
    ...attempts('mail01', '203.0.113.88', ['analyst', 'analyst', 'mara', 'mara', 'raj', 'raj', 'raj', 'backup'], night(1, 30, 10), 40, 52010),
    keyLogin('mail01', night(1, 50, 12), 'mara', 1001),
    ...attempts('mail01', '192.0.2.140', ['raj', 'raj', 'raj', 'mara', 'mara'], night(2, 5, 30), 20, 33410),
    cron('mail01', night(2, 17, 1)),
    ...attempts('mail01', '203.0.113.150', Array<string>(9).fill('root'), night(2, 40, 0), 4, 41022),
    { t: night(2, 40, 40), lines: [`${syslogTime(night(2, 40, 40))} mail01 sshd[${pidAt(night(2, 40, 40))}]: Connection closed by authenticating user root 203.0.113.150 port 41229 [preauth]`] },
  ];
  home(vfs, 'spray/auth.log', render(evs), 0o644, night(3, 0));
});

/** fails.sh before the fix: `set -u` stops it when no log is named. */
const FAILS = `#!/bin/bash
# fails.sh [LOGFILE] - count failed SSH logins (default: /var/log/auth.log)
set -euo pipefail
log=$1
n=$(grep -c "Failed password" "$log" || true)
echo "$log: $n failed logins"
`;

defineFixture('arena-scripting-default', (vfs) => {
  const night = (h: number, m: number, s = 0) => at(3, 13, h, m, s);
  const authLines = render([cron('halden-ws01', night(22, 17, 1)), ...attempts('halden-ws01', '203.0.113.7', ['root', 'root', 'root', 'admin', 'root', 'root'], night(2, 10, 4), 9, 39880), keyLogin('halden-ws01', night(8, 2, 44), 'analyst', 1000)]);
  put(vfs, '/var/log/auth.log', authLines, { mode: 0o640, uid: UID.syslog, gid: GID.adm, mtime: at(3, 14, 12, 0) });
  home(vfs, 'logs/web02.log', render([...attempts('web02', '192.0.2.66', ['root', 'backup'], night(23, 40, 2), 12, 45110), cron('web02', night(23, 17, 1))]), 0o644, at(3, 14, 8, 10));
  home(vfs, 'tools/fails.sh', FAILS, 0o755, at(3, 13, 16, 0));
});

/** nightly.sh before the lock: two copies can run at once. */
const NIGHTLY = `#!/bin/bash
# nightly.sh - count last night's ERROR lines (cron, 02:00)
set -euo pipefail
n=$(grep -h ERROR ~/logs/*.log | wc -l)
echo "Errors: $n"
`;

defineFixture('arena-scripting-lock', (vfs) => {
  const pulled = at(3, 14, 9, 30);
  home(vfs, 'logs/db01.log', appLog({ seed: 221, lines: 20, errors: 3, warnings: 2, service: 'postgres' }), 0o644, pulled);
  home(vfs, 'logs/web01.log', appLog({ seed: 222, lines: 30, errors: 4, warnings: 3, service: 'portal' }), 0o644, pulled);
  home(vfs, 'tools/nightly.sh', NIGHTLY, 0o755, at(3, 12, 15, 0));
});

/** web01's portal log for the morning: five ERROR lines, four WARN. */
const PORTAL = `2026-03-14 08:00:41 INFO portal: config reloaded
2026-03-14 08:02:13 INFO portal: request served in 41ms
2026-03-14 08:04:57 WARN portal: slow query took 2.4s
2026-03-14 08:07:30 INFO portal: health check ok
2026-03-14 08:09:02 ERROR portal: upstream returned 502
2026-03-14 08:11:48 INFO portal: user session started
2026-03-14 08:15:20 ERROR portal: database timeout after 30s
2026-03-14 08:18:05 INFO portal: cache refreshed
2026-03-14 08:21:39 WARN portal: certificate expires in 12 days
2026-03-14 08:24:10 INFO portal: request served in 38ms
2026-03-14 08:26:52 ERROR portal: failed to parse request body
2026-03-14 08:29:31 INFO portal: scheduled job finished
2026-03-14 08:33:07 INFO portal: health check ok
2026-03-14 08:35:44 ERROR portal: permission denied writing /var/cache/app
2026-03-14 08:38:16 WARN portal: memory usage at 78%
2026-03-14 08:41:03 INFO portal: queue drained
2026-03-14 08:44:29 ERROR portal: connection reset by peer
2026-03-14 08:47:12 INFO portal: user session started
2026-03-14 08:50:58 WARN portal: retrying upstream request
2026-03-14 08:53:21 INFO portal: health check ok
`;

defineFixture('arena-scripting-getopts', (vfs) => {
  homeDir(vfs, 'tools');
  home(vfs, 'logs/web01.log', PORTAL, 0o644, at(3, 14, 9, 30));
  home(vfs, 'logs/db01.log', appLog({ seed: 232, lines: 20, errors: 2, warnings: 3, service: 'postgres' }), 0o644, at(3, 14, 9, 30));
});

// ------------------------------------------------------------------ solutions that write scripts

const ATTACKED_FIXED = `cat > ~/tools/attacked.sh <<'EOF'
${LEAKY.replace('fails() {\n', 'fails() {\n  local n\n')}EOF
bash ~/tools/attacked.sh`;

const FAILS_FIXED = `cat > ~/tools/fails.sh <<'EOF'
${FAILS.replace('log=$1', 'log=${1:-/var/log/auth.log}')}EOF
bash ~/tools/fails.sh; bash ~/tools/fails.sh ~/logs/web02.log`;

const LOCK_TEST = 'bash ~/tools/nightly.sh; ls /tmp; touch /tmp/nightly.lock; bash ~/tools/nightly.sh 2>/dev/null; echo "status $?"; ls /tmp';

const NIGHTLY_LOCKED = `cat > ~/tools/nightly.sh <<'EOF'
#!/bin/bash
# nightly.sh - count last night's ERROR lines (cron, 02:00)
set -euo pipefail
lock=/tmp/nightly.lock
if [ -e "$lock" ]; then
  echo "nightly.sh: already running" >&2
  exit 1
fi
touch "$lock"
trap 'rm -f "$lock"' EXIT
n=$(grep -h ERROR ~/logs/*.log | wc -l)
echo "Errors: $n"
EOF
${LOCK_TEST}`;

const GRAB_TEST =
  'bash ~/tools/grab.sh ~/logs/web01.log; bash ~/tools/grab.sh -n 1 -l WARN ~/logs/web01.log; bash ~/tools/grab.sh -x ~/logs/web01.log 2>/dev/null; echo "status $?"; bash ~/tools/grab.sh -n 2 2>/dev/null; echo "status $?"';

const GRAB = `cat > ~/tools/grab.sh <<'EOF'
#!/bin/bash
# grab.sh [-l LEVEL] [-n N] LOGFILE - the last N lines of one level
set -euo pipefail

usage() {
  echo "Usage: grab.sh [-l LEVEL] [-n N] LOGFILE" >&2
  exit 2
}

level=ERROR
count=3
while getopts "l:n:" opt; do
  case $opt in
    l) level=$OPTARG ;;
    n) count=$OPTARG ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))
[ $# -eq 1 ] || usage

grep " $level " "$1" | tail -n "$count" || true
EOF
${GRAB_TEST}`;

// ------------------------------------------------------------------ challenges

export const challenges: Challenge[] = [
  {
    id: 'scripting-leavers',
    title: 'Still on the Books',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 12,
    md: 'HR’s March leavers list is `~/tickets/leavers.txt`, one username per line, and every one of those accounts should be gone from web02. Forgotten accounts are a favourite way in. `~/audit/web02.passwd` is a copy of web02’s account list, where a username is everything before the first `:`. Write a function `has_account` that **succeeds** when the name in `$1` has an account in that file and fails when it doesn’t (the function is the point, so use one). Then print `NAME STILL ACTIVE` or `NAME removed` for each leaver, in list order.',
    fixture: 'arena-scripting-leavers',
    check: { output: 'dan removed\njlee STILL ACTIVE\nsvoss removed\npnair STILL ACTIVE\ntkaur removed\n', nodes: ['function'] },
    solution: 'has_account() { grep -q "^$1:" ~/audit/web02.passwd; }; while read -r u; do if has_account "$u"; then echo "$u STILL ACTIVE"; else echo "$u removed"; fi; done < ~/tickets/leavers.txt',
    hints: [
      'A function’s exit status is its last command’s. `grep -q` prints nothing and exits 0 on a match, so `has_account() { grep -q …; }` is a whole function, ready for `if has_account "$u"; then …`.',
      'Match the whole name: `"^$1:"` only matches a line that **starts** with the name and a colon. A bare `grep -q dan` also matches `daniel`, and `tkaur` turns up in another account’s comment field.',
      '`has_account() { grep -q "^$1:" ~/audit/web02.passwd; }; while read -r u; do if has_account "$u"; then echo "$u STILL ACTIVE"; else echo "$u removed"; fi; done < ~/tickets/leavers.txt`',
    ],
    xp: 40,
  },
  {
    id: 'scripting-quarantine-sort',
    title: 'Sorting the Quarantine',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 12,
    md: `The mail gateway dropped seven attachments into \`~/quarantine\`. Nobody opens them; you sort them by name alone. Use a \`case\` (that’s the point of this one) to print \`KIND NAME\` for every file, in \`ls\` order:

- \`DOUBLE\`: a double extension ending in \`.exe\` or \`.scr\`, like \`x.pdf.exe\`
- \`WINDOWS\`: any other \`.exe\`, \`.scr\` or \`.dll\`
- \`SCRIPT\`: \`.sh\` or \`.py\`
- \`OTHER\`: everything else`,
    fixture: 'arena-scripting-quarantine',
    check: { output: 'SCRIPT cleanup.py\nDOUBLE invoice.pdf.exe\nOTHER notes.txt\nDOUBLE payroll.xlsx.scr\nOTHER report.pdf\nWINDOWS setup.exe\nSCRIPT update.sh\n', nodes: ['case'] },
    solution: 'cd ~/quarantine; for f in *; do case $f in *.*.exe|*.*.scr) k=DOUBLE ;; *.exe|*.scr|*.dll) k=WINDOWS ;; *.sh|*.py) k=SCRIPT ;; *) k=OTHER ;; esac; echo "$k $f"; done',
    hints: [
      '`cd ~/quarantine`, then `for f in *; do …; done` hands you each name in `ls` order. Inside, `case $f in PATTERN) … ;; esac` matches globs like `*.exe`, and `|` separates alternatives.',
      '`case` takes the **first** pattern that matches, and `invoice.pdf.exe` matches `*.exe` too. Put `*.*.exe|*.*.scr` before the plain extensions, and `*)` last.',
      '`cd ~/quarantine; for f in *; do case $f in *.*.exe|*.*.scr) k=DOUBLE ;; *.exe|*.scr|*.dll) k=WINDOWS ;; *.sh|*.py) k=SCRIPT ;; *) k=OTHER ;; esac; echo "$k $f"; done`',
    ],
    xp: 70,
  },
  {
    id: 'scripting-leaky-counter',
    title: 'The Leaky Counter',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 12,
    md: 'Raj’s `~/tools/attacked.sh` prints the failed logins in each log in `~/collected`, then how many servers were attacked. Mara sent four logs, and it reports six. The bug is one variable that the function and the main script both use. Fix it with `local`, then run `bash ~/tools/attacked.sh`.',
    fixture: 'arena-scripting-leaky',
    check: {
      output: 'db01.log: 2 failed\nmail01.log: 0 failed\nweb01.log: 9 failed\nweb02.log: 5 failed\nServers attacked: 3\n',
      fs: [{ path: '~/tools/attacked.sh', contains: 'local' }],
    },
    solution: ATTACKED_FIXED,
    hints: [
      'Run it and `cat` it first. Inside `fails`, `n=$(grep -c …)` writes to the **same** `n` the main script uses to count servers, so every call overwrites the running total.',
      'One line fixes it: `local n` as the first line inside `fails() {`. The function’s `n` now lives and dies inside the function, and the script’s counter is left alone.',
      '`nano ~/tools/attacked.sh`, add `  local n` straight after `fails() {`, save, then run `bash ~/tools/attacked.sh`.',
    ],
    xp: 70,
  },
  {
    id: 'scripting-owner-lookup',
    title: 'Who Owns This?',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 15,
    md: `This morning’s alerts are in \`~/alerts/today.txt\`, one per line: the host, then the message. Halden keeps a lookup table of who looks after each server:

\`\`\`bash
declare -A owner=([web01]=raj [web02]=raj [db01]=mara [mail01]=mara)
\`\`\`

Print each alert with its owner in front, like \`raj: web01 disk /var at 91%\`. A host that isn’t in the table gets \`unassigned\`.`,
    fixture: 'arena-scripting-oncall',
    check: { output: 'raj: web01 disk /var at 91%\nmara: db01 replication lag 45s\nmara: mail01 queue at 5000 messages\nunassigned: web03 certificate expires in 3 days\nraj: web02 upstream returned 502\n' },
    solution: 'declare -A owner=([web01]=raj [web02]=raj [db01]=mara [mail01]=mara); while read -r host msg; do echo "${owner[$host]:-unassigned}: $host $msg"; done < ~/alerts/today.txt',
    hints: [
      'Type the `declare` line first. Then `while read -r host msg; do …; done < ~/alerts/today.txt`: the first word lands in `host`, the rest of the line in `msg`.',
      '`${owner[$host]}` looks the host up. Add a default with `:-` (as in `${2:-10}`): `${owner[$host]:-unassigned}`.',
      '`declare -A owner=([web01]=raj [web02]=raj [db01]=mara [mail01]=mara); while read -r host msg; do echo "${owner[$host]:-unassigned}: $host $msg"; done < ~/alerts/today.txt`',
    ],
    xp: 40,
  },
  {
    id: 'scripting-redacted',
    title: 'Redacted',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 15,
    md: 'An audit found four credentials hard-coded in a world-readable script. They’re copied into `~/audit/found-keys.txt` as `NAME=VALUE`, and the ticket has to say which ones leaked without leaking them again. For each line print `NAME ****LAST4`: the name, a space, four stars and only the **last four** characters of the value. `${v: -4}` gives the last four. Mind the space before the `-`: `${v:-4}` is the default-value form.',
    fixture: 'arena-scripting-keys',
    check: { output: 'BACKUP_KEY ****4F1A\nSMTP_PASSWORD ****8c2e\nDASHBOARD_TOKEN ****b77d\nDB_REPLICA_PASS ****0e9f\n' },
    solution: 'while IFS=\'=\' read -r name value; do echo "$name ****${value: -4}"; done < ~/audit/found-keys.txt',
    hints: [
      '`while IFS=\'=\' read -r name value; do …; done < ~/audit/found-keys.txt` splits each line at the `=`: the name in `name`, the secret in `value`.',
      'A negative offset counts from the end, so `${value: -4}` is the last four characters. Print them after four literal stars: `echo "$name ****${value: -4}"`.',
      '`while IFS=\'=\' read -r name value; do echo "$name ****${value: -4}"; done < ~/audit/found-keys.txt`',
    ],
    xp: 40,
  },
  {
    id: 'scripting-date-stamps',
    title: 'Date Stamps',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 15,
    md: 'Last week’s auth logs came back from the archive as `~/archive/HOST_auth_YYYYMMDD.log`. For the incident timeline, Mara wants one line per file, `YYYY-MM-DD HOST`, **oldest first**. Cut the names apart in pure bash with `${…}` trims and `${var:offset:length}`: no `cut`, `sed` or `awk` this time, because the expansions are the point.',
    fixture: 'arena-scripting-archive',
    check: { output: '2026-03-09 web02\n2026-03-11 mail01\n2026-03-12 db01\n2026-03-13 web01\n2026-03-14 web01\n', forbid: ['cut', 'sed', 'awk'] },
    solution: 'for f in ~/archive/*.log; do n=${f##*/}; d=${n##*_}; echo "${d:0:4}-${d:4:2}-${d:6:2} ${n%%_*}"; done | sort',
    hints: [
      'Work on the bare file name: `n=${f##*/}` turns the full path into `web01_auth_20260313.log`. The host is everything before the first `_`, so trim the longest `_*` from the end: `${n%%_*}`.',
      '`d=${n##*_}` keeps what follows the last `_` (`20260313.log`). Then `${d:0:4}` is the year, `${d:4:2}` the month and `${d:6:2}` the day; offsets count from 0. Dates written `YYYY-MM-DD` sort correctly as plain text, so pipe the loop into `sort`.',
      '`for f in ~/archive/*.log; do n=${f##*/}; d=${n##*_}; echo "${d:0:4}-${d:4:2}-${d:6:2} ${n%%_*}"; done | sort`',
    ],
    xp: 70,
  },
  {
    id: 'scripting-cron-path',
    title: 'Search Order',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 15,
    md: 'Root’s nightly backup job, `/etc/cron.d/halden-backup`, sets its own `PATH`, and cron searches those folders **in order** for every command the job runs. An entry inside `/tmp`, where anyone can write, or a relative one like `.`, lets someone plant a fake `tar` that runs as root the next time the job calls it. Load the PATH’s entries into an array and print `N entries`. Then print `RISKY POSITION ENTRY` for each entry that doesn’t start with `/`, or is `/tmp` or anything inside it. Position 1 is the first folder searched.',
    fixture: 'arena-scripting-cronpath',
    check: { output: '8 entries\nRISKY 3 /tmp/.cache\nRISKY 8 .\n' },
    solution:
      'mapfile -t dirs < <(grep \'^PATH=\' /etc/cron.d/halden-backup | cut -d= -f2 | tr \':\' \'\\n\'); echo "${#dirs[@]} entries"; for i in "${!dirs[@]}"; do d=${dirs[$i]}; if [[ $d != /* || $d == /tmp || $d == /tmp/* ]]; then echo "RISKY $((i + 1)) $d"; fi; done',
    hints: [
      'One entry per line makes `mapfile` do the splitting: `mapfile -t dirs < <(grep \'^PATH=\' /etc/cron.d/halden-backup | cut -d= -f2 | tr \':\' \'\\n\')`. Then `${#dirs[@]}` is the count.',
      '`"${!dirs[@]}"` lists an indexed array’s positions (0, 1, 2…), so `for i in "${!dirs[@]}"` gives you each index; print `$((i + 1))`. The test for one entry `d`: `[[ $d != /* || $d == /tmp || $d == /tmp/* ]]`.',
      'After the `mapfile`: `echo "${#dirs[@]} entries"; for i in "${!dirs[@]}"; do d=${dirs[$i]}; if [[ $d != /* || $d == /tmp || $d == /tmp/* ]]; then echo "RISKY $((i + 1)) $d"; fi; done`',
    ],
    xp: 70,
  },
  {
    id: 'scripting-spray-or-hammer',
    title: 'Spray or Hammer',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 15,
    md: 'Overnight, someone went after mail01’s logins; its log is `~/spray/auth.log`. A **brute force** hammers one account. A **password spray** tries a guess or two against many accounts, staying under any lockout limit. For every IP with `Failed password` lines, print `IP USERS ATTEMPTS`: how many **different** usernames it tried, and how many failed attempts it made. Sort by USERS, most first. On those lines the IP is `$(NF-3)` and the username `$(NF-5)`.',
    fixture: 'arena-scripting-spray',
    check: { output: '198.51.100.212 7 7\n203.0.113.88 4 8\n192.0.2.140 2 5\n203.0.113.150 1 9\n' },
    solution:
      'declare -A tries users seen; while read -r ip u; do ((tries[$ip]++)); if [ -z "${seen[$ip,$u]}" ]; then seen[$ip,$u]=1; ((users[$ip]++)); fi; done < <(grep "Failed password" ~/spray/auth.log | awk \'{print $(NF-3), $(NF-5)}\'); for ip in "${!tries[@]}"; do echo "$ip ${users[$ip]} ${tries[$ip]}"; done | sort -k2 -rn',
    hints: [
      'One pass, three associative arrays: `tries` counts attempts per IP, `users` counts different usernames per IP, and `seen` remembers each IP,user pair you’ve already met. Feed the loop with `< <(grep "Failed password" ~/spray/auth.log | awk \'{print $(NF-3), $(NF-5)}\')`.',
      'For each `ip u`: always `((tries[$ip]++))`. Only the first time a pair turns up (`[ -z "${seen[$ip,$u]}" ]`) set `seen[$ip,$u]=1` and `((users[$ip]++))`.',
      'Print with `for ip in "${!tries[@]}"; do echo "$ip ${users[$ip]} ${tries[$ip]}"; done | sort -k2 -rn`. The IP with the most attempts ends up last: it only ever tried root.',
    ],
    xp: 120,
  },
  {
    id: 'scripting-sensible-default',
    title: 'Sensible Default',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 19,
    md: `\`~/tools/fails.sh\` counts the failed SSH logins in the log you name. With no argument it’s meant to read \`/var/log/auth.log\`, but \`set -u\` stops it with an “unbound variable” error. Fix the \`log=\` line so the default kicks in, keep strict mode, and test it with:

\`\`\`bash
bash ~/tools/fails.sh; bash ~/tools/fails.sh ~/logs/web02.log
\`\`\``,
    fixture: 'arena-scripting-default',
    check: {
      output: '/var/log/auth.log: 6 failed logins\n/home/analyst/logs/web02.log: 2 failed logins\n',
      fs: [{ path: '~/tools/fails.sh', contains: 'set -euo pipefail' }],
    },
    solution: FAILS_FIXED,
    hints: [
      '`${1:-DEFAULT}` means “`$1`, or DEFAULT if it’s missing or empty”, and `set -u` is happy with it.',
      'With `nano ~/tools/fails.sh`, change `log=$1` to `log=${1:-/var/log/auth.log}`. Save, then run the test line.',
    ],
    xp: 40,
  },
  {
    id: 'scripting-one-at-a-time',
    title: 'One at a Time',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 19,
    md: `On Thursday the 02:00 run of \`~/tools/nightly.sh\` was still going when the next one started, and both wrote the same report. Give it a **lock file**: if \`/tmp/nightly.lock\` already exists, print \`nightly.sh: already running\` to stderr and exit 1. Otherwise create the lock and set a \`trap\` that removes it whenever the script exits. Test a normal run, a look in \`/tmp\`, then a run while another copy holds the lock:

\`\`\`bash
${LOCK_TEST}
\`\`\``,
    fixture: 'arena-scripting-lock',
    check: { output: 'Errors: 7\nstatus 1\nnightly.lock\n' },
    solution: NIGHTLY_LOCKED,
    hints: [
      'Guard first, straight under `set -euo pipefail`: `lock=/tmp/nightly.lock`, then `if [ -e "$lock" ]; then echo "nightly.sh: already running" >&2; exit 1; fi`.',
      'Then take the lock and arm the trap, in that order: `touch "$lock"` and `trap \'rm -f "$lock"\' EXIT`. Arm it before the guard and a refused run deletes the other copy’s lock on its way out, so the next run starts alongside it.',
      'Save and run the test line. You want one report, nothing from the first `ls /tmp`, `status 1`, and the other copy’s `nightly.lock` still in place at the end.',
    ],
    xp: 70,
  },
  {
    id: 'scripting-options',
    title: 'Options, Not Edits',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 19,
    md: `Ops keep editing scripts to change one number. Write \`~/tools/grab.sh [-l LEVEL] [-n N] LOGFILE\` with \`getopts\` (that’s the point) and strict mode. It prints the **last** N lines (default 3) of LOGFILE whose level is LEVEL (default \`ERROR\`), unchanged. An unknown option, or anything but exactly one LOGFILE after the options, prints \`Usage: grab.sh [-l LEVEL] [-n N] LOGFILE\` to stderr and exits 2. Test it with:

\`\`\`bash
${GRAB_TEST}
\`\`\``,
    fixture: 'arena-scripting-getopts',
    check: {
      output: `2026-03-14 08:26:52 ERROR portal: failed to parse request body
2026-03-14 08:35:44 ERROR portal: permission denied writing /var/cache/app
2026-03-14 08:44:29 ERROR portal: connection reset by peer
2026-03-14 08:50:58 WARN portal: retrying upstream request
status 2
status 2
`,
      fs: [{ path: '~/tools/grab.sh', contains: 'getopts' }],
    },
    solution: GRAB,
    hints: [
      'Defaults first (`level=ERROR`, `count=3`), then `while getopts "l:n:" opt; do case $opt in l) level=$OPTARG ;; n) count=$OPTARG ;; *) usage ;; esac; done`, where `usage` prints the message to stderr and exits 2.',
      'After the loop, `shift $((OPTIND - 1))` leaves only the operands, so `[ $# -eq 1 ] || usage`. The level is the third field of each line, so `grep " $level " "$1"` finds them; `tail -n "$count"` keeps the last few.',
      'Under strict mode a level with no lines makes `grep` fail, so end the pipeline with `|| true`: `grep " $level " "$1" | tail -n "$count" || true`.',
    ],
    xp: 120,
  },
];
