import { defineFixture } from '../fixtures';
import { home, homeDir } from '../fixtures/base';
import { apacheTime, STORY_END } from '../fixtures/gen';
import type { Challenge } from '../types';

// Arena: Columns & pipelines (days 5, 11, 14–15). See docs/CONTENT_GUIDE.md.
// Every challenge uses a fixture defined here, so nothing depends on mission files.

const LOGS_MTIME = STORY_END;

// ------------------------------------------------------------------ web01 firewall log, early hours of 14 March

/**
 * Blocked destination ports: 22 ×7, 3389 ×5, 23 ×4, 445 ×3, 3306 ×2, 5900 ×1.
 * Allowed: 443 ×6, internal SSH ×2, web01 → db01 ×2 (so without the BLOCK filter, 443 enters the top 3).
 */
const UFW_LOG = `Mar 14 01:02:11 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.7 DST=10.20.0.21 PROTO=TCP SPT=51234 DPT=22
Mar 14 01:02:14 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.7 DST=10.20.0.21 PROTO=TCP SPT=51236 DPT=23
Mar 14 01:09:40 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=192.0.2.14 DST=10.20.0.21 PROTO=TCP SPT=50311 DPT=443
Mar 14 01:15:40 web01 kernel: [UFW ALLOW] IN= OUT=eth0 SRC=10.20.0.21 DST=10.20.0.22 PROTO=TCP SPT=41822 DPT=5432
Mar 14 01:21:07 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.140 DST=10.20.0.21 PROTO=TCP SPT=40112 DPT=3389
Mar 14 01:21:09 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.140 DST=10.20.0.21 PROTO=TCP SPT=40113 DPT=3389
Mar 14 01:33:52 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=192.0.2.66 DST=10.20.0.21 PROTO=TCP SPT=33861 DPT=445
Mar 14 01:47:05 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=198.51.100.14 DST=10.20.0.21 PROTO=TCP SPT=52004 DPT=443
Mar 14 02:03:18 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.99 DST=10.20.0.21 PROTO=TCP SPT=60122 DPT=22
Mar 14 02:03:21 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.99 DST=10.20.0.21 PROTO=TCP SPT=60124 DPT=22
Mar 14 02:11:44 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.140 DST=10.20.0.21 PROTO=TCP SPT=40188 DPT=3389
Mar 14 02:26:30 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=10.20.0.15 DST=10.20.0.21 PROTO=TCP SPT=50522 DPT=22
Mar 14 02:30:02 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=192.0.2.66 DST=10.20.0.21 PROTO=TCP SPT=33990 DPT=445
Mar 14 02:30:05 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=192.0.2.66 DST=10.20.0.21 PROTO=TCP SPT=33991 DPT=3306
Mar 14 02:44:19 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=192.0.2.33 DST=10.20.0.21 PROTO=TCP SPT=49870 DPT=443
Mar 14 02:58:57 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.7 DST=10.20.0.21 PROTO=TCP SPT=51410 DPT=22
Mar 14 03:05:13 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.23 DST=10.20.0.21 PROTO=TCP SPT=44502 DPT=23
Mar 14 03:05:16 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.23 DST=10.20.0.21 PROTO=TCP SPT=44503 DPT=23
Mar 14 03:12:40 web01 kernel: [UFW ALLOW] IN= OUT=eth0 SRC=10.20.0.21 DST=10.20.0.22 PROTO=TCP SPT=41990 DPT=5432
Mar 14 03:18:22 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.140 DST=10.20.0.21 PROTO=TCP SPT=40230 DPT=3389
Mar 14 03:27:51 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=198.51.100.14 DST=10.20.0.21 PROTO=TCP SPT=52230 DPT=443
Mar 14 03:40:09 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=192.0.2.150 DST=10.20.0.21 PROTO=TCP SPT=38011 DPT=5900
Mar 14 03:52:36 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.99 DST=10.20.0.21 PROTO=TCP SPT=60301 DPT=22
Mar 14 04:04:47 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=192.0.2.66 DST=10.20.0.21 PROTO=TCP SPT=34210 DPT=445
Mar 14 04:13:03 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=192.0.2.14 DST=10.20.0.21 PROTO=TCP SPT=50902 DPT=443
Mar 14 04:21:28 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.23 DST=10.20.0.21 PROTO=TCP SPT=44610 DPT=23
Mar 14 04:29:15 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.140 DST=10.20.0.21 PROTO=TCP SPT=40377 DPT=3389
Mar 14 04:35:58 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=10.20.0.15 DST=10.20.0.21 PROTO=TCP SPT=50740 DPT=22
Mar 14 04:42:10 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.99 DST=10.20.0.21 PROTO=TCP SPT=60455 DPT=3306
Mar 14 04:50:33 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.7 DST=10.20.0.21 PROTO=TCP SPT=51502 DPT=22
Mar 14 04:55:21 web01 kernel: [UFW ALLOW] IN=eth0 OUT= SRC=192.0.2.150 DST=10.20.0.21 PROTO=TCP SPT=38120 DPT=443
Mar 14 04:58:44 web01 kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.99 DST=10.20.0.21 PROTO=TCP SPT=60512 DPT=22
`;

/** What the vendor may see: every 10.20.0.N replaced, two per line on internal-to-internal traffic. */
const UFW_SCRUBBED = UFW_LOG.replace(/10\.20\.0\.[0-9]+/g, 'INTERNAL');

defineFixture('arena-columns-fw', (vfs) => {
  home(vfs, 'logs/ufw.log', UFW_LOG, 0o644, LOGS_MTIME);
  homeDir(vfs, 'outbox');
});

// ------------------------------------------------------------------ process lists for stacking

/** Distinct process names per host. Seen on exactly one host: dovecot, netsvc-agent, postfix, postgres. */
const COMMON = ['cron', 'node_exporter', 'rsyslogd', 'sshd', 'systemd', 'systemd-journald'];
const FLEET: Record<string, string[]> = {
  web01: [...COMMON, 'nginx', 'php-fpm'],
  web02: [...COMMON, 'netsvc-agent', 'nginx', 'php-fpm'],
  db01: [...COMMON, 'postgres', 'rsync'],
  mail01: [...COMMON, 'dovecot', 'postfix'],
  backup01: [...COMMON, 'rsync'],
};

defineFixture('arena-columns-fleet', (vfs) => {
  for (const [host, procs] of Object.entries(FLEET)) home(vfs, `fleet/${host}.txt`, [...procs].sort().join('\n') + '\n', 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ fail2ban ban lists, two nights

/** Both nights: 198.51.100.23, 203.0.113.7, 203.0.113.99. Banned twice on one night only: 198.51.100.140, 198.51.100.200. */
const BANS_FRI = ['203.0.113.7', '198.51.100.23', '198.51.100.140', '203.0.113.7', '192.0.2.66', '198.51.100.23', '203.0.113.99', '198.51.100.140', '203.0.113.7'];
const BANS_SAT = ['198.51.100.200', '203.0.113.99', '192.0.2.150', '198.51.100.23', '198.51.100.200', '203.0.113.99', '203.0.113.7'];

defineFixture('arena-columns-bans', (vfs) => {
  home(vfs, 'bans/fri.txt', BANS_FRI.join('\n') + '\n', 0o644, LOGS_MTIME);
  home(vfs, 'bans/sat.txt', BANS_SAT.join('\n') + '\n', 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ merged intel feeds, mixed case

const DOMAINS = `Northw1nd-Secure.example
files.cdn-share.example
login-halden.example
NORTHW1ND-SECURE.EXAMPLE
Files.CDN-share.example
invoice-portal.example
northw1nd-secure.example
LOGIN-HALDEN.example
update-check.example
FILES.CDN-SHARE.EXAMPLE
Invoice-Portal.example
Update-Check.Example
`;

defineFixture('arena-columns-intel', (vfs) => {
  home(vfs, 'intel/domains.txt', DOMAINS, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ asset inventory and vulnerability scan

const ASSETS = `hostname,ip,owner,role
web01,10.20.0.21,platform,web
db01,10.20.0.22,platform,database
web02,10.20.0.23,platform,web
halden-ws01,10.20.0.15,secops,workstation
mail01,10.20.0.30,it,mail
webmail01,10.20.0.31,it,mail
portal01,10.20.0.25,platform,web
backup01,10.20.0.34,it,backup
mon01,10.20.0.41,platform,monitoring
`;

/** Top five: 10.0, 9.8, 9.1, 8.8, 7.5; the sixth is 7.1. Text sorting would rank 9.8 above 10.0. */
const SCAN = `host,finding,cvss
web01,TLS 1.0 still enabled,5.3
db01,Database port open to every network,9.1
mail01,Open mail relay,7.5
web02,Directory listing on /backup,5.0
portal01,Admin console without MFA,8.8
web01,Outdated SSH server,6.4
db01,Default admin password,10.0
backup01,Backups readable by every user,7.1
web02,Debug mode enabled,6.5
mail01,Weak DKIM key,4.3
portal01,Session cookie without Secure flag,4.7
halden-ws01,Screen lock disabled,2.1
web01,Unpatched web framework (remote code execution),9.8
`;

defineFixture('arena-columns-inventory', (vfs) => {
  home(vfs, 'inventory/assets.csv', ASSETS, 0o644, LOGS_MTIME);
  home(vfs, 'scans/fleet.csv', SCAN, 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ customer portal access log (web02), 14 March

const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64)';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const SCRIPT_UA = 'python-requests/2.31.0';
const SURVEY_UA = 'Mozilla/5.0 (compatible; survey-bot/0.3)';
const SCRAPER = '198.51.100.180';
const SCRAPER_UA = 'Go-http-client/1.1';

/** [HH:MM:SS, client, request, status, bytes, user agent]. No field but the timestamp contains a colon. */
type Req = [string, string, string, number, number, string];

const PORTAL_REQUESTS: Req[] = [
  // 03:47 a noisy scanner: 12 x 404 and one 403
  ...['/.env', '/wp-login.php', '/.git/config', '/server-status', '/backup.zip', '/admin/', '/phpmyadmin/', '/config.php.bak', '/.aws/credentials', '/xmlrpc.php', '/api/v1/users', '/cgi-bin/test.cgi', '/actuator/health'].map(
    (path, i): Req => [`03:47:${String(2 + i * 3).padStart(2, '0')}`, '203.0.113.80', `GET ${path} HTTP/1.1`, path === '/server-status' ? 403 : 404, path === '/server-status' ? 199 : 196, SCRIPT_UA],
  ),
  ['09:02:14', '192.0.2.14', 'GET / HTTP/1.1', 200, 5120, BROWSER],
  ['09:02:15', '192.0.2.14', 'GET /assets/site.css HTTP/1.1', 200, 2210, BROWSER],
  ['09:02:16', '192.0.2.14', 'GET /assets/logo.png HTTP/1.1', 200, 15873, BROWSER],
  ['09:04:51', '192.0.2.14', 'GET /services.html HTTP/1.1', 200, 7342, BROWSER],
  ['09:11:30', '198.51.100.62', 'GET /blog/ HTTP/1.1', 200, 9120, WINDOWS],
  ['09:11:58', '198.51.100.62', 'GET /blog/old-post-2019 HTTP/1.1', 404, 196, WINDOWS],
  ['09:12:20', '198.51.100.62', 'GET /news/2020/patch-notes HTTP/1.1', 404, 196, WINDOWS],
  ['09:13:02', '192.0.2.14', 'GET /blog/phishing-101 HTTP/1.1', 200, 11408, BROWSER],
  ['09:20:44', '192.0.2.33', 'GET /careers.html HTTP/1.1', 200, 6120, BROWSER],
  ['09:21:09', '192.0.2.33', 'GET /media/halden-intro.mp4 HTTP/1.1', 200, 2404118, BROWSER],
  ['09:27:19', '192.0.2.14', 'GET /contact.html HTTP/1.1', 200, 3982, BROWSER],
  ['09:31:40', '198.51.100.62', 'GET /blog/patch-tuesday HTTP/1.1', 200, 8770, WINDOWS],
  ['09:44:12', '192.0.2.33', 'GET /about.html HTTP/1.1', 200, 4410, BROWSER],
  ['09:52:37', '192.0.2.14', 'GET /about.html HTTP/1.1', 200, 4410, BROWSER],
  ['09:58:03', '192.0.2.14', 'GET /careers.html HTTP/1.1', 200, 6120, BROWSER],
  ['10:03:09', '198.51.100.14', 'GET /portal/login HTTP/1.1', 200, 3307, WINDOWS],
  ['10:03:31', '198.51.100.14', 'POST /portal/login HTTP/1.1', 302, 0, WINDOWS],
  ['10:03:32', '198.51.100.14', 'GET /portal/invoices HTTP/1.1', 200, 18422, WINDOWS],
  ['10:04:10', '198.51.100.14', 'GET /portal/invoices/INV-0311.pdf HTTP/1.1', 200, 377045, WINDOWS],
  ['10:04:52', '198.51.100.14', 'GET /portal/invoices/INV-0312.pdf HTTP/1.1', 200, 398112, WINDOWS],
  ['10:05:30', '198.51.100.14', 'GET /portal/invoices/INV-0313.pdf HTTP/1.1', 200, 412880, WINDOWS],
  ['10:09:47', '198.51.100.14', 'GET /portal/logout HTTP/1.1', 302, 0, WINDOWS],
  ['10:17:23', '192.0.2.150', 'GET /.git/config HTTP/1.1', 404, 196, SURVEY_UA],
  ['10:22:41', '192.0.2.150', 'GET /backup.zip HTTP/1.1', 404, 196, SURVEY_UA],
  ['10:26:33', '198.51.100.62', 'GET /downloads/brochure-2021.pdf HTTP/1.1', 404, 196, WINDOWS],
  ['10:26:51', '198.51.100.62', 'GET /downloads/brochure.pdf HTTP/1.1', 404, 196, WINDOWS],
  ['10:27:40', '198.51.100.62', 'GET /services.html HTTP/1.1', 200, 7342, WINDOWS],
  ['10:29:08', '192.0.2.150', 'GET /.env HTTP/1.1', 404, 196, SURVEY_UA],
  ['10:35:56', '192.0.2.150', 'GET /db.sql HTTP/1.1', 404, 196, SURVEY_UA],
  ['10:41:19', '192.0.2.150', 'GET /config.php.bak HTTP/1.1', 404, 196, SURVEY_UA],
  ['11:02:51', '203.0.113.150', 'GET /portal/login HTTP/1.1', 200, 3307, WINDOWS],
  ['11:03:14', '203.0.113.150', 'POST /portal/login HTTP/1.1', 302, 0, WINDOWS],
  ['11:04:02', '203.0.113.150', 'GET /exports/customers-2026-03.csv HTTP/1.1', 200, 4812330, WINDOWS],
  ['11:15:37', '192.0.2.14', 'GET / HTTP/1.1', 200, 5120, BROWSER],
  ['11:15:38', '192.0.2.14', 'GET /blog/ HTTP/1.1', 200, 9120, BROWSER],
];

/**
 * From 02:41 a script pages through the customer API: pages 1–24 succeed (~210 KB each, none as big as an
 * invoice), then pages 25–31 are 404s when it runs past the end. Its total beats the single 4.8 MB export.
 */
function portalLog(): string {
  const day = Date.UTC(2026, 2, 14);
  const at = (hms: string) => {
    const [h, m, s] = hms.split(':').map(Number);
    return day + ((h! * 60 + m!) * 60 + s!) * 1000;
  };
  const ev: [number, string][] = PORTAL_REQUESTS.map(([t, ip, req, status, bytes, ua]) => [at(t), `${ip} - - [${apacheTime(at(t))}] "${req}" ${status} ${bytes} "-" "${ua}"`]);
  const start = at('02:41:07');
  for (let page = 1; page <= 31; page++) {
    const t = start + (page - 1) * 97000;
    const ok = page <= 24;
    ev.push([t, `${SCRAPER} - - [${apacheTime(t)}] "GET /api/v1/customers?page=${page} HTTP/1.1" ${ok ? 200 : 404} ${ok ? 204800 + ((page * 7919) % 10240) : 52} "-" "${SCRAPER_UA}"`]);
  }
  ev.sort((a, b) => a[0] - b[0]);
  return ev.map((e) => e[1]).join('\n') + '\n';
}

defineFixture('arena-columns-web', (vfs) => {
  home(vfs, 'logs/access.log', portalLog(), 0o644, LOGS_MTIME);
});

// ------------------------------------------------------------------ challenges

export const challenges: Challenge[] = [
  {
    id: 'columns-port-knocks',
    title: 'Knocking on Doors',
    topic: 'Columns & pipelines',
    difficulty: 'easy',
    unlockDay: 5,
    md: 'Overnight, web01’s firewall wrote every connection it **blocked** to `~/logs/ufw.log`, along with a few it allowed. Which doors were attackers trying? Count the blocked lines by destination port (the `DPT=` part) and print the **top 3**, busiest first, the way `uniq -c` shows them: lines like `     12 DPT=8080`.',
    fixture: 'arena-columns-fw',
    check: { output: 'reference', looseSpace: true },
    solution: 'grep BLOCK ~/logs/ufw.log | grep -o "DPT=[0-9]*" | sort | uniq -c | sort -rn | head -3',
    hints: [
      'Keep only the `BLOCK` lines first: the allowed traffic would skew the ranking. Then pull out just the port with `grep -o`.',
      '`grep -o "DPT=[0-9]*"` prints only the port part. After that it’s the Day 5 ranking machine: `sort | uniq -c | sort -rn | head -3`.',
      '`grep BLOCK ~/logs/ufw.log | grep -o "DPT=[0-9]*" | sort | uniq -c | sort -rn | head -3`',
    ],
    xp: 40,
  },
  {
    id: 'columns-only-one',
    title: 'The Odd Process Out',
    topic: 'Columns & pipelines',
    difficulty: 'medium',
    unlockDay: 5,
    md: '`~/fleet` holds one file per server, each listing the distinct process names running on it. Analysts call the next move **stacking**: line the hosts up and look at what only one of them runs. Print the process names that appear on **exactly one** server, once each, in sorted order. Then read the list: which one has no business being there?\n\nNew switch: **`uniq -u`** prints only the lines that have no identical neighbour, the ones that occur once.',
    fixture: 'arena-columns-fleet',
    check: { output: 'reference' },
    solution: 'sort ~/fleet/*.txt | uniq -u',
    hints: [
      'Put all five lists into one stream first: `cat ~/fleet/*.txt`, or give `sort` every file at once.',
      'After `sort`, identical names sit next to each other. `uniq -c` shows how many servers run each one; `uniq -u` keeps only the names with no twin.',
      '`sort ~/fleet/*.txt | uniq -u`',
    ],
    xp: 70,
  },
  {
    id: 'columns-repeat-offenders',
    title: 'Back for More',
    topic: 'Columns & pipelines',
    difficulty: 'hard',
    unlockDay: 5,
    md: 'The fail2ban ban lists for Friday and Saturday night are in `~/bans/fri.txt` and `~/bans/sat.txt`: one address per ban, and an address that came back the same night was banned again. Mara wants the **repeat offenders**, the addresses banned on **both** nights. Print each one once, sorted. Several commands are fine.\n\nNew switch: **`uniq -d`** prints one copy of each line that has an identical neighbour. Careful: an address banned twice on Friday alone is not a repeat offender.',
    fixture: 'arena-columns-bans',
    check: { output: 'reference' },
    solution: 'sort -u ~/bans/fri.txt > ~/nights.txt\nsort -u ~/bans/sat.txt >> ~/nights.txt\nsort ~/nights.txt | uniq -d',
    hints: [
      'Try `sort ~/bans/fri.txt ~/bans/sat.txt | uniq -d` and check each address against the two files: some only show up because they were banned twice in one night.',
      'Remove the repeats inside each night first. `sort -u` each file into one scratch file (`>` for the first, `>>` for the second). Now an address appears twice only if both nights banned it.',
      '`sort -u ~/bans/fri.txt > ~/nights.txt`, then `sort -u ~/bans/sat.txt >> ~/nights.txt`, then `sort ~/nights.txt | uniq -d`',
    ],
    xp: 120,
  },
  {
    id: 'columns-domain-case',
    title: 'Same Domain, Shouting',
    topic: 'Columns & pipelines',
    difficulty: 'easy',
    unlockDay: 11,
    md: 'Three intel feeds sent Halden their bad-domain lists, and `~/intel/domains.txt` is the merge. The same domain turns up in different capitals (`Files.CDN-share.example`, `FILES.CDN-SHARE.EXAMPLE` …), but domain names ignore case. Clean it up for the DNS blocklist: print every domain in **lower case**, each **once**, sorted.',
    fixture: 'arena-columns-intel',
    check: { output: 'reference' },
    solution: "tr 'A-Z' 'a-z' < ~/intel/domains.txt | sort -u",
    hints: [
      '`tr` swaps characters one for one, and it takes whole ranges: `A-Z` and `a-z`.',
      'Lower-case first, and then `sort -u` sees the copies as identical. `tr` reads only stdin, so feed it the file with `<`.',
      "`tr 'A-Z' 'a-z' < ~/intel/domains.txt | sort -u`",
    ],
    xp: 40,
  },
  {
    id: 'columns-scrub-internal',
    title: 'Nothing Internal Leaves',
    topic: 'Columns & pipelines',
    difficulty: 'easy',
    unlockDay: 11,
    md: 'web01’s firewall log is going to the vendor’s support desk, and Halden policy says internal addresses never leave the building. Write a copy of `~/logs/ufw.log` to `~/outbox/ufw-vendor.log` in which every internal address (`10.20.0.` and a number) reads `INTERNAL`. Some lines hold two of them. Leave `~/logs/ufw.log` itself untouched: it’s evidence.',
    fixture: 'arena-columns-fw',
    check: {
      fs: [
        { path: '~/outbox/ufw-vendor.log', content: UFW_SCRUBBED },
        { path: '~/logs/ufw.log', content: UFW_LOG },
      ],
    },
    solution: "sed 's/10\\.20\\.0\\.[0-9]*/INTERNAL/g' ~/logs/ufw.log > ~/outbox/ufw-vendor.log",
    hints: [
      '`sed` rewrites lines as they stream past, and `>` catches the result in a new file. Skip `sed -i`: it would change the evidence.',
      'Match an address with `10\\.20\\.0\\.[0-9]*` (the backslashes make the dots literal). Without the `g` flag only the first address on each line changes.',
      "`sed 's/10\\.20\\.0\\.[0-9]*/INTERNAL/g' ~/logs/ufw.log > ~/outbox/ufw-vendor.log`",
    ],
    xp: 40,
  },
  {
    id: 'columns-worst-findings',
    title: 'Worst First',
    topic: 'Columns & pipelines',
    difficulty: 'easy',
    unlockDay: 11,
    md: 'The quarterly vulnerability scan landed in `~/scans/fleet.csv`: a header, then one `host,finding,cvss` line per finding. CVSS scores run from 0.0 to 10.0. Mara wants the **five most severe** findings for Monday’s meeting: print those five lines exactly as they appear in the file, highest score first.',
    fixture: 'arena-columns-inventory',
    check: { output: 'reference' },
    solution: 'sort -t, -k3 -rn ~/scans/fleet.csv | head -5',
    hints: [
      '`sort` can order by a column: `-t,` splits on commas and `-k3` picks the score.',
      'Without `-n`, sort compares text and puts `9.8` above `10.0`. Add `-n` for numbers and `-r` for biggest first, then keep the top five with `head`.',
      '`sort -t, -k3 -rn ~/scans/fleet.csv | head -5`',
    ],
    xp: 40,
  },
  {
    id: 'columns-ip-first',
    title: 'IP First',
    topic: 'Columns & pipelines',
    difficulty: 'medium',
    unlockDay: 11,
    md: 'The web application firewall needs an allowlist of Halden’s **web** servers, and it imports `ip,hostname`: IP first. `~/inventory/assets.csv` has the columns `hostname,ip,owner,role`. Print one `ip,hostname` line for each host whose role is exactly `web`: no header, no spaces.',
    fixture: 'arena-columns-inventory',
    check: { output: 'reference', anyOrder: true },
    solution: "awk -F, '$4 == \"web\" {print $2 \",\" $1}' ~/inventory/assets.csv",
    hints: [
      'Try `cut -d, -f2,1 ~/inventory/assets.csv`: `cut` always prints fields in file order, whatever order you ask for. And a plain `grep web` catches more than web servers.',
      'awk does both jobs: test field 4, then print the fields in any order you like. `print $2, $1` puts a space between them; `print $2 "," $1` puts a comma.',
      "`awk -F, '$4 == \"web\" {print $2 \",\" $1}' ~/inventory/assets.csv`",
    ],
    xp: 70,
  },
  {
    id: 'columns-big-responses',
    title: 'Heavy Lifting',
    topic: 'Columns & pipelines',
    difficulty: 'medium',
    unlockDay: 11,
    md: 'Big responses are where data leaves. In the customer portal’s `~/logs/access.log`, field 10 is the size of each response in bytes. Print the **three largest** responses, biggest first, as `IP URL BYTES`: fields 1, 7 and 10, separated by single spaces.',
    fixture: 'arena-columns-web',
    check: { output: 'reference' },
    solution: "awk '{print $1, $7, $10}' ~/logs/access.log | sort -k3 -rn | head -3",
    hints: [
      "`awk '{print $1, $7, $10}'` builds the three columns. Then sort on the third one.",
      'Sort numerically and in reverse on the bytes column, `sort -k3 -rn` (or sort the raw log with `-k10` before you print), then `head -3`.',
      "`awk '{print $1, $7, $10}' ~/logs/access.log | sort -k3 -rn | head -3`",
    ],
    xp: 70,
  },
  {
    id: 'columns-busy-hours',
    title: 'Hour by Hour',
    topic: 'Columns & pipelines',
    difficulty: 'medium',
    unlockDay: 11,
    md: 'When did the portal’s traffic come? Count the requests in `~/logs/access.log` **per hour** and print one line per hour, in hour order, the way `uniq -c` prints them: the count, then the two-digit hour, like `     21 07`. Every line in the log is from 14 March.',
    fixture: 'arena-columns-web',
    check: { output: 'reference', looseSpace: true },
    solution: 'cut -d: -f2 ~/logs/access.log | sort | uniq -c',
    hints: [
      'Look at a timestamp: `[14/Mar/2026:09:02:14 +0000]`. Is there a separator that sits right in front of the hour and nowhere earlier in the line?',
      'The first `:` on each line comes right before the hour, so `cut -d: -f2` prints just the hour. Then count with `sort | uniq -c`.',
      '`cut -d: -f2 ~/logs/access.log | sort | uniq -c`',
    ],
    xp: 70,
  },
  {
    id: 'columns-watchlist',
    title: 'One Line for the WAF',
    topic: 'Columns & pipelines',
    difficulty: 'hard',
    unlockDay: 14,
    md: 'The web application firewall takes its watchlist as **one line** of comma-separated addresses. From `~/logs/access.log`, find every client that got **five or more** `404` responses (field 9). Print them on a single line, separated by commas, with no spaces and no trailing comma, in the order plain `sort` puts them.\n\nNew tool: **`paste -sd,`** joins all the lines it reads into one, with a comma between each.',
    fixture: 'arena-columns-web',
    check: { output: 'reference' },
    solution: "awk '$9 == 404 {print $1}' ~/logs/access.log | sort | uniq -c | awk '$1 >= 5 {print $2}' | paste -sd,",
    hints: [
      'Build it in stages: the IP of every 404 line, then count them with `sort | uniq -c`.',
      "`awk '$1 >= 5 {print $2}'` keeps the addresses with a count of 5 or more. `uniq -c` already lists them in `sort` order, so don’t re-rank them.",
      "`awk '$9 == 404 {print $1}' ~/logs/access.log | sort | uniq -c | awk '$1 >= 5 {print $2}' | paste -sd,`",
    ],
    xp: 120,
  },
  {
    id: 'columns-slow-drip',
    title: 'The Slow Drip',
    topic: 'Columns & pipelines',
    difficulty: 'hard',
    unlockDay: 15,
    md: 'One big download is easy to spot. A client that takes a little at a time isn’t. Add up the bytes (field 10) **per client IP** in `~/logs/access.log` and print the **top 3** as `TOTAL IP`, biggest first.\n\nNew trick: awk has associative arrays built in, like `declare -A`. `b[$1] += $10` keeps a running total per IP, and `for (ip in b) print b[ip], ip` inside the `END` block prints them all, in no particular order.',
    fixture: 'arena-columns-web',
    check: { output: 'reference' },
    solution: "awk '{b[$1] += $10} END {for (ip in b) print b[ip], ip}' ~/logs/access.log | sort -rn | head -3",
    hints: [
      "Start with `awk '{b[$1] += $10} END {for (ip in b) print b[ip], ip}' ~/logs/access.log` and read the totals.",
      'The `for (ip in b)` order looks random, so sort the result numerically, biggest first, and keep three.',
      "`awk '{b[$1] += $10} END {for (ip in b) print b[ip], ip}' ~/logs/access.log | sort -rn | head -3`",
    ],
    xp: 120,
  },
];
