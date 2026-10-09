import { defineFixture } from '../fixtures';
import { dir, home, homeDir, put } from '../fixtures/base';
import { apacheTime, STORY_END } from '../fixtures/gen';
import type { Challenge } from '../types';

// Arena: Reading text & grep (days 4–5, 13). See docs/CONTENT_GUIDE.md.
// Every challenge has its own small fixture, so nothing here depends on mission files.

const LOGS_MTIME = STORY_END;

// ------------------------------------------------------------------ web02 access log, buried in health checks

const LB_IP = '10.20.0.40';
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64)';
const SCRIPT_UA = 'python-requests/2.31.0';
/** [seconds after 09:00, client, request, status, bytes, user agent] — never on a multiple of 15 s. */
const WEB_REQUESTS: [number, string, string, number, number, string][] = [
  [14, '192.0.2.14', 'GET / HTTP/1.1', 200, 5120, BROWSER],
  [47, '192.0.2.14', 'GET /assets/site.css HTTP/1.1', 200, 2210, BROWSER],
  [133, '198.51.100.14', 'GET /portal/login HTTP/1.1', 200, 3307, BROWSER],
  [161, '198.51.100.14', 'POST /portal/login HTTP/1.1', 302, 0, BROWSER],
  [176, '198.51.100.14', 'GET /portal/invoices HTTP/1.1', 200, 18422, BROWSER],
  [401, '203.0.113.80', 'GET /.env HTTP/1.1', 404, 196, SCRIPT_UA],
  [403, '203.0.113.80', 'GET /wp-login.php HTTP/1.1', 404, 196, SCRIPT_UA],
  [406, '203.0.113.80', 'GET /server-status HTTP/1.1', 403, 199, SCRIPT_UA],
  [512, '192.0.2.150', 'GET /about.html HTTP/1.1', 200, 4410, BROWSER],
  [644, '192.0.2.14', 'GET /contact.html HTTP/1.1', 200, 3982, BROWSER],
  [781, '198.51.100.14', 'GET /portal/logout HTTP/1.1', 302, 0, BROWSER],
  [1093, '192.0.2.33', 'GET /careers.html HTTP/1.1', 200, 6120, BROWSER],
  [1094, '192.0.2.33', 'GET /assets/logo.png HTTP/1.1', 200, 15873, BROWSER],
];

function web02Access(): string {
  const start = Date.UTC(2026, 2, 14, 9, 0, 0);
  const ev: [number, string][] = [];
  for (let s = 0; s < 1200; s += 15) ev.push([s, `${LB_IP} - - [${apacheTime(start + s * 1000)}] "GET /healthz HTTP/1.1" 200 2 "-" "lb-healthcheck/1.0"`]);
  for (const [s, ip, req, status, bytes, ua] of WEB_REQUESTS) ev.push([s, `${ip} - - [${apacheTime(start + s * 1000)}] "${req}" ${status} ${bytes} "-" "${ua}"`]);
  ev.sort((a, b) => a[0] - b[0]);
  return ev.map((e) => e[1]).join('\n') + '\n';
}

defineFixture('arena-text-web', (vfs) => {
  home(vfs, 'logs/access.log', web02Access(), 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ web01 firewall log: one address and its lookalikes

const FW_LOG = `Mar 14 03:12:07 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.7 DST=10.20.0.21 PROTO=TCP SPT=51234 DPT=22
Mar 14 03:12:09 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.70 DST=10.20.0.21 PROTO=TCP SPT=40112 DPT=3389
Mar 14 03:12:15 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.7 DST=10.20.0.21 PROTO=TCP SPT=51240 DPT=23
Mar 14 03:13:02 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.71 DST=10.20.0.21 PROTO=TCP SPT=33861 DPT=445
Mar 14 03:14:40 web01 sshd[2210]: Connection closed by 198.51.100.7 port 51298 [preauth]
Mar 14 03:15:00 web01 fail2ban.actions[870]: NOTICE [sshd] Ban 198.51.100.7
Mar 14 03:15:31 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.70 DST=10.20.0.21 PROTO=TCP SPT=40150 DPT=3389
Mar 14 03:18:44 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.75 DST=10.20.0.21 PROTO=UDP SPT=5353 DPT=161
Mar 14 03:20:12 web01 sshd[2241]: Connection closed by 198.51.100.71 port 33990 [preauth]
Mar 14 03:25:00 web01 fail2ban.actions[870]: NOTICE [sshd] Ban 198.51.100.71
Mar 14 03:41:09 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=10.20.0.15 DST=10.20.0.21 PROTO=TCP SPT=50522 DPT=22
Mar 14 03:45:00 web01 fail2ban.actions[870]: NOTICE [sshd] Unban 198.51.100.7
Mar 14 03:45:12 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.70 DST=10.20.0.21 PROTO=TCP SPT=40188 DPT=3389
Mar 14 03:47:33 web01 sshd[2290]: Failed password for root from 198.51.100.7 port 51410 ssh2
Mar 14 03:47:36 web01 sshd[2290]: Failed password for root from 198.51.100.7 port 51410 ssh2
Mar 14 03:52:10 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.7 DST=10.20.0.21 PROTO=TCP SPT=51502 DPT=3306
Mar 14 03:55:00 web01 fail2ban.actions[870]: NOTICE [sshd] Unban 198.51.100.71
`;

defineFixture('arena-text-fw', (vfs) => {
  home(vfs, 'logs/fw.log', FW_LOG, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ customer portal app log with CRITICAL lines

const PORTAL_LOG = `2026-03-13 22:58:01 INFO  GET /portal/ from 192.0.2.14
2026-03-13 22:58:40 INFO  login ok user=jlee from 192.0.2.14
2026-03-13 23:02:13 INFO  GET /portal/invoices from 192.0.2.14
2026-03-13 23:05:52 WARN  upload size 4.1MB close to limit from 203.0.113.80
2026-03-13 23:05:53 INFO  upload stored as uploads/invoice-0313.pdf
2026-03-13 23:11:09 INFO  GET /portal/help from 198.51.100.14
2026-03-13 23:14:30 WARN  extension check skipped for upload from 203.0.113.80
2026-03-13 23:14:31 INFO  upload stored as uploads/avatar.php
2026-03-13 23:14:32 CRITICAL scanner flagged uploads/avatar.php: webshell signature (training sample)
2026-03-13 23:20:00 INFO  scheduled cleanup finished
2026-03-13 23:26:44 INFO  GET /portal/ from 192.0.2.33
2026-03-13 23:39:51 WARN  failed login for user=admin from 192.0.2.150
2026-03-13 23:40:02 WARN  failed login for user=admin from 192.0.2.150
2026-03-13 23:40:15 WARN  5 failed logins for user=admin, locking account
2026-03-13 23:40:15 CRITICAL privileged account admin locked out
2026-03-13 23:40:16 CRITICAL page sent to on-call analyst
2026-03-13 23:52:30 INFO  GET /portal/status from 10.20.0.15
2026-03-13 23:58:02 INFO  login ok user=mara from 10.20.0.8
2026-03-14 00:01:12 INFO  config reloaded by mara
2026-03-14 00:03:40 WARN  certificate for portal.halden.example expires in 9 days
2026-03-14 00:10:05 INFO  GET /portal/ from 192.0.2.14
2026-03-14 00:12:47 WARN  disk /srv at 91%
2026-03-14 00:16:20 INFO  GET /portal/invoices from 192.0.2.14
2026-03-14 00:19:03 CRITICAL disk /srv at 97%, uploads paused
2026-03-14 00:25:00 INFO  scheduled cleanup finished
2026-03-14 00:31:44 INFO  GET /portal/ from 198.51.100.14
`;

defineFixture('arena-text-portal', (vfs) => {
  home(vfs, 'logs/portal.log', PORTAL_LOG, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ two logs for one evidence file

const SUSPECT_IP = '198.51.100.91';

const VPN_LOG = `Mar 13 21:02:11 vpn01 vpnd[812]: connect from 10.20.0.8 user=mara
Mar 13 21:02:12 vpn01 vpnd[812]: tunnel up user=mara assigned 10.20.0.201
Mar 13 21:40:37 vpn01 vpnd[812]: auth failed for user=tpark from 198.51.100.91
Mar 13 21:40:52 vpn01 vpnd[812]: auth failed for user=tpark from 198.51.100.91
Mar 13 21:52:19 vpn01 vpnd[812]: connect from 192.0.2.33 user=jlee
Mar 13 21:52:20 vpn01 vpnd[812]: tunnel up user=jlee assigned 10.20.0.202
Mar 13 22:15:44 vpn01 vpnd[812]: auth failed for user=svc-print from 198.51.100.91
Mar 13 22:31:02 vpn01 vpnd[812]: tunnel down user=mara after 88m
Mar 13 23:05:10 vpn01 vpnd[812]: tunnel down user=jlee after 72m
`;

const MAIL_LOG = `Mar 13 20:55:02 mail01 smtpd[1440]: connect from mx.partner.example[192.0.2.25]
Mar 13 20:55:03 mail01 smtpd[1440]: 4F2A1C: message accepted from <billing@partner.example>
Mar 13 21:12:40 mail01 smtpd[1440]: connect from unknown[198.51.100.91]
Mar 13 21:12:41 mail01 smtpd[1440]: NOQUEUE: reject: RCPT from unknown[198.51.100.91]: 554 Relay access denied
Mar 13 21:30:18 mail01 smtpd[1440]: connect from mx.partner.example[192.0.2.25]
Mar 13 21:30:19 mail01 smtpd[1440]: 4F2B07: message accepted from <news@partner.example>
Mar 13 22:47:55 mail01 smtpd[1440]: disconnect from mx.partner.example[192.0.2.25]
`;

const EVIDENCE = [VPN_LOG, MAIL_LOG].flatMap((log) => log.split('\n').filter((l) => l.includes(SUSPECT_IP))).join('\n') + '\n';

defineFixture('arena-text-evidence', (vfs) => {
  home(vfs, 'logs/vpn.log', VPN_LOG, 0o644, LOGS_MTIME);
  home(vfs, 'logs/mail.log', MAIL_LOG, 0o644, LOGS_MTIME);
  homeDir(vfs, 'evidence');
});

// ------------------------------------------------------------------ billing app log: timeouts in three spellings

const BILLING_ROUTINE = ['request served in 38ms', 'health check ok', 'cache refreshed', 'queue drained', 'invoice job finished', 'connection pool at 14/50'];
/** Lines 0–23 are older; the last 40 lines are 24–63. */
const BILLING_EVENTS: Record<number, string> = {
  5: 'ERROR upstream timeout after 30s (payments-api)',
  9: 'WARN  Timeout talking to cache, serving stale copy',
  14: 'ERROR TIMEOUT waiting for db01:5432',
  20: 'WARN  client request timed out after 60s',
  27: 'ERROR upstream timeout after 30s (payments-api)',
  33: 'WARN  client request timed out after 60s',
  38: 'ERROR TIMEOUT waiting for db01:5432',
  44: 'WARN  Timeout talking to cache, serving stale copy',
  51: 'ERROR pool exhausted: Timeout acquiring connection',
  58: 'ERROR upstream timeout after 30s (payments-api)',
};

function billingLog(): string {
  const out: string[] = [];
  let t = Date.UTC(2026, 2, 14, 6, 0, 0);
  for (let i = 0; i < 64; i++) {
    t += 20000 + ((i * 37) % 11) * 5000;
    const stamp = new Date(t).toISOString().replace('T', ' ').slice(0, 19);
    out.push(`${stamp} ${BILLING_EVENTS[i] ?? 'INFO  ' + BILLING_ROUTINE[i % BILLING_ROUTINE.length]}`);
  }
  return out.join('\n') + '\n';
}

defineFixture('arena-text-billing', (vfs) => {
  home(vfs, 'logs/billing.log', billingLog(), 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ nightly backup runs between marker lines

const BACKUP_LOG = `=== run 2026-03-09 02:30 ===
02:30:01 start: nightly backup of db01 to the backup store
02:30:04 snapshot created: db01-0309.dump (2.1G)
02:41:52 upload ok: 2.1G in 11m48s
02:41:53 retention: removed db01-0302.dump
02:41:53 finished: OK
=== run 2026-03-10 02:30 ===
02:30:01 start: nightly backup of db01 to the backup store
02:30:05 snapshot created: db01-0310.dump (2.1G)
02:42:30 upload ok: 2.1G in 12m25s
02:42:31 retention: removed db01-0303.dump
02:42:31 finished: OK
=== run 2026-03-11 02:30 ===
02:30:01 start: nightly backup of db01 to the backup store
02:30:04 snapshot created: db01-0311.dump (2.2G)
02:31:10 warning: upload slow, 310 KB/s
02:44:02 upload ok: 2.2G in 13m57s
02:44:03 retention: removed db01-0304.dump
02:44:03 finished: OK
=== run 2026-03-12 02:30 ===
02:30:01 start: nightly backup of db01 to the backup store
02:30:04 snapshot created: db01-0312.dump (2.2G)
02:33:17 warning: upload slow, 41 KB/s
02:39:50 error: connection to backup store reset
02:39:51 retry 1/3 in 60s
02:40:51 error: connection to backup store reset
02:40:52 retry 2/3 in 60s
02:41:52 error: connection to backup store reset
02:41:53 giving up after 3 retries
02:41:53 retention: skipped (no new upload)
02:41:53 finished: FAILED
=== run 2026-03-13 02:30 ===
02:30:01 start: nightly backup of db01 to the backup store
02:30:04 snapshot created: db01-0313.dump (2.2G)
02:30:05 note: previous run failed, uploading two snapshots
02:52:10 upload ok: 4.4G in 22m05s
02:52:11 retention: removed db01-0305.dump
02:52:11 finished: OK
=== run 2026-03-14 02:30 ===
02:30:01 start: nightly backup of db01 to the backup store
02:30:04 snapshot created: db01-0314.dump (2.2G)
02:42:40 upload ok: 2.2G in 12m36s
02:42:41 retention: removed db01-0306.dump
02:42:41 finished: OK
`;

defineFixture('arena-text-backup', (vfs) => {
  home(vfs, 'logs/backup.log', BACKUP_LOG, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ /etc/halden: service configs, a few root-only

defineFixture('arena-text-configs', (vfs) => {
  const old = Date.UTC(2026, 1, 2, 10, 0, 0);
  const conf = (path: string, content: string, mode = 0o644) => put(vfs, '/etc/halden/' + path, content, { mode, mtime: old });
  conf('README', 'Halden service configs. Owners: platform team. Change via ticket only.\n');
  conf('portal/app.conf', '# customer portal\nlisten = 0.0.0.0:8080\ndb_host = db01.halden.internal\ndb_name = portal\n');
  conf('portal/cache.conf', 'cache_host = 127.0.0.1\ncache_ttl = 300\n');
  conf('portal/sites/main.conf', 'server_name portal.halden.example\nupstream_app 127.0.0.1:8080\nupstream_db db01:5432\n');
  conf('portal/legacy.conf', '# retired 2025, kept for reference\nlisten = 0.0.0.0:8081\n', 0o600);
  conf('backup/targets.conf', '# host     address      schedule\ntarget web01 10.20.0.21 nightly\ntarget db01 10.20.0.22 nightly\ntarget mail01 10.20.0.30 weekly\n');
  conf('backup/retention.conf', 'keep_days = 14\nkeep_weekly = 8\n');
  conf('monitoring/hosts.conf', 'web01 10.20.0.21\nweb02 10.20.0.23\ndb01 10.20.0.22\nmail01 10.20.0.30\n');
  conf('monitoring/alerts.conf', 'notify = oncall@halden.example\ndisk_warn = 85\ndisk_crit = 95\n');
  conf('reports/weekly.conf', 'source = db02.halden.internal\nsend_to = mara@halden.example\n');
  conf('secrets/tokens.env', 'REPORT_TOKEN=placeholder-not-real\n', 0o600);
  dir(vfs, '/etc/halden/secrets', { mode: 0o700, mtime: old });
});

// ------------------------------------------------------------------ mail01 audit: passwd copy and sshd_config

const MAIL01_PASSWD = `root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
mail:x:8:8:mail:/var/mail:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/bin/sh
backup:x:34:34:backup:/var/backups:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
sshd:x:105:65534::/run/sshd:/usr/sbin/nologin
smtpd:x:110:116::/var/spool/smtpd:/bin/false
mara:x:1001:1001:Mara Okafor,,,:/home/mara:/bin/bash
raj:x:1002:1002:Raj Menon,,,:/home/raj:/usr/bin/zsh
ashley:x:1003:1003:Ashley Shaw (shared mailbox),,,:/home/ashley:/usr/sbin/nologin
svc-relay:x:998:998:relay service:/srv/relay:/bin/bash
`;

/** Built from an array so the whitespace-only lines keep their spaces. */
const MAIL01_SSHD = [
  '# Halden baseline for mail01 -- /etc/ssh/sshd_config',
  '# Lines starting with # are comments.',
  '',
  'Port 22',
  '#Port 2222',
  'ListenAddress 10.20.0.30',
  '',
  '    # Authentication',
  'PermitRootLogin yes',
  '#PermitRootLogin prohibit-password',
  'PasswordAuthentication yes',
  'PubkeyAuthentication yes',
  '   ',
  'MaxAuthTries 10',
  '    #MaxAuthTries 3',
  'LoginGraceTime 2m',
  '',
  '# Forwarding',
  'X11Forwarding yes',
  'AllowTcpForwarding no',
  '  ',
  '    # Logging',
  'LogLevel INFO',
  'SyslogFacility AUTH',
  '',
  '# Who may log in',
  'AllowUsers mara raj svc-relay',
  'Subsystem sftp internal-sftp',
  '',
].join('\n');

defineFixture('arena-text-audit', (vfs) => {
  home(vfs, 'audit/mail01.passwd', MAIL01_PASSWD, 0o644, LOGS_MTIME);
  home(vfs, 'audit/sshd_config', MAIL01_SSHD, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ partner advisory with three kinds of hash

// The hashes are of harmless strings ("training sample 1" …), not of any real file.
const ADVISORY = `PARTNER ADVISORY PA-2026-031                                  TLP:AMBER
From: cert.partner.example                       Date: 12 Mar 2026

Summary
A phishing campaign is sending fake invoices. The attached ZIP holds a
script that fetches a loader, which then pulls a second stage. Block the
hashes below at the mail gateway and on endpoints.

Files
  invoice-0313.zip   md5    f852f58dc781d06a0b7bd826b076b4b3
                     sha1   721fc5a6867cb06afc395161bbe00f6fe0a79f84
                     sha256 f21cde96e4bb4a8cad4af28c413d661299678de95f4bb19b1f68e3fda2004a44
  invoice.js         md5    17b9e59d389cfff2db90b2a1c2e2c660
  loader.dll         sha256=d9909a5162629a4dc38e76c8c6ffef4d43c478866fc36b2efc0216181f3b3f22
                     md5=e05c7ea19797a6f8104a679a2e981596
  stage2.bin         sha1:2c94f549e4c0757312e09fe2ba222dc2a9762ed8
                     sha256:c6a3a5f94e07f6df4f24b067a03627e065bc64f0962dae60b59b8ac2b33db07c
                     md5:8df579d10955d2f18878b82a5933d1ab

Notes
Older feeds list the loader by MD5 only (e05c7ea19797a6f8104a679a2e981596).
Contact the partner CERT desk before sharing outside your organisation.
`;

defineFixture('arena-text-intel', (vfs) => {
  home(vfs, 'intel/advisory.txt', ADVISORY, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ mail01 auth log across midnight

const MAIL01_AUTH = `Mar 12 23:31:10 mail01 sshd[3001]: Accepted publickey for mara from 10.20.0.8 port 50110 ssh2
Mar 12 23:47:22 mail01 sshd[3014]: Invalid user test from 192.0.2.150 port 41022
Mar 12 23:58:40 mail01 sshd[3001]: pam_unix(sshd:session): session closed for user mara
Mar 13 00:05:01 mail01 CRON[3101]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 13 00:12:31 mail01 sshd[3110]: Invalid user admin from 192.0.2.150 port 41380
Mar 13 09:14:02 mail01 sshd[3540]: Accepted publickey for raj from 10.20.0.12 port 51220 ssh2
Mar 13 17:40:55 mail01 sshd[3540]: pam_unix(sshd:session): session closed for user raj
Mar 13 23:38:15 mail01 sshd[4190]: Accepted publickey for mara from 10.20.0.8 port 50322 ssh2
Mar 13 23:44:59 mail01 sudo:     mara : TTY=pts/0 ; PWD=/home/mara ; USER=root ; COMMAND=/usr/bin/cp /etc/smtpd.conf /root/smtpd.conf.bak
Mar 13 23:45:00 mail01 sudo:     mara : TTY=pts/0 ; PWD=/home/mara ; USER=root ; COMMAND=/usr/bin/apt upgrade -y
Mar 13 23:49:37 mail01 sshd[4230]: Invalid user oracle from 203.0.113.99 port 40222
Mar 13 23:49:39 mail01 sshd[4230]: Failed password for invalid user oracle from 203.0.113.99 port 40222 ssh2
Mar 13 23:52:10 mail01 sudo:     mara : TTY=pts/0 ; PWD=/home/mara ; USER=root ; COMMAND=/usr/bin/systemctl restart smtpd
Mar 13 23:56:48 mail01 sshd[4255]: Failed password for svc-relay from 203.0.113.99 port 40301 ssh2
Mar 13 23:58:30 mail01 sshd[4262]: Accepted publickey for raj from 10.20.0.12 port 51388 ssh2
Mar 14 00:02:13 mail01 sudo:      raj : user NOT in sudoers ; TTY=pts/1 ; PWD=/home/raj ; USER=root ; COMMAND=/usr/bin/tail /var/log/mail.log
Mar 14 00:05:01 mail01 CRON[4300]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)
Mar 14 00:11:20 mail01 sshd[4290]: Failed password for svc-relay from 203.0.113.99 port 40388 ssh2
Mar 14 00:14:59 mail01 sudo:     mara : TTY=pts/0 ; PWD=/home/mara ; USER=root ; COMMAND=/usr/bin/systemctl status smtpd
Mar 14 00:15:00 mail01 sshd[4190]: pam_unix(sshd:session): session closed for user mara
Mar 14 00:19:30 mail01 sshd[4330]: Invalid user test from 203.0.113.99 port 40420
Mar 14 00:38:12 mail01 sshd[4340]: Accepted publickey for raj from 10.20.0.12 port 50740 ssh2
`;

defineFixture('arena-text-window', (vfs) => {
  home(vfs, 'logs/mail01-auth.log', MAIL01_AUTH, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ challenges

export const challenges: Challenge[] = [
  {
    id: 'text-health-noise',
    title: 'Signal Under the Noise',
    topic: 'Reading text & grep',
    difficulty: 'easy',
    unlockDay: 4,
    md: 'Halden’s load balancer (`10.20.0.40`) asks web02 for `/healthz` every 15 seconds, and those checks bury the real traffic in `~/logs/access.log`. How many requests are left once you ignore every line containing `/healthz`? Print just the number.',
    fixture: 'arena-text-web',
    check: { output: 'reference' },
    solution: 'grep -vc /healthz ~/logs/access.log',
    hints: [
      'You want the lines that do **not** match, and then a count of them.',
      '`-v` inverts the match and `-c` counts; they combine into `-vc`.',
      '`grep -vc /healthz ~/logs/access.log`',
    ],
    xp: 40,
  },
  {
    id: 'text-exact-ip',
    title: 'One Address, Not Four',
    topic: 'Reading text & grep',
    difficulty: 'medium',
    unlockDay: 4,
    md: 'The firewall team wants to know how many lines of `~/logs/fw.log` involve **`198.51.100.7`**, that exact address. The lookalikes `198.51.100.70`, `.71` and `.75` belong to someone else, and a plain `grep` counts them too. Print just the number.\n\nNew switch: **`grep -w`** matches whole words only, so a match can’t have a letter, digit or underscore right before or after it.',
    fixture: 'arena-text-fw',
    check: { output: 'reference' },
    solution: 'grep -cw 198.51.100.7 ~/logs/fw.log',
    hints: [
      'Run `grep 198.51.100.7 ~/logs/fw.log` first and read what comes back: `198.51.100.70` contains `198.51.100.7`.',
      'A trailing space in the pattern misses the lines where the address is the last thing on the line. Let grep check the edges for you.',
      '`grep -cw 198.51.100.7 ~/logs/fw.log`',
    ],
    xp: 70,
  },
  {
    id: 'text-before-critical',
    title: 'What Came Before',
    topic: 'Reading text & grep',
    difficulty: 'medium',
    unlockDay: 4,
    md: 'Every `CRITICAL` in `~/logs/portal.log` has a story, and it’s usually in the lines just above it. Show each `CRITICAL` line together with the **2 lines before it**.\n\nNew switch: **`grep -B N`** prints N lines of context **B**efore each match (`-A N` prints them **A**fter). When two groups don’t touch, grep puts a `--` line between them, and that’s part of the expected output.',
    fixture: 'arena-text-portal',
    check: { output: 'reference' },
    solution: 'grep -B 2 CRITICAL ~/logs/portal.log',
    hints: [
      'This is one `grep` with one extra option.',
      '`-B 2` means “and the 2 lines before each match”.',
      '`grep -B 2 CRITICAL ~/logs/portal.log`',
    ],
    xp: 70,
  },
  {
    id: 'text-evidence-file',
    title: 'Evidence Bundle',
    topic: 'Reading text & grep',
    difficulty: 'easy',
    unlockDay: 5,
    md: '`198.51.100.91` tried VPN accounts last night, then knocked on the mail server. Build one evidence file, `~/evidence/198.51.100.91.txt`, holding every line that mentions it: first the matching lines from `~/logs/vpn.log`, then those from `~/logs/mail.log`, exactly as they appear in the logs (no file names in front). Two commands are fine.',
    fixture: 'arena-text-evidence',
    check: { fs: [{ path: '~/evidence/198.51.100.91.txt', content: EVIDENCE }] },
    solution: 'grep 198.51.100.91 ~/logs/vpn.log > ~/evidence/198.51.100.91.txt\ngrep 198.51.100.91 ~/logs/mail.log >> ~/evidence/198.51.100.91.txt',
    hints: [
      '`>` creates (or empties) a file; `>>` adds to the end of it.',
      'One `grep … > FILE` for the VPN log, then one `grep … >> FILE` for the mail log. Using `>` twice would wipe out the VPN lines.',
      '`grep 198.51.100.91 ~/logs/vpn.log > ~/evidence/198.51.100.91.txt`, then the same for `~/logs/mail.log` with `>>`.',
    ],
    xp: 40,
  },
  {
    id: 'text-still-happening',
    title: 'Still Happening?',
    topic: 'Reading text & grep',
    difficulty: 'easy',
    unlockDay: 5,
    md: 'The billing app had a rough night, but is it still timing out? Look only at the **last 40 lines** of `~/logs/billing.log` and count the lines that mention `timeout` in any capitalisation (`timeout`, `Timeout`, `TIMEOUT`). Lines that say “timed out” don’t count. Print just the number.',
    fixture: 'arena-text-billing',
    check: { output: 'reference' },
    solution: 'tail -n 40 ~/logs/billing.log | grep -ci timeout',
    hints: [
      'Two jobs: cut the log down to its last 40 lines, then count. A pipe joins them.',
      '`tail -n 40 FILE | grep …`, and grep has to ignore case **and** count.',
      '`tail -n 40 ~/logs/billing.log | grep -ci timeout`',
    ],
    xp: 40,
  },
  {
    id: 'text-one-run',
    title: 'One Night Only',
    topic: 'Reading text & grep',
    difficulty: 'medium',
    unlockDay: 5,
    md: '`~/logs/backup.log` holds a week of nightly backups, each run starting with a marker line like `=== run 2026-03-09 02:30 ===`. The run on **12 March** failed. Print that run alone: from its marker line down to the line just before the next marker, and nothing else. `grep -n` tells you where the markers are; `head` and `tail` can cut out the slice.',
    fixture: 'arena-text-backup',
    check: { output: 'reference' },
    solution: 'head -n 31 ~/logs/backup.log | tail -n 13',
    hints: [
      '`grep -n "=== run" ~/logs/backup.log` shows the line number of every marker.',
      'If the run covers lines A to B, `head -n B` keeps everything up to B, and `tail -n` then keeps the last B − A + 1 of those.',
      '`head -n 31 ~/logs/backup.log | tail -n 13`',
    ],
    xp: 70,
  },
  {
    id: 'text-config-sweep',
    title: 'Who Still Points at db01?',
    topic: 'Reading text & grep',
    difficulty: 'medium',
    unlockDay: 5,
    md: 'db01 is being retired, so every config that still mentions it has to change first. List the files anywhere under `/etc/halden` that contain `db01`, as full paths starting with `/etc/halden/`, in any order. A few files there are root-only, so throw the “Permission denied” messages away.\n\nTwo new switches: **`grep -r`** searches every file in a folder and its subfolders, and **`grep -l`** prints only the names of the files that match.',
    fixture: 'arena-text-configs',
    check: { output: 'reference', anyOrder: true },
    solution: 'grep -rl db01 /etc/halden 2>/dev/null',
    hints: [
      'The switches combine: `grep -rl PATTERN FOLDER`.',
      'Error messages travel on stream 2. Send them to `/dev/null`.',
      '`grep -rl db01 /etc/halden 2>/dev/null`',
    ],
    xp: 70,
  },
  {
    id: 'text-login-shells',
    title: 'Who Gets a Shell?',
    topic: 'Reading text & grep',
    difficulty: 'easy',
    unlockDay: 13,
    md: 'On a mail server, people get a login shell and service accounts shouldn’t. `~/audit/mail01.passwd` is a copy of mail01’s `/etc/passwd`, where the shell is the last field. Print the **names** of the accounts whose shell ends in `sh` (`/bin/bash`, `/bin/sh`, `/usr/bin/zsh` …), one per line, in file order.',
    fixture: 'arena-text-audit',
    check: { output: 'reference' },
    solution: "grep 'sh$' ~/audit/mail01.passwd | cut -d: -f1",
    hints: [
      '`grep sh` matches far too much: `sshd`, `/home/ashley`, “shared mailbox”. Anchor the pattern to the end of the line.',
      "`$` means “end of line”, so `grep 'sh$'` finds the shells. Then keep the first `:`-separated field with `cut`.",
      "`grep 'sh$' ~/audit/mail01.passwd | cut -d: -f1`",
    ],
    xp: 40,
  },
  {
    id: 'text-live-config',
    title: 'Only What’s Live',
    topic: 'Reading text & grep',
    difficulty: 'medium',
    unlockDay: 13,
    md: 'mail01’s `~/audit/sshd_config` is mostly comments and blank lines. Print only the **live** settings: drop every comment line and every blank line, and keep the rest in order. Careful: some comments are indented, and some “blank” lines hold a few spaces. Then read what’s left: what would you flag?',
    fixture: 'arena-text-audit',
    check: { output: 'reference' },
    solution: "grep -Ev '^ *(#|$)' ~/audit/sshd_config",
    hints: [
      'Two kinds of line to drop, so think `grep -v` with one extended regex that covers both.',
      'A line to drop starts with any number of spaces (` *`), then either `#` or the end of the line: `^ *(#|$)`.',
      "`grep -Ev '^ *(#|$)' ~/audit/sshd_config`",
    ],
    xp: 70,
  },
  {
    id: 'text-md5-only',
    title: 'Thirty-Two, Exactly',
    topic: 'Reading text & grep',
    difficulty: 'hard',
    unlockDay: 13,
    md: 'The partner advisory in `~/intel/advisory.txt` lists MD5, SHA-1 and SHA-256 hashes, and the blocklist team wants only the **MD5s**: runs of exactly 32 hex characters (`0-9`, `a-f`). The trap: `[0-9a-f]{32}` also matches the first 32 characters of every longer hash. Print each MD5 once, sorted.',
    fixture: 'arena-text-intel',
    check: { output: 'reference' },
    solution: "grep -Eow '[0-9a-f]{32}' ~/intel/advisory.txt | sort -u",
    hints: [
      "Run `grep -Eo '[0-9a-f]{32}' ~/intel/advisory.txt` and compare with the file: the SHA-1 and SHA-256 hashes come back chopped into pieces.",
      'A real MD5 has no letter or digit right before or after it. `grep -w` enforces exactly that kind of edge.',
      "`grep -Eow '[0-9a-f]{32}' ~/intel/advisory.txt | sort -u`",
    ],
    xp: 120,
  },
  {
    id: 'text-change-window',
    title: 'The Change Window',
    topic: 'Reading text & grep',
    difficulty: 'hard',
    unlockDay: 13,
    md: 'A change on mail01 ran from **23:45:00 on 13 March** to **00:14:59 on 14 March**, across midnight. Mara wants every line of `~/logs/mail01-auth.log` logged inside that window, both ends included, in order: nothing from the minutes either side, and nothing from other nights. One `grep -E` with anchors and alternation can do it.',
    fixture: 'arena-text-window',
    check: { output: 'reference' },
    solution: "grep -E '^Mar 13 23:(4[5-9]|5[0-9])|^Mar 14 00:(0[0-9]|1[0-4])' ~/logs/mail01-auth.log",
    hints: [
      'Split the window in two: the end of 13 March (23:45–23:59) and the start of 14 March (00:00–00:14).',
      'Minutes 45–59 are `(4[5-9]|5[0-9])`; minutes 00–14 are `(0[0-9]|1[0-4])`. Anchor each half to its date with `^Mar 13 23:` and `^Mar 14 00:`.',
      "`grep -E '^Mar 13 23:(4[5-9]|5[0-9])|^Mar 14 00:(0[0-9]|1[0-4])' ~/logs/mail01-auth.log`",
    ],
    xp: 120,
  },
];
