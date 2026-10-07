import { defineFixture } from '../fixtures';
import { home } from '../fixtures/base';
import type { Mission } from '../types';

export const APP_LOG = `2026-03-14 08:00:01 INFO  service started (v2.4.1)
2026-03-14 08:00:02 INFO  loading config from /etc/halden/app.conf
2026-03-14 08:03:17 WARN  disk usage at 81% on /var
2026-03-14 08:05:44 INFO  user mara logged in
2026-03-14 08:09:12 ERROR database timeout after 30s
2026-03-14 08:09:13 INFO  retrying database connection
2026-03-14 08:09:15 INFO  database connection restored
2026-03-14 08:21:40 WARN  certificate expires in 12 days
2026-03-14 08:30:02 error payment webhook returned 500
2026-03-14 08:44:59 INFO  user raj logged in
2026-03-14 08:52:31 Error unexpected token in request body
2026-03-14 09:00:00 INFO  hourly report generated
`;

defineFixture('day04', (vfs) => {
  home(vfs, 'logs/app.log', APP_LOG);
});

export const day04: Mission = {
  day: 4,
  week: 1,
  title: 'Reading the Logs',
  topic: 'cat, head, tail, wc & grep',
  minutes: 40,
  fixture: 'day04',
  briefing: `Something hammered our web server overnight. The firewall blocked it eventually, but management wants answers by lunch: **how many attempts, from where, and did anyone get in?**

The answers are sitting in \`/var/log/auth.log\` — a few hundred lines of plain text. Scrolling through it by eye is how mistakes happen. Today you learn to **read logs like an analyst**: peek at the start and end, count lines, and pull out exactly the lines you need with \`grep\`.`,
  objectives: ['Read the anatomy of a log line', 'Peek with head and tail, count with wc', 'Search with grep and its key options: -c -i -n -v', 'Answer real questions from auth.log'],
  lesson: [
    {
      kind: 'read',
      id: 'anatomy',
      title: 'Anatomy of a log line',
      md: `Most Linux logs write **one event per line**:

\`\`\`text
Mar 13 02:10:03 web01 sshd[1301]: Failed password for root from 203.0.113.7 port 50122 ssh2
└── when ─────┘ └host┘ └ program[pid] ┘ └── what happened ──────────────────────────────┘
\`\`\`

Because every line has the same shape, simple tools can slice them up. That’s the whole trick of log analysis on the command line.`,
    },
    {
      kind: 'task',
      id: 'head',
      md: 'Peek at the **first 10 lines** of `/var/log/auth.log`.',
      check: { output: 'reference', uses: ['head'] },
      solution: 'head /var/log/auth.log',
      hints: ['`head` shows 10 lines by default.'],
      explain: 'Hourly CRON sessions, logins, sudo — the normal heartbeat of a server. You need to know “normal” to spot “wrong”.',
    },
    {
      kind: 'task',
      id: 'head3',
      md: 'Just the first **3** lines this time.',
      check: { output: 'reference', uses: ['head'] },
      solution: 'head -n 3 /var/log/auth.log',
      hints: ['`-n NUMBER` sets how many lines.', '`head -n 3 /var/log/auth.log` (or `head -3`).'],
    },
    {
      kind: 'task',
      id: 'tail',
      md: 'Logs grow at the bottom, so the newest events are at the end. Show the **last 5** lines.',
      check: { output: 'reference', uses: ['tail'] },
      solution: 'tail -n 5 /var/log/auth.log',
      hints: ['`tail` is `head`’s mirror image.', '`tail -n 5 /var/log/auth.log`'],
    },
    {
      kind: 'task',
      id: 'wc',
      md: 'How big is this log? Count its lines with `wc -l`.',
      check: { output: 'reference', uses: ['wc'] },
      solution: 'wc -l /var/log/auth.log',
      hints: ['`wc -l FILE` counts lines.'],
      explain: '`wc` = word count. `-l` lines, `-w` words, `-c` bytes.',
    },
    {
      kind: 'read',
      id: 'grep',
      title: 'grep: find the needle',
      md: `\`grep PATTERN FILE\` prints only the lines that contain the pattern.

- It’s **case-sensitive**: \`Failed\` won’t match \`failed\`.
- Put the pattern in **quotes** when it has spaces: \`grep "Failed password" auth.log\`.

The options you’ll use every day:

| Option | Meaning |
|---|---|
| \`-c\` | count matching lines |
| \`-i\` | ignore case |
| \`-n\` | show line numbers |
| \`-v\` | invert: lines that **don’t** match |`,
    },
    {
      kind: 'task',
      id: 'grep-failed',
      md: 'Show every line containing `Failed password`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep "Failed password" /var/log/auth.log',
      hints: ['Quote the pattern because it contains a space.', '`grep "Failed password" /var/log/auth.log`'],
      explain: 'Notice the burst from `203.0.113.7` in the early hours of Mar 13 — that’s last night’s attack.',
    },
    {
      kind: 'task',
      id: 'grep-c',
      md: 'Management wants a number. **Count** the failed password lines.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep -c "Failed password" /var/log/auth.log',
      hints: ['Add `-c` to the same command.'],
    },
    {
      kind: 'quiz',
      id: 'q-c',
      q: 'A line contains the word `root` three times. How much does it add to `grep -c root`?',
      options: ['3', '1', '0', 'It depends on -i'],
      answer: 1,
      explain: '`grep -c` counts **matching lines**, not matches. One line, however many hits, counts once.',
    },
    {
      kind: 'task',
      id: 'grep-i',
      md: 'Developers aren’t consistent: `~/logs/app.log` has `ERROR`, `error` **and** `Error`. Show all of them with one search.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep -i error ~/logs/app.log',
      hints: ['There’s an option for ignoring case.', '`grep -i error ~/logs/app.log`'],
    },
    {
      kind: 'task',
      id: 'grep-n',
      md: 'Show the `WARN` lines in `~/logs/app.log` **with their line numbers**.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep -n WARN ~/logs/app.log',
      hints: ['`-n` adds line numbers.'],
      explain: 'Line numbers let you say “see line 8” in a report — and jump straight there later.',
    },
    {
      kind: 'task',
      id: 'grep-v',
      md: 'Hide the noise: show every line of `~/logs/app.log` that does **not** contain `INFO`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep -v INFO ~/logs/app.log',
      hints: ['`-v` inverts the match.'],
    },
    {
      kind: 'task',
      id: 'accepted',
      md: 'The big question: did anyone get in? Show the successful logins — lines with `Accepted`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep Accepted /var/log/auth.log',
      hints: ['Search for the word `Accepted`.'],
      explain: 'Only staff accounts from the internal `10.20.0.x` network logged in. The attacker never succeeded. That’s your headline for management.',
    },
    {
      kind: 'predict',
      id: 'p-c',
      md: 'What does this print?',
      code: 'grep -c root /etc/passwd',
      options: ['3', '1', 'root', '0'],
      answer: 1,
      explain: 'Only one line of `/etc/passwd` mentions root — even though “root” appears three times on it.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-syslog',
      md: '**Drill 1.** Show the last 3 lines of `/var/log/syslog`.',
      check: { output: 'reference', uses: ['tail'] },
      solution: 'tail -n 3 /var/log/syslog',
      hints: ['Same as before, different file.'],
    },
    {
      kind: 'task',
      id: 'd-sudo',
      md: '**Drill 2.** How many lines in `/var/log/auth.log` mention `sudo`?',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep -c sudo /var/log/auth.log',
      hints: ['`grep -c`'],
    },
    {
      kind: 'task',
      id: 'd-invalid',
      md: '**Drill 3.** Show every line mentioning an `invalid user` — in **any** capitalisation (there’s “Invalid user” and “invalid user”).',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep -i "invalid user" /var/log/auth.log',
      hints: ['Ignore case, and quote the two-word pattern.'],
    },
    {
      kind: 'task',
      id: 'd-root',
      md: '**Drill 4.** Show only the failed password attempts against the **root** account.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep "Failed password for root" /var/log/auth.log',
      hints: ['Make the pattern more specific: `Failed password for root`.'],
    },
  ],
  debrief: {
    summary: [
      'Logs are one event per line: timestamp, host, program, message.',
      '`head` and `tail` peek at the ends; `wc -l` counts lines.',
      '`grep PATTERN FILE` filters lines. `-c` counts, `-i` ignores case, `-n` numbers, `-v` inverts.',
      '`grep -c` counts matching **lines**, not individual matches.',
    ],
    cards: ['c-head', 'c-tail', 'c-wcl', 'c-grep', 'c-grepc', 'c-grepi', 'c-grepv', 'c-authlog'],
  },
};
