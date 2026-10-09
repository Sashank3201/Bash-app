import { defineFixture } from '../fixtures';
import { dir, GID, homeDir, put, UID } from '../fixtures/base';
import type { VFS } from '../../shell/vfs';
import type { Mission } from '../types';

/** Base files are dated 2026-01-20; anything changed "yesterday" is relative to the fixture's clock. */
const OLD = Date.UTC(2026, 0, 20, 10, 0, 0);
const HOUR = 3600000;

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
 */
export function web02(vfs: VFS, now: number) {
  const yesterday = now - 26 * HOUR;
  put(vfs, '/etc/hostname', 'web02\n', { mtime: OLD });
  put(vfs, '/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tweb02\n10.20.0.21\tweb01.halden.internal web01\n10.20.0.22\tdb01.halden.internal db01\n', { mtime: OLD });
  vfs.symlink('/usr/share/zoneinfo/Etc/UTC', '/etc/localtime');
  vfs.lookup('/etc/localtime', { follow: false }).mtime = OLD;

  // yesterday: a second root account, and SSH opened up so it can be used
  put(vfs, '/etc/passwd', (vfs.tryRead('/etc/passwd') ?? '') + 'toor:x:0:0::/root:/bin/bash\n', { mtime: yesterday });
  put(vfs, '/etc/shadow', (vfs.tryRead('/etc/shadow') ?? '') + 'toor:$y$j9T$Qm4rX8bN2cV7kL1pZ0sW5e$breakglass-hash-placeholder-not-real:20733:0:99999:7:::\n', {
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
  briefing: 'draft',
  objectives: [],
  lesson: [],
  drills: [],
  debrief: { summary: [], cards: [] },
  cards: [],
};
