import { defineFixture } from '../fixtures';
import { dir, put } from '../fixtures/base';
import { authLog } from '../fixtures/gen';
import type { CaseFile } from '../types';

defineFixture('case-bruteforce', () => {}, 'day14');

// Hidden: another server's log (with a root compromise) and a quiet one.
defineFixture(
  'case-bruteforce-more',
  (vfs) => {
    dir(vfs, '/srv/logs');
    put(
      vfs,
      '/srv/logs/auth-web02.log',
      authLog({
        seed: 77,
        host: 'web02',
        noise: 20,
        attackers: [
          { ip: '203.0.113.99', count: 22, users: ['root'], at: Date.UTC(2026, 2, 12, 4, 0), success: 'root' },
          { ip: '198.51.100.200', count: 7, users: ['admin'], at: Date.UTC(2026, 2, 10, 9, 0) },
          { ip: '192.0.2.10', count: 16, users: ['admin', 'deploy'], at: Date.UTC(2026, 2, 13, 18, 0) },
        ],
      }),
    );
    put(vfs, '/srv/logs/auth-quiet.log', authLog({ seed: 78, host: 'build02', noise: 6 }));
  },
  'case-bruteforce',
);

export const case03: CaseFile = {
  id: 'bruteforce',
  number: 3,
  title: 'Brute-Force Detector',
  day: 14,
  difficulty: 3,
  minutes: 40,
  brief: `Last night we found out about a break-in **eight hours late**, by reading the log over coffee. That can’t happen again.

Write \`bruteforce.sh\`. Give it an auth log, and optionally a threshold. It reports every source IP with at least that many failed password attempts, worst first. Then the important part: if any of those IPs **also logged in successfully**, it says so, loudly.

Ops will run this from cron on every server, so it has to behave: a clear error and the right exit code when it’s used wrongly.

— Mara`,
  requirements: [
    'Usage: `bruteforce.sh LOGFILE [THRESHOLD]`. The threshold defaults to `10`.',
    'No arguments, more than two, or a threshold that isn’t a whole number → message to stderr, **exit 2**.',
    'A log file that doesn’t exist or can’t be read → message to stderr, **exit 1**.',
    'Line 1: `Brute-force report: LOGFILE`. Line 2: `Threshold: N failed logins`.',
    'For every IP whose `Failed password` lines number **at least** the threshold: `ALERT IP COUNT`, most failures first.',
    'Then, for each alerted IP (same order) that also has an `Accepted` login line: `BREACH IP USER`. The user is the 9th field of the first such line.',
    'Last line: `Suspicious IPs: N` (the number of ALERT lines, which may be 0).',
  ],
  usage: 'bash ~/cases/bruteforce.sh /var/log/auth.log 10',
  sampleOutput: `Brute-force report: /var/log/auth.log
Threshold: 10 failed logins
ALERT 198.51.100.23 31
ALERT 203.0.113.7 14
ALERT 198.51.100.140 12
BREACH 198.51.100.23 raj
Suspicious IPs: 3`,
  scriptPath: '~/cases/bruteforce.sh',
  fixture: 'case-bruteforce',
  starter: `#!/bin/bash
# bruteforce.sh LOGFILE [THRESHOLD] — flag IPs with too many failed SSH logins
# Usage: bash ~/cases/bruteforce.sh /var/log/auth.log 10

log=$1
threshold=\${2:-10}

# TODO: usage checks (exit 2) and an unreadable log (exit 1)

echo "Brute-force report: $log"
echo "Threshold: $threshold failed logins"

# TODO: ALERT lines — failed logins per IP, worst first, at or over the threshold
# TODO: BREACH lines — alerted IPs that also have an "Accepted" login
# TODO: Suspicious IPs: N
`,
  tests: [
    { name: 'web01 log, default threshold', args: ['/var/log/auth.log'], check: { output: 'reference' } },
    { name: 'web01 log, threshold 5', args: ['/var/log/auth.log', '5'], check: { output: 'reference' } },
    { name: 'Hidden: web02 (a root compromise)', args: ['/srv/logs/auth-web02.log', '15'], fixture: 'case-bruteforce-more', check: { output: 'reference' } },
    { name: 'Hidden: a quiet server', args: ['/srv/logs/auth-quiet.log'], fixture: 'case-bruteforce-more', check: { output: 'reference' } },
    { name: 'No arguments → exit 2', args: [], check: { status: 2 } },
    { name: 'Threshold “ten” → exit 2', args: ['/var/log/auth.log', 'ten'], check: { status: 2 } },
    { name: 'Missing log → exit 1', args: ['/var/log/nope.log'], check: { status: 1 } },
  ],
  solution: `#!/bin/bash
# bruteforce.sh LOGFILE [THRESHOLD] — flag IPs with too many failed SSH logins
# Usage: bash ~/cases/bruteforce.sh /var/log/auth.log 10

log=$1
threshold=\${2:-10}

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "Usage: bruteforce.sh LOGFILE [THRESHOLD]" >&2
  exit 2
fi
if ! [[ $threshold =~ ^[0-9]+$ ]]; then
  echo "Threshold must be a whole number, got: $threshold" >&2
  exit 2
fi
if [ ! -r "$log" ]; then
  echo "Cannot read $log" >&2
  exit 1
fi

echo "Brute-force report: $log"
echo "Threshold: $threshold failed logins"

count=0
suspects=""
while read -r n ip; do
  if [ "$n" -ge "$threshold" ]; then
    echo "ALERT $ip $n"
    count=$((count + 1))
    suspects="$suspects $ip"
  fi
done < <(grep "Failed password" "$log" | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn)

for ip in $suspects; do
  user=$(grep "Accepted" "$log" | grep -F "from $ip " | head -1 | awk '{print $9}')
  if [ -n "$user" ]; then
    echo "BREACH $ip $user"
  fi
done

echo "Suspicious IPs: $count"
`,
  walkthrough: `**How it works**

- **Guards first, in order of cheapness.** Count the arguments, validate the threshold with a regex, then check that the file is readable. Each failure gets its own exit code, so a cron job — or another script — can tell “you called me wrong” (2) apart from “the log is missing” (1).
- **\`\${2:-10}\`** gives the optional argument its default in one go.
- **\`$(NF-3)\`** finds the IP whatever the username looked like, because it counts from the end of the line.
- **\`done < <( … )\`** keeps the loop in the main shell. With \`… | while\`, \`count\` and \`suspects\` would be lost the moment the loop ended, and the script would always report 0.
- **\`suspects\`** is a space-separated list collected in the first loop. It’s fine here because IPs never contain spaces. On Day 15 you’ll meet arrays, the proper container for lists.
- **\`grep -F "from $ip "\`**: \`-F\` treats the IP as plain text, so its dots aren’t regex wildcards. The trailing space stops \`198.51.100.2\` from also matching \`198.51.100.23\`.

**Going further:** run it from cron every 10 minutes and pipe any \`BREACH\` line into an alert. Use the \`ALERT\` IPs to update a firewall blocklist after a human has reviewed them.`,
  hints: [
    'Default with `threshold=${2:-10}`. Validate with `[[ $threshold =~ ^[0-9]+$ ]]`. Check the file with `[ -r "$log" ]`.',
    "The counting pipeline from today’s lesson: `grep \"Failed password\" \"$log\" | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn`",
    'Loop over it with `while read -r n ip; do …; done < <(PIPELINE)` — not with a pipe, or your counter resets.',
    'For the BREACH check, keep the alerted IPs in a variable like `suspects="$suspects $ip"`, then loop over them afterwards and `grep` for an `Accepted` line `from $ip `.',
  ],
  xp: 350,
};
