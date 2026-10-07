import type { Mission } from '../types';

export const day05: Mission = {
  day: 5,
  week: 1,
  title: 'Plumbing',
  topic: 'Pipes, redirection, sort & uniq',
  minutes: 45,
  fixture: 'base',
  briefing: `Good work yesterday — management got their headline. Now they want the details: **which IPs attacked us, and how hard?**

You could grep, copy the results into a spreadsheet and count by hand. Or you could let five small tools pass the data along, each doing one job, and get a ranked list in a single line.

That’s the Unix philosophy, and the **pipe** — the \`|\` character — is how it works. Today you become a plumber.`,
  objectives: ['Understand stdin, stdout and stderr', 'Chain commands with |', 'Rank results with sort and uniq -c', 'Save output with > and >>, silence errors with 2>/dev/null'],
  lesson: [
    {
      kind: 'read',
      id: 'streams',
      title: 'Three streams',
      md: `Every command has three data streams:

- **stdin** — input (usually your keyboard, or a file)
- **stdout** — normal output (your screen)
- **stderr** — error messages (also your screen, but a separate channel)

A **pipe**, \`A | B\`, plugs A’s stdout into B’s stdin. B never knows the data came from another program — it just reads text.`,
    },
    {
      kind: 'example',
      id: 'ex-pipe',
      md: 'Yesterday you counted with `grep -c`. Here’s the same answer built from two tools:',
      code: 'grep "Failed password" /var/log/auth.log | wc -l',
    },
    {
      kind: 'task',
      id: 'pipe-accepted',
      md: 'Use a pipe to count the successful logins: `grep` the `Accepted` lines, then count them with `wc -l`.',
      check: { output: 'reference', uses: ['grep', 'wc'], nodes: ['pipeline'] },
      solution: 'grep Accepted /var/log/auth.log | wc -l',
      hints: ['`grep … | wc -l`'],
    },
    {
      kind: 'read',
      id: 'sortuniq',
      title: 'sort and uniq',
      md: `- \`sort\` puts lines in order. \`-n\` sorts numbers properly, \`-r\` reverses.
- \`uniq\` collapses **neighbouring** duplicate lines; \`uniq -c\` also counts them.

Because \`uniq\` only compares neighbours, you almost always \`sort\` first. The pattern \`sort | uniq -c | sort -rn\` is the analyst’s ranking machine — “how many of each, biggest first”.`,
    },
    {
      kind: 'widget',
      id: 'pipe-widget',
      md: 'Here’s the full ranking pipeline you’re about to build. Tap each stage to watch the data change as it flows through.',
      widget: 'pipeline',
      props: { pipeline: 'grep "Failed password" /var/log/auth.log | grep -o "from [0-9.]*" | sort | uniq -c | sort -rn | head -3' },
    },
    {
      kind: 'task',
      id: 'pipe-o',
      md: 'Step 1: from the failed-password lines, pull out just the `from <IP>` part. `grep -o` prints only the matching text, and `[0-9.]*` means “any run of digits and dots”.\n\n```\ngrep "Failed password" /var/log/auth.log | grep -o "from [0-9.]*"\n```',
      check: { output: 'reference', uses: ['grep'], nodes: ['pipeline'] },
      solution: 'grep "Failed password" /var/log/auth.log | grep -o "from [0-9.]*"',
      hints: ['Type the command shown above.', 'Use ↑ afterwards — you’ll be extending this command.'],
    },
    {
      kind: 'task',
      id: 'pipe-count',
      md: 'Step 2: add `sort` and `uniq -c` to count how many attempts each IP made. (Press **↑** to bring back your last command and add to it.)',
      check: { output: 'reference', uses: ['sort', 'uniq'], nodes: ['pipeline'] },
      solution: 'grep "Failed password" /var/log/auth.log | grep -o "from [0-9.]*" | sort | uniq -c',
      hints: ['Append `| sort | uniq -c` to the previous command.'],
    },
    {
      kind: 'task',
      id: 'pipe-top',
      md: 'Step 3: rank them — biggest first — and keep only the top 3.',
      check: { output: 'reference', uses: ['sort', 'head'], nodes: ['pipeline'] },
      solution: 'grep "Failed password" /var/log/auth.log | grep -o "from [0-9.]*" | sort | uniq -c | sort -rn | head -3',
      hints: ['`sort -rn` sorts numbers, biggest first.', 'Append `| sort -rn | head -3`.'],
      explain: 'There’s your answer: `203.0.113.7` is far ahead of the background noise. Six tools, one line, no spreadsheet.',
    },
    {
      kind: 'read',
      id: 'redirect',
      title: 'Redirection: saving and silencing',
      md: `| Syntax | Effect |
|---|---|
| \`cmd > file\` | write stdout to a file (**overwrites** it) |
| \`cmd >> file\` | **append** stdout to a file |
| \`cmd < file\` | read stdin from a file |
| \`cmd 2> file\` | write **errors** to a file |
| \`cmd 2>/dev/null\` | throw errors away (\`/dev/null\` is a black hole) |
| \`cmd > file 2>&1\` | output **and** errors into the same file |

Careful: \`>\` empties the file before the command even starts.`,
    },
    {
      kind: 'task',
      id: 'save',
      md: 'Save the top 3 attackers from your pipeline into `~/top_attackers.txt`.',
      check: { fs: [{ path: '~/top_attackers.txt', contains: '203.0.113.7' }], nodes: ['redirect'] },
      solution: 'grep "Failed password" /var/log/auth.log | grep -o "from [0-9.]*" | sort | uniq -c | sort -rn | head -3 > ~/top_attackers.txt',
      hints: ['Add `> ~/top_attackers.txt` at the very end.'],
      explain: 'Nothing printed — the output went into the file instead. `cat ~/top_attackers.txt` to check.',
    },
    {
      kind: 'task',
      id: 'append',
      md: 'Stamp the report: **append** the output of `date` to the same file (without wiping it).',
      check: { fs: [{ path: '~/top_attackers.txt', contains: 'UTC' }, { path: '~/top_attackers.txt', contains: '203.0.113.7' }], uses: ['date'], nodes: ['redirect'] },
      solution: 'date >> ~/top_attackers.txt',
      hints: ['Two arrows append: `>>`.'],
    },
    {
      kind: 'task',
      id: 'devnull',
      md: '`ls /root` fails — you’re not allowed in. Run it with its error message thrown away into `/dev/null`.',
      check: { uses: ['ls'], nodes: ['redirect'], output: '' },
      solution: 'ls /root 2>/dev/null',
      hints: ['Errors are stream number 2: `2>`.', '`ls /root 2>/dev/null`'],
      explain: 'Silence. You’ll use `2>/dev/null` constantly with `find` on whole systems, where permission errors would bury the real results.',
    },
    {
      kind: 'quiz',
      id: 'q-redir',
      q: 'You run `echo one > f.txt` and then `echo two > f.txt`. What does `f.txt` contain?',
      options: ['one', 'two', 'one and two', 'Nothing — an error'],
      answer: 1,
      explain: '`>` overwrites. To keep both lines you’d use `>>` for the second command.',
    },
    {
      kind: 'predict',
      id: 'p-uniq',
      md: 'What does this pipeline print?',
      code: "printf 'b\\na\\nb\\n' | sort | uniq -c",
      options: ['      1 b\n      1 a\n      1 b', '      1 a\n      2 b', '      2 b\n      1 a', 'a\nb'],
      answer: 1,
      explain: '`sort` groups the two b’s together, then `uniq -c` counts each group. Without `sort`, uniq would see b, a, b — three separate runs.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-unique',
      md: '**Drill 1.** How many **different** IP addresses had failed password attempts? (Hint: `sort -u` sorts and removes duplicates.)',
      check: { output: 'reference', uses: ['wc'], nodes: ['pipeline'] },
      solution: 'grep "Failed password" /var/log/auth.log | grep -o "from [0-9.]*" | sort -u | wc -l',
      hints: ['Reuse step 1 of the lesson, then `| sort -u | wc -l`.'],
    },
    {
      kind: 'task',
      id: 'd-sudofile',
      md: '**Drill 2.** Save every `sudo` line from `/var/log/auth.log` into `~/sudo_events.txt`.',
      check: { fs: [{ path: '~/sudo_events.txt', contains: 'COMMAND=' }], nodes: ['redirect'] },
      solution: 'grep sudo /var/log/auth.log > ~/sudo_events.txt',
      hints: ['`grep … > file`'],
    },
    {
      kind: 'task',
      id: 'd-recent',
      md: '**Drill 3.** Show the **5 most recent** failed password attempts.',
      check: { output: 'reference', uses: ['tail'], nodes: ['pipeline'] },
      solution: 'grep "Failed password" /var/log/auth.log | tail -n 5',
      hints: ['Newest lines are at the bottom of the log.', '`grep … | tail -n 5`'],
    },
    {
      kind: 'task',
      id: 'd-both',
      md: '**Drill 4.** Run `ls /var/log /nope` and save **both** its output and its error message into `~/both.txt`.',
      check: { fs: [{ path: '~/both.txt', contains: 'auth.log' }, { path: '~/both.txt', contains: 'cannot access' }], uses: ['ls'] },
      solution: 'ls /var/log /nope > ~/both.txt 2>&1',
      hints: ['Send stdout to the file, then point stderr at stdout: `> ~/both.txt 2>&1`.'],
    },
  ],
  debrief: {
    summary: [
      'stdin, stdout and stderr are separate streams; `|` connects stdout to the next stdin.',
      '`sort | uniq -c | sort -rn | head` ranks anything.',
      '`>` overwrites, `>>` appends, `2>` redirects errors, `2>/dev/null` discards them, `2>&1` merges them.',
    ],
    cards: ['c-pipe', 'c-streams', 'c-sortuniq', 'c-topn', 'c-redirect', 'c-append', 'c-devnull', 'c-21'],
  },
};
