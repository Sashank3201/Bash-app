import { defineFixture } from '../fixtures';
import { GID, UID, dir, home, put } from '../fixtures/base';
import type { Challenge } from '../types';

// Arena: Encoding, hashing, auditing & time (days 16–20). See docs/CONTENT_GUIDE.md.
// Every "binary" below is a few ASCII bytes plus the words "training sample". Hashes were taken with sha256sum / md5sum.

const TOPIC = 'Security scripting';
const at = (mon: number, day: number, h: number, m: number, s = 0) => Date.UTC(2026, mon - 1, day, h, m, s);
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0';
const lines = (xs: string[]) => xs.join('\n') + '\n';

// ------------------------------------------------------------------ day 16: a web shell's orders, in base64

/** The c= value decodes to: ls -la /var/www/html; id */
const WEBSHELL_LOG = lines([
  `198.18.7.41 - - [13/Mar/2026:23:44:12 +0000] "GET / HTTP/1.1" 200 3120 "-" "${UA}"`,
  `198.18.7.41 - - [13/Mar/2026:23:44:13 +0000] "GET /assets/site.css HTTP/1.1" 200 812 "-" "${UA}"`,
  `203.0.113.61 - - [13/Mar/2026:23:49:30 +0000] "GET /backup.zip HTTP/1.1" 404 196 "-" "Mozilla/5.0 (compatible; scan/2.1)"`,
  `198.51.100.23 - - [13/Mar/2026:23:58:12 +0000] "GET /status-check.php HTTP/1.1" 200 41 "-" "curl/8.5.0"`,
  `198.18.93.5 - - [14/Mar/2026:00:01:56 +0000] "GET /about.html HTTP/1.1" 200 1544 "-" "${UA}"`,
  `198.51.100.23 - - [14/Mar/2026:00:02:47 +0000] "GET /status-check.php?c=bHMgLWxhIC92YXIvd3d3L2h0bWw7IGlk HTTP/1.1" 200 618 "-" "curl/8.5.0"`,
  `198.18.93.5 - - [14/Mar/2026:00:02:51 +0000] "GET /contact.html HTTP/1.1" 200 980 "-" "${UA}"`,
  `198.18.120.44 - - [14/Mar/2026:00:09:13 +0000] "GET / HTTP/1.1" 200 3120 "-" "${UA}"`,
]);

defineFixture('arena-security-webshell', (vfs) => {
  home(vfs, 'evidence/web01-access.log', WEBSHELL_LOG, 0o644, at(3, 14, 9, 40));
});

// ------------------------------------------------------------------ day 16: a file path hidden in a hex literal

/** 0x2f76… is /var/www/html/config.php */
const SQLI_LOG = lines([
  `203.0.113.61 - - [12/Mar/2026:14:20:03 +0000] "GET /portal/reports.php?id=7 HTTP/1.1" 200 5120 "-" "${UA}"`,
  `203.0.113.61 - - [12/Mar/2026:14:20:05 +0000] "GET /portal/reports.php?id=7%27 HTTP/1.1" 500 612 "-" "${UA}"`,
  `203.0.113.61 - - [12/Mar/2026:14:20:09 +0000] "GET /portal/reports.php?id=7%20AND%201=1 HTTP/1.1" 200 5120 "-" "${UA}"`,
  `203.0.113.61 - - [12/Mar/2026:14:20:12 +0000] "GET /portal/reports.php?id=7%20AND%201=2 HTTP/1.1" 200 388 "-" "${UA}"`,
  `198.18.44.9 - - [12/Mar/2026:14:21:40 +0000] "GET /portal/ HTTP/1.1" 200 9120 "-" "${UA}"`,
  `203.0.113.61 - - [12/Mar/2026:14:22:31 +0000] "GET /portal/reports.php?id=-1%20UNION%20SELECT%201,2,3 HTTP/1.1" 200 4980 "-" "${UA}"`,
  `203.0.113.61 - - [12/Mar/2026:14:23:02 +0000] "GET /portal/reports.php?id=-1%20UNION%20SELECT%201,load_file(0x2f7661722f7777772f68746d6c2f636f6e6669672e706870),3 HTTP/1.1" 200 6022 "-" "${UA}"`,
  `198.18.44.9 - - [12/Mar/2026:14:24:15 +0000] "GET /portal/reports HTTP/1.1" 200 15544 "-" "${UA}"`,
]);

defineFixture('arena-security-sqli', (vfs) => {
  home(vfs, 'evidence/portal-access.log', SQLI_LOG, 0o644, at(3, 12, 18, 0));
});

// ------------------------------------------------------------------ day 16: attachments judged by their first bytes

defineFixture('arena-security-inbox', (vfs) => {
  const t = at(3, 13, 16, 40);
  home(vfs, 'inbox/contract-renewal.pdf', '%PDF-1.7\n% Halden contract renewal (training sample)\n%%EOF\n', 0o644, t);
  home(vfs, 'inbox/invoice-0311.pdf', 'MZ\x00\x00\x03\x00\x00\x00PE\x00\x00L\x01 invoice viewer (training sample, not a real program)\n', 0o644, t);
  home(vfs, 'inbox/payslip-march.pdf', '%PDF-1.4\n% payslip, March 2026 (training sample)\n%%EOF\n', 0o644, t);
  home(vfs, 'inbox/q1-report.pdf', '%PDF-1.7\n% Halden Q1 report (training sample)\n%%EOF\n', 0o644, t);
  // a zip local-file header (version 2.0, stored, 13-byte name) so `file` calls it a Zip archive, like the real one does
  home(vfs, 'inbox/scan-0042.pdf', 'PK\x03\x04\x14' + '\x00'.repeat(21) + '\x0d\x00\x00\x00scan-0042.exe training sample, zipped\n', 0o644, t);
  home(vfs, 'inbox/travel-policy.pdf', '%PDF-1.5\n% travel policy (training sample)\n%%EOF\n', 0o644, t);
});

// ------------------------------------------------------------------ day 16: a hand-edited intel feed with blank lines in it

const SHA_BUDGET = '6ffbcec9057d9875c20e3025bf4ad1d4b37f7f37b0a45bb6f11e681e517dc4ac';
const SHA_SVC = '70bae2e84b1f1f3a40c8c082066b5fc79d470ea03043dbe45f50f758cfa53e41';

const FEED = lines([
  '# Halden partner feed - sha256 of files seen in the northw1nd campaign',
  '# one hash per line; comments start with #',
  '',
  '968bab449f14f62abedcbc4d1d8b5db390d0997fdb27d5f63e09250055d3e576',
  SHA_SVC,
  '',
  '# added 2026-03-14 by the night shift',
  SHA_BUDGET,
  '15f63d6a4f33d6732e44e4dc2eadff9b36e55b1b1904fa0497baf5edda07b764',
  '',
]);

defineFixture('arena-security-feed', (vfs) => {
  const t = at(3, 14, 8, 15);
  home(vfs, 'intel/feed.txt', FEED, 0o644, at(3, 14, 8, 0));
  home(vfs, 'quarantine/agent-update.sh', '#!/bin/bash\n# agent updater for the Halden fleet (training sample)\necho "agent up to date"\n', 0o644, t);
  home(vfs, 'quarantine/budget-2026.xlsm', 'PK\x03\x04 budget-2026 workbook with an auto-run macro (training sample)\n', 0o644, t);
  home(vfs, 'quarantine/invoice-0311.pdf', '%PDF-1.7\n% invoice 0311 from a real supplier (training sample)\n%%EOF\n', 0o644, t);
  home(vfs, 'quarantine/logo.gif', 'GIF89a halden logo (training sample)\n', 0o644, t);
  home(vfs, 'quarantine/readme.txt', 'Quarantine. Nothing in here gets opened, only hashed.\n', 0o644, t);
  home(vfs, 'quarantine/svc-helper', '\x7fELF\x02\x01\x01 svc-helper dropped in /tmp on web01 (training sample, not a real program)\n', 0o644, t);
});

// ------------------------------------------------------------------ day 17: the audit log counts in epoch seconds

function audit(epoch: number, ms: string, serial: number, pid: number, uid: number, exe: string, args: string[]): string {
  const stamp = `msg=audit(${epoch}.${ms}:${serial}):`;
  const comm = exe.slice(exe.lastIndexOf('/') + 1);
  return (
    `type=SYSCALL ${stamp} arch=c000003e syscall=59 success=yes exit=0 ppid=2391 pid=${pid} auid=1002 uid=${uid} euid=${uid} tty=pts0 ses=12 comm="${comm}" exe="${exe}" key="exec"\n` +
    `type=EXECVE ${stamp} argc=${args.length} ${args.map((a, i) => `a${i}="${a}"`).join(' ')}\n`
  );
}

/** raj's hijacked session on web01. useradd ran at 2026-03-14 00:27:13 UTC. */
const AUDIT_LOG = [
  audit(1773446021, '317', 5098, 2402, 1002, '/usr/bin/id', ['id']),
  audit(1773446024, '902', 5099, 2403, 1002, '/usr/bin/uname', ['uname', '-a']),
  audit(1773446050, '044', 5100, 2405, 1002, '/usr/bin/cat', ['cat', '/etc/passwd']),
  audit(1773448033, '508', 5121, 2440, 0, '/usr/sbin/useradd', ['useradd', '-o', '-u', '0', 'sysmaint']),
  audit(1773448051, '226', 5124, 2443, 0, '/usr/bin/passwd', ['passwd', 'sysmaint']),
  audit(1773448264, '731', 5131, 2451, 0, '/usr/bin/tee', ['tee', '/etc/cron.d/sysupdate']),
].join('');

defineFixture('arena-security-audit', (vfs) => {
  home(vfs, 'evidence/audit.log', AUDIT_LOG, 0o644, at(3, 14, 9, 40));
});

// ------------------------------------------------------------------ day 17: logins by weekday (Sat 7, Sun 8, Sat 14 March)

const LOGINS = lines([
  'Mar  2 08:47:15 mail01 sshd[1104]: Accepted publickey for mara from 10.20.0.8 port 50112 ssh2',
  'Mar  3 09:12:40 mail01 sshd[1187]: Accepted publickey for raj from 10.20.0.12 port 44871 ssh2',
  'Mar  4 16:20:03 mail01 sshd[1255]: Accepted publickey for analyst from 10.20.0.5 port 51220 ssh2',
  'Mar  6 18:55:29 mail01 sshd[1342]: Accepted publickey for mara from 10.20.0.8 port 50288 ssh2',
  'Mar  7 03:14:55 mail01 sshd[1402]: Accepted password for backup from 192.0.2.140 port 60211 ssh2',
  'Mar  8 11:20:31 mail01 sshd[1530]: Accepted publickey for mara from 10.20.0.8 port 50390 ssh2',
  'Mar  9 00:10:22 mail01 sshd[1588]: Accepted password for backup from 192.0.2.140 port 60377 ssh2',
  'Mar  9 08:51:09 mail01 sshd[1611]: Accepted publickey for analyst from 10.20.0.5 port 51377 ssh2',
  'Mar 10 10:03:44 mail01 sshd[1702]: Accepted publickey for raj from 10.20.0.12 port 45002 ssh2',
  'Mar 11 14:37:18 mail01 sshd[1790]: Accepted publickey for mara from 10.20.0.8 port 50455 ssh2',
  'Mar 12 09:25:51 mail01 sshd[1868]: Accepted publickey for analyst from 10.20.0.5 port 51498 ssh2',
  'Mar 13 17:02:36 mail01 sshd[1950]: Accepted publickey for raj from 10.20.0.12 port 45190 ssh2',
  'Mar 13 23:58:03 mail01 sshd[1994]: Accepted publickey for mara from 10.20.0.8 port 50901 ssh2',
  'Mar 14 06:05:44 mail01 sshd[2033]: Accepted publickey for mara from 10.20.0.8 port 50977 ssh2',
]);

defineFixture('arena-security-logins', (vfs) => {
  home(vfs, 'evidence/mail01-logins.log', LOGINS, 0o644, at(3, 14, 9, 40));
});

// ------------------------------------------------------------------ day 17: web01's egress in the first 15 minutes of the breach

const BREACH_AUTH = lines([
  'Mar 13 23:47:09 web01 sshd[2340]: Failed password for root from 198.51.100.23 port 45149 ssh2',
  'Mar 13 23:48:36 web01 sshd[2343]: Failed password for raj from 198.51.100.23 port 39390 ssh2',
  'Mar 13 23:51:00 web01 sshd[2348]: Accepted password for raj from 198.51.100.23 port 39615 ssh2',
  'Mar 13 23:51:00 web01 sshd[2348]: pam_unix(sshd:session): session opened for user raj(uid=1002) by (uid=0)',
  'Mar 14 00:17:01 web01 CRON[2402]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)',
  'Mar 14 00:17:02 web01 CRON[2402]: pam_unix(cron:session): session closed for user root',
  'Mar 14 00:41:27 web01 sshd[2348]: pam_unix(sshd:session): session closed for user raj',
]);

/** Window: 2026-03-13 23:51:00 up to 2026-03-14 00:06:00, exclusive. 23:50:59 and 00:06:00 sit on the edges. */
const EGRESS = lines([
  '2026-03-13 23:30:12 ALLOW tcp 10.20.0.21:41802 -> 198.18.40.12:443',
  '2026-03-13 23:45:00 ALLOW udp 10.20.0.21:123 -> 198.18.0.123:123',
  '2026-03-13 23:50:59 ALLOW tcp 10.20.0.21:41866 -> 10.20.0.22:5432',
  '2026-03-13 23:51:00 ALLOW tcp 10.20.0.21:41870 -> 10.20.0.22:5432',
  '2026-03-13 23:52:12 ALLOW tcp 10.20.0.21:50214 -> 198.51.100.77:80',
  '2026-03-13 23:52:13 ALLOW tcp 10.20.0.21:50216 -> 198.51.100.77:80',
  '2026-03-13 23:56:30 DENY tcp 10.20.0.21:50240 -> 198.51.100.77:8443',
  '2026-03-14 00:00:00 ALLOW udp 10.20.0.21:123 -> 198.18.0.123:123',
  '2026-03-14 00:03:40 ALLOW tcp 10.20.0.21:50288 -> 198.51.100.77:443',
  '2026-03-14 00:05:59 ALLOW tcp 10.20.0.21:41902 -> 10.20.0.22:5432',
  '2026-03-14 00:06:00 ALLOW tcp 10.20.0.21:41906 -> 10.20.0.22:5432',
  '2026-03-14 00:15:00 ALLOW udp 10.20.0.21:123 -> 198.18.0.123:123',
  '2026-03-14 00:31:05 ALLOW tcp 10.20.0.21:50330 -> 198.51.100.77:80',
]);

defineFixture('arena-security-breach', (vfs) => {
  home(vfs, 'evidence/web01-auth.log', BREACH_AUTH, 0o644, at(3, 14, 9, 40));
  home(vfs, 'evidence/web01-egress.log', EGRESS, 0o644, at(3, 14, 9, 40));
});

// ------------------------------------------------------------------ day 18: two accounts, one UID

defineFixture('arena-security-passwd', (vfs) => {
  const passwd = vfs.readFile('/etc/passwd') + 'sysmaint:x:0:0:System Maintenance:/root:/bin/bash\nrmenon:x:1002:1002::/home/raj:/bin/bash\n';
  put(vfs, '/etc/passwd', passwd, { mtime: at(3, 14, 0, 27, 13) });
});

// ------------------------------------------------------------------ day 18: SUID files against an allow-list

const SUID_ALLOW = lines([
  '/usr/bin/chfn',
  '/usr/bin/chsh',
  '/usr/bin/gpasswd',
  '/usr/bin/mount',
  '/usr/bin/newgrp',
  '/usr/bin/passwd',
  '/usr/bin/su',
  '/usr/bin/sudo',
  '/usr/bin/umount',
  '/usr/lib/openssh/ssh-keysign',
]);

defineFixture('arena-security-suid', (vfs) => {
  const old = at(1, 20, 10, 0);
  vfs.lookup('/usr/bin/su').mode = 0o4755;
  put(vfs, '/usr/lib/openssh/ssh-keysign', '# ssh-keysign placeholder (training sample)\n', { mode: 0o4755, mtime: old });
  put(vfs, '/usr/local/bin/report-tool', '# report-tool: runs with the staff group (training sample)\n', { mode: 0o2755, gid: GID.staff, mtime: at(2, 3, 11, 0) });
  put(vfs, '/usr/local/bin/halden-sync', '# halden-sync (training sample)\n', { mode: 0o755, mtime: at(2, 3, 11, 0) });
  put(vfs, '/usr/local/sbin/netcheck', '# netcheck: origin unknown (training sample)\n', { mode: 0o4755, mtime: at(3, 14, 0, 36, 40) });
  dir(vfs, '/home/raj/.cache', { mode: 0o755, uid: UID.raj, gid: GID.raj });
  put(vfs, '/home/raj/.cache/.bash', '# a root-owned SUID copy of a shell (training sample)\n', { mode: 0o4755, mtime: at(3, 14, 0, 35, 12) });
  home(vfs, 'audit/suid-allow.txt', SUID_ALLOW, 0o644, at(2, 2, 9, 0));
});

// ------------------------------------------------------------------ day 19: a strict-mode sweep script

const SHA_INVOICE = '5d53a4746cca2a9cdce77482011d0de2696153da72c36cf93ce50f63b3664353';
const SHA_PAYROLL = 'a55c30daadc3bc1fee0bc92de1843edc9ead4f0b18d41dd737e7d5fe41a9e3e0';

const CHECK_SWEEP = `#!/bin/bash
# check-sweep.sh - Mara's acceptance test for ~/bin/sweep.sh
for d in ~/drop ~/clean; do
  bash ~/bin/sweep.sh "$d"
  echo "exit $?"
done
bash ~/bin/sweep.sh 2> /dev/null
echo "exit $?"
`;

defineFixture('arena-security-sweep', (vfs) => {
  const t = at(3, 14, 8, 30);
  home(vfs, 'intel/bad.sha256', lines(['48e633ac8123fa811f346970500efcec3e55359464e7bc04e5a34086aee43104', SHA_INVOICE, SHA_PAYROLL, 'b31f19551925e2d165c219187faa2338f5041519bdd35b012e6c044c1aa94f71']), 0o644, at(3, 14, 8, 0));
  home(vfs, 'drop/invoice-0311.pdf', 'MZ\x00\x00\x03\x00\x00\x00PE\x00\x00L\x01 invoice viewer (training sample, not a real program)\n', 0o644, t);
  home(vfs, 'drop/march payroll.xlsm', 'PK\x03\x04 payroll workbook with an auto-run macro (training sample)\n', 0o644, t);
  home(vfs, 'drop/minutes-0312.txt', 'Ops meeting, 12 Mar: rotate the VPN certificates before Friday.\n', 0o644, t);
  home(vfs, 'drop/q1-report.pdf', '%PDF-1.7\n% Halden Q1 report (training sample)\n%%EOF\n', 0o644, t);
  home(vfs, 'clean/handbook.pdf', '%PDF-1.4\n% Halden staff handbook (training sample)\n%%EOF\n', 0o644, t);
  home(vfs, 'clean/rota.txt', 'On call: Sat 14 Mar mara, Sun 15 Mar analyst.\n', 0o644, t);
  home(vfs, 'bin/check-sweep.sh', CHECK_SWEEP, 0o755, t);
});

const SWEEP_SH = `#!/bin/bash
# sweep.sh DIR - flag files whose sha256 is on the bad list
set -euo pipefail

dir=\${1:-}
if [ -z "$dir" ]; then
  echo "usage: sweep.sh DIR" >&2
  exit 2
fi

checked=0
bad=0
for f in "$dir"/*; do
  hash=$(sha256sum "$f" | awk '{print $1}')
  if grep -qx "$hash" "$HOME/intel/bad.sha256"; then
    echo "BAD \${f##*/}"
    bad=$((bad + 1))
  fi
  checked=$((checked + 1))
done

echo "checked $checked, bad $bad"
if [ "$bad" -gt 0 ]; then
  exit 1
fi
`;

// ------------------------------------------------------------------ day 20: dpkg's own md5 lists as a vendor baseline

const PAM_UNIX = '# pam_unix.so 1.5.3-5ubuntu5.1 (training sample placeholder)\n';
const SSHD = '# OpenSSH server 1:9.6p1-3ubuntu13.5 (training sample placeholder)\n';
const SFTP = '# OpenSSH sftp server 1:9.6p1-3ubuntu13.5 (training sample placeholder)\n';
const PAM_DENY = '# pam_deny.so 1.5.3-5ubuntu5.1 (training sample placeholder)\n';
const PAM_PERMIT = '# pam_permit.so 1.5.3-5ubuntu5.1 (training sample placeholder)\n';
const SSHD_DEFAULT = '# Ubuntu default sshd_config (training sample)\nInclude /etc/ssh/sshd_config.d/*.conf\nKbdInteractiveAuthentication no\nUsePAM yes\n';

const MD5 = {
  pamUnix: 'aef26632b43364606116b2af1f37eede',
  pamDeny: '926c5c8326dbb7428903244cd9663cbd',
  pamPermit: '9cd5afaa58c9275d89b7871c90a94ad9',
  sshd: '1b6a6fd2043b9e5737233b0a03791292',
  sftp: 'ff7bda89dbfaa42e8cd4ae8ab42dfcb6',
  sshdDefault: 'e1eb48bc2c2474ffcc47b95540268825',
};

defineFixture('arena-security-dpkg', (vfs) => {
  const installed = at(3, 10, 6, 12, 47);
  const info = '/var/lib/dpkg/info/';
  const sec = '/usr/lib/x86_64-linux-gnu/security/';
  put(vfs, info + 'libpam-modules:amd64.md5sums', lines([`${MD5.pamDeny}  usr/lib/x86_64-linux-gnu/security/pam_deny.so`, `${MD5.pamPermit}  usr/lib/x86_64-linux-gnu/security/pam_permit.so`, `${MD5.pamUnix}  usr/lib/x86_64-linux-gnu/security/pam_unix.so`, 'b1c0f2e4a7d93a5c8e6f01d2b3a4c5d6  usr/share/doc/libpam-modules/copyright']), { mtime: installed });
  put(vfs, info + 'openssh-server.md5sums', lines([`${MD5.sshd}  usr/sbin/sshd`, `${MD5.sshdDefault}  usr/share/openssh/sshd_config`, '0f3e9a1c7b2d4e5f6a8b9c0d1e2f3a4b  usr/share/doc/openssh-server/README.Debian.gz', '7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d  usr/share/man/man8/sshd.8.gz']), { mtime: installed });
  put(vfs, info + 'openssh-server.list', lines(['/.', '/usr', '/usr/sbin', '/usr/sbin/sshd', '/usr/share/openssh/sshd_config', '/usr/share/doc/openssh-server/README.Debian.gz', '/usr/share/man/man8/sshd.8.gz']), { mtime: installed });
  put(vfs, info + 'openssh-server.conffiles', lines(['/etc/default/ssh', '/etc/pam.d/sshd', '/etc/ssh/moduli']), { mtime: installed });
  put(vfs, info + 'openssh-sftp-server.md5sums', lines([`${MD5.sftp}  usr/lib/openssh/sftp-server`, '5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b  usr/share/doc/openssh-sftp-server/copyright']), { mtime: installed });
  put(vfs, sec + 'pam_deny.so', PAM_DENY, { mtime: installed });
  put(vfs, sec + 'pam_permit.so', PAM_PERMIT, { mtime: installed });
  put(vfs, sec + 'pam_unix.so', PAM_UNIX + '# not the vendor build (training sample)\n', { mtime: at(3, 14, 0, 38, 2) });
  put(vfs, '/usr/sbin/sshd', SSHD + '# not the vendor build (training sample)\n', { mode: 0o755, mtime: installed });
  put(vfs, '/usr/lib/openssh/sftp-server', SFTP, { mode: 0o755, mtime: installed });
  put(vfs, '/usr/share/openssh/sshd_config', SSHD_DEFAULT, { mtime: installed });
});

// ------------------------------------------------------------------ challenges

export const challenges: Challenge[] = [
  {
    id: 'security-webshell-order',
    title: 'What the Shell Was Told',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 16,
    md: 'The web shell dropped on web01, `status-check.php`, took its orders in a `c=` parameter, base64-encoded so the command never shows up in a plain-text search. One request in `~/evidence/web01-access.log` carries an order. Pull out the value after `c=` and decode it: print the command the attacker sent, and nothing else. Decode to read, never pipe it into `bash`.',
    fixture: 'arena-security-webshell',
    check: { output: 'ls -la /var/www/html; id\n' },
    solution: "grep -o 'c=[^ ]*' ~/evidence/web01-access.log | cut -d= -f2 | base64 -d",
    hints: [
      '`grep c= ~/evidence/web01-access.log` finds the request. The value runs from just after `c=` to the next space.',
      "`grep -o 'c=[^ ]*'` prints only the `c=…` part, and `cut -d= -f2` drops the `c=`. Then pipe it into `base64 -d`.",
      "`grep -o 'c=[^ ]*' ~/evidence/web01-access.log | cut -d= -f2 | base64 -d`",
    ],
    xp: 40,
  },
  {
    id: 'security-hex-literal',
    title: 'Zero-X',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 16,
    md: 'Someone probed the customer portal with SQL injection, and `~/evidence/portal-access.log` kept every attempt. The last one asks the database to read a file, written as a hex literal (`0x…`) so the path never appears as text. Decode the hex digits after `0x` and print the path the attacker was after. `xxd -r -p` turns plain hex back into bytes, but it doesn’t understand the `0x` prefix, so leave that out.',
    fixture: 'arena-security-sqli',
    check: { output: '/var/www/html/config.php\n' },
    solution: "grep -o '0x[0-9a-f]*' ~/evidence/portal-access.log | cut -dx -f2 | xxd -r -p",
    hints: [
      "`grep -o '0x[0-9a-f]*' ~/evidence/portal-access.log` prints only the hex literal.",
      '`cut -dx -f2` splits it at the `x` and keeps what comes after: the bare hex digits. Then pipe them into `xxd -r -p`.',
      "`grep -o '0x[0-9a-f]*' ~/evidence/portal-access.log | cut -dx -f2 | xxd -r -p`",
    ],
    xp: 40,
  },
  {
    id: 'security-fake-pdf',
    title: 'Not What It Says',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 16,
    md: 'All six attachments in `~/inbox` end in `.pdf`. A real PDF starts with the four bytes `%PDF`; anything else is wearing a costume. Print the names of the files that are **not** real PDFs: just the names (no folder), one per line, in name order. `file` reads the first bytes for you, and `head -c 4 FILE | xxd` shows them raw.',
    fixture: 'arena-security-inbox',
    check: { output: 'invoice-0311.pdf\nscan-0042.pdf\n' },
    solution: "cd ~/inbox && file * | grep -v 'PDF document' | cut -d: -f1",
    hints: [
      '`cd ~/inbox` and run `file *`. The real ones say `PDF document`.',
      'Keep the lines that don’t say it with `grep -v`, then cut the name off before the `:`.',
      "`cd ~/inbox && file * | grep -v 'PDF document' | cut -d: -f1`",
    ],
    xp: 40,
  },
  {
    id: 'security-dirty-feed',
    title: 'Dirty Feed',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 16,
    md: 'A partner’s threat-intel feed landed in `~/intel/feed.txt`: one sha256 per line, plus `#` comments and blank lines, because a human edits it. Print the names of the files in `~/quarantine` whose sha256 is in the feed, one per line, in name order. Sanity-check what you get: six files can’t all be malware.',
    fixture: 'arena-security-feed',
    check: { output: 'budget-2026.xlsm\nsvc-helper\n' },
    solution: "cd ~/quarantine && sha256sum * | grep -Ff <(grep -E '^[0-9a-f]{64}$' ~/intel/feed.txt) | awk '{print $2}'",
    hints: [
      '`cd ~/quarantine && sha256sum * | grep -Ff ~/intel/feed.txt` looks right, and prints every file. A blank line in a pattern file is an empty pattern, and an empty pattern matches every line.',
      "Clean the feed first. `grep -E '^[0-9a-f]{64}$' ~/intel/feed.txt` keeps only real hashes; save that to a file, or hand it to `grep -Ff` directly with `<( )`.",
      "`cd ~/quarantine && sha256sum * | grep -Ff <(grep -E '^[0-9a-f]{64}$' ~/intel/feed.txt) | awk '{print $2}'`",
    ],
    xp: 70,
  },
  {
    id: 'security-audit-clock',
    title: 'Audit Clock',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 17,
    md: 'The Linux audit log stamps every event in epoch seconds: `msg=audit(1773446021.317:5098)` means 1773446021 seconds after 1 January 1970, then milliseconds and an event number. `~/evidence/audit.log` caught the intruder on web01 adding a user. Print when `useradd` ran, in UTC, as `YYYY-MM-DD HH:MM:SS`.',
    fixture: 'arena-security-audit',
    check: { output: '2026-03-14 00:27:13\n' },
    solution: "date -u -d @$(grep useradd ~/evidence/audit.log | head -1 | grep -o 'audit([0-9]*' | cut -d'(' -f2) '+%F %T'",
    hints: [
      '`grep useradd ~/evidence/audit.log` shows the event (two lines, one stamp). The epoch is the number between `audit(` and the dot.',
      "`date -u -d @EPOCH '+%F %T'` turns epoch seconds into a UTC date and time.",
      "`date -u -d @1773448033 '+%F %T'`",
    ],
    xp: 40,
  },
  {
    id: 'security-weekend-logins',
    title: 'Weekend Shift',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 17,
    md: 'Nobody at Halden works weekends except whoever is on call, so a weekend login deserves a second look. `~/evidence/mail01-logins.log` lists two weeks of successful SSH logins to mail01. Print every line stamped on a Saturday or Sunday, unchanged and in log order. The stamps have no year (it’s 2026); `date +%u` prints the weekday as a number, 1 for Monday through 7 for Sunday.',
    fixture: 'arena-security-logins',
    check: { output: 'reference', looseSpace: true },
    solution: 'while read -r mon day clock rest; do if [ "$(date -d "$mon $day $clock 2026" +%u)" -ge 6 ]; then echo "$mon $day $clock $rest"; fi; done < ~/evidence/mail01-logins.log',
    hints: [
      'Read the log a line at a time and split off the stamp: `while read -r mon day clock rest; do …; done < ~/evidence/mail01-logins.log`.',
      '`date -d "$mon $day $clock 2026" +%u` is 6 or 7 at the weekend. Test it with `[ … -ge 6 ]` and echo the line back.',
      '`while read -r mon day clock rest; do if [ "$(date -d "$mon $day $clock 2026" +%u)" -ge 6 ]; then echo "$mon $day $clock $rest"; fi; done < ~/evidence/mail01-logins.log`',
    ],
    xp: 70,
  },
  {
    id: 'security-first-fifteen',
    title: 'The First Fifteen Minutes',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 17,
    md: 'Mara wants every outbound connection web01 made in the first fifteen minutes after the intruder got in. Take the time of the `Accepted password` line in `~/evidence/web01-auth.log`, then print the lines of `~/evidence/web01-egress.log` from that second up to, but not including, fifteen minutes later. The auth stamps have no year (it’s 2026); the egress log uses ISO stamps, which compare correctly as text.',
    fixture: 'arena-security-breach',
    check: { output: 'reference' },
    solution: `s=$(grep 'Accepted password' ~/evidence/web01-auth.log | awk '{print $1, $2, $3}')
t=$(date -d "$s 2026" +%s)
a=$(date -u -d @$t '+%F %T')
b=$(date -u -d @$((t + 900)) '+%F %T')
awk -v a="$a" -v b="$b" '$0 >= a && $0 < b' ~/evidence/web01-egress.log`,
    hints: [
      "Start: `s=$(grep 'Accepted password' ~/evidence/web01-auth.log | awk '{print $1, $2, $3}')` is the stamp; `date -d \"$s 2026\" +%s` turns it into epoch seconds.",
      "End: add 900 seconds and convert both moments back with `date -u -d @EPOCH '+%F %T'`. Print them, then keep the window with `awk '$0 >= \"START\" && $0 < \"END\"' ~/evidence/web01-egress.log`.",
      "With `t` holding the start in epoch seconds: `a=$(date -u -d @$t '+%F %T'); b=$(date -u -d @$((t + 900)) '+%F %T'); awk -v a=\"$a\" -v b=\"$b\" '$0 >= a && $0 < b' ~/evidence/web01-egress.log` (`awk -v name=value` hands a shell value to awk).",
    ],
    xp: 120,
  },
  {
    id: 'security-shared-uid',
    title: 'Two Names, One User',
    topic: TOPIC,
    difficulty: 'easy',
    unlockDay: 18,
    md: 'Linux decides who you are by UID, not by name: two accounts with the same UID are the same user to the kernel, which makes a duplicate a quiet place to hide a backdoor. Print every UID that more than one account in `/etc/passwd` uses, one per line, smallest first. `uniq -d` prints one copy of each line that repeats; like `uniq -c`, it needs sorted input.',
    fixture: 'arena-security-passwd',
    check: { output: '0\n1002\n', anyOrder: true },
    solution: 'cut -d: -f3 /etc/passwd | sort -n | uniq -d',
    hints: [
      'The UID is field 3 of `/etc/passwd`: `cut -d: -f3 /etc/passwd`.',
      'Sort the UIDs so repeats sit together, then `uniq -d` keeps only the repeats.',
      '`cut -d: -f3 /etc/passwd | sort -n | uniq -d`',
    ],
    xp: 40,
  },
  {
    id: 'security-suid-allowlist',
    title: 'Off the List',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 18,
    md: 'Halden keeps an allow-list of the SUID programs a clean Ubuntu box should have: `~/audit/suid-allow.txt`. Search the whole disk with `sudo`, and print every SUID file that is **not** on the list, one full path per line, in any order. `grep -vxFf LIST` keeps the lines that are not (`-v`) an exact whole-line (`-x`) match for any fixed string (`-F`) in the file LIST (`-f`).',
    fixture: 'arena-security-suid',
    check: { output: '/home/raj/.cache/.bash\n/usr/local/sbin/netcheck\n', anyOrder: true },
    solution: 'sudo find / -type f -perm -4000 | grep -vxFf ~/audit/suid-allow.txt',
    hints: [
      '`sudo find / -type f -perm -4000` lists every SUID file on the machine.',
      'Pipe it into `grep -vxFf ~/audit/suid-allow.txt` to drop the ones on the list.',
      '`sudo find / -type f -perm -4000 | grep -vxFf ~/audit/suid-allow.txt`',
    ],
    xp: 70,
  },
  {
    id: 'security-sweep-script',
    title: 'Sweep Script',
    topic: TOPIC,
    difficulty: 'hard',
    unlockDay: 19,
    md: `Write \`~/bin/sweep.sh DIR\`, a quarantine sweep fit for cron:

- strict mode: \`set -euo pipefail\` under the shebang;
- for each file in DIR, in name order, print \`BAD NAME\` (the name without the folder) if its sha256 is listed in \`~/intel/bad.sha256\`; names may contain spaces;
- finish with \`checked N, bad M\`, then exit 1 if anything was bad, 0 if not;
- run with no DIR, print \`usage: sweep.sh DIR\` to stderr and exit 2.

Mara’s acceptance test runs it three ways. Finish with \`bash ~/bin/check-sweep.sh\`.`,
    fixture: 'arena-security-sweep',
    check: {
      output: 'BAD invoice-0311.pdf\nBAD march payroll.xlsm\nchecked 4, bad 2\nexit 1\nchecked 2, bad 0\nexit 0\nexit 2\n',
      fs: [{ path: '~/bin/sweep.sh', contains: 'set -euo pipefail' }],
    },
    solution: `cat > ~/bin/sweep.sh <<'EOF'\n${SWEEP_SH}EOF\nbash ~/bin/check-sweep.sh`,
    hints: [
      'Guard first: `dir=${1:-}` keeps `set -u` quiet when there is no argument; then `if [ -z "$dir" ]; then echo "usage: sweep.sh DIR" >&2; exit 2; fi`.',
      "Loop with `for f in \"$dir\"/*`, hash with `sha256sum \"$f\" | awk '{print $1}'`, test with `grep -qx \"$hash\" ~/intel/bad.sha256`, and print `${f##*/}`. Count with `bad=$((bad + 1))`: under `set -e`, `((bad++))` from 0 stops the script.",
      'End with `if [ "$bad" -gt 0 ]; then exit 1; fi`. A bare `[ "$bad" -gt 0 ] && exit 1` as the last line leaves the script with status 1 even when nothing was bad.',
    ],
    xp: 120,
  },
  {
    id: 'security-package-drift',
    title: 'Package Drift',
    topic: TOPIC,
    difficulty: 'medium',
    unlockDay: 20,
    md: 'Every Ubuntu package leaves a vendor baseline behind: `/var/lib/dpkg/info/PACKAGE.md5sums`, one `md5  path` line per file it installed, with paths relative to `/`, so `md5sum -c` only finds them when you run it from `/`. Check every `.md5sums` list in that folder. Missing files are noise here (this image strips docs and man pages), so print only the files whose **content** changed, as absolute paths (`/usr/…`), one per line, in any order. An intruder with root can rewrite these lists too, which is why Halden also keeps its own baseline off the box.',
    fixture: 'arena-security-dpkg',
    check: { output: '/usr/lib/x86_64-linux-gnu/security/pam_unix.so\n/usr/sbin/sshd\n', anyOrder: true },
    solution: "cd / && md5sum -c /var/lib/dpkg/info/*.md5sums 2>/dev/null | grep ': FAILED$' | awk -F: '{print \"/\" $1}'",
    hints: [
      '`cd / && md5sum -c /var/lib/dpkg/info/*.md5sums` and read the lines that aren’t `OK`.',
      'A changed file ends in `: FAILED`; a missing one says `FAILED open or read`. `2>/dev/null` hides the complaints and `grep \': FAILED$\'` keeps the changes. Then put a `/` in front of each path.',
      "`cd / && md5sum -c /var/lib/dpkg/info/*.md5sums 2>/dev/null | grep ': FAILED$' | awk -F: '{print \"/\" $1}'`",
    ],
    xp: 70,
  },
];
