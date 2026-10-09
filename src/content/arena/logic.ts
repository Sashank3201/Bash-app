import { defineFixture } from '../fixtures';
import { dir, home, homeDir, put } from '../fixtures/base';
import type { Challenge } from '../types';

// Arena: Arguments, conditions & loops (days 8–10). See docs/CONTENT_GUIDE.md.

const TOPIC = 'Conditions & loops';
const at = (mon: number, day: number, h: number, m: number, s = 0) => Date.UTC(2026, mon - 1, day, h, m, s);

// ------------------------------------------------------------------ fixtures

defineFixture('arena-logic-collected', (vfs) => {
  const t = at(3, 14, 7, 30);
  home(
    vfs,
    'collected/web01.log',
    `Mar 13 23:50:41 web01 sshd[4611]: Failed password for raj from 198.51.100.23 port 52190 ssh2
Mar 13 23:51:02 web01 sshd[4630]: Accepted password for raj from 198.51.100.23 port 52211 ssh2
Mar 13 23:51:02 web01 sshd[4630]: pam_unix(sshd:session): session opened for user raj(uid=1002) by (uid=0)
`,
    0o644,
    t,
  );
  home(
    vfs,
    'collected/web02.log',
    `Mar 13 23:17:01 web02 CRON[3350]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 13 23:17:01 web02 CRON[3350]: pam_unix(cron:session): session closed for user root
Mar 14 00:17:01 web02 CRON[3391]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 14 00:17:01 web02 CRON[3391]: pam_unix(cron:session): session closed for user root
`,
    0o644,
    t,
  );
});

defineFixture('arena-logic-incident', (vfs) => {
  homeDir(vfs, 'tools');
  home(
    vfs,
    'incident/auth.log',
    `Mar 13 23:05:12 web01 sshd[4112]: Invalid user admin from 198.51.100.23 port 51022
Mar 13 23:05:14 web01 sshd[4112]: Failed password for invalid user admin from 198.51.100.23 port 51022 ssh2
Mar 13 23:05:19 web01 sshd[4115]: Failed password for root from 198.51.100.23 port 51040 ssh2
Mar 13 23:05:27 web01 sshd[4119]: Failed password for raj from 198.51.100.23 port 51063 ssh2
Mar 13 23:06:02 web01 sshd[4124]: Failed password for invalid user admin from 198.51.100.23 port 51101 ssh2
Mar 13 23:06:40 web01 sshd[4130]: Failed password for backup from 198.51.100.23 port 51144 ssh2
Mar 13 23:17:01 web01 CRON[4301]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 13 23:51:02 web01 sshd[4630]: Accepted password for raj from 198.51.100.23 port 52211 ssh2
Mar 13 23:51:02 web01 sshd[4630]: pam_unix(sshd:session): session opened for user raj(uid=1002) by (uid=0)
`,
    0o644,
    at(3, 14, 0, 20),
  );
});

defineFixture('arena-logic-audit', (vfs) => {
  // web02's account list: the workstation's twelve accounts plus one that shouldn't be there (a second uid 0)
  const lines = vfs.readFile('/etc/passwd').trimEnd().split('\n');
  const i = lines.findIndex((l) => l.startsWith('sshd:'));
  lines.splice(i + 1, 0, 'sysupdate:x:0:0:System Update,,,:/root:/bin/bash');
  home(vfs, 'audit/web02.passwd', lines.join('\n') + '\n', 0o644, at(3, 14, 7, 5));
});

defineFixture('arena-logic-tools', (vfs) => {
  homeDir(vfs, 'tools');
});

defineFixture('arena-logic-logs', (vfs) => {
  const t = at(3, 14, 7, 0);
  home(
    vfs,
    'logs/auth.log',
    `Mar 14 06:17:01 web01 CRON[2210]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 14 06:40:12 web01 sshd[2236]: Accepted publickey for mara from 10.20.0.15 port 55102 ssh2
`,
    0o644,
    t,
  );
  home(vfs, 'logs/audit.log', '', 0o644, at(3, 13, 23, 52));
  home(vfs, 'logs/cron.log', 'Mar 14 06:25:01 web01 CRON[2214]: (root) CMD (test -x /usr/sbin/anacron || run-parts --report /etc/cron.daily)\n', 0o644, t);
  home(vfs, 'logs/kern.log', '', 0o644, at(3, 13, 23, 52));
  home(vfs, 'logs/nginx-error.log', '2026/03/14 07:02:11 [error] 611#611: *88 open() "/var/www/html/wp-login.php" failed (2: No such file or directory), client: 192.0.2.44, server: halden.example\n', 0o644, t);
  home(vfs, 'logs/notes.txt', '', 0o644, t);
});

defineFixture('arena-logic-critical', (vfs) => {
  const t = at(1, 20, 10, 0);
  put(vfs, '/etc/audit/auditd.conf', '# Halden baseline\nlog_file = /var/log/audit/audit.log\nmax_log_file_action = keep_logs\n', { mode: 0o640, mtime: t });
  dir(vfs, '/etc/audit', { mode: 0o755, mtime: t });
  put(vfs, '/usr/local/bin/nightly-backup.sh', '#!/bin/bash\n# copies /srv/evidence to the backup volume\n', { mode: 0o755, mtime: t });
  home(vfs, 'case notes/timeline.txt', '23:05 failures start on web01\n23:51 accepted password for raj\n', 0o644, at(3, 14, 0, 30));
  home(
    vfs,
    'lists/critical.txt',
    `/etc/ssh/sshd_config
/etc/audit/auditd.conf
/etc/audit/rules.d/halden.rules
/usr/local/bin/nightly-backup.sh
/home/analyst/case notes/timeline.txt
/etc/fail2ban/jail.local
/var/log/auth.log
`,
    0o644,
    at(3, 9, 9, 0),
  );
});

defineFixture('arena-logic-csv', (vfs) => {
  home(vfs, 'reports/failed-logins.csv', 'host,ip,failed\nweb01,10.20.0.21,42\nweb02,10.20.0.23,3\ndb01,10.20.0.22,17\nmail01,10.20.0.30,10\nhalden-ws01,10.20.0.15,11\n', 0o644, at(3, 9, 23, 59));
});

const capture = (n: number) => `capture ${n} - web01 eth0, Mar 13 ${String(n + 6).padStart(2, '0')}:00-${String(n + 6).padStart(2, '0')}:59 - training sample\n`;
const INBOX_CAPTURE = 'capture - web01 eth0, Mar 14 02:00-02:59, 2 alerts - training sample\n';

defineFixture('arena-logic-captures', (vfs) => {
  for (let n = 1; n <= 14; n++) if (n !== 9) home(vfs, `evidence/capture-${n}.txt`, capture(n), 0o644, at(3, 13, n + 7, 0));
  home(vfs, 'inbox/capture.txt', INBOX_CAPTURE, 0o644, at(3, 14, 3, 0));
});

const HONEYPOT = `Mar 12 03:00:01 trap01 CRON[2101]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 12 03:02:14 trap01 sshd[2140]: Failed password for root from 203.0.113.61 port 40112 ssh2
Mar 12 03:02:19 trap01 sshd[2140]: Failed password for root from 203.0.113.61 port 40112 ssh2
Mar 12 03:02:25 trap01 sshd[2140]: Connection closed by authenticating user root 203.0.113.61 port 40112 [preauth]
Mar 12 03:05:40 trap01 sshd[2151]: Invalid user ubuntu from 203.0.113.61 port 40388
Mar 12 03:05:42 trap01 sshd[2151]: Failed password for invalid user ubuntu from 203.0.113.61 port 40388 ssh2
Mar 12 03:05:47 trap01 sshd[2151]: Failed password for invalid user ubuntu from 203.0.113.61 port 40388 ssh2
Mar 12 03:09:03 trap01 sshd[2166]: Invalid user pi from 192.0.2.201 port 50114
Mar 12 03:09:05 trap01 sshd[2166]: Failed password for invalid user pi from 192.0.2.201 port 50114 ssh2
Mar 12 03:11:30 trap01 sshd[2172]: Accepted publickey for mara from 10.20.0.15 port 55012 ssh2: ED25519 SHA256:DemoKeyNotReal
Mar 12 03:11:30 trap01 sshd[2172]: pam_unix(sshd:session): session opened for user mara(uid=1001) by (uid=0)
Mar 12 03:14:12 trap01 sshd[2190]: Failed password for admin from 198.51.100.200 port 33410 ssh2
Mar 12 03:14:16 trap01 sshd[2190]: Failed password for admin from 198.51.100.200 port 33410 ssh2
Mar 12 03:14:21 trap01 sshd[2190]: Failed password for admin from 198.51.100.200 port 33410 ssh2
Mar 12 03:14:24 trap01 sshd[2190]: Connection closed by authenticating user admin 198.51.100.200 port 33410 [preauth]
Mar 12 03:16:02 trap01 sshd[2172]: pam_unix(sshd:session): session closed for user mara
Mar 12 03:19:50 trap01 sshd[2201]: Failed password for root from 203.0.113.61 port 41022 ssh2
Mar 12 03:22:07 trap01 sshd[2214]: Failed password for admin from 198.51.100.200 port 33590 ssh2
Mar 12 03:22:11 trap01 sshd[2214]: Failed password for admin from 198.51.100.200 port 33590 ssh2
Mar 12 03:26:38 trap01 sshd[2230]: Invalid user oracle from 192.0.2.201 port 50377
Mar 12 03:26:40 trap01 sshd[2230]: Failed password for invalid user oracle from 192.0.2.201 port 50377 ssh2
Mar 12 03:30:15 trap01 sshd[2245]: Failed password for admin from 198.51.100.200 port 33871 ssh2
Mar 12 03:30:19 trap01 sshd[2245]: Failed password for admin from 198.51.100.200 port 33871 ssh2
Mar 12 03:34:52 trap01 sshd[2260]: Failed password for root from 203.0.113.61 port 41377 ssh2
Mar 12 03:38:30 trap01 sshd[2277]: Failed password for admin from 198.51.100.200 port 34102 ssh2
Mar 12 03:38:34 trap01 sshd[2277]: Failed password for admin from 198.51.100.200 port 34102 ssh2
Mar 12 03:41:09 trap01 sshd[2288]: Accepted password for admin from 198.51.100.200 port 34155 ssh2
Mar 12 03:41:09 trap01 sshd[2288]: pam_unix(sshd:session): session opened for user admin(uid=1500) by (uid=0)
Mar 12 03:44:51 trap01 sshd[2301]: Failed password for root from 203.0.113.61 port 41680 ssh2
Mar 12 03:47:00 trap01 sshd[2318]: Invalid user pi from 192.0.2.201 port 50702
Mar 12 03:47:02 trap01 sshd[2318]: Failed password for invalid user pi from 192.0.2.201 port 50702 ssh2
Mar 12 03:52:30 trap01 sshd[2288]: pam_unix(sshd:session): session closed for user admin
Mar 12 03:58:12 trap01 sshd[2340]: Failed password for root from 203.0.113.61 port 41993 ssh2
Mar 12 04:00:01 trap01 CRON[2351]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 12 04:06:44 trap01 sshd[2369]: Failed password for admin from 203.0.113.61 port 42210 ssh2
Mar 12 04:06:49 trap01 sshd[2369]: Accepted password for admin from 203.0.113.61 port 42210 ssh2
Mar 12 04:06:49 trap01 sshd[2369]: pam_unix(sshd:session): session opened for user admin(uid=1500) by (uid=0)
`;

defineFixture('arena-logic-honeypot', (vfs) => {
  home(vfs, 'honeypot/auth.log', HONEYPOT, 0o644, at(3, 12, 4, 10));
});

defineFixture('arena-logic-preflight', (vfs) => {
  homeDir(vfs, 'tools');
  const t = at(3, 14, 1, 30);
  home(vfs, 'evidence/auth.log', 'Mar 13 23:51:02 web01 sshd[4630]: Accepted password for raj from 198.51.100.23 port 52211 ssh2\n', 0o644, t);
  home(vfs, 'evidence/empty.log', '', 0o644, t);
  home(vfs, 'evidence/raj notes.txt', 'Raj says he never logged in after 22:00.\n', 0o644, t);
});

// ------------------------------------------------------------------ challenges

export const challenges: Challenge[] = [
  {
    id: 'logic-zero-one-two',
    title: 'Zero, One, Two',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 8,
    md: 'Mara asked for the auth logs of web01, web02 and db01 to be copied into `~/collected` as `web01.log`, `web02.log` and `db01.log`. For each one, in that order, check **quietly** whether it contains `Accepted` (a successful login) and print the exit status on its own line. Hide any error messages. You’ll get three numbers — and the third tells you something the other two can’t.',
    fixture: 'arena-logic-collected',
    check: { output: '0\n1\n2\n', uses: ['grep'] },
    solution: 'cd ~/collected\ngrep -q Accepted web01.log; echo $?; grep -q Accepted web02.log; echo $?; grep -q Accepted db01.log 2>/dev/null; echo $?',
    hints: [
      '`grep -q` prints nothing; `echo $?` straight after it prints its exit status. Chain the pairs with `;` on one line.',
      '`2>/dev/null` hides error messages. 0 means “found”, 1 means “looked and found nothing”, 2 means “couldn’t look at all” — `db01.log` never arrived. A script that treats every non-zero status as “all clear” would miss that.',
      '`cd ~/collected`, then `grep -q Accepted web01.log; echo $?; grep -q Accepted web02.log; echo $?; grep -q Accepted db01.log 2>/dev/null; echo $?`',
    ],
    xp: 40,
  },
  {
    id: 'logic-pass-it-on',
    title: 'Pass It On',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 8,
    md: 'Typing `~/incident/auth.log` after every grep is getting old. Write `~/tools/ig.sh` (“incident grep”): it runs `grep` on `~/incident/auth.log` and passes along **every** argument you give it, options and quoted patterns intact — exactly the job of `"$@"`. Then test it with this line:\n\n```bash\nbash tools/ig.sh -c "invalid user"; bash tools/ig.sh -i -c "invalid user"\n```',
    fixture: 'arena-logic-incident',
    check: { output: '2\n3\n' },
    solution: 'printf \'#!/bin/bash\\n# ig.sh - grep the incident log with any options\\ngrep "$@" ~/incident/auth.log\\n\' > tools/ig.sh\nbash tools/ig.sh -c "invalid user"; bash tools/ig.sh -i -c "invalid user"',
    hints: [
      'The whole script is a shebang line plus one `grep` line. Your arguments go **before** the file name, where grep expects options and the pattern.',
      '`"$@"` expands to all the arguments, each kept as one word — so `"invalid user"` stays a single pattern. `$*` or `$1 $2` would break it apart or drop some.',
      'In nano: `#!/bin/bash` then `grep "$@" ~/incident/auth.log`. Save, then run the test line.',
    ],
    xp: 70,
  },
  {
    id: 'logic-head-count',
    title: 'Head Count',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 9,
    md: 'This morning’s copy of web02’s account list is `~/audit/web02.passwd`, one account per line. Mara’s January baseline counted **12** accounts. Count the lines now: if the number isn’t 12, print `CHANGED: N accounts (baseline 12)`; if it is, print `unchanged`. (Then open the file and find the newcomer. It’s a nasty one.)',
    fixture: 'arena-logic-audit',
    check: { output: 'CHANGED: 13 accounts (baseline 12)\n' },
    solution: 'n=$(wc -l < ~/audit/web02.passwd); if [ "$n" -ne 12 ]; then echo "CHANGED: $n accounts (baseline 12)"; else echo "unchanged"; fi',
    hints: [
      '`wc -l < FILE` prints just the number, without the filename. Capture it in a variable with `$( )`.',
      '`-ne` means “not equal” for numbers: `if [ "$n" -ne 12 ]; then …; else …; fi`.',
      '`n=$(wc -l < ~/audit/web02.passwd); if [ "$n" -ne 12 ]; then echo "CHANGED: $n accounts (baseline 12)"; else echo "unchanged"; fi`',
    ],
    xp: 40,
  },
  {
    id: 'logic-gatekeeper',
    title: 'Gatekeeper',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 9,
    md: `Write \`~/tools/acct.sh USER\`, an account checker other scripts can trust:

- Not exactly one argument: print \`Usage: acct.sh USER\` to **stderr** and exit \`2\`.
- No such account in \`/etc/passwd\`: print \`acct.sh: no such user: USER\` to stderr and exit \`1\`.
- Otherwise print \`USER: no login\` if its line contains \`nologin\`, or \`USER: can log in\` if it doesn’t.

\`echo "…" >&2\` sends a message to stderr (the mirror image of \`2>&1\`). Test it with:

\`\`\`bash
bash tools/acct.sh; echo $?; bash tools/acct.sh eve; echo $?; bash tools/acct.sh sshd; bash tools/acct.sh raj
\`\`\``,
    fixture: 'arena-logic-tools',
    check: { output: '2\n1\nsshd: no login\nraj: can log in\n', status: 0 },
    solution: `cat > tools/acct.sh <<'EOF'
#!/bin/bash
# acct.sh USER - does the account exist, and can it log in?
if [ $# -ne 1 ]; then
  echo "Usage: acct.sh USER" >&2
  exit 2
fi
line=$(grep "^$1:" /etc/passwd)
if [ -z "$line" ]; then
  echo "acct.sh: no such user: $1" >&2
  exit 1
fi
if [[ $line == *nologin* ]]; then
  echo "$1: no login"
else
  echo "$1: can log in"
fi
EOF
bash tools/acct.sh; echo $?; bash tools/acct.sh eve; echo $?; bash tools/acct.sh sshd; bash tools/acct.sh raj`,
    hints: [
      'Guards go first. `if [ $# -ne 1 ]; then echo "Usage: acct.sh USER" >&2; exit 2; fi` handles bad usage before anything else runs.',
      'Grab the account’s line with `line=$(grep "^$1:" /etc/passwd)`. If `[ -z "$line" ]`, nobody by that name exists: message to stderr, then `exit 1`.',
      'Last: `if [[ $line == *nologin* ]]; then echo "$1: no login"; else echo "$1: can log in"; fi`. Only the two result lines and the `echo $?` numbers should reach stdout.',
    ],
    xp: 70,
  },
  {
    id: 'logic-gone-quiet',
    title: 'Gone Quiet',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 10,
    md: 'A log that suddenly goes empty isn’t a calm server. It’s a logger that died, or someone covering their tracks. Loop over every `.log` file in `~/logs` and, for each one that is **empty**, print `EMPTY` and its full path, like `EMPTY /home/analyst/logs/x.log`. Print nothing for the others.',
    fixture: 'arena-logic-logs',
    check: { output: 'EMPTY /home/analyst/logs/audit.log\nEMPTY /home/analyst/logs/kern.log\n' },
    solution: 'for f in ~/logs/*.log; do [ -s "$f" ] || echo "EMPTY $f"; done',
    hints: [
      '`for f in ~/logs/*.log` hands you each log’s full path in turn — and skips `notes.txt`.',
      '`[ -s "$f" ]` is true when the file has something in it. You want the opposite, so pair it with `||`.',
      '`for f in ~/logs/*.log; do [ -s "$f" ] || echo "EMPTY $f"; done`',
    ],
    xp: 40,
  },
  {
    id: 'logic-still-standing',
    title: 'Still Standing',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 10,
    md: 'After an intrusion you check that the defences are still there. `~/lists/critical.txt` lists the files this workstation must have, one path per line, and one path contains a space. Read the list line by line and print `MISSING PATH` for every path that doesn’t exist. Print nothing for the ones that do.',
    fixture: 'arena-logic-critical',
    check: { output: 'MISSING /etc/audit/rules.d/halden.rules\nMISSING /etc/fail2ban/jail.local\n' },
    solution: 'while read -r p; do [ -e "$p" ] || echo "MISSING $p"; done < ~/lists/critical.txt',
    hints: [
      'Lines, not words: `while read -r p; do …; done < ~/lists/critical.txt` gives you one whole line at a time. `for p in $(cat …)` would split the spaced path in two.',
      '`[ -e "$p" ]` is true when the path exists. Keep `$p` in quotes, or the space breaks the test. Use `||` to print only when the test fails.',
      '`while read -r p; do [ -e "$p" ] || echo "MISSING $p"; done < ~/lists/critical.txt`',
    ],
    xp: 40,
  },
  {
    id: 'logic-over-the-line',
    title: 'Over the Line',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 10,
    md: 'The login monitor writes `~/reports/failed-logins.csv`: a header line, then `host,ip,failed` for each machine. For every host with **more than 10** failed logins, print `ALERT HOST N`, in file order. After the loop, print `Total: N`, the failed logins of **all** hosts added up.',
    fixture: 'arena-logic-csv',
    check: { output: 'ALERT web01 42\nALERT db01 17\nALERT halden-ws01 11\nTotal: 83\n' },
    solution: 'total=0; while IFS=, read -r host ip failed; do [ "$host" = host ] && continue; total=$((total + failed)); [ "$failed" -gt 10 ] && echo "ALERT $host $failed"; done < ~/reports/failed-logins.csv; echo "Total: $total"',
    hints: [
      '`while IFS=, read -r host ip failed; do …; done < ~/reports/failed-logins.csv` splits each line on commas. Feed the file in with `<` after `done`, not through a pipe: a piped loop runs in a copy of the shell, and your total vanishes with it.',
      'Skip the header with `[ "$host" = host ] && continue`. Then `total=$((total + failed))`, and `[ "$failed" -gt 10 ] && echo "ALERT $host $failed"`. “More than 10” means `-gt`, so mail01’s 10 stays quiet.',
      '`total=0; while IFS=, read -r host ip failed; do [ "$host" = host ] && continue; total=$((total + failed)); [ "$failed" -gt 10 ] && echo "ALERT $host $failed"; done < ~/reports/failed-logins.csv; echo "Total: $total"`',
    ],
    xp: 70,
  },
  {
    id: 'logic-no-overwrites',
    title: 'No Overwrites',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 10,
    md: 'Night-shift captures live in `~/evidence` as `capture-1.txt`, `capture-2.txt`, … but someone moved one out, so the numbers have a gap. Copy `~/inbox/capture.txt` into `~/evidence` as `capture-N.txt`, where N is the **lowest number not yet taken**. Overwriting a capture destroys evidence, so find the gap before you copy.',
    fixture: 'arena-logic-captures',
    check: {
      fs: [
        { path: '~/evidence/capture-9.txt', content: INBOX_CAPTURE },
        { path: '~/evidence/capture-14.txt', content: capture(14) },
        { path: '~/evidence/capture-15.txt', exists: false },
        { path: '~/inbox/capture.txt', exists: true },
      ],
    },
    solution: 'n=1; while [ -e ~/evidence/capture-$n.txt ]; do n=$((n + 1)); done; cp ~/inbox/capture.txt ~/evidence/capture-$n.txt',
    hints: [
      'Counting the files and adding 1 lands on a number that’s already taken, and `ls` sorts `capture-10` before `capture-2`, which hides the gap. Let a loop try 1, 2, 3, … instead.',
      'Start `n=1` and keep adding 1 **while** `~/evidence/capture-$n.txt` exists: `while [ -e ~/evidence/capture-$n.txt ]; do n=$((n + 1)); done`. When it stops, `$n` is free. Check it with `echo $n`.',
      '`n=1; while [ -e ~/evidence/capture-$n.txt ]; do n=$((n + 1)); done; cp ~/inbox/capture.txt ~/evidence/capture-$n.txt`',
    ],
    xp: 70,
  },
  {
    id: 'logic-first-through',
    title: 'First Through the Door',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 10,
    md: 'Halden runs a **honeypot**, `trap01`: a decoy server with a deliberately weak `admin` password, so attackers reveal themselves. Its log is `~/honeypot/auth.log`. Read it line by line, counting the lines that contain `Failed password`, until you reach the **first** line containing `Accepted password`. Then stop and print `N failures, first success at HH:MM:SS`, with the time taken from that line.',
    fixture: 'arena-logic-honeypot',
    check: { output: '17 failures, first success at 03:41:09\n' },
    solution: 'n=0; while read -r mon day time rest; do if [[ $rest == *"Accepted password"* ]]; then echo "$n failures, first success at $time"; break; fi; [[ $rest == *"Failed password"* ]] && n=$((n + 1)); done < ~/honeypot/auth.log',
    hints: [
      '`read` can split as it reads: `while read -r mon day time rest; do …; done < ~/honeypot/auth.log` puts the clock time in `$time` and everything after it in `$rest`.',
      '`[[ $rest == *"Failed password"* ]]` is true when that text appears anywhere: the stars are wildcards, the quoted part is literal. Add 1 to a counter for each failure. On the first `Accepted password`, print and `break`. `Accepted publickey` is a key login, so it doesn’t count.',
      '`n=0; while read -r mon day time rest; do if [[ $rest == *"Accepted password"* ]]; then echo "$n failures, first success at $time"; break; fi; [[ $rest == *"Failed password"* ]] && n=$((n + 1)); done < ~/honeypot/auth.log`',
    ],
    xp: 120,
  },
  {
    id: 'logic-preflight',
    title: 'Preflight',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 10,
    md: `Before collecting evidence, Mara runs a preflight: can we actually read everything we’re about to copy? Write \`~/tools/preflight.sh FILE...\`. For each argument, in order, print one line with the name exactly as given: \`MISSING NAME\` if it doesn’t exist, \`DENIED NAME\` if it exists but you can’t read it, \`EMPTY NAME\` if it’s readable but empty, otherwise \`OK NAME\`. The script’s exit status is the number of files that weren’t OK. Test it with:

\`\`\`bash
cd ~/evidence && bash ~/tools/preflight.sh * gone.log /etc/shadow; echo "status $?"
\`\`\``,
    fixture: 'arena-logic-preflight',
    check: { output: 'OK auth.log\nEMPTY empty.log\nOK raj notes.txt\nMISSING gone.log\nDENIED /etc/shadow\nstatus 3\n' },
    solution: `cat > ~/tools/preflight.sh <<'EOF'
#!/bin/bash
# preflight.sh FILE... - can we read these files? Exit status = number of problems.
problems=0
for f in "$@"; do
  if [ -r "$f" ] && [ -s "$f" ]; then
    echo "OK $f"
  elif [ -r "$f" ]; then
    echo "EMPTY $f"
    problems=$((problems + 1))
  elif [ -e "$f" ]; then
    echo "DENIED $f"
    problems=$((problems + 1))
  else
    echo "MISSING $f"
    problems=$((problems + 1))
  fi
done
exit "$problems"
EOF
cd ~/evidence && bash ~/tools/preflight.sh * gone.log /etc/shadow; echo "status $?"`,
    hints: [
      '`for f in "$@"; do …; done` visits every argument; the quotes keep `raj notes.txt` in one piece. Set `problems=0` before the loop, add 1 for each problem, and finish with `exit "$problems"`.',
      'Order the tests so each branch only sees what’s left: `if [ -r "$f" ] && [ -s "$f" ]` → OK; `elif [ -r "$f" ]` → EMPTY (readable, so it must be empty); `elif [ -e "$f" ]` → DENIED; `else` → MISSING.',
      'Inside the loop: `if [ -r "$f" ] && [ -s "$f" ]; then echo "OK $f"; elif [ -r "$f" ]; then echo "EMPTY $f"; problems=$((problems + 1)); elif [ -e "$f" ]; then echo "DENIED $f"; problems=$((problems + 1)); else echo "MISSING $f"; problems=$((problems + 1)); fi`',
    ],
    xp: 120,
  },
];
