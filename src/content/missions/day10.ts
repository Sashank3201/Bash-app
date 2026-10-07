import { defineFixture } from '../fixtures';
import { home, homeDir } from '../fixtures/base';
import { appLog } from '../fixtures/gen';
import type { Mission } from '../types';

defineFixture('day10', (vfs) => {
  home(vfs, 'logs/web01.log', appLog({ seed: 101, lines: 48, errors: 3, warnings: 5, service: 'nginx' }));
  home(vfs, 'logs/web02.log', appLog({ seed: 102, lines: 36, warnings: 2, service: 'nginx' }));
  home(vfs, 'logs/db01.log', appLog({ seed: 103, lines: 25, errors: 4, warnings: 1, service: 'postgres' }));
  home(vfs, 'logs/mail01.log', appLog({ seed: 104, lines: 14, errors: 1, service: 'postfix', inject: [{ at: 9, level: 'CRITICAL', msg: 'queue directory not writable' }] }));
  home(vfs, 'logs/README.txt', 'Logs copied from the four servers on Mar 14. Do not edit.\n');
  home(vfs, 'lists/hosts.txt', 'web01 10.20.0.21\nweb02 10.20.0.23\ndb01 10.20.0.22\nmail01 10.20.0.30\n');
  home(vfs, 'lists/users.txt', '# accounts to review this week\nmara\n# contractor, left in February\nkofi\nraj\n');
  homeDir(vfs, 'cases');
});

export const day10: Mission = {
  day: 10,
  week: 2,
  title: 'Repetition',
  topic: 'for, while, until & loop control',
  minutes: 45,
  fixture: 'day10',
  caseId: 'sweep',
  briefing: `Overnight, four servers shipped their logs to us. Tomorrow it’ll be forty.

Checking each file by hand means typing the same commands over and over — and that’s exactly the moment people make mistakes, or skip the one file that mattered. Today you teach bash to **repeat**: for every file, for every line, until a job is done.

Loops are where scripts start saving you real time. At the end of the day there’s a case file waiting: a sweep across a whole folder of logs.`,
  objectives: ['Loop over lists and globs with for', 'Process files line by line with while read', 'Keep running totals with $(( ))', 'Steer loops with continue, break and until'],
  lesson: [
    {
      kind: 'read',
      id: 'for',
      title: 'for: do this for each item',
      md: `\`\`\`bash
for host in web01 db01 mail01; do
  echo "Checking $host"
done
\`\`\`

The loop runs its body once per item, with \`host\` set to each item in turn. The items can come from a list you type, from a glob, or from a command:

\`\`\`bash
for f in ~/logs/*.log; do …; done      # every .log file
for n in {1..5}; do …; done            # 1 2 3 4 5
\`\`\``,
    },
    {
      kind: 'task',
      id: 'for-list',
      md: 'Loop over `web01 web02 db01` and print `Checking web01` and so on — one line per host.',
      check: { output: 'Checking web01\nChecking web02\nChecking db01\n', nodes: ['for'] },
      solution: 'for host in web01 web02 db01; do echo "Checking $host"; done',
      hints: ['One-line form: `for x in a b c; do echo "…$x"; done`'],
    },
    {
      kind: 'task',
      id: 'for-glob',
      md: 'Go into `~/logs` and, for every `.log` file there, print its name and line count, like `db01.log 25`.\n\n```bash\ncd ~/logs && for f in *.log; do echo "$f $(wc -l < "$f")"; done\n```',
      check: { output: 'reference', nodes: ['for'], cwd: '~/logs' },
      solution: 'cd ~/logs && for f in *.log; do echo "$f $(wc -l < "$f")"; done',
      hints: ['Type the command shown — then read it back piece by piece.', '`"$f"` is in quotes so a filename with spaces stays one argument.'],
      explain: 'The glob `*.log` skipped `README.txt` for free. Notice how the names come out sorted: bash sorts glob results.',
    },
    {
      kind: 'read',
      id: 'while',
      title: 'while read: line by line',
      md: `To go through a file **line by line**, use \`while read\`:

\`\`\`bash
while read -r host ip; do
  echo "$host is at $ip"
done < ~/lists/hosts.txt
\`\`\`

- \`< file\` at the end feeds the file into the loop.
- \`read -r host ip\` splits each line on spaces: the first word goes into \`host\`, the rest into \`ip\`.
- The loop stops when there are no lines left, because \`read\` fails at the end of the file.

Why not \`for line in $(cat file)\`? Because \`for\` splits on **every space**, not on lines. It quietly breaks on real data.`,
    },
    {
      kind: 'task',
      id: 'while-read',
      md: 'Read `~/lists/hosts.txt` with `while read` and print `web01 is at 10.20.0.21` for each line.',
      check: { output: 'reference', nodes: ['while'] },
      solution: 'while read -r host ip; do echo "$host is at $ip"; done < ~/lists/hosts.txt',
      hints: ['`while read -r host ip; do …; done < ~/lists/hosts.txt`'],
    },
    {
      kind: 'read',
      id: 'arith',
      title: 'Counting with $(( ))',
      md: `\`$(( … ))\` does whole-number arithmetic:

\`\`\`bash
total=0
total=$((total + 5))     # 5
echo $((total * 2))      # 10
((total++))              # add 1 — handy in loops
\`\`\`

Inside \`$(( ))\` you can leave out the \`$\` on variable names.`,
    },
    {
      kind: 'task',
      id: 'total',
      md: 'Add up the `ERROR` lines across every `.log` file in `~/logs` and print `Total errors: N`. Use a loop and a running total.',
      check: { output: 'reference', nodes: ['for', 'arith'] },
      solution: 'total=0; for f in ~/logs/*.log; do n=$(grep -c ERROR "$f"); total=$((total + n)); done; echo "Total errors: $total"',
      hints: ['Start with `total=0`.', 'In the loop: `n=$(grep -c ERROR "$f")` then `total=$((total + n))`.', 'Print after `done`.'],
    },
    {
      kind: 'predict',
      id: 'p-continue',
      md: 'What does this print?',
      code: 'for i in 1 2 3; do [ $i -eq 2 ] && continue; echo $i; done',
      options: ['1\n2\n3', '1\n3', '1', '2'],
      answer: 1,
      explain: '`continue` skips the rest of the loop body for that item, so 2 is never printed.',
    },
    {
      kind: 'read',
      id: 'control',
      title: 'continue, break and until',
      md: `- \`continue\` skips to the **next** item.
- \`break\` leaves the loop **entirely**.
- \`until COND; do …; done\` is \`while\` flipped: it repeats **until** the condition becomes true.

\`\`\`bash
while read -r user; do
  [[ $user == \\#* ]] && continue      # skip comment lines
  echo "Review: $user"
done < ~/lists/users.txt
\`\`\``,
    },
    {
      kind: 'task',
      id: 'skip-comments',
      md: 'Print every user in `~/lists/users.txt` as `Review: NAME`, skipping the comment lines that start with `#`. Use a loop — no grep this time.',
      check: { output: 'Review: mara\nReview: kofi\nReview: raj\n', nodes: ['while'], forbid: ['grep'] },
      solution: 'while read -r user; do [[ $user == \\#* ]] && continue; echo "Review: $user"; done < ~/lists/users.txt',
      hints: ['Copy the example above.', '`\\#` is escaped so bash doesn’t treat it as the start of a comment.'],
    },
    {
      kind: 'task',
      id: 'until',
      md: 'Count down from 3 to 1 with `until`, then print `Go`.',
      check: { output: '3\n2\n1\nGo\n', nodes: ['while'] },
      solution: 'n=3; until [ $n -eq 0 ]; do echo $n; n=$((n - 1)); done; echo Go',
      hints: ['`n=3; until [ $n -eq 0 ]; do …; done`', 'Inside: print `$n`, then `n=$((n - 1))`.'],
    },
    {
      kind: 'quiz',
      id: 'q-for-cat',
      q: '`hosts.txt` has the line `web01 10.20.0.21`. How many times does `for x in $(cat hosts.txt)` run its body for that one line?',
      options: ['Once', 'Twice', 'Zero times', 'It depends on the file size'],
      answer: 1,
      explain: '`for` splits on spaces as well as newlines, so it sees two items: `web01` and `10.20.0.21`. Use `while read` for lines.',
    },
    {
      kind: 'fill',
      id: 'f-loop',
      md: 'Complete the loop so it prints the name of every `.log` file in the current folder.',
      template: 'for f in ___; ___\n  echo "$f"\n___',
      answers: [['*.log'], ['do'], ['done']],
      explain: '`for VAR in LIST; do … done`.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-seq',
      md: '**Drill 1.** Print the numbers 1 to 5, one per line, with a `for` loop.',
      check: { output: '1\n2\n3\n4\n5\n', nodes: ['for'] },
      solution: 'for i in {1..5}; do echo $i; done',
      hints: ['`{1..5}` expands to 1 2 3 4 5.'],
    },
    {
      kind: 'task',
      id: 'd-humans',
      md: '**Drill 2.** Real people have UIDs from 1000 up (but `nobody` is 65534). Read `/etc/passwd` with\n\n`while IFS=: read -r name _ uid _; do …; done < /etc/passwd`\n\nand print the names whose UID is **≥ 1000 and < 65534**.',
      check: { output: 'analyst\nmara\nraj\n', nodes: ['while'] },
      solution: 'while IFS=: read -r name _ uid _; do [ "$uid" -ge 1000 ] && [ "$uid" -lt 65534 ] && echo "$name"; done < /etc/passwd',
      hints: ['`IFS=:` makes read split on colons. `_` is a throwaway variable.', 'Inside: `[ "$uid" -ge 1000 ] && [ "$uid" -lt 65534 ] && echo "$name"`'],
      explain: 'Comparing this list with the people you expect is a classic audit step. An unknown human account is a red flag.',
    },
    {
      kind: 'task',
      id: 'd-big',
      md: '**Drill 3.** For each `.log` file in `~/logs`, print `BIG FILE` if it has more than 30 lines. Print the full path, like `BIG /home/analyst/logs/web01.log`.',
      check: { output: 'reference', nodes: ['for', 'if'] },
      solution: 'for f in ~/logs/*.log; do if [ "$(wc -l < "$f")" -gt 30 ]; then echo "BIG $f"; fi; done',
      hints: ['`$(wc -l < "$f")` gives the line count.', 'Compare it with `-gt 30` inside `if`.'],
    },
    {
      kind: 'task',
      id: 'd-break',
      md: '**Drill 4.** Find the **first** `.log` file in `~/logs` that contains `CRITICAL`, print `Found in FILE` (full path), and stop the loop with `break`.',
      check: { output: 'reference', nodes: ['for'], uses: ['grep', 'break'] },
      solution: 'for f in ~/logs/*.log; do if grep -q CRITICAL "$f"; then echo "Found in $f"; break; fi; done',
      hints: ['`grep -q CRITICAL "$f"` as the condition.', 'Inside the `then`: echo, then `break`.'],
    },
  ],
  debrief: {
    summary: [
      '`for x in LIST; do …; done` repeats for each item: words, globs like `*.log`, or `{1..5}`.',
      '`while read -r a b; do …; done < file` processes a file line by line; `IFS=:` changes the separator.',
      '`$(( ))` does arithmetic — perfect for running totals.',
      '`continue` skips an item, `break` stops the loop, `until` loops until something becomes true.',
      'Case 2 is open: the Log Folder Sweep.',
    ],
    cards: ['c-for', 'c-forglob', 'c-whileread', 'c-ifs', 'c-arith', 'c-continue', 'c-until', 'c-forcat'],
  },
};
