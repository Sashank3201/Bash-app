// Deterministic generators for realistic log files.

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** syslog timestamp: "Mar  9 08:01:22" */
export function syslogTime(ms: number): string {
  const d = new Date(ms);
  return `${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}

/** Apache timestamp: "14/Mar/2026:09:12:01 +0000" */
export function apacheTime(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getUTCDate())}/${MON[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} +0000`;
}

/**
 * A random "internet" address from 198.18.0.0/15, a reserved range that is never assigned to anyone,
 * so background noise never names a real host. Draws four numbers like a full random IPv4 did, so the
 * rest of a seeded log stays the same.
 */
function noiseIp(rand: (a: number, b: number) => number, lo = 1, hi = 223): string {
  const a = rand(lo, hi);
  const b = rand(0, 255);
  rand(0, 255);
  const d = rand(1, 254);
  return `198.${18 + (a & 1)}.${b}.${d}`;
}

const UIDS: Record<string, number> = { root: 0, backup: 34, analyst: 1000, mara: 1001, raj: 1002 };

export const STORY_START = Date.UTC(2026, 2, 9, 0, 0, 0); // Mon Mar 9 2026
export const STORY_END = Date.UTC(2026, 2, 14, 12, 0, 0); // Sat Mar 14 2026 noon

export interface AuthOptions {
  host?: string;
  seed?: number;
  start?: number;
  end?: number;
  /** Background noise volume (events). */
  noise?: number;
  attackers?: { ip: string; count: number; users?: string[]; at?: number; spreadMin?: number; success?: string }[];
  logins?: { user: string; ip: string; times: number }[];
}

/** /var/log/auth.log style content, sorted by time. */
export function authLog(o: AuthOptions = {}): string {
  const r = rng(o.seed ?? 7);
  const host = o.host ?? 'web01';
  const start = o.start ?? STORY_START;
  const end = o.end ?? STORY_END;
  const ev: { t: number; line: string }[] = [];
  let pid = 1200;
  const nextPid = () => (pid += 1 + Math.floor(r() * 9));
  const at = (t: number, s: string) => ev.push({ t, line: `${syslogTime(t)} ${host} ${s}` });
  const rand = (a: number, b: number) => a + Math.floor(r() * (b - a));

  // routine cron sessions every hour
  for (let t = start + 17 * 60000; t < end; t += 3600000) {
    const p = nextPid();
    at(t, `CRON[${p}]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)`);
    at(t + 1000, `CRON[${p}]: pam_unix(cron:session): session closed for user root`);
  }
  // legitimate logins
  const logins = o.logins ?? [
    { user: 'analyst', ip: '10.20.0.5', times: 6 },
    { user: 'mara', ip: '10.20.0.8', times: 5 },
    { user: 'raj', ip: '10.20.0.12', times: 3 },
  ];
  for (const l of logins) {
    for (let i = 0; i < l.times; i++) {
      const t = rand(start, end);
      const p = nextPid();
      const port = rand(40000, 60000);
      at(t, `sshd[${p}]: Accepted publickey for ${l.user} from ${l.ip} port ${port} ssh2: ED25519 SHA256:${b64(r, 43)}`);
      at(t + 200, `sshd[${p}]: pam_unix(sshd:session): session opened for user ${l.user}(uid=${l.user === 'analyst' ? 1000 : l.user === 'mara' ? 1001 : 1002}) by (uid=0)`);
      at(t + 200 + rand(60000, 3 * 3600000), `sshd[${p}]: pam_unix(sshd:session): session closed for user ${l.user}`);
      if (r() < 0.5) {
        at(t + rand(60000, 1800000), `sudo: ${l.user.padStart(8)} : TTY=pts/${rand(0, 4)} ; PWD=/home/${l.user} ; USER=root ; COMMAND=/usr/bin/${['apt update', 'systemctl restart apache2', 'tail -n 50 /var/log/syslog', 'ufw status'][rand(0, 4)]}`);
      }
    }
  }
  // background internet noise: a few random failed logins
  const noiseUsers = ['admin', 'test', 'ubuntu', 'oracle', 'postgres', 'git', 'user', 'pi', 'ftpuser', 'guest'];
  for (let i = 0; i < (o.noise ?? 25); i++) {
    const t = rand(start, end);
    const ip = noiseIp(rand);
    const p = nextPid();
    const u = noiseUsers[rand(0, noiseUsers.length)];
    at(t, `sshd[${p}]: Invalid user ${u} from ${ip} port ${rand(30000, 65000)}`);
    at(t + 1500, `sshd[${p}]: Failed password for invalid user ${u} from ${ip} port ${rand(30000, 65000)} ssh2`);
    at(t + 3000, `sshd[${p}]: Connection closed by invalid user ${u} ${ip} port ${rand(30000, 65000)} [preauth]`);
  }
  // attackers
  for (const a of o.attackers ?? []) {
    const base = a.at ?? rand(start, end - 3600000);
    const spread = (a.spreadMin ?? 20) * 60000;
    const users = a.users ?? ['root'];
    for (let i = 0; i < a.count; i++) {
      const t = base + Math.floor((spread * i) / Math.max(1, a.count)) + rand(0, 4000);
      const u = users[i % users.length];
      const p = nextPid();
      const port = rand(30000, 65000);
      if (u === 'root' || ['analyst', 'mara', 'raj', 'backup'].includes(u)) {
        at(t, `sshd[${p}]: Failed password for ${u} from ${a.ip} port ${port} ssh2`);
      } else {
        at(t, `sshd[${p}]: Invalid user ${u} from ${a.ip} port ${port}`);
        at(t + 900, `sshd[${p}]: Failed password for invalid user ${u} from ${a.ip} port ${port} ssh2`);
      }
    }
    if (a.success) {
      const t = base + spread + 60000;
      const p = nextPid();
      at(t, `sshd[${p}]: Accepted password for ${a.success} from ${a.ip} port ${rand(30000, 65000)} ssh2`);
      at(t + 300, `sshd[${p}]: pam_unix(sshd:session): session opened for user ${a.success}(uid=${UIDS[a.success] ?? 1000}) by (uid=0)`);
    }
  }
  ev.sort((x, y) => x.t - y.t);
  return ev.map((e) => e.line).join('\n') + '\n';
}

function b64(r: () => number, n: number): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let s = '';
  for (let i = 0; i < n; i++) s += A[Math.floor(r() * 64)];
  return s;
}

export interface AccessOptions {
  seed?: number;
  start?: number;
  end?: number;
  normal?: number;
  scanners?: { ip: string; count: number; at?: number; ua?: string }[];
  extra?: { t: number; line: string }[];
}

const PAGES = ['/', '/index.html', '/about.html', '/services.html', '/contact.html', '/blog/', '/blog/phishing-101', '/blog/patch-tuesday', '/assets/site.css', '/assets/app.js', '/assets/logo.png', '/careers.html', '/login', '/api/status'];
const SCAN = ['/wp-login.php', '/.env', '/admin', '/phpmyadmin/', '/.git/config', '/backup.zip', '/config.php.bak', '/server-status', '/wp-admin/', '/xmlrpc.php', '/cgi-bin/test.cgi', '/.aws/credentials', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/api/v1/users', '/actuator/health'];
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

/** Apache combined log format. */
export function accessLog(o: AccessOptions = {}): string {
  const r = rng(o.seed ?? 11);
  const start = o.start ?? Date.UTC(2026, 2, 14, 0, 0, 0);
  const end = o.end ?? Date.UTC(2026, 2, 14, 12, 0, 0);
  const rand = (a: number, b: number) => a + Math.floor(r() * (b - a));
  const ev: { t: number; line: string }[] = [];
  const clients = Array.from({ length: 18 }, () => noiseIp(rand, 11, 200));
  for (let i = 0; i < (o.normal ?? 160); i++) {
    const t = rand(start, end);
    const ip = clients[rand(0, clients.length)];
    const page = PAGES[rand(0, PAGES.length)];
    const method = page === '/login' && r() < 0.5 ? 'POST' : 'GET';
    const status = page === '/login' && method === 'POST' ? (r() < 0.8 ? 302 : 401) : r() < 0.04 ? 304 : 200;
    const size = status === 200 ? rand(400, 48000) : 0;
    ev.push({ t, line: `${ip} - - [${apacheTime(t)}] "${method} ${page} HTTP/1.1" ${status} ${size} "-" "${UAS[rand(0, UAS.length)]}"` });
  }
  for (const s of o.scanners ?? []) {
    const base = s.at ?? rand(start, end - 600000);
    for (let i = 0; i < s.count; i++) {
      const t = base + i * rand(400, 2500);
      const path = SCAN[i % SCAN.length];
      ev.push({ t, line: `${s.ip} - - [${apacheTime(t)}] "GET ${path} HTTP/1.1" 404 196 "-" "${s.ua ?? 'python-requests/2.31.0'}"` });
    }
  }
  ev.push(...(o.extra ?? []));
  ev.sort((x, y) => x.t - y.t);
  return ev.map((e) => e.line).join('\n') + '\n';
}

/** A few lines of generic syslog. */
export function sysLog(seed = 3, host = 'web01', start = STORY_START, end = STORY_END): string {
  const r = rng(seed);
  const rand = (a: number, b: number) => a + Math.floor(r() * (b - a));
  const lines: { t: number; s: string }[] = [];
  const msgs = [
    'systemd[1]: Started Daily apt download activities.',
    'systemd[1]: logrotate.service: Deactivated successfully.',
    'kernel: [UFW BLOCK] IN=eth0 OUT= SRC=203.0.113.140 DST=10.20.0.15 PROTO=TCP DPT=23',
    'systemd[1]: Starting Cleanup of Temporary Directories...',
    'rsyslogd: [origin software="rsyslogd"] rsyslogd was HUPed',
    'systemd-timesyncd[512]: Initial synchronization to time server 192.0.2.123:123 (ntp.halden.example).',
    'apache2[610]: AH00558: apache2: Could not reliably determine the server\'s fully qualified domain name',
    'CRON[2231]: (root) CMD (test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily ))',
  ];
  for (let i = 0; i < 60; i++) {
    const t = rand(start, end);
    lines.push({ t, s: `${syslogTime(t)} ${host} ${msgs[rand(0, msgs.length)]}` });
  }
  lines.sort((a, b) => a.t - b.t);
  return lines.map((l) => l.s).join('\n') + '\n';
}

export interface AppLogOptions {
  seed?: number;
  lines: number;
  errors?: number;
  warnings?: number;
  start?: number;
  service?: string;
  /** Extra lines injected at fixed positions (by index). */
  inject?: { at: number; level: string; msg: string }[];
}

const INFO_MSGS = ['request served in 41ms', 'health check ok', 'cache refreshed', 'user session started', 'scheduled job finished', 'config reloaded', 'connection pool at 12/50', 'queue drained'];
const WARN_MSGS = ['disk usage at 83%', 'slow query took 2.4s', 'certificate expires in 12 days', 'retrying upstream request', 'memory usage at 78%'];
const ERROR_MSGS = ['database timeout after 30s', 'upstream returned 502', 'permission denied writing /var/cache/app', 'failed to parse request body', 'connection reset by peer'];

/** Application log: "2026-03-14 08:00:01 LEVEL service: message". Exact error/warning counts. */
export function appLog(o: AppLogOptions): string {
  const r = rng(o.seed ?? 1);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const levels: string[] = Array(o.lines).fill('INFO');
  const slots = Array.from({ length: o.lines }, (_, i) => i).sort(() => r() - 0.5);
  let k = 0;
  for (let i = 0; i < (o.errors ?? 0); i++) levels[slots[k++]] = 'ERROR';
  for (let i = 0; i < (o.warnings ?? 0); i++) levels[slots[k++]] = 'WARN';
  const svc = o.service ?? 'app';
  let t = o.start ?? Date.UTC(2026, 2, 14, 8, 0, 0);
  const out: string[] = [];
  const fmt = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  for (let i = 0; i < o.lines; i++) {
    t += 1000 + Math.floor(r() * 240000);
    for (const inj of o.inject ?? []) if (inj.at === i) out.push(`${fmt(t)} ${inj.level} ${svc}: ${inj.msg}`);
    const lv = levels[i];
    out.push(`${fmt(t)} ${lv} ${svc}: ${pick(lv === 'ERROR' ? ERROR_MSGS : lv === 'WARN' ? WARN_MSGS : INFO_MSGS)}`);
  }
  return out.join('\n') + '\n';
}
