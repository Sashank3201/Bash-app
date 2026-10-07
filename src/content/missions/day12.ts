import { defineFixture } from '../fixtures';
import { home } from '../fixtures/base';
import type { Mission } from '../types';

export const TOOLKIT = `#!/bin/bash
# toolkit.sh COMMAND — the team's little analyst toolkit
# Usage: bash toolkit.sh users|failed

usage() {
  echo "Usage: toolkit.sh users|failed" >&2
}

bash_users() {
  grep "/bin/bash$" /etc/passwd | cut -d: -f1
}

failed_count() {
  grep -c "Failed password" /var/log/auth.log
}

case $1 in
  users)  bash_users ;;
  failed) echo "Failed logins: $(failed_count)" ;;
  *)      usage; exit 2 ;;
esac
`;

defineFixture('day12', (vfs) => {
  home(vfs, 'tools/toolkit.sh', TOOLKIT, 0o755);
});

export const day12: Mission = {
  day: 12,
  week: 2,
  title: 'Toolkit',
  topic: 'Functions, local variables & case',
  minutes: 40,
  fixture: 'day12',
  briefing: `Your scripts are getting longer, and you may have noticed the same few lines turning up again and again: print a header, count failed logins, check whether a user exists.

Today you package those into **functions** — named mini-commands you write once and call anywhere. Then you meet \`case\`, the clean way to choose between many options.

Together they turn a pile of one-off scripts into a **toolkit**: one script, several commands, like \`git\` or \`systemctl\`. Raj started one for the team; you’ll extend it.`,
  objectives: ['Define and call functions with arguments', 'Keep variables private with local', 'Return data with echo and $( ), success with return', 'Branch on patterns with case'],
  lesson: [
    {
      kind: 'read',
      id: 'func',
      title: 'Functions',
      md: `\`\`\`bash
banner() {
  echo "=== $1 ==="
}

banner "Failed logins"     # → === Failed logins ===
\`\`\`

- Define it once with \`name() { … }\`, then call it like any command.
- Inside, \`$1\`, \`$2\` and \`$#\` are the **function’s** arguments, not the script’s.
- On one line, the closing brace needs a \`;\` before it: \`banner() { echo "=== $1 ==="; }\`.`,
    },
    {
      kind: 'task',
      id: 'banner',
      md: 'Define `banner` (one-line form) and call it with `Report` — both on the same line.',
      check: { output: '=== Report ===\n', nodes: ['function'] },
      solution: 'banner() { echo "=== $1 ==="; }; banner Report',
      hints: ['`banner() { echo "=== $1 ==="; }; banner Report`'],
    },
    {
      kind: 'task',
      id: 'banner-again',
      md: 'Your function still exists in this shell. Call it again — this time with `Failed logins` (two words, one argument).',
      check: { output: '=== Failed logins ===\n' },
      solution: 'banner() { echo "=== $1 ==="; }; banner "Failed logins"',
      hints: ['Quote the two words.'],
    },
    {
      kind: 'read',
      id: 'local',
      title: 'local: keep your variables to yourself',
      md: `Variables in bash are **global** by default. A function that sets \`count\` overwrites any \`count\` the rest of your script was using. That’s a classic, confusing bug.

\`local\` makes a variable private to the function:

\`\`\`bash
count_lines() {
  local n
  n=$(wc -l < "$1")
  echo "$n"
}
\`\`\`

Make it a habit: **every variable inside a function is \`local\`** unless you really mean otherwise.`,
    },
    {
      kind: 'predict',
      id: 'p-local',
      md: 'What does this print?',
      code: 'x=1; f() { local x=2; }; f; echo $x',
      options: ['1', '2', 'Nothing', 'An error'],
      answer: 0,
      explain: 'The `x=2` lived only inside `f`. Without `local`, it would print 2.',
    },
    {
      kind: 'read',
      id: 'return',
      title: 'Two ways a function answers',
      md: `**Success or failure** — the function’s exit status: its last command’s status, or whatever you give \`return\`. Perfect for \`if\`:

\`\`\`bash
is_user() { grep -q "^$1:" /etc/passwd; }
if is_user mara; then echo "mara exists"; fi
\`\`\`

**Data** — anything the function prints. Capture it with \`$( )\`:

\`\`\`bash
count_failed() { grep -c "Failed password" "$1"; }
n=$(count_failed /var/log/auth.log)
\`\`\`

\`return\` is only for a status number (0–255). It can’t hand back text.`,
    },
    {
      kind: 'task',
      id: 'is-user',
      md: 'Define `is_user` as above and use it in an `if` to print `mara exists` — all on one line.',
      check: { output: 'mara exists\n', nodes: ['function', 'if'] },
      solution: 'is_user() { grep -q "^$1:" /etc/passwd; }; if is_user mara; then echo "mara exists"; fi',
      hints: ['Copy the two example lines onto one line, separated by `;`.'],
    },
    {
      kind: 'task',
      id: 'capture',
      md: 'Define `count_failed` (it prints the number of `Failed password` lines in the file given as `$1`). Capture its answer for `/var/log/auth.log` in `n`, then print `Failed: N`.',
      check: { output: 'Failed: 39\n', nodes: ['function', 'cmdsub'] },
      solution: 'count_failed() { grep -c "Failed password" "$1"; }; n=$(count_failed /var/log/auth.log); echo "Failed: $n"',
      hints: ['`n=$(count_failed /var/log/auth.log)`', 'Then `echo "Failed: $n"`.'],
    },
    {
      kind: 'read',
      id: 'case',
      title: 'case: many choices, cleanly',
      md: `When one value can lead to many actions, a stack of \`elif\`s gets messy. \`case\` matches the value against **patterns**:

\`\`\`bash
case $level in
  ERROR|CRIT) echo "page the on-call" ;;
  WARN)       echo "open a ticket" ;;
  *)          echo "ignore" ;;
esac
\`\`\`

- \`|\` separates alternatives, and globs like \`*.log\` work as patterns.
- \`;;\` ends each branch; \`*)\` catches everything else.
- \`esac\` (“case” backwards) closes it.`,
    },
    {
      kind: 'task',
      id: 'case-level',
      md: 'Set `level=WARN` and run the `case` from the example on one line.',
      check: { output: 'open a ticket\n', nodes: ['case'] },
      solution: 'level=WARN; case $level in ERROR|CRIT) echo "page the on-call" ;; WARN) echo "open a ticket" ;; *) echo "ignore" ;; esac',
      hints: ['`case $level in ERROR|CRIT) … ;; WARN) … ;; *) … ;; esac`'],
    },
    {
      kind: 'read',
      id: 'toolkit',
      title: 'Putting it together',
      md: `Open Raj’s toolkit with \`cat ~/tools/toolkit.sh\`. It’s the pattern behind many real tools:

1. Small, named **functions** do the work.
2. A **case** on \`$1\` picks which one to run.
3. Anything unknown prints **usage** and exits 2.

Try \`bash ~/tools/toolkit.sh users\` and \`… failed\`.`,
    },
    {
      kind: 'task',
      id: 'run-toolkit',
      md: 'Run the toolkit’s `users` command.',
      check: { output: 'reference' },
      solution: 'bash ~/tools/toolkit.sh users',
      hints: ['`bash ~/tools/toolkit.sh users`'],
    },
    {
      kind: 'task',
      id: 'add-sudo',
      md: 'Extend the toolkit. Add a function `sudo_count` that prints how many lines in `/var/log/auth.log` contain `COMMAND=`, and a `sudo)` branch that prints `Sudo commands: N`. Then run `bash ~/tools/toolkit.sh sudo`.\n\nOpen it with `nano ~/tools/toolkit.sh`.',
      check: { output: 'reference', fs: [{ path: '~/tools/toolkit.sh', contains: 'sudo_count' }] },
      solution: `cat > ~/tools/toolkit.sh <<'EOF'
${TOOLKIT.replace('users|failed"', 'users|failed|sudo"')
  .replace('failed_count() {', 'sudo_count() {\n  grep -c "COMMAND=" /var/log/auth.log\n}\n\nfailed_count() {')
  .replace('  *)      usage', '  sudo)   echo "Sudo commands: $(sudo_count)" ;;\n  *)      usage')}EOF
bash ~/tools/toolkit.sh sudo`,
      hints: ['The new function looks just like `failed_count`, with a different pattern.', 'The new branch goes before `*)`: `sudo) echo "Sudo commands: $(sudo_count)" ;;`'],
      explain: 'Every sudo use, counted — and you added a feature to someone else’s tool without breaking the existing ones.',
    },
    {
      kind: 'order',
      id: 'o-func',
      md: 'Order these lines into a working function and a call to it.',
      lines: ['count_lines() {', '  local n', '  n=$(wc -l < "$1")', '  echo "$n"', '}', 'count_lines /etc/passwd'],
      explain: 'Define the function before you call it — bash reads top to bottom.',
    },
    {
      kind: 'fill',
      id: 'f-case',
      md: 'Complete the `case`.',
      template: 'case $1 in\n  start) echo "starting" ___\n  stop)  echo "stopping" ;;\n  ___)     echo "unknown" ;;\n___',
      answers: [[';;'], ['*'], ['esac']],
      explain: 'Each branch ends with `;;`, `*` catches the rest, and `esac` closes the block.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-log',
      md: '**Drill 1.** Define `log` so that `log Scan started` prints the time and the message, like `[08:15:02] Scan started`. Use `$(date +%H:%M:%S)`, and `$*` for “all the arguments as one string”. Define it and call it on one line.',
      check: { output: { regex: '^\\[\\d\\d:\\d\\d:\\d\\d\\] Scan started$' }, nodes: ['function'] },
      solution: 'log() { echo "[$(date +%H:%M:%S)] $*"; }; log Scan started',
      hints: ['`log() { echo "[$(date +%H:%M:%S)] $*"; }`'],
      explain: 'Timestamped log lines make a script’s output useful as evidence later. You’ll build a fuller logger on Day 19.',
    },
    {
      kind: 'task',
      id: 'd-bigger',
      md: '**Drill 2.** Write a function `bigger` that prints the larger of its two arguments, then call `bigger 7 12`.',
      check: { output: '12\n', nodes: ['function', 'if'] },
      solution: 'bigger() { if [ "$1" -gt "$2" ]; then echo "$1"; else echo "$2"; fi; }; bigger 7 12',
      hints: ['Inside: `if [ "$1" -gt "$2" ]; then echo "$1"; else echo "$2"; fi`'],
    },
    {
      kind: 'task',
      id: 'd-yes',
      md: '**Drill 3.** Set `answer=Yes`. Use `case` to print `Proceeding` for `y`, `Y`, `yes` or `Yes`, and `Aborted` for anything else.',
      check: { output: 'Proceeding\n', nodes: ['case'] },
      solution: 'answer=Yes; case $answer in [Yy]|[Yy]es) echo "Proceeding" ;; *) echo "Aborted" ;; esac',
      hints: ['`[Yy]` matches either letter.', 'Pattern: `[Yy]|[Yy]es)`'],
    },
    {
      kind: 'task',
      id: 'd-unknown',
      md: '**Drill 4.** Run the toolkit with a command it doesn’t know (`nope`), hide its error message, and print `status N`.',
      check: { output: 'status 2\n' },
      solution: 'bash ~/tools/toolkit.sh nope 2>/dev/null; echo "status $?"',
      hints: ['`… 2>/dev/null; echo "status $?"`'],
    },
  ],
  debrief: {
    summary: [
      '`name() { …; }` defines a function; call it like a command. Its arguments are `$1`, `$2`…',
      '`local` keeps a variable inside the function. Use it for every function variable.',
      'Functions return **data** by printing it (capture with `$( )`) and **success** with their exit status or `return N`.',
      '`case $x in a|b) … ;; *) … ;; esac` picks a branch by pattern.',
    ],
    cards: ['c-func', 'c-funcargs', 'c-local', 'c-return', 'c-funcout', 'c-case', 'c-casepat', 'c-dispatch'],
  },
};
