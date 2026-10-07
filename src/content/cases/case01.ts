import { defineFixture } from '../fixtures';
import { homeDir, put } from '../fixtures/base';
import { authLog } from '../fixtures/gen';
import type { CaseFile } from '../types';

defineFixture('case-snapshot', (vfs) => {
  homeDir(vfs, 'cases');
});

// Hidden test machines: a busier web server and a quiet build box.
defineFixture(
  'case-snapshot-web',
  (vfs) => {
    put(vfs, '/etc/hostname', 'web01\n');
    const passwd = vfs.tryRead('/etc/passwd') ?? '';
    put(vfs, '/etc/passwd', passwd + 'deploy:x:1003:1003:Deploy bot,,,:/home/deploy:/bin/bash\npostgres:x:113:121:PostgreSQL:/var/lib/postgresql:/bin/bash\nmysql:x:114:122:MySQL:/nonexistent:/bin/false\n');
    put(vfs, '/var/log/auth.log', authLog({ seed: 41, noise: 40, attackers: [{ ip: '198.51.100.23', count: 30, users: ['root', 'admin', 'deploy'] }] }), { mode: 0o640, uid: 104, gid: 4 });
  },
  'case-snapshot',
);

defineFixture(
  'case-snapshot-quiet',
  (vfs) => {
    put(vfs, '/etc/hostname', 'build02\n');
    put(vfs, '/var/log/auth.log', authLog({ seed: 5, noise: 0 }), { mode: 0o640, uid: 104, gid: 4 });
  },
  'case-snapshot',
);

export const case01: CaseFile = {
  id: 'snapshot',
  number: 1,
  title: 'System Snapshot',
  day: 7,
  difficulty: 1,
  minutes: 20,
  brief: `When we pick up a machine during an incident, the first thing anyone asks is: **what is this box?** Name, who we are on it, kernel, how many accounts, and whether anyone has been knocking on the door.

Right now analysts type those commands one by one and paste the answers into the ticket. Write \`snapshot.sh\` so it’s one command instead.

I’ll run it on a couple of other machines too — so **don’t hard-code anything**. Every value has to come from a command.

— Mara`,
  requirements: [
    'The first line is exactly `=== SYSTEM SNAPSHOT ===`',
    '`Host:` the machine’s hostname',
    '`User:` the account running the script',
    '`Kernel:` the kernel release (`uname -r`)',
    '`Date:` today’s date as YYYY-MM-DD',
    '`Accounts:` how many lines `/etc/passwd` has',
    '`Bash users:` how many accounts use `/bin/bash` as their shell',
    '`Failed logins:` how many “Failed password” lines are in `/var/log/auth.log`',
    'Extra spaces after the colon are fine if you want to line things up.',
  ],
  usage: 'bash ~/cases/snapshot.sh',
  sampleOutput: `=== SYSTEM SNAPSHOT ===
Host: halden-ws01
User: analyst
Kernel: 6.8.0-45-generic
Date: 2026-03-14
Accounts: 12
Bash users: 4
Failed logins: 39`,
  scriptPath: '~/cases/snapshot.sh',
  fixture: 'case-snapshot',
  starter: `#!/bin/bash
# snapshot.sh — a one-screen summary of this machine
# Usage: bash ~/cases/snapshot.sh

echo "=== SYSTEM SNAPSHOT ==="
echo "Host: $(hostname)"

# TODO: User, Kernel, Date
# TODO: Accounts, Bash users, Failed logins
`,
  tests: [
    { name: 'Report on this workstation', check: { output: 'reference', looseSpace: true } },
    { name: 'Hidden machine: a busy web server', fixture: 'case-snapshot-web', check: { output: 'reference', looseSpace: true } },
    { name: 'Hidden machine: a quiet build box', fixture: 'case-snapshot-quiet', check: { output: 'reference', looseSpace: true } },
  ],
  solution: `#!/bin/bash
# snapshot.sh — a one-screen summary of this machine
# Usage: bash ~/cases/snapshot.sh

accounts=$(wc -l < /etc/passwd)
bash_users=$(grep -c "/bin/bash" /etc/passwd)
failed=$(grep -c "Failed password" /var/log/auth.log)

echo "=== SYSTEM SNAPSHOT ==="
echo "Host: $(hostname)"
echo "User: $(whoami)"
echo "Kernel: $(uname -r)"
echo "Date: $(date +%F)"
echo "Accounts: $accounts"
echo "Bash users: $bash_users"
echo "Failed logins: $failed"
`,
  walkthrough: `**How it works**

- Each value comes from one command, captured with \`$( )\`. Nothing is typed in by hand, so the same script tells the truth on any machine.
- \`wc -l < /etc/passwd\` feeds the file on stdin, so \`wc\` prints only the number — \`wc -l /etc/passwd\` would print the filename too.
- \`grep -c\` counts matching **lines**. One line per account, so that’s one count per bash user.
- Storing the counts in variables first keeps the \`echo\` lines short and readable. It also means you could reuse a value later — say, to print a warning when \`failed\` is high. (That’s Day 9.)

On the quiet build box \`grep -c\` finds nothing, prints \`0\` and exits with status 1. The report is still right, because the script doesn’t stop on errors. On Day 19 you’ll make scripts strict on purpose, and then you’ll need to handle that case.`,
  hints: [
    'Every line follows the same pattern as the Host line: `echo "Label: $(command)"`.',
    '`wc -l < /etc/passwd` prints just the number of lines — no filename.',
    '`grep -c PATTERN FILE` counts matching lines. For bash users the pattern is `/bin/bash`; for failures it’s `"Failed password"`.',
  ],
  xp: 200,
};
