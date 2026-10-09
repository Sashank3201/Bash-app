import { defineFixture } from '../fixtures';
import { dir, GID, homeDir, put, UID } from '../fixtures/base';
import { web02 } from '../missions/day18';
import type { VFS } from '../../shell/vfs';
import type { CaseFile } from '../types';

const OLD = Date.UTC(2026, 0, 20, 10, 0, 0);
const FAKE_ELF = (what: string) => `\x7fELF\x02\x01\x01 training sample: inert stand-in for ${what}\n`;

/** A symlink always shows rwxrwxrwx; a correct world-writable check ignores it (-type f). */
function localtime(vfs: VFS) {
  vfs.symlink('/usr/share/zoneinfo/Etc/UTC', '/etc/localtime');
  vfs.lookup('/etc/localtime', { follow: false }).mtime = OLD;
}

// Visible: the web02 snapshot from Day 18.
defineFixture('case-auditbot', (vfs, now) => {
  web02(vfs, now);
  homeDir(vfs, 'cases');
});

// Hidden: db01, hardened properly. Decoys: commented-out "yes" lines, a known SUID su,
// a world-writable folder and a symlink (neither is a regular file).
defineFixture('case-auditbot-db01', (vfs) => {
  put(vfs, '/etc/hostname', 'db01\n', { mtime: OLD });
  put(
    vfs,
    '/etc/ssh/sshd_config',
    `# Halden Security baseline -- db01 (hardened)
Port 22
# PermitRootLogin yes   <- never on a Halden server
PermitRootLogin no
PasswordAuthentication yes
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
AllowUsers analyst mara
`,
    { mtime: OLD },
  );
  const shadow = vfs.lookup('/etc/shadow');
  shadow.mode = 0o600;
  put(vfs, '/usr/bin/su', '#!/sim/builtin su\n', { mode: 0o4755, mtime: OLD });
  dir(vfs, '/var/tmp', { mode: 0o1777, mtime: OLD });
  localtime(vfs);
  homeDir(vfs, 'cases');
});

// Hidden: mail01, worse than web02. Two extra root accounts (file order differs from
// alphabetical order), shadow readable by all, a space in a filename, a finding behind
// /home/mara (750, so only sudo sees it) and a SUID file hiding in a dot-folder.
defineFixture('case-auditbot-mail01', (vfs) => {
  put(vfs, '/etc/hostname', 'mail01\n', { mtime: OLD });
  const passwd = (vfs.tryRead('/etc/passwd') ?? '').replace('sys:x:3:3', 'toor:x:0:0::/root:/bin/bash\nsys:x:3:3');
  put(vfs, '/etc/passwd', passwd + 'maint:x:0:0:maintenance:/root:/bin/bash\n', { mtime: OLD });
  const hashes = 'toor:$y$j9T$aB3dE5fG7hJ9kL1mN3pQ5r$mail01-hash-placeholder-not-real:20400:0:99999:7:::\nmaint:$y$j9T$sT7uV9wX1yZ3aB5cD7eF9g$maint-hash-placeholder-not-real:20410:0:99999:7:::\n';
  put(vfs, '/etc/shadow', (vfs.tryRead('/etc/shadow') ?? '') + hashes, { mode: 0o644, gid: GID.shadow, mtime: OLD });
  put(
    vfs,
    '/etc/ssh/sshd_config',
    `# /etc/ssh/sshd_config -- mail01
Port 22
PermitRootLogin yes
#PasswordAuthentication yes
PasswordAuthentication no
PubkeyAuthentication yes
`,
    { mtime: OLD },
  );
  localtime(vfs);

  // world-writable regular files
  put(vfs, '/etc/profile.d/proxy.sh', '# proxy.sh -- sourced by every login shell\nexport http_proxy=http://proxy.halden.example:3128\n', { mode: 0o666, mtime: OLD });
  put(vfs, '/home/mara/notes.txt', 'Remember: never paste credentials into tickets.\n', { mode: 0o666, uid: UID.mara, gid: GID.mara, mtime: OLD });
  put(vfs, '/opt/mailtools/run report.sh', '#!/bin/bash\n# run report.sh -- daily mail queue report\nmailq | tail -1\n', { mode: 0o777, mtime: OLD });
  put(vfs, '/var/www/html/index.html', '<!doctype html>\n<title>Halden webmail</title>\n<h1>Halden webmail</h1>\n', { mode: 0o666, uid: UID.www, gid: GID.www, mtime: OLD });
  // world-writable, but not regular files
  dir(vfs, '/opt/mailtools/drop', { mode: 0o777, mtime: OLD });
  dir(vfs, '/var/tmp', { mode: 0o1777, mtime: OLD });

  // SUID: one known, two not
  put(vfs, '/usr/bin/su', '#!/sim/builtin su\n', { mode: 0o4755, mtime: OLD });
  put(vfs, '/opt/mailtools/bin/mailq-helper', FAKE_ELF('a vendor mail tool'), { mode: 0o4755, mtime: OLD });
  dir(vfs, '/var/tmp/.cache', { mtime: OLD });
  put(vfs, '/var/tmp/.cache/dbus-daemon', FAKE_ELF('a program named like a system daemon'), { mode: 0o4755, mtime: OLD });
  homeDir(vfs, 'cases');
});

export const case06: CaseFile = {
  id: 'auditbot',
  number: 6,
  title: 'Audit Bot',
  day: 18,
  difficulty: 4,
  minutes: 45,
  brief: `web02 took you an afternoon. Every other server needs the same sweep, because that runbook was used on more than one of them, and I’m not spending an afternoon per box. I want **one command**.

Write \`auditbot.sh\`. Run it on a server, with no arguments, and it checks the seven things you hunted today, prints one verdict line per check and ends with a tally. Ops will run it every night from cron, so the exit status matters: **1** if anything failed, **0** if not. Warnings alone don’t wake anyone up.

I’ll test it on web02, on a server we hardened properly, and on one that’s worse than web02. One of them has a filename with a space in it, and one hides a finding in a folder that only \`sudo\` can open.

— Mara`,
  requirements: [
    'Usage: `auditbot.sh` takes **no arguments**. Any argument → a usage message on stderr, **exit 2**.',
    'It runs as analyst. Reading `/etc/passwd`, `sshd_config` and the mode of `/etc/shadow` needs no special rights; run the three `find` sweeps with **`sudo`** so no folder is skipped. Nothing goes to stderr.',
    'One verdict line per check, in this order, each starting with `[PASS]`, `[WARN]` or `[FAIL]`:',
    '**1. shadow:** `[PASS] shadow: mode M` if the last digit of `/etc/shadow`’s octal mode (`stat -c %a`) is 0, otherwise `[FAIL] shadow: mode M`.',
    '**2. uid0:** `[FAIL] uid0: NAMES`, every account other than root with UID 0, in `/etc/passwd` order, joined with commas and no spaces (`toor,maint`). If there are none: `[PASS] uid0: only root`.',
    '**3. ssh-root:** `[FAIL] ssh-root: PermitRootLogin yes` if `/etc/ssh/sshd_config` has a line that **starts with** `PermitRootLogin yes`, otherwise `[PASS] ssh-root: PermitRootLogin is not yes`. Lines starting with `#` are comments and don’t count.',
    '**4. ssh-passwords:** `[WARN] ssh-passwords: PasswordAuthentication yes` if a line starts with `PasswordAuthentication yes`, otherwise `[PASS] ssh-passwords: PasswordAuthentication is not yes`.',
    '**5. world-writable:** regular files under `/etc /usr /var /home /opt` that others can write. `[FAIL] world-writable: N found`, then each path on its own line, indented by two spaces, sorted. If there are none: `[PASS] world-writable: none`.',
    '**6. suid:** regular files anywhere under `/` with the SUID bit, except the known `/usr/bin/sudo /usr/bin/passwd /usr/bin/chsh /usr/bin/mount /usr/bin/su`. `[WARN] suid: N unexpected`, then each path indented by two spaces, sorted. If all are known: `[PASS] suid: none unexpected`.',
    '**7. unowned:** files and folders under `/etc /usr /var /home /opt` with no owner. `[WARN] unowned: N found` (a count, no list), or `[PASS] unowned: none`.',
    'Last line: `Result: P pass, W warn, F fail`. Exit status **1** if any check failed, otherwise **0**.',
  ],
  usage: 'bash ~/cases/auditbot.sh',
  sampleOutput: `[PASS] shadow: mode 640
[FAIL] uid0: toor
[FAIL] ssh-root: PermitRootLogin yes
[WARN] ssh-passwords: PasswordAuthentication yes
[FAIL] world-writable: 3 found
  /etc/cron.d/backup-job
  /home/raj/.ssh/authorized_keys
  /usr/local/bin/backup.sh
[WARN] suid: 1 unexpected
  /usr/local/bin/helper
[WARN] unowned: 4 found
Result: 1 pass, 3 warn, 3 fail`,
  scriptPath: '~/cases/auditbot.sh',
  fixture: 'case-auditbot',
  starter: `#!/bin/bash
# auditbot.sh - audit this server for the misconfigurations attackers love
# Usage: bash ~/cases/auditbot.sh   (no arguments; the find sweeps use sudo)

# TODO: any argument -> usage message on stderr, exit 2

npass=0
nwarn=0
nfail=0
pass() { echo "[PASS] $1"; npass=$((npass + 1)); }
warn() { echo "[WARN] $1"; nwarn=$((nwarn + 1)); }
fail() { echo "[FAIL] $1"; nfail=$((nfail + 1)); }

# 1 shadow: the last digit of the mode is what "others" get
mode=$(stat -c %a /etc/shadow)
if [[ $mode == *0 ]]; then
  pass "shadow: mode $mode"
else
  fail "shadow: mode $mode"
fi

# TODO 2 uid0: accounts other than root with UID 0, comma-separated, in file order
# TODO 3 ssh-root and 4 ssh-passwords: active lines only (anchor with ^)
# TODO 5 world-writable: sudo find /etc /usr /var /home /opt -type f -perm -0002, sorted, indented
# TODO 6 suid: sudo find / -type f -perm -4000, minus the known five
# TODO 7 unowned: sudo find /etc /usr /var /home /opt -nouser, count only

echo "Result: $npass pass, $nwarn warn, $nfail fail"
# TODO: exit 1 if anything failed, 0 otherwise
`,
  tests: [
    { name: 'web02 snapshot', check: { output: 'reference' } },
    { name: 'Hidden: db01, hardened (warnings only → exit 0)', fixture: 'case-auditbot-db01', check: { output: 'reference' } },
    { name: 'Hidden: mail01, worse than web02', fixture: 'case-auditbot-mail01', check: { output: 'reference' } },
    {
      name: 'web02 after fixing the world-writable files',
      run: 'sudo chmod 755 /usr/local/bin/backup.sh\nsudo chmod 644 /etc/cron.d/backup-job\nsudo chmod 600 /home/raj/.ssh/authorized_keys\nbash "$SCRIPT"',
      check: { output: 'reference' },
    },
    { name: 'An argument → usage, exit 2', args: ['--fix'], check: { status: 2 } },
  ],
  solution: `#!/bin/bash
# auditbot.sh - audit this server for the misconfigurations attackers love
# Usage: bash ~/cases/auditbot.sh   (no arguments; the find sweeps use sudo)

if [ $# -ne 0 ]; then
  echo "Usage: auditbot.sh (no arguments)" >&2
  exit 2
fi

roots=(/etc /usr /var /home /opt)
npass=0
nwarn=0
nfail=0

# One line per verdict. The counters are global on purpose: the totals outlive each call.
pass() { echo "[PASS] $1"; npass=$((npass + 1)); }
warn() { echo "[WARN] $1"; nwarn=$((nwarn + 1)); }
fail() { echo "[FAIL] $1"; nfail=$((nfail + 1)); }

# 1 shadow: the last digit of the mode is what "others" get
mode=$(stat -c %a /etc/shadow)
if [[ $mode == *0 ]]; then
  pass "shadow: mode $mode"
else
  fail "shadow: mode $mode"
fi

# 2 uid0: every account except root with UID 0, in file order, comma-separated
extra=$(awk -F: '$3 == 0 && $1 != "root" {print $1}' /etc/passwd | tr '\\n' ',')
if [ -z "$extra" ]; then
  pass "uid0: only root"
else
  fail "uid0: \${extra%,}"
fi

# 3 and 4: only active lines count, so anchor at the start (comments begin with #)
cfg=/etc/ssh/sshd_config
if grep -q '^PermitRootLogin yes' "$cfg"; then
  fail "ssh-root: PermitRootLogin yes"
else
  pass "ssh-root: PermitRootLogin is not yes"
fi
if grep -q '^PasswordAuthentication yes' "$cfg"; then
  warn "ssh-passwords: PasswordAuthentication yes"
else
  pass "ssh-passwords: PasswordAuthentication is not yes"
fi

# 5 world-writable regular files; sudo, so no folder is skipped
mapfile -t ww < <(sudo find "\${roots[@]}" -type f -perm -0002 2>/dev/null | sort)
if [ "\${#ww[@]}" -eq 0 ]; then
  pass "world-writable: none"
else
  fail "world-writable: \${#ww[@]} found"
  for f in "\${ww[@]}"; do
    echo "  $f"
  done
fi

# 6 SUID files that aren't on the known list
odd=()
while read -r f; do
  case $f in
    /usr/bin/sudo | /usr/bin/passwd | /usr/bin/chsh | /usr/bin/mount | /usr/bin/su) ;;
    *) odd+=("$f") ;;
  esac
done < <(sudo find / -type f -perm -4000 2>/dev/null | sort)
if [ "\${#odd[@]}" -eq 0 ]; then
  pass "suid: none unexpected"
else
  warn "suid: \${#odd[@]} unexpected"
  for f in "\${odd[@]}"; do
    echo "  $f"
  done
fi

# 7 files and folders whose owner no longer exists
n=$(sudo find "\${roots[@]}" -nouser 2>/dev/null | wc -l)
if [ "$n" -eq 0 ]; then
  pass "unowned: none"
else
  warn "unowned: $n found"
fi

echo "Result: $npass pass, $nwarn warn, $nfail fail"
if [ "$nfail" -gt 0 ]; then
  exit 1
fi
exit 0
`,
  walkthrough: `**How it works**

- **Guard first.** \`[ $# -ne 0 ]\` rejects any argument with a usage line on stderr and exit 2, before the script touches anything.
- **Three verdict functions that also count.** \`pass\`, \`warn\` and \`fail\` print the line *and* bump a counter. The counters are deliberately **not** \`local\`: the totals have to outlive each call, so the \`Result\` line can add them up.
- **shadow:** \`[[ $mode == *0 ]]\` asks whether the mode ends in 0, the digit for others. It works for 640, for 600, even for a bare \`0\`.
- **uid0:** awk compares field 3 as a number, so \`00\` would still count as 0. \`tr '\\n' ','\` joins the names and \`\${extra%,}\` (Day 15) trims the trailing comma. awk reads the file top to bottom, so the order is the file’s.
- **sshd:** \`^\` anchors the match to the start of the line, so \`#PermitRootLogin yes\` is ignored. \`grep -q\` prints nothing and answers with its status, which is all \`if\` needs.
- **The sweeps run under \`sudo\`.** Without it, find can’t open \`/home/mara\` and quietly misses what’s inside: mail01’s \`notes.txt\`. \`2>/dev/null\` stays as well, because on a real server \`find /\` also trips over files that vanish mid-walk.
- **\`-type f\`** drops symlinks (always \`rwxrwxrwx\`) and world-writable folders like \`/var/tmp\`. **\`mapfile -t … < <(… | sort)\`** keeps \`run report.sh\` in one piece, and \`\${#ww[@]}\` is the count.
- **The known SUID list** is a \`case\` with \`|\` between the patterns. Anything that falls through to \`*)\` is unexpected.
- **Exit last:** 1 if \`nfail\` is above zero, otherwise 0, so cron and other scripts can react without reading the text.

**Going further:** run it nightly from root’s crontab and mail only the lines that matter: \`auditbot.sh | grep -v '^\\[PASS\\]'\`. Add checks as you learn them: \`NOPASSWD\` lines in \`/etc/sudoers\`, root cron jobs whose script is writable by anyone, SSH keys in unexpected places.`,
  hints: [
    'The starter already has the counters, the three functions and check 1. Every other check has the same shape: a test, then `pass`, `warn` or `fail`. Add the usage guard at the top and `if [ "$nfail" -gt 0 ]; then exit 1; fi` at the end.',
    "uid0: `extra=$(awk -F: '$3 == 0 && $1 != \"root\" {print $1}' /etc/passwd | tr '\\n' ',')`, then print `${extra%,}`. sshd: `if grep -q '^PermitRootLogin yes' /etc/ssh/sshd_config; then …`.",
    'Lists: `mapfile -t ww < <(sudo find /etc /usr /var /home /opt -type f -perm -0002 2>/dev/null | sort)`. `${#ww[@]}` is the count, and `for f in "${ww[@]}"; do echo "  $f"; done` prints the paths.',
    'SUID: loop with `while read -r f; do …; done < <(sudo find / -type f -perm -4000 2>/dev/null | sort)` and skip the known five with `case $f in /usr/bin/sudo | /usr/bin/passwd | …) ;; *) odd+=("$f") ;; esac`. Unowned: `n=$(sudo find … -nouser 2>/dev/null | wc -l)`.',
  ],
  xp: 450,
};
