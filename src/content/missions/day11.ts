import { defineFixture } from '../fixtures';
import { home } from '../fixtures/base';
import { accessLog } from '../fixtures/gen';
import type { Mission } from '../types';

export const WEB_LOG = accessLog({
  seed: 21,
  normal: 150,
  scanners: [
    { ip: '203.0.113.61', count: 45, at: Date.UTC(2026, 2, 14, 3, 12) },
    { ip: '198.51.100.188', count: 15, at: Date.UTC(2026, 2, 14, 9, 40), ua: 'Mozilla/5.0 zgrab/0.x' },
  ],
});

defineFixture('day11', (vfs) => {
  home(vfs, 'web/access.log', WEB_LOG);
  home(vfs, 'data/users.csv', 'name,dept,last_login\nmara,secops,2026-03-14\nraj,secops,2026-03-13\nkofi,it,2026-02-02\nlena,it,2026-03-12\ntomas,finance,2026-03-11\nanaya,hr,2026-01-30\n');
  home(vfs, 'data/ticket.txt', 'Ticket #4471: VPN access for new hire\nuser: lena.k\npassword=Winter2026!\nNote: ask her to change it after the first login\nold vpn password=Summer2025?\n');
});

export const day11: Mission = {
  day: 11,
  week: 2,
  title: 'Slicing Columns',
  topic: 'cut, tr, sort -k, sed & awk',
  minutes: 45,
  fixture: 'day11',
  briefing: `Our public web server had a strange night. The access log has a few hundred lines, and every line packs the same information into columns: who asked, when, for what, and what we answered.

\`grep\` finds lines. Today you learn to **slice them into columns**: pull out the third field, count by the ninth, sum the tenth, rewrite text as it streams past. The tools are \`cut\`, \`tr\`, \`sort -k\`, \`sed\` and the big one, **awk**.

By lunch you’ll know who scanned us, what they were looking for, and how much data we served.`,
  objectives: ['Pick columns with cut -d -f', 'Translate characters with tr', 'Sort by a column with sort -t -k', 'Edit streams with sed s///', 'Filter, extract and sum with awk'],
  lesson: [
    {
      kind: 'read',
      id: 'fields',
      title: 'Lines are made of fields',
      md: `Most data files are tables in disguise. \`/etc/passwd\` uses \`:\` between columns, a CSV uses \`,\`, and logs usually use spaces:

\`\`\`text
203.0.113.61 - - [14/Mar/2026:03:12:09 +0000] "GET /.env HTTP/1.1" 404 196 "-" "python-requests/2.31.0"
$1            $2 $3 $4                    $5     $6  $7    $8        $9  $10
\`\`\`

\`cut\` grabs fields by number: \`-d\` sets the separator, \`-f\` picks the fields.

\`\`\`bash
cut -d: -f1 /etc/passwd        # field 1
cut -d: -f1,7 /etc/passwd      # fields 1 and 7
\`\`\``,
    },
    {
      kind: 'task',
      id: 'cut-users',
      md: 'Print just the usernames from `/etc/passwd`.',
      check: { output: 'reference', uses: ['cut'] },
      solution: 'cut -d: -f1 /etc/passwd',
      hints: ['Separator `:`, field 1.'],
    },
    {
      kind: 'task',
      id: 'cut-csv',
      md: 'From `~/data/users.csv`, print each person’s **name** and **last login** (columns 1 and 3).',
      check: { output: 'reference', uses: ['cut'] },
      solution: 'cut -d, -f1,3 ~/data/users.csv',
      hints: ['The separator is a comma: `-d,`.'],
    },
    {
      kind: 'task',
      id: 'tr',
      md: '`tr` swaps characters one for one. Turn the commas in `users.csv` into tabs, so the columns line up:\n\n`tr \',\' \'\\t\' < ~/data/users.csv`',
      check: { output: 'reference', uses: ['tr'] },
      solution: "tr ',' '\\t' < ~/data/users.csv",
      hints: ['`tr` only reads stdin, hence the `<`.'],
      explain: '`tr \'a-z\' \'A-Z\'` uppercases text, and `tr -d \'\\r\'` deletes the stray carriage returns that Windows files carry.',
    },
    {
      kind: 'read',
      id: 'awk',
      title: 'awk: a tiny language for columns',
      md: `\`awk\` reads a line, splits it into fields \`$1\`, \`$2\` … (\`$NF\` is the last one), and runs your program on it:

\`\`\`bash
awk '{print $1}' access.log                 # field 1 of every line
awk '$9 == 404 {print $1, $7}' access.log   # only lines whose field 9 is 404
awk -F: '{print $1}' /etc/passwd            # -F sets the separator
\`\`\`

The pattern is \`CONDITION { ACTION }\`. Always wrap the program in **single quotes** so bash doesn’t expand the \`$1\`.`,
    },
    {
      kind: 'task',
      id: 'awk-ip',
      md: 'Who sent us the most requests? Print the **top 5 client IPs** in `~/web/access.log` with their counts. (Field 1, then your Day 5 ranking pipeline.)',
      check: { output: 'reference', uses: ['awk', 'sort', 'uniq'] },
      solution: "awk '{print $1}' ~/web/access.log | sort | uniq -c | sort -rn | head -5",
      hints: ["`awk '{print $1}' FILE`", 'Then `| sort | uniq -c | sort -rn | head -5`.'],
      explain: 'One IP sent far more than anyone else — and far more than a person clicking around would.',
    },
    {
      kind: 'task',
      id: 'awk-status',
      md: 'How did we answer? Count the requests per **status code** (field 9), biggest first.',
      check: { output: 'reference', uses: ['awk'] },
      solution: "awk '{print $9}' ~/web/access.log | sort | uniq -c | sort -rn",
      hints: ['Same pipeline, field 9, no `head`.'],
    },
    {
      kind: 'task',
      id: 'awk-404',
      md: 'A pile of **404 Not Found** usually means someone is guessing URLs. Show which IPs got 404s, and how many each.',
      check: { output: 'reference', uses: ['awk'] },
      solution: "awk '$9 == 404 {print $1}' ~/web/access.log | sort | uniq -c | sort -rn",
      hints: ["Add a condition before the action: `awk '$9 == 404 {print $1}'`"],
      explain: 'Two scanners, and nobody else. Normal visitors almost never hit a missing page.',
    },
    {
      kind: 'widget',
      id: 'w-pipe',
      md: 'Tap through each stage of this pipeline: what did `203.0.113.61` go looking for?',
      widget: 'pipeline',
      props: { fixture: 'day11', pipeline: "awk '$1 == \"203.0.113.61\" {print $7}' ~/web/access.log | sort | uniq -c | sort -rn | head -6" },
    },
    {
      kind: 'read',
      id: 'sortk',
      title: 'Sorting by a column',
      md: `\`sort\` compares whole lines unless you tell it otherwise:

- \`-t:\` sets the field separator.
- \`-k3\` sorts by field 3 (strictly, from field 3 to the end of the line; \`-k3,3\` means only field 3).
- \`-n\` compares as **numbers**. Without it, \`10\` sorts before \`9\`, because 1 comes before 9.

\`\`\`bash
sort -t: -k3 -n /etc/passwd      # accounts by UID
\`\`\``,
    },
    {
      kind: 'task',
      id: 'sort-uid',
      md: 'List the accounts sorted by **UID** (numerically), showing only `name:uid`.',
      check: { output: 'reference', uses: ['sort', 'cut'] },
      solution: 'sort -t: -k3 -n /etc/passwd | cut -d: -f1,3',
      hints: ['Sort first: `sort -t: -k3 -n /etc/passwd`.', 'Then `| cut -d: -f1,3`.'],
    },
    {
      kind: 'read',
      id: 'sed',
      title: 'sed: find and replace on the fly',
      md: `\`sed 's/OLD/NEW/'\` rewrites each line as it passes through:

\`\`\`bash
sed 's/ERROR/error/'       # first match on each line
sed 's/ERROR/error/g'      # every match (g = global)
sed -n '5,10p' file        # print only lines 5–10
\`\`\`

\`OLD\` is a pattern: \`.\` means any character and \`.*\` means “anything, to the end”. A typical use in security work is **redacting secrets** before you paste text into a ticket or a chat.`,
    },
    {
      kind: 'task',
      id: 'sed-redact',
      md: '`~/data/ticket.txt` contains passwords in plain text. Print it with everything after `password=` replaced by `[REDACTED]`.',
      check: { output: 'reference', uses: ['sed'] },
      solution: "sed 's/password=.*/password=[REDACTED]/' ~/data/ticket.txt",
      hints: ["`sed 's/password=.*/password=[REDACTED]/' FILE`"],
      explain: 'Both lines were caught, because `s///` runs on every line. The file itself is unchanged — `sed` printed an edited copy. (`sed -i` edits in place; be careful with it.)',
    },
    {
      kind: 'task',
      id: 'awk-sum',
      md: 'awk can do maths, too. Add up field 10 (bytes sent) across the whole log and print the total.\n\n`awk \'{sum += $10} END {print sum}\' ~/web/access.log`',
      check: { output: 'reference', uses: ['awk'] },
      solution: "awk '{sum += $10} END {print sum}' ~/web/access.log",
      hints: ['`END { … }` runs once, after the last line.'],
    },
    {
      kind: 'predict',
      id: 'p-cut',
      md: 'What does this print?',
      code: 'echo "web01:10.20.0.21:nginx" | cut -d: -f2',
      options: ['web01', '10.20.0.21', 'nginx', 'web01:10.20.0.21'],
      answer: 1,
      explain: 'Split on `:` and take field 2.',
    },
    {
      kind: 'quiz',
      id: 'q-sortn',
      q: 'You run `printf "9\\n10\\n100\\n" | sort`. What order comes out?',
      options: ['9, 10, 100', '10, 100, 9', '100, 10, 9', '9, 100, 10'],
      answer: 1,
      explain: 'Without `-n`, sort compares text character by character: “1…” comes before “9”. Use `sort -n` for numbers.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-shells',
      md: '**Drill 1.** How many accounts use each login shell? Count field 7 of `/etc/passwd`, biggest first.',
      check: { output: 'reference', uses: ['sort', 'uniq'] },
      solution: 'cut -d: -f7 /etc/passwd | sort | uniq -c | sort -rn',
      hints: ['`cut -d: -f7` then the ranking pipeline.'],
    },
    {
      kind: 'task',
      id: 'd-urls',
      md: '**Drill 2.** What are the **5 most requested URLs** (field 7) in the access log?',
      check: { output: 'reference', uses: ['awk'] },
      solution: "awk '{print $7}' ~/web/access.log | sort | uniq -c | sort -rn | head -5",
      hints: ['Like the top-IPs task, with field 7.'],
    },
    {
      kind: 'task',
      id: 'd-probes',
      md: '**Drill 3.** List the **distinct URLs** that `198.51.100.188` asked for, sorted.',
      check: { output: 'reference', uses: ['awk', 'sort'] },
      solution: "awk '$1 == \"198.51.100.188\" {print $7}' ~/web/access.log | sort -u",
      hints: ["Compare a field with text: `$1 == \"198.51.100.188\"`.", '`sort -u` sorts and removes duplicates.'],
      explain: '`.env`, `.git/config`, `backup.zip`: classic hunting for leaked secrets. Worth checking that none of those requests got a 200.',
    },
    {
      kind: 'task',
      id: 'd-it',
      md: '**Drill 4.** Using `awk -F,`, print the names of everyone in the `it` department from `users.csv`.',
      check: { output: 'kofi\nlena\n', uses: ['awk'] },
      solution: "awk -F, '$2 == \"it\" {print $1}' ~/data/users.csv",
      hints: ['`-F,` splits on commas.', "`awk -F, '$2 == \"it\" {print $1}' FILE`"],
    },
  ],
  debrief: {
    summary: [
      '`cut -d SEP -f N` picks columns. `tr` swaps or deletes characters.',
      '`sort -t SEP -k N -n` sorts by a numeric column. Without `-n`, 10 sorts before 9.',
      "`sed 's/old/new/g'` rewrites text as it streams by — great for redacting secrets.",
      "`awk 'COND {ACTION}'` filters, extracts (`$1`, `$NF`) and sums (`END {print sum}`).",
    ],
    cards: ['c-cut', 'c-tr', 'c-sortk', 'c-sed', 'c-awkprint', 'c-awkcond', 'c-awksum', 'c-awkF'],
  },
};
