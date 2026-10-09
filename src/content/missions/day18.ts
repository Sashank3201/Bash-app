import { defineFixture } from '../fixtures';
import { dir, GID, homeDir, put, UID } from '../fixtures/base';
import type { VFS } from '../../shell/vfs';
import type { Mission } from '../types';

/** Base files are dated 2026-01-20; anything changed "yesterday" is relative to the fixture's clock. */
const OLD = Date.UTC(2026, 0, 20, 10, 0, 0);
const HOUR = 3600000;
const DAY = 24 * HOUR;

/** The deleted contractor account whose files were left behind in /opt/old. */
export const GONE_UID = 1005;

const WEB02_SSHD = `# /etc/ssh/sshd_config -- web02 (contractor build)
Port 22
#PermitRootLogin prohibit-password
PermitRootLogin yes
PasswordAuthentication yes
PubkeyAuthentication yes
X11Forwarding yes
MaxAuthTries 6
`;

const BACKUP_JOB = `# /etc/cron.d/backup-job -- nightly web backup (contractor)
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
15 1 * * * root /usr/local/bin/backup.sh
`;

const ROTATE_JOB = `# /etc/cron.d/rotate-web -- compress last week's web logs
0 3 * * * root /usr/local/sbin/rotate-web.sh
`;

const BACKUP_SH = `#!/bin/bash
# backup.sh -- nightly copy of the web root (run by /etc/cron.d/backup-job)
tar -czf /var/backups/www-$(date +%F).tar.gz /var/www/html
find /var/backups -name 'www-*.tar.gz' -mtime +14 -delete
`;

const ROTATE_SH = `#!/bin/bash
# rotate-web.sh -- compress web logs older than a week
find /var/log/apache2 -name '*.log.*' -mtime +7 -exec gzip {} \\;
`;

const FIX_PERMS = `#!/bin/bash
# quick fix: nightly backup keeps failing with "permission denied"
chmod 777 /usr/local/bin/backup.sh
chmod 666 /etc/cron.d/backup-job
`;

/**
 * web02, built by the same contractor from the same runbook as web01: a second UID-0 account,
 * root SSH logins, world-writable cron pieces, an unexplained SUID binary and orphaned files.
 * Yesterday's session (relative to `now`): passwd + shadow at T, sshd_config at T+10 min, the fix script at T+20 min.
 */
export function web02(vfs: VFS, now: number) {
  const yesterday = now - 26 * HOUR;
  put(vfs, '/etc/hostname', 'web02\n', { mtime: OLD });
  put(vfs, '/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tweb02\n10.20.0.21\tweb01.halden.internal web01\n10.20.0.22\tdb01.halden.internal db01\n', { mtime: OLD });
  // a symlink: its own rwxrwxrwx means nothing, which is why world-writable searches add -type f
  vfs.symlink('/usr/share/zoneinfo/Etc/UTC', '/etc/localtime');
  vfs.lookup('/etc/localtime', { follow: false }).mtime = OLD;

  // yesterday: a second root account, and SSH opened up so it can be used
  put(vfs, '/etc/passwd', (vfs.tryRead('/etc/passwd') ?? '') + 'toor:x:0:0::/root:/bin/bash\n', { mtime: yesterday });
  const changed = Math.floor(yesterday / DAY);
  put(vfs, '/etc/shadow', (vfs.tryRead('/etc/shadow') ?? '') + `toor:$y$j9T$Qm4rX8bN2cV7kL1pZ0sW5e$breakglass-hash-placeholder-not-real:${changed}:0:99999:7:::\n`, {
    mode: 0o640,
    gid: GID.shadow,
    mtime: yesterday,
  });
  put(vfs, '/etc/ssh/sshd_config', WEB02_SSHD, { mtime: yesterday + 10 * 60000 });

  // cron: one root job whose pieces anyone can edit, one done properly
  put(vfs, '/etc/cron.d/backup-job', BACKUP_JOB, { mode: 0o666, mtime: OLD });
  put(vfs, '/etc/cron.d/rotate-web', ROTATE_JOB, { mtime: OLD });
  put(vfs, '/usr/local/bin/backup.sh', BACKUP_SH, { mode: 0o777, mtime: OLD });
  put(vfs, '/usr/local/sbin/rotate-web.sh', ROTATE_SH, { mode: 0o755, mtime: OLD });
  put(vfs, '/usr/local/bin/nightly-backup.sh', '#!/bin/bash\n# nightly-backup.sh -- database dump (runs as the backup user)\necho "nightly backup"\n', { mode: 0o755, mtime: OLD });

  // a SUID-root program no package explains
  put(vfs, '/usr/local/bin/helper', '\x7fELF\x02\x01\x01 training sample: inert stand-in for an unknown SUID program\n', { mode: 0o4755, mtime: OLD });

  // raj's login keys: anyone can add one
  dir(vfs, '/home/raj/.ssh', { mode: 0o755, uid: UID.raj, gid: GID.raj, mtime: OLD });
  put(vfs, '/home/raj/.ssh/authorized_keys', 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK7trainingSampleKeyNotRealRajHalden01 raj@halden-laptop\n', {
    mode: 0o666,
    uid: UID.raj,
    gid: GID.raj,
    mtime: OLD,
  });

  // files left behind by a deleted account
  dir(vfs, '/opt/old', { uid: GONE_UID, gid: GONE_UID, mtime: OLD });
  put(vfs, '/opt/old/README', 'Old deploy tooling. Do not use.\n', { uid: GONE_UID, gid: GONE_UID, mtime: OLD });
  put(vfs, '/opt/old/deploy.sh', '#!/bin/bash\n# deploy.sh -- old release script\necho "deploying web02"\n', { mode: 0o755, uid: GONE_UID, gid: GONE_UID, mtime: OLD });
  put(vfs, '/opt/old/release.conf', 'release=2025.11\nhost=web02\n', { uid: GONE_UID, gid: GONE_UID, mtime: OLD });

  // the contractor's "quick fix", left in a hidden folder
  dir(vfs, '/tmp/.hidden', { mtime: OLD });
  put(vfs, '/tmp/.hidden/fix-perms.sh', FIX_PERMS, { mode: 0o755, mtime: yesterday + 20 * 60000 });
}

defineFixture('day18', (vfs, now) => {
  web02(vfs, now);
  homeDir(vfs, 'cases');
});

export const day18: Mission = {
  day: 18,
  week: 3,
  title: 'The Audit',
  topic: 'find, risky permissions & account review',
  minutes: 45,
  fixture: 'day18',
  caseId: 'auditbot',
  briefing: `web01 is about to be wiped and rebuilt. Before anyone copies its setup onto the new box, I want to know what else the contractor’s runbook got wrong, because **web02** was built from the same runbook by the same people. I’ve cloned it into a sandbox for you. The prompt says \`web02\`: that’s the snapshot you’re on.

Nobody is attacking it today. This is an **audit**: a slow, methodical sweep for the mistakes attackers love. Files anyone can write. Programs that run as root for whoever starts them. A second root account. SSH doors left open. Root cron jobs running scripts that anyone can edit. Most of it comes down to one command, **find**, which walks the whole filesystem and tests every file against your conditions.

Every finding needs a reason. “Mode 777” means nothing to a manager; “any account on this box can become root at 01:15 tonight” gets fixed before lunch. By the end you’ll turn each check into a PASS or FAIL line, and in Case 6 into a script that audits any server in one run.`,
  objectives: [
    'Search the whole filesystem with find: where, tests, actions and -exec',
    'Hunt SUID programs, world-writable files and files with no owner',
    'Review UID 0 accounts, SSH settings and root cron jobs',
    'Turn each check into a PASS/FAIL line with small functions',
  ],
  lesson: [
    {
      kind: 'read',
      id: 'find',
      title: 'find: walk the tree, test every file',
      md: `\`\`\`text
find /usr/local  -type f -name '*.sh'  -exec ls -l {} +
     └ where ─┘  └────── tests ─────┘  └─── action ───┘
\`\`\`

- **Where:** one or more starting folders. find visits everything below them.
- **Tests:** yes/no questions about each file. Written side by side, **all** of them must be yes.
- **Action:** what to do with each match. Leave it out and find prints the path.

| Test | Matches |
|---|---|
| \`-type f\` / \`-type d\` | regular files / folders |
| \`-name '*.sh'\` | names that match a glob |
| \`-user raj\` | files owned by raj |

Quote the glob. Unquoted, the shell would expand \`*.sh\` in your current folder before find ever saw it.

find lists files in the order the disk keeps them, so pipe through \`sort\` whenever the order matters.`,
    },
    {
      kind: 'task',
      id: 'find-sh',
      md: 'Start small: list every file under `/usr/local` whose name ends in `.sh`.',
      check: { output: 'reference', uses: ['find'] },
      solution: "find /usr/local -name '*.sh'",
      hints: ['Where: `/usr/local`. Test: `-name` with a quoted glob.', "`find /usr/local -name '*.sh'`"],
      explain: '`/usr/local` is where things installed **by hand** live, outside any package, so no update ever checks them. Remember `backup.sh`; it comes back later.',
    },
    {
      kind: 'task',
      id: 'find-raj',
      md: 'Now the **whole disk**: start at `/` and find everything owned by `raj`. Folders you aren’t allowed into will complain on stderr; throw that noise into `/dev/null` (Day 5).',
      check: { output: 'reference', uses: ['find'], nodes: ['redirect'] },
      solution: 'find / -user raj 2>/dev/null',
      hints: ['The test is `-user raj`.', 'Errors are stream 2: `2>/dev/null`.', '`find / -user raj 2>/dev/null`'],
      explain:
        '`2>/dev/null` hid the errors. It didn’t fill the gaps: `/root`, `/home/mara` and the cron spool were never searched, because analyst can’t open them. An audit with holes is worse than none, because it looks finished. From here on, audit with **`sudo find`**. Root can open every folder, and each `sudo` lands in `auth.log`, which is exactly what you want while you’re going through someone’s server.',
    },
    {
      kind: 'read',
      id: 'perm',
      title: 'Special bits, and the dash in -perm',
      md: `Day 6’s three digits can have a fourth one in front: the **special bits**.

| Bit | Name | In \`ls -l\` | Meaning |
|---|---|---|---|
| \`4000\` | **SUID** | \`-rwsr-xr-x\` | the program runs with its **owner’s** powers, not yours |
| \`2000\` | SGID | \`-rwxr-sr-x\` | it runs with its group’s powers |
| \`1000\` | sticky | \`drwxrwxrwt\` | in a shared folder, only a file’s owner may delete it |

SUID exists for good reasons: \`passwd\` has to update \`/etc/shadow\` for ordinary users, so it runs as root. But every SUID-root program is a door to root, and it’s only as safe as its code.

\`find -perm\` reads a mode two ways:

- \`-perm 4755\`: the mode is **exactly** 4755
- \`-perm -4000\`: **at least** these bits are on, whatever the rest are`,
    },
    {
      kind: 'predict',
      id: 'p-exact',
      md: '`/usr/bin` holds four SUID programs, all mode 4755. No dash this time: what does this print?',
      code: 'sudo find /usr/bin -perm 4000 | wc -l',
      options: ['0', '4', '1', '5'],
      answer: 0,
      explain: 'Without the dash, the mode must be **exactly** 4000: SUID and no read, write or execute bits at all. No real program looks like that. `-perm -4000` asks only that the SUID bit is on.',
    },
    {
      kind: 'task',
      id: 'suid',
      md: 'List every **regular file** on the system with the SUID bit set. Use `sudo`, and start at `/`.',
      check: { output: 'reference', uses: ['sudo', 'find'] },
      solution: 'sudo find / -type f -perm -4000',
      hints: ['Two tests: `-type f`, and `-perm` with the SUID bit and a dash.', '`sudo find / -type f -perm -4000`'],
      explain:
        'Four of these ship with Ubuntu: `chsh`, `mount`, `passwd`, `sudo`. The fifth, `/usr/local/bin/helper`, belongs to no package. A SUID-root program nobody can explain is one of the first things an incident responder looks at: if it was planted, or simply has one bug, it could let any user become root. **Don’t run it** to see what it does. Record it, hash it (Day 16), and find out who installed it.',
    },
    {
      kind: 'read',
      id: 'ww',
      title: 'World-writable: anyone can change it',
      md: `The last digit of a mode is **others**: every account on the box, including any service account that a web bug might hand to an attacker. If that digit includes **2** (\`w\`), anyone can change the file. \`-perm -0002\` (or \`-perm -o+w\`) finds exactly those.

How bad that is depends on **who uses the file**:

| If anyone can write… | then anyone can… |
|---|---|
| a script that root runs from cron | choose what root runs next |
| \`~/.ssh/authorized_keys\` | add their own key and log in as that user |
| a service’s config file | change how the service behaves |

Always add **\`-type f\`**. Without it you also get symlinks, which always show \`rwxrwxrwx\` because Linux ignores a link’s own permissions, and \`/tmp\`, which is writable by everyone on purpose. Its sticky bit stops users deleting each other’s files.`,
    },
    {
      kind: 'task',
      id: 'ww-files',
      md: 'Find every world-writable **regular file** on web02 and show the evidence with `ls -l`. find runs a command on its matches with `-exec`: `{}` stands for the paths, and `+` ends the command.\n\n```bash\n… -exec ls -l {} +\n```',
      check: { output: 'reference', uses: ['sudo', 'find', 'ls'] },
      solution: 'sudo find / -type f -perm -0002 -exec ls -l {} +',
      hints: ['Start from the SUID search and swap in the bits that mean “others can write”.', '`-perm -0002`, then add `-exec ls -l {} +` at the end.', '`sudo find / -type f -perm -0002 -exec ls -l {} +`'],
      explain:
        'Three files, three open doors. `backup-job` and `backup.sh` are both links in a root cron job. And anyone can append a key to Raj’s `authorized_keys`, then log in as raj without ever needing his password. You’ll also meet `-exec ls -l {} \\;` in the wild: the `\\;` form runs `ls` once **per file**, while `+` packs every path into a single run. That’s faster, and the columns line up.',
    },
    {
      kind: 'quiz',
      id: 'q-octal',
      q: '`ls -l` shows `-rw-rw-rw-` for `/etc/cron.d/backup-job`. What is that in octal, and what should a root-owned cron file be?',
      options: ['666; it should be 644', '644; it should be 600', '777; it should be 755', '666; it should be 664'],
      answer: 0,
      explain: '`rw-` is 4 + 2 = 6, three times over. A cron file only needs root to write it and cron to read it: 644 (`rw-r--r--`), and some admins go to 600.',
    },
    {
      kind: 'fill',
      id: 'f-ww',
      md: 'Complete the command: every regular file under `/etc` that others can write.',
      template: 'sudo find /etc ___ f -perm ___',
      answers: [['-type'], ['-0002', '-002', '-2', '-o+w', '-o=w']],
      explain: '`-type f` keeps symlinks and folders out. In `-0002` the dash means “at least these bits”, and the 2 in the last digit is write permission for others.',
    },
    {
      kind: 'read',
      id: 'cron',
      title: 'Cron: what root runs, and who can change it',
      md: `System jobs live in \`/etc/crontab\` and in the files under \`/etc/cron.d/\`. Read them all at once:

\`\`\`bash
cat /etc/crontab /etc/cron.d/*
\`\`\`

A job line has five time fields, then the **user** the job runs as, then the command:

\`\`\`text
15   1    *    *    *    root   /usr/local/bin/backup.sh
min  hour day  mon  dow  user   command
\`\`\`

A root job is only as safe as the **most writable link in its chain**: the cron file, the script it runs, and the folders they sit in. If any account can edit one of those, that account decides what root runs next. So for every root job, \`ls -l\` the cron file **and** the script.`,
    },
    {
      kind: 'task',
      id: 'cron-scripts',
      md: 'Read the cron files first (`cat /etc/crontab /etc/cron.d/*`). Then run `ls -l` on every script that a **root** job in `/etc/cron.d` runs. On a job line `$6` is the user and `$7` the command, so awk can hand you the paths. Put this inside `$( )`:\n\n```bash\nawk \'$6 == "root" {print $7}\' /etc/cron.d/*\n```',
      check: { output: 'reference', uses: ['ls', 'awk'], nodes: ['cmdsub'] },
      solution: 'ls -l $(awk \'$6 == "root" {print $7}\' /etc/cron.d/*)',
      hints: ['`ls -l $( … )` runs ls on whatever the inner command prints.', '`ls -l $(awk \'$6 == "root" {print $7}\' /etc/cron.d/*)`'],
      explain:
        '`rotate-web.sh` is 755, so only root can change it. `backup.sh` is **777**, and the job file that calls it is 666: two open doors into the same root job. Whoever edits either one decides what runs as root at 01:15 tonight. That is the whole finding. You don’t need to prove it by trying.',
    },
    {
      kind: 'read',
      id: 'accounts',
      title: 'Accounts and SSH: who can be root',
      md: `The system doesn’t care about the **name** root. It cares about **UID 0**, field 3 of \`/etc/passwd\`. Any account with UID 0 *is* root, whatever it’s called:

\`\`\`bash
awk -F: '$3 == 0' /etc/passwd
\`\`\`

The password hashes live in \`/etc/shadow\`, which must give **nothing** to others. \`stat -c\` prints just the fields you ask for: \`%a\` the octal mode, \`%U\` the owner, \`%n\` the name.

\`\`\`bash
stat -c '%a %U %n' /etc/shadow     # 640 root /etc/shadow
\`\`\`

Then the front door, \`/etc/ssh/sshd_config\`:

| Setting | Risk |
|---|---|
| \`PermitRootLogin yes\` | anyone on the network can try root’s password |
| \`PasswordAuthentication yes\` | passwords can be guessed: that’s how raj fell on web01 |

Only lines that **start** with the keyword are active; \`#\` lines are comments. Anchor your grep with \`^\`.`,
    },
    {
      kind: 'task',
      id: 'uid0',
      md: 'Print the **name** of every account with UID 0.',
      check: { output: 'reference', uses: ['awk'] },
      solution: "awk -F: '$3 == 0 {print $1}' /etc/passwd",
      hints: ['`-F:` splits on colons; field 3 is the UID.', "`awk -F: '$3 == 0 {print $1}' /etc/passwd`"],
      explain:
        '`toor` is root spelled backwards, an old favourite name for a second root account. It has its own password (`sudo grep toor /etc/shadow`) and every power root has, and in the logs it appears as `toor`, so a search for `root` walks straight past it. Maybe a contractor made it as an emergency login. The rule doesn’t change: one UID 0 account, and anything else is justified in writing or removed today.',
    },
    {
      kind: 'task',
      id: 'ssh',
      md: 'Show the active `PermitRootLogin` and `PasswordAuthentication` lines of `/etc/ssh/sshd_config`, with one `grep -E`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: "grep -E '^(PermitRootLogin|PasswordAuthentication)' /etc/ssh/sshd_config",
      hints: ['`^` anchors the match to the start of the line, so the `#` comments drop out.', "Alternatives go in a group: `'^(A|B)'`.", "`grep -E '^(PermitRootLogin|PasswordAuthentication)' /etc/ssh/sshd_config`"],
      explain:
        'Both `yes`. `cat` the file and you’ll also see `#PermitRootLogin prohibit-password`: someone commented out the safe setting and added the open one below it. Put that next to `toor`: a second root account **and** root logins with a password, from anywhere. Neither depends on anyone’s personal account, which is why they’re the first doors to close.',
    },
    {
      kind: 'task',
      id: 'recent',
      md: 'Configuration rarely changes on a server that’s just doing its job, so recent changes deserve a look. find counts a file’s age in whole days, rounded down:\n\n| Test | Matches |\n|---|---|\n| `-mtime -2` | modified less than 2 days ago |\n| `-mtime +30` | modified more than 30 days ago |\n| `-newer FILE` | modified more recently than FILE |\n\nList every regular file on web02 modified in the last **2 days**.',
      check: { output: 'reference', uses: ['sudo', 'find'] },
      solution: 'sudo find / -type f -mtime -2',
      hints: ['Tests: `-type f` and `-mtime` with a minus.', '`sudo find / -type f -mtime -2`'],
      explain:
        'Nothing else on this box has been touched in months. These four changed yesterday: `passwd` and `shadow` (that’s `toor`), `sshd_config` (root logins), and a script in a hidden folder under `/tmp`. Changes that travel together tell one story. You’ll read that script in the drills.',
    },
    {
      kind: 'task',
      id: 'check-shadow',
      md: 'An audit you can rerun is worth ten done by hand. Give every check one line in a fixed format, with a tiny function per verdict:\n\n```bash\npass() { echo "[PASS] $1"; }\nfail() { echo "[FAIL] $1"; }\n\nmode=$(stat -c %a /etc/shadow)\nif [[ $mode == *0 ]]; then\n  pass "shadow: mode $mode"\nelse\n  fail "shadow: mode $mode"\nfi\n```\n\nThe last digit of the mode is what others get, so `*0` means “others get nothing”. Type it all on **one line**, joined with `;`.',
      check: { output: '[PASS] shadow: mode 640\n', uses: ['stat'], nodes: ['function', 'if'] },
      solution: 'pass() { echo "[PASS] $1"; }; fail() { echo "[FAIL] $1"; }; mode=$(stat -c %a /etc/shadow); if [[ $mode == *0 ]]; then pass "shadow: mode $mode"; else fail "shadow: mode $mode"; fi',
      hints: [
        'Day 12’s one-line form needs a `;` before each closing brace: `pass() { echo "[PASS] $1"; }`.',
        'After the functions: `mode=$(stat -c %a /etc/shadow);` then the `if` on one line.',
        '`pass() { echo "[PASS] $1"; }; fail() { echo "[FAIL] $1"; }; mode=$(stat -c %a /etc/shadow); if [[ $mode == *0 ]]; then pass "shadow: mode $mode"; else fail "shadow: mode $mode"; fi`',
      ],
      explain:
        'A PASS matters as much as a FAIL: it tells the next person this was checked, not forgotten. Fixed prefixes pay off too: `grep \'^\\[FAIL\\]\'` pulls out just the failures, from one server or fifty. Case 6 builds seven checks like this into one script, with a third verdict, `[WARN]`, for things that need a human look rather than an emergency.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-nouser',
      md: '**Drill 1.** When an account is deleted, its files stay behind, owned by a number that no longer has a name. Find every file and folder on web02 with **no owner** (`-nouser`) and show them with `ls -ld` (`-d` lists a folder itself, not what’s inside).',
      check: { output: 'reference', uses: ['find', 'ls'] },
      solution: 'sudo find / -nouser -exec ls -ld {} +',
      hints: ['The test is `-nouser`; the action is `-exec ls -ld {} +`.', '`sudo find / -nouser -exec ls -ld {} +`'],
      explain:
        'Where the owner’s name should be, `ls` shows a bare number: `1005`. That’s the risk. If a new account is created tomorrow and happens to get UID 1005, it silently owns `deploy.sh` and the rest. Hand them to root, or archive and delete them.',
    },
    {
      kind: 'task',
      id: 'd-hidden',
      md: '**Drill 2.** Attackers and tired admins both like folders whose names start with a dot. First find every hidden **folder** on the system (`-type d -name \'.*\'`). One of them is normal. Then `cat` every file in the other one.',
      check: { output: 'reference', uses: ['cat'] },
      solution: 'cat /tmp/.hidden/*',
      hints: ["Step one: `sudo find / -type d -name '.*'`", '`.ssh` belongs in a home folder. The other one is in `/tmp`: `cat /tmp/.hidden/*`.'],
      explain:
        'Someone’s “quick fix”. The nightly backup failed with *permission denied*, so they made the script and its cron file writable by everyone. The error went away, and every account on the box got a path to root. The answer to *permission denied* is almost never 777. It’s working out which user needs which access, and granting only that.',
    },
    {
      kind: 'task',
      id: 'd-newer',
      md: '**Drill 3.** `toor` was added to `/etc/passwd` yesterday. Which regular files on the system changed **after** that? (`-newer FILE`)',
      check: { output: 'reference', uses: ['find'] },
      solution: 'sudo find / -type f -newer /etc/passwd',
      hints: ['`-newer /etc/passwd` matches files modified more recently than it.', '`sudo find / -type f -newer /etc/passwd`'],
      explain:
        '`sshd_config` ten minutes later, the fix script ten minutes after that: one session, in order. Now notice what **isn’t** listed: `backup.sh` and `backup-job`, the two files that script changed. `chmod` changes a file’s permissions, not its contents, so its modified time, the one `-mtime` and `-newer` look at, stays put. A hunt for recently modified files walks right past that kind of damage, which is why an audit checks permissions directly.',
    },
    {
      kind: 'task',
      id: 'd-ssh-check',
      md: '**Drill 4.** One more check for the list. Your `pass` and `fail` functions still exist in this terminal. Print `[FAIL] ssh-root: PermitRootLogin yes` if sshd_config has an active `PermitRootLogin yes` line, and `[PASS] ssh-root: PermitRootLogin is not yes` if it doesn’t. `grep -q` answers with its exit status only, which is exactly what `if` wants.',
      check: { output: '[FAIL] ssh-root: PermitRootLogin yes\n', uses: ['grep'], nodes: ['if'] },
      solution:
        'pass() { echo "[PASS] $1"; }; fail() { echo "[FAIL] $1"; }; if grep -q \'^PermitRootLogin yes\' /etc/ssh/sshd_config; then fail "ssh-root: PermitRootLogin yes"; else pass "ssh-root: PermitRootLogin is not yes"; fi',
      hints: [
        'If you reloaded the page, define `pass` and `fail` again first.',
        "The test: `grep -q '^PermitRootLogin yes' /etc/ssh/sshd_config`.",
        "`if grep -q '^PermitRootLogin yes' /etc/ssh/sshd_config; then fail \"ssh-root: PermitRootLogin yes\"; else pass \"ssh-root: PermitRootLogin is not yes\"; fi`",
      ],
      explain:
        'Run the same line on a server built to Halden’s baseline and it prints PASS, because `prohibit-password` isn’t `yes`. That’s what makes it a check: the same question for any server, and a one-line answer. Case 6 is open.',
    },
  ],
  debrief: {
    summary: [
      '`find WHERE TESTS ACTION`: `-type f`, `-name \'*.sh\'`, `-user`, `-nouser`, `-mtime -2`, `-newer FILE`. Audit with `sudo`: a folder find can’t open is a folder you didn’t check.',
      '`-perm -4000` finds SUID programs and `-perm -0002` world-writable files; the dash means “at least these bits”. Add `-type f`, and `-exec ls -l {} +` for the evidence.',
      'A root cron job is only as safe as the most writable file in its chain: `ls -l` the cron file and the script it runs.',
      'UID 0 is root whatever the name: `awk -F: \'$3 == 0\' /etc/passwd`. In sshd_config only lines that start with the keyword count: anchor with `^`.',
      '`pass() { echo "[PASS] $1"; }` and friends turn checks into a report you can rerun. Case 6 is open: Audit Bot.',
    ],
    cards: ['c-d18-find', 'c-d18-sudofind', 'c-d18-permdash', 'c-d18-suid', 'c-d18-worldw', 'c-d18-exec', 'c-d18-cronchain', 'c-d18-uid0', 'c-d18-sshd', 'c-d18-mtime'],
  },
  cards: [
    { id: 'c-d18-find', day: 18, tag: 'find', front: 'The three parts of a find command?', back: '`find WHERE TESTS ACTION`, e.g. `find /usr/local -type f -name \'*.sh\' -exec ls -l {} +`. All tests must match; with no action, find prints the path.' },
    { id: 'c-d18-sudofind', day: 18, tag: 'find', front: 'Why audit with `sudo find` rather than `find … 2>/dev/null`?', back: '`2>/dev/null` hides the “Permission denied” errors but not the gaps: folders you can’t open are never searched. `sudo` can open them all.' },
    { id: 'c-d18-permdash', day: 18, tag: 'find', front: '`-perm 4000` vs `-perm -4000`?', back: 'No dash: the mode is exactly 4000. Dash: at least these bits are set, whatever the rest are.' },
    { id: 'c-d18-suid', day: 18, tag: 'security', front: 'List SUID programs, and why do they matter?', back: '`sudo find / -type f -perm -4000`. A SUID program runs with its owner’s powers; an unknown SUID-root file can make any user root.' },
    { id: 'c-d18-worldw', day: 18, tag: 'security', front: 'Find files anyone can change? Why add `-type f`?', back: '`sudo find / -type f -perm -0002`. Without `-type f` you also get symlinks (always rwxrwxrwx) and `/tmp`, which is writable on purpose.' },
    { id: 'c-d18-exec', day: 18, tag: 'find', front: '`-exec ls -l {} \\;` vs `-exec ls -l {} +`?', back: '`\\;` runs `ls` once per file; `+` runs it once with all the paths. `{}` stands for the path(s).' },
    { id: 'c-d18-cronchain', day: 18, tag: 'security', front: 'When does a root cron job let any user become root?', back: 'When anyone can write the cron file or the script it runs. Read `cat /etc/crontab /etc/cron.d/*`, then `ls -l` each script.' },
    { id: 'c-d18-uid0', day: 18, tag: 'security', front: 'List every account with root’s powers?', back: "`awk -F: '$3 == 0 {print $1}' /etc/passwd`. UID 0 is root, whatever the account is called." },
    { id: 'c-d18-sshd', day: 18, tag: 'security', front: 'Show the risky SSH settings that are actually active?', back: "`grep -E '^(PermitRootLogin|PasswordAuthentication)' /etc/ssh/sshd_config`. The `^` skips `#` comments; `yes` on either is a finding." },
    { id: 'c-d18-mtime', day: 18, tag: 'find', front: 'Files modified in the last 2 days? Files changed after FILE?', back: '`find / -type f -mtime -2` and `find / -type f -newer FILE`. `chmod` doesn’t change the modified time, so permission changes don’t show up.' },
  ],
};
