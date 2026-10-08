import { defineFixture } from '../fixtures';
import { dir, GID, put } from '../fixtures/base';
import { accessLog, authLog } from '../fixtures/gen';
import { webHit } from '../missions/day17';
import type { CaseFile } from '../types';

// Visible: web01's logs exactly as on Day 17.
defineFixture('case-timeline', () => {}, 'day17');

const mar = (d: number, h: number, m: number, s: number) => Date.UTC(2026, 2, d, h, m, s);

const SCAN_PATHS = ['/.env', '/wp-login.php', '/.git/config', '/phpmyadmin/', '/backup.zip', '/server-status', '/config.php.bak', '/wp-admin/', '/admin', '/xmlrpc.php', '/.aws/credentials', '/api/v1/users'];

// Hidden: web02's evidence copy (the attacker tried there too, a scanner, a near-miss IP and two traps),
// plus a mail01 folder that holds only an auth.log.
defineFixture(
  'case-timeline-more',
  (vfs) => {
    const auth =
      authLog({
        seed: 1702,
        host: 'web02',
        noise: 12,
        end: mar(14, 8, 0, 0),
        logins: [
          { user: 'mara', ip: '10.20.0.8', times: 3 },
          { user: 'analyst', ip: '10.20.0.5', times: 2 },
        ],
        attackers: [
          { ip: '198.51.100.23', count: 6, users: ['raj', 'root'], at: mar(14, 0, 41, 0), spreadMin: 6 },
          { ip: '198.51.100.2', count: 5, users: ['admin', 'deploy'], at: mar(9, 14, 20, 0), spreadMin: 10 },
        ],
      }) +
      // not sshd: Mara blocking the address. Must not count as an SSH event.
      'Mar 14 08:05:12 web02 sudo:     mara : TTY=pts/0 ; PWD=/home/mara ; USER=root ; COMMAND=/usr/sbin/ufw deny from 198.51.100.23\n';
    const scanner = SCAN_PATHS.map((p, i) => webHit('203.0.113.88', mar(14, 3, 7, 0) + i * 3000, 'GET', p, 404, 196, 'python-requests/2.31.0'));
    const web = accessLog({
      seed: 1703,
      start: mar(13, 22, 0, 0),
      end: mar(14, 8, 0, 0),
      normal: 90,
      extra: [
        ...scanner,
        webHit('198.51.100.23', mar(14, 0, 38, 12), 'GET', '/portal/login', 404, 196),
        webHit('198.51.100.23', mar(14, 0, 38, 15), 'GET', '/login', 200, 3307),
        webHit('198.51.100.23', mar(14, 0, 39, 2), 'POST', '/login', 401, 512),
        webHit('198.51.100.2', mar(9, 14, 18, 40), 'GET', '/', 200, 6120),
        webHit('198.51.100.2', mar(9, 14, 18, 41), 'GET', '/login', 200, 3307),
        // the address in a query string, from Mara's workstation: not a request FROM it
        webHit('10.20.0.8', mar(14, 7, 52, 10), 'GET', '/admin/lookup?ip=198.51.100.23', 200, 812),
      ],
    });
    dir(vfs, '/srv/evidence', { mode: 0o750, gid: GID.adm });
    put(vfs, '/srv/evidence/web02/auth.log', auth, { mode: 0o640, gid: GID.adm });
    put(vfs, '/srv/evidence/web02/apache2/access.log', web, { mode: 0o640, gid: GID.adm });
    put(vfs, '/srv/evidence/mail01/auth.log', authLog({ seed: 1704, host: 'mail01', noise: 5 }), { mode: 0o640, gid: GID.adm });
  },
  'case-timeline',
);

export const case05: CaseFile = {
  id: 'timeline',
  number: 5,
  title: 'Incident Timeline',
  day: 17,
  difficulty: 4,
  minutes: 45,
  brief: `The incident report goes to management on Monday, and they want it **minute by minute**: when 198.51.100.23 started, when it got in, and what it did once it was inside.

By hand, that’s two logs, two timestamp formats and an afternoon of squinting. Write \`timeline.sh\` instead. Give it an IP and it pulls every SSH event and every web request from that address, turns each timestamp into ISO, and prints one sorted timeline with a short summary at the end.

I’ll also run it on the evidence copies we took from other servers, so it needs to take a log folder. Be strict about the address: \`198.51.100.2\` is not \`198.51.100.23\`, and an IP that only shows up in someone else’s line isn’t an event.

— Mara`,
  requirements: [
    'Usage: `timeline.sh IP [LOGDIR]`. LOGDIR defaults to `/var/log`. The script reads `LOGDIR/auth.log` (syslog format, no year: it’s always **2026**) and `LOGDIR/apache2/access.log` (Apache combined format).',
    'No IP, more than two arguments, or an IP that doesn’t match `^[0-9]{1,3}(\\.[0-9]{1,3}){3}$` → message to stderr, **exit 2**.',
    'If `LOGDIR/auth.log` or `LOGDIR/apache2/access.log` is missing or unreadable → message to stderr, **exit 1**.',
    'An **SSH event** is an `auth.log` line whose 5th field starts with `sshd` and that contains the IP as a whole space-separated word. Print it as `YYYY-MM-DD HH:MM:SS ssh MESSAGE`, where MESSAGE is the text after `sshd[PID]: `.',
    'A **web event** is an `access.log` line whose 1st field is exactly the IP. Print it as `YYYY-MM-DD HH:MM:SS web METHOD PATH STATUS`, e.g. `2026-03-13 23:58:10 web GET /portal/admin 403`.',
    'Line 1: `Timeline for IP`. Then every event line, SSH and web together, sorted with plain `sort` (the whole line as text: ISO stamps make that chronological, and events in the same second fall back to alphabetical order).',
    'Then `First seen: TS`, `Last seen: TS` (the stamps of the first and last event lines) and `Events: N`.',
    'No events at all → just `Timeline for IP` and `Events: 0`, **exit 0**: “never seen” is a finding, not an error. Exit 0 whenever the logs could be read.',
  ],
  usage: 'bash ~/cases/timeline.sh 198.51.100.23 /var/log',
  sampleOutput: `Timeline for 198.51.100.23
2026-03-13 23:05:00 ssh Invalid user admin from 198.51.100.23 port 36395
2026-03-13 23:05:01 ssh Failed password for invalid user admin from 198.51.100.23 port 36395 ssh2
2026-03-13 23:06:31 ssh Failed password for root from 198.51.100.23 port 53205 ssh2
2026-03-13 23:07:56 ssh Failed password for raj from 198.51.100.23 port 64925 ssh2
2026-03-13 23:09:23 ssh Failed password for backup from 198.51.100.23 port 53076 ssh2
2026-03-13 23:10:48 ssh Invalid user admin from 198.51.100.23 port 36741
2026-03-13 23:10:49 ssh Failed password for invalid user admin from 198.51.100.23 port 36741 ssh2
2026-03-13 23:12:17 ssh Failed password for root from 198.51.100.23 port 62286 ssh2
2026-03-13 23:13:45 ssh Failed password for raj from 198.51.100.23 port 61473 ssh2
2026-03-13 23:15:09 ssh Failed password for backup from 198.51.100.23 port 44486 ssh2
2026-03-13 23:16:40 ssh Failed password for invalid user admin from 198.51.100.23 port 64480 ssh2
2026-03-13 23:16:40 ssh Invalid user admin from 198.51.100.23 port 64480
2026-03-13 23:18:04 ssh Failed password for root from 198.51.100.23 port 43665 ssh2
2026-03-13 23:19:31 ssh Failed password for raj from 198.51.100.23 port 53625 ssh2
2026-03-13 23:20:58 ssh Failed password for backup from 198.51.100.23 port 51458 ssh2
2026-03-13 23:22:26 ssh Invalid user admin from 198.51.100.23 port 39899
2026-03-13 23:22:27 ssh Failed password for invalid user admin from 198.51.100.23 port 39899 ssh2
2026-03-13 23:23:52 ssh Failed password for root from 198.51.100.23 port 33736 ssh2
2026-03-13 23:25:20 ssh Failed password for raj from 198.51.100.23 port 36022 ssh2
2026-03-13 23:26:47 ssh Failed password for backup from 198.51.100.23 port 52773 ssh2
2026-03-13 23:28:15 ssh Invalid user admin from 198.51.100.23 port 56442
2026-03-13 23:28:16 ssh Failed password for invalid user admin from 198.51.100.23 port 56442 ssh2
2026-03-13 23:29:41 ssh Failed password for root from 198.51.100.23 port 48917 ssh2
2026-03-13 23:31:08 ssh Failed password for raj from 198.51.100.23 port 44596 ssh2
2026-03-13 23:32:38 ssh Failed password for backup from 198.51.100.23 port 48042 ssh2
2026-03-13 23:34:05 ssh Failed password for invalid user admin from 198.51.100.23 port 40698 ssh2
2026-03-13 23:34:05 ssh Invalid user admin from 198.51.100.23 port 40698
2026-03-13 23:35:29 ssh Failed password for root from 198.51.100.23 port 55547 ssh2
2026-03-13 23:36:59 ssh Failed password for raj from 198.51.100.23 port 61563 ssh2
2026-03-13 23:38:23 ssh Failed password for backup from 198.51.100.23 port 33884 ssh2
2026-03-13 23:39:52 ssh Invalid user admin from 198.51.100.23 port 54433
2026-03-13 23:39:53 ssh Failed password for invalid user admin from 198.51.100.23 port 54433 ssh2
2026-03-13 23:41:17 ssh Failed password for root from 198.51.100.23 port 39035 ssh2
2026-03-13 23:42:48 ssh Failed password for raj from 198.51.100.23 port 48795 ssh2
2026-03-13 23:44:15 ssh Failed password for backup from 198.51.100.23 port 40551 ssh2
2026-03-13 23:45:42 ssh Invalid user admin from 198.51.100.23 port 33635
2026-03-13 23:45:43 ssh Failed password for invalid user admin from 198.51.100.23 port 33635 ssh2
2026-03-13 23:47:09 ssh Failed password for root from 198.51.100.23 port 45149 ssh2
2026-03-13 23:48:36 ssh Failed password for raj from 198.51.100.23 port 39390 ssh2
2026-03-13 23:51:00 ssh Accepted password for raj from 198.51.100.23 port 39615 ssh2
2026-03-13 23:52:40 web GET /portal/login 200
2026-03-13 23:53:05 web POST /portal/login 302
2026-03-13 23:53:07 web GET /portal/ 200
2026-03-13 23:54:31 web GET /portal/reports 200
2026-03-13 23:55:09 web GET /portal/export?table=customers 200
2026-03-13 23:58:10 web GET /portal/admin 403
2026-03-13 23:58:44 web GET /portal/admin/users 403
2026-03-14 00:03:12 web GET /portal/export?table=invoices 200
2026-03-14 00:11:37 web GET /portal/settings/api-keys 403
2026-03-14 00:24:58 web GET /portal/logout 302
First seen: 2026-03-13 23:05:00
Last seen: 2026-03-14 00:24:58
Events: 50`,
  scriptPath: '~/cases/timeline.sh',
  fixture: 'case-timeline',
  starter: `#!/bin/bash
# timeline.sh IP [LOGDIR] — one sorted timeline of an IP's SSH and web activity
# Usage: bash ~/cases/timeline.sh 198.51.100.23 /var/log

ip=$1
logdir=\${2:-/var/log}

# TODO: usage checks (exit 2), then both log files must be readable (exit 1)

echo "Timeline for $ip"

# TODO: SSH events from $logdir/auth.log
#   "Mar 13 23:51:00 web01 sshd[2348]: Accepted ..."  ->  "2026-03-13 23:51:00 ssh Accepted ..."
# TODO: web events from $logdir/apache2/access.log
#   '198.51.100.23 - - [13/Mar/2026:23:58:10 +0000] "GET /portal/admin HTTP/1.1" 403 ...'
#   ->  "2026-03-13 23:58:10 web GET /portal/admin 403"
# TODO: merge both into one sorted list, print it, then First seen / Last seen

echo "Events: 0"
`,
  tests: [
    { name: 'web01: the breach IP', args: ['198.51.100.23'], check: { output: 'reference' } },
    { name: 'Hidden: web02’s evidence copy, with traps', args: ['198.51.100.23', '/srv/evidence/web02'], fixture: 'case-timeline-more', check: { output: 'reference' } },
    { name: 'Hidden: a scanner that only hit the website', args: ['203.0.113.88', '/srv/evidence/web02'], fixture: 'case-timeline-more', check: { output: 'reference' } },
    { name: 'Hidden: SSH only (Week 1’s attacker)', args: ['203.0.113.7'], fixture: 'case-timeline-more', check: { output: 'reference' } },
    { name: 'Hidden: 198.51.100.2 is not 198.51.100.23', args: ['198.51.100.2', '/srv/evidence/web02'], fixture: 'case-timeline-more', check: { output: 'reference' } },
    { name: 'Hidden: an IP that never showed up', args: ['203.0.113.45', '/var/log'], fixture: 'case-timeline-more', check: { output: 'reference' } },
    { name: 'No IP → exit 2', args: [], check: { status: 2 } },
    { name: 'Not an IP → exit 2', args: ['198.51.100'], check: { status: 2 } },
    { name: 'Three arguments → exit 2', args: ['198.51.100.23', '/var/log', 'web01'], check: { status: 2 } },
    { name: 'LOGDIR without an access log → exit 1', args: ['198.51.100.23', '/srv/evidence/mail01'], fixture: 'case-timeline-more', check: { status: 1 } },
  ],
  solution: `#!/bin/bash
# timeline.sh IP [LOGDIR] — one sorted timeline of an IP's SSH and web activity
# Usage: bash ~/cases/timeline.sh 198.51.100.23 /var/log

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "Usage: timeline.sh IP [LOGDIR]" >&2
  exit 2
fi
ip=$1
logdir=\${2:-/var/log}
if ! [[ $ip =~ ^[0-9]{1,3}(\\.[0-9]{1,3}){3}$ ]]; then
  echo "Not an IPv4 address: $ip" >&2
  exit 2
fi
auth=$logdir/auth.log
web=$logdir/apache2/access.log
if [ ! -r "$auth" ] || [ ! -r "$web" ]; then
  echo "Need both $auth and $web" >&2
  exit 1
fi

# "Mar 13 23:51:00 web01 sshd[2348]: Accepted ..." -> "2026-03-13 23:51:00 ssh Accepted ..."
ssh_events() {
  local mon day clock host prog msg
  while read -r mon day clock host prog msg; do
    [[ $prog == sshd* ]] || continue          # SSH lines only
    [[ " $msg " == *" $ip "* ]] || continue    # the exact IP, as a whole word
    echo "$(date -d "$mon $day $clock 2026" '+%F %T') ssh $msg"
  done < "$auth"
}

# '198.51.100.23 - - [13/Mar/2026:23:58:10 +0000] "GET /portal/admin HTTP/1.1" 403 ...'
#   -> "2026-03-13 23:58:10 web GET /portal/admin 403"
web_events() {
  local addr ident user stamp zone method path proto status rest
  while read -r addr ident user stamp zone method path proto status rest; do
    [ "$addr" = "$ip" ] || continue
    stamp=\${stamp:1}          # 13/Mar/2026:23:58:10
    stamp=\${stamp/:/ }        # 13/Mar/2026 23:58:10
    stamp=\${stamp//\\// }      # 13 Mar 2026 23:58:10
    echo "$(date -d "$stamp" '+%F %T') web \${method:1} $path $status"
  done < "$web"
}

mapfile -t events < <({ ssh_events; web_events; } | sort)

echo "Timeline for $ip"
if [ "\${#events[@]}" -gt 0 ]; then
  printf '%s\\n' "\${events[@]}"
  echo "First seen: \${events[0]:0:19}"
  echo "Last seen: \${events[-1]:0:19}"
fi
echo "Events: \${#events[@]}"
`,
  walkthrough: `**How it works**

- **Guards first.** Count the arguments, check the IP’s shape with \`[[ =~ ]]\`, then make sure both logs are readable. Usage mistakes exit 2, missing evidence exits 1, and a clean run exits 0 even with \`Events: 0\`, because “this address never touched web02” is exactly what the report needs to say.
- **\`read\` does the splitting.** \`read -r mon day clock host prog msg\` puts the first five words of a syslog line into their own variables and everything else into \`msg\`. It also swallows the double space in \`Mar  9\`, which would break \`cut -d' '\`.
- **Exact matches only.** \`" $msg " == *" $ip "*\` pads both sides with spaces, so \`198.51.100.2\` can’t match inside \`198.51.100.23\`. For the web log, \`[ "$addr" = "$ip" ]\` compares the whole first field, so a lookup like \`?ip=198.51.100.23\` from Mara’s machine doesn’t count. And \`[[ $prog == sshd* ]]\` keeps out \`sudo\` lines such as the \`ufw deny\` that blocked the address.
- **One format for everything.** Syslog stamps get the year appended; Apache stamps lose the \`[\`, the first \`:\` and the slashes. After that, \`date -d … '+%F %T'\` turns both into ISO.
- **\`{ ssh_events; web_events; } | sort\`** merges the two streams, and \`sort\` puts them in time order because ISO stamps sort correctly as text. \`mapfile\` loads the result into an array, so the first and last events and the count come straight from it: \`\${events[0]:0:19}\` is the first 19 characters, the timestamp.

**Going further:** two events in the same second (\`Invalid user\` and \`Failed password\` at 23:16:40) come out alphabetically, not in the order they happened. Logs with one-second resolution can’t tell you more. \`sort -s -k1,2\` sorts on the stamp only and keeps each log’s own order within a second. Add the portal’s \`app.log\` as a third source, and the report writes itself.`,
  hints: [
    'Start with the guards: `[ $# -lt 1 ] || [ $# -gt 2 ]`, then `[[ $ip =~ ^[0-9]{1,3}(\\.[0-9]{1,3}){3}$ ]]`, then `[ -r "$logdir/auth.log" ]` for both files.',
    'SSH: `while read -r mon day clock host prog msg; do …; done < "$logdir/auth.log"`. Skip lines unless `[[ $prog == sshd* ]]` and `[[ " $msg " == *" $ip "* ]]`, then print `$(date -d "$mon $day $clock 2026" \'+%F %T\') ssh $msg`.',
    'Web: `while read -r addr ident user stamp zone method path proto status rest`. Keep lines where `[ "$addr" = "$ip" ]`; fix the stamp with `${stamp:1}`, `${stamp/:/ }` and `${stamp//\\// }`; the method is `${method:1}` (it starts with a `"`).',
    'Put each loop in a function, then `mapfile -t events < <({ ssh_events; web_events; } | sort)`. Print `"${events[@]}"`, then use `${events[0]:0:19}`, `${events[-1]:0:19}` and `${#events[@]}`.',
  ],
  xp: 400,
};
