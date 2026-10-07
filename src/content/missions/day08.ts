import { defineFixture } from '../fixtures';
import { home, homeDir } from '../fixtures/base';
import type { Mission } from '../types';

defineFixture('day08', (vfs) => {
  home(
    vfs,
    'tools/args.sh',
    `#!/bin/bash
# args.sh — shows what a script receives
echo "First argument: $1"
echo "Second argument: $2"
echo "Number of arguments: $#"
`,
    0o755,
  );
  home(
    vfs,
    'tools/ask.sh',
    `#!/bin/bash
# ask.sh — asks for a username and shows its account line
read -r -p "Which user? " user
grep "^$user:" /etc/passwd
`,
    0o755,
  );
  home(
    vfs,
    'tools/exists.sh',
    `#!/bin/bash
# exists.sh USER — exit status 0 if the account exists, 1 if it doesn't
grep -q "^$1:" /etc/passwd
`,
    0o755,
  );
  homeDir(vfs, 'cases');
});

export const day08: Mission = {
  day: 8,
  week: 2,
  title: 'Taking Orders',
  topic: 'Arguments, read & exit codes',
  minutes: 40,
  fixture: 'day08',
  briefing: `Your snapshot script was a hit. Raj has already asked for a version that checks *one particular user* — and someone else wants one that checks a log file they choose.

You could copy the script and change a word each time. Don’t. A good tool takes **orders**: you tell it what to work on when you run it, the same way you tell \`grep\` what to search for.

Today your scripts learn to accept **arguments**, ask questions with **read**, and report success or failure with **exit codes** — the quiet signal every command sends when it finishes.`,
  objectives: ['Use $1, $2, $# and "$@" inside a script', 'Pass arguments with spaces safely', 'Read exit codes with $? and set them with exit', 'Ask for input with read'],
  lesson: [
    {
      kind: 'read',
      id: 'args',
      title: 'Scripts that take arguments',
      md: `Everything you type after the script name becomes an **argument**. Inside the script they arrive in numbered variables:

| Variable | Holds |
|---|---|
| \`$1\`, \`$2\`, … | the first, second, … argument |
| \`$#\` | how many arguments there are |
| \`"$@"\` | all of them, each kept separate |
| \`$0\` | the script’s own name |

\`\`\`bash
bash whois.sh mara      # inside whois.sh, $1 is "mara"
\`\`\``,
    },
    {
      kind: 'task',
      id: 'run-args',
      md: '`~/tools/args.sh` prints what it receives. Run it with two arguments: `alpha` and `bravo`.',
      check: { output: 'First argument: alpha\nSecond argument: bravo\nNumber of arguments: 2\n' },
      solution: 'bash tools/args.sh alpha bravo',
      hints: ['`bash tools/args.sh` followed by the two words.'],
    },
    {
      kind: 'task',
      id: 'quoted-arg',
      md: 'Now run it with **one** argument that contains a space: `Failed password`.',
      check: { output: 'First argument: Failed password\nSecond argument:\nNumber of arguments: 1\n' },
      solution: 'bash tools/args.sh "Failed password"',
      hints: ['Spaces separate arguments — unless they’re inside quotes.', '`bash tools/args.sh "Failed password"`'],
      explain: 'Quotes glue words into a single argument. Same rule as `grep "Failed password" file` on Day 4.',
    },
    {
      kind: 'quiz',
      id: 'q-count',
      q: 'Inside `scan.sh`, what is `$#` when you run `bash scan.sh web01 db01 "file server"`?',
      options: ['4', '3', '2', '5'],
      answer: 1,
      explain: '`"file server"` is one argument because of the quotes, so there are three: web01, db01 and file server.',
    },
    {
      kind: 'task',
      id: 'whois',
      md: 'Write `~/tools/whois.sh`: it should print the `/etc/passwd` line for the user named in its **first argument**. The heart of it is:\n\n```bash\ngrep "^$1:" /etc/passwd\n```\n\nThen run it for `raj`. (`nano tools/whois.sh`, save, then `bash tools/whois.sh raj`.)',
      check: { output: 'raj:x:1002:1002:Raj Menon,,,:/home/raj:/bin/bash\n', fs: [{ path: '~/tools/whois.sh', contains: '$1' }] },
      solution: 'printf \'#!/bin/bash\\n# whois.sh USER — show the account line for USER\\ngrep "^$1:" /etc/passwd\\n\' > tools/whois.sh && bash tools/whois.sh raj',
      hints: ['In nano, write the shebang line and then `grep "^$1:" /etc/passwd`.', 'Save, then run `bash tools/whois.sh raj`.'],
      explain: '`^` means “start of the line” and the `:` ends the name — so `ma` can’t accidentally match `mara`. More on patterns like these on Day 13.',
    },
    {
      kind: 'read',
      id: 'exit',
      title: 'Exit codes: did it work?',
      md: `Every command finishes with a number called its **exit status**:

- \`0\` means **success**.
- Anything else (\`1\`–\`255\`) means **something went wrong**. The number often says what.

Bash keeps the last one in \`$?\`. Many commands set it in useful ways. \`grep\` returns \`0\` when it finds a match and \`1\` when it doesn’t, and \`grep -q\` (quiet) prints nothing at all — it **only** sets the status.

\`\`\`bash
grep -q root /etc/passwd
echo $?     # 0 — found
\`\`\``,
    },
    {
      kind: 'task',
      id: 'status-ok',
      md: 'Check quietly whether `mara` appears in `/etc/passwd`, then print the exit status — both on one line, separated by `;`.',
      check: { output: '0\n', uses: ['grep'], nodes: ['variable'] },
      solution: 'grep -q mara /etc/passwd; echo $?',
      hints: ['`grep -q PATTERN FILE; echo $?`'],
    },
    {
      kind: 'task',
      id: 'status-fail',
      md: 'Same again, for a user called `eve` who doesn’t exist.',
      check: { output: '1\n', uses: ['grep'], nodes: ['variable'] },
      solution: 'grep -q eve /etc/passwd; echo $?',
      hints: ['Press ↑ and change the name.'],
      explain: 'No match → status 1. Tomorrow you’ll feed exactly this signal into `if`.',
    },
    {
      kind: 'predict',
      id: 'p-ls',
      md: 'What does this print?',
      code: 'ls /nope 2>/dev/null; echo $?',
      options: ['0', '1', '2', 'Nothing at all'],
      answer: 2,
      explain: '`ls` uses status 2 for “serious trouble”, like a path that doesn’t exist. The error message went to /dev/null, but the status still tells you it failed.',
    },
    {
      kind: 'read',
      id: 'exitcmd',
      title: 'Your script’s own status',
      md: `A script finishes with the status of its **last command** — unless you choose one with \`exit\`:

\`\`\`bash
exit 0    # success
exit 1    # general failure
exit 2    # wrong usage (by convention)
\`\`\`

Look at \`~/tools/exists.sh\`: its last line is \`grep -q\`, so the script succeeds exactly when the account exists. Other scripts — and tomorrow, your \`if\` statements — can rely on that.`,
    },
    {
      kind: 'task',
      id: 'exists',
      md: 'Run `~/tools/exists.sh` for the user `backup`, then print its exit status.',
      check: { output: '0\n' },
      solution: 'bash tools/exists.sh backup; echo $?',
      hints: ['`bash tools/exists.sh backup; echo $?`'],
    },
    {
      kind: 'read',
      id: 'read',
      title: 'Asking questions with read',
      md: `\`read\` waits for a line of input and stores it in a variable:

\`\`\`bash
read -r -p "Which user? " user
echo "You typed: $user"
\`\`\`

- \`-p "…"\` shows a prompt.
- \`-r\` keeps backslashes as typed — always use it.

Input doesn’t have to come from the keyboard. \`echo mara | bash ask.sh\` answers the question through a pipe. Scripts can’t tell the difference, which makes them easy to automate.`,
    },
    {
      kind: 'task',
      id: 'ask',
      md: 'Run `~/tools/ask.sh`. When it asks, type `mara` and press Enter.',
      check: { output: 'mara:x:1001:1001:Mara Okafor,,,:/home/mara:/bin/bash\n' },
      solution: 'echo mara | bash tools/ask.sh',
      hints: ['`bash tools/ask.sh`, then type `mara` when the prompt appears.'],
    },
    {
      kind: 'fill',
      id: 'f-args',
      md: 'Complete the script so it prints its first argument and how many arguments it got.',
      template: 'echo "First: ___"\necho "Count: ___"',
      answers: [['$1', '${1}'], ['$#']],
      explain: '`$1` is the first argument; `$#` is the count.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-two-words',
      md: '**Drill 1.** Run `~/tools/args.sh` so that it gets **three** arguments and the second one is `two words`.',
      check: { output: { contains: ['Second argument: two words', 'Number of arguments: 3'] } },
      solution: 'bash tools/args.sh one "two words" three',
      hints: ['Quote the middle argument.'],
    },
    {
      kind: 'task',
      id: 'd-pwlogin',
      md: '**Drill 2.** Did *anyone* log in with a password? Search `/var/log/auth.log` for `Accepted password` with `grep -q` and print the exit status.',
      check: { output: '1\n', uses: ['grep'] },
      solution: 'grep -q "Accepted password" /var/log/auth.log; echo $?',
      hints: ['Quote the two-word pattern.', '`grep -q "…" FILE; echo $?`'],
      explain: 'Status 1: no password logins at all — only key-based ones. Good news for this server.',
    },
    {
      kind: 'task',
      id: 'd-failed-for',
      md: '**Drill 3.** Write `~/tools/failed.sh` that prints how many `Failed password for USER ` lines the log has, where USER is the first argument. Then run it for `root`.\n\nThe core line: `grep "Failed password for $1 " /var/log/auth.log | wc -l`',
      check: { output: '14\n', fs: [{ path: '~/tools/failed.sh', contains: '$1' }] },
      solution: 'printf \'#!/bin/bash\\ngrep "Failed password for $1 " /var/log/auth.log | wc -l\\n\' > tools/failed.sh && bash tools/failed.sh root',
      hints: ['Write the core line into the file with nano.', 'Then `bash tools/failed.sh root`.'],
      explain: 'The space after `$1` matters: without it, `root` would also match a user called `rootkit`.',
    },
    {
      kind: 'task',
      id: 'd-hello',
      md: '**Drill 4.** Write `~/tools/hello.sh` that asks `Name: ` with `read` and then prints `Hello, NAME`. Run it and answer `Mara`.',
      check: { output: 'Hello, Mara\n', fs: [{ path: '~/tools/hello.sh', contains: 'read' }] },
      solution: 'printf \'#!/bin/bash\\nread -r -p "Name: " name\\necho "Hello, $name"\\n\' > tools/hello.sh && echo Mara | bash tools/hello.sh',
      hints: ['Two lines after the shebang: a `read -r -p` and an `echo`.', '`echo "Hello, $name"`'],
    },
  ],
  debrief: {
    summary: [
      'Arguments arrive as `$1`, `$2`…; `$#` counts them; `"$@"` is all of them.',
      'Quotes keep words with spaces together as one argument.',
      'Exit status 0 = success, anything else = failure. `$?` holds the last one; `exit N` sets yours.',
      '`grep -q` prints nothing — it only sets the status. `read -r -p` asks for input.',
    ],
    cards: ['c-positional', 'c-argcount', 'c-atquote', 'c-exitcode', 'c-dollarq', 'c-exitn', 'c-grepq', 'c-read'],
  },
};
