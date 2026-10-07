import { defineFixture } from '../fixtures';
import { home, homeDir } from '../fixtures/base';
import type { Mission } from '../types';

defineFixture('day09', (vfs) => {
  homeDir(vfs, 'tools');
  homeDir(vfs, 'evidence');
  home(vfs, 'evidence/notes.txt', '');
  home(vfs, 'evidence/suspicious.txt', '203.0.113.7\n');
});

export const day09: Mission = {
  day: 9,
  week: 2,
  title: 'Decisions',
  topic: 'if, test, [[ ]] & file checks',
  minutes: 45,
  fixture: 'day09',
  briefing: `So far your scripts do the same thing every time. Real tools **decide**: *if* the log shows more than ten failures, raise an alert. *If* the config allows root logins, flag it. *If* nobody gave an argument, explain how to use the script.

Yesterday you met exit codes. Today they pay off: \`if\` is nothing more than “run a command, and check its exit code”.

By the end of today your scripts will be able to look at a system and form an opinion about it.`,
  objectives: ['Branch on any command’s exit code with if', 'Compare numbers and strings with [ ]', 'Check files: exists, directory, readable, empty', 'Use [[ ]], elif/else, && and ||'],
  lesson: [
    {
      kind: 'read',
      id: 'if',
      title: 'if runs a command',
      md: `\`\`\`bash
if grep -q "PermitRootLogin yes" /etc/ssh/sshd_config; then
  echo "WARN: root can log in over SSH"
fi
\`\`\`

\`if\` runs the command after it. Exit status **0** → the \`then\` block runs. Anything else → it’s skipped. \`fi\` (“if” backwards) closes the block.

You can type it on one line too: \`if CMD; then …; fi\`.`,
    },
    {
      kind: 'task',
      id: 'if-grep',
      md: 'If `/etc/ssh/sshd_config` contains `PasswordAuthentication yes`, print `WARN: password logins enabled`. One line.',
      check: { output: 'WARN: password logins enabled\n', nodes: ['if'], uses: ['grep'] },
      solution: 'if grep -q "PasswordAuthentication yes" /etc/ssh/sshd_config; then echo "WARN: password logins enabled"; fi',
      hints: ['Use `grep -q` as the condition.', '`if grep -q "…" FILE; then echo "…"; fi`'],
      explain: 'Password logins are what the attackers in `auth.log` were trying to guess. Most hardened servers allow keys only.',
    },
    {
      kind: 'read',
      id: 'test',
      title: '[ ] is a command too',
      md: `To compare values, use \`[ … ]\` — a command (also called \`test\`) that exits 0 when its condition is true.

| Numbers | Strings | Files |
|---|---|---|
| \`-eq\` equal | \`=\` equal | \`-e\` exists |
| \`-ne\` not equal | \`!=\` not equal | \`-f\` is a regular file |
| \`-lt\` \`-le\` less (or equal) | \`-z\` is empty | \`-d\` is a directory |
| \`-gt\` \`-ge\` greater (or equal) | \`-n\` is not empty | \`-r\` \`-w\` \`-x\` readable / writable / executable |
| | | \`-s\` exists and isn’t empty |

**Spaces matter.** \`[ "$n" -gt 10 ]\` works. \`["$n" -gt 10]\` fails — bash looks for a command called \`["39"\`.`,
    },
    {
      kind: 'task',
      id: 'file-test',
      md: 'Use `if` with `[ -r … ]` to print `readable` or `not readable` for `/etc/shadow`.',
      check: { output: 'not readable\n', nodes: ['if'] },
      solution: 'if [ -r /etc/shadow ]; then echo "readable"; else echo "not readable"; fi',
      hints: ['`else` gives you the other branch.', '`if [ -r FILE ]; then echo …; else echo …; fi`'],
    },
    {
      kind: 'task',
      id: 'num-test',
      md: 'Store the number of failed logins in a variable `failed`, then print `ALERT: 39 failed logins` (using the variable) if it’s greater than 10.',
      check: { output: 'reference', nodes: ['if', 'cmdsub'], vars: { failed: '39' } },
      solution: 'failed=$(grep -c "Failed password" /var/log/auth.log); if [ "$failed" -gt 10 ]; then echo "ALERT: $failed failed logins"; fi',
      hints: ['`failed=$(grep -c "Failed password" /var/log/auth.log)`', 'Then `; if [ "$failed" -gt 10 ]; then echo "ALERT: $failed failed logins"; fi`'],
    },
    {
      kind: 'quiz',
      id: 'q-spaces',
      q: 'Why does `if [$count -gt 5]; then echo big; fi` fail?',
      options: ['-gt only works on strings', '[ and ] need spaces around them — they’re a command and its last argument', 'You must write $count in braces', 'if needs a semicolon before [ '],
      answer: 1,
      explain: '`[` is a command, so it needs a space after it like any command. `]` is its final argument, so it needs a space before it.',
    },
    {
      kind: 'read',
      id: 'elif',
      title: 'elif and else',
      md: `\`\`\`bash
if [ "$1" -ge 20 ]; then
  echo "HIGH"
elif [ "$1" -ge 5 ]; then
  echo "MEDIUM"
else
  echo "LOW"
fi
\`\`\`

Bash checks each condition from the top, runs the **first** block that matches, and skips the rest.

**Typing it in the terminal:** after \`then\`, press Enter. The prompt changes to \`>\` and bash waits until you type \`fi\`. In a script, just write it as shown.`,
    },
    {
      kind: 'task',
      id: 'severity',
      md: 'Write `~/tools/severity.sh` from the example above (it rates the count in `$1`), then run it with `12`.',
      check: { output: 'MEDIUM\n', fs: [{ path: '~/tools/severity.sh', contains: 'elif' }] },
      solution: `cat > tools/severity.sh <<'EOF'
#!/bin/bash
# severity.sh COUNT — rate a number of failed logins
if [ "$1" -ge 20 ]; then
  echo "HIGH"
elif [ "$1" -ge 5 ]; then
  echo "MEDIUM"
else
  echo "LOW"
fi
EOF
bash tools/severity.sh 12`,
      hints: ['`nano tools/severity.sh` and copy the example.', 'Save, then `bash tools/severity.sh 12`.'],
    },
    {
      kind: 'task',
      id: 'severity-3',
      md: 'Prove all three branches work: run it with `3`, `12` and `40` on one line, separated by `;`.',
      check: { output: 'LOW\nMEDIUM\nHIGH\n' },
      solution: 'bash tools/severity.sh 3; bash tools/severity.sh 12; bash tools/severity.sh 40',
      hints: ['`bash tools/severity.sh 3; bash tools/severity.sh 12; …`'],
      explain: 'Testing every branch is a habit worth keeping. Bugs love the branch nobody ran.',
    },
    {
      kind: 'read',
      id: 'dbl',
      title: '[[ ]] — the safer test',
      md: `Bash also has \`[[ … ]]\`. It does everything \`[ ]\` does, plus:

- No surprises with empty or spaced variables, so missing quotes won’t break it.
- \`&&\` and \`||\` inside: \`[[ -f $f && -s $f ]]\`.
- Pattern matching: \`[[ $file == *.log ]]\` is true for any name ending in \`.log\`.

In bash scripts, prefer \`[[ ]]\`. You’ll still see \`[ ]\` everywhere, because it also works in plain \`sh\`.`,
    },
    {
      kind: 'task',
      id: 'pattern',
      md: 'Set `file=access.log`, then use `[[ ]]` and `&&` to print `log file` if the name ends in `.log`.',
      check: { output: 'log file\n', nodes: ['cond'] },
      solution: 'file=access.log; [[ $file == *.log ]] && echo "log file"',
      hints: ['`[[ $file == *.log ]] && echo "log file"`'],
    },
    {
      kind: 'read',
      id: 'andor',
      title: 'Shortcuts: && and ||',
      md: `- \`A && B\` runs B **only if A succeeded**.
- \`A || B\` runs B **only if A failed**.

\`\`\`bash
[ -d ~/backup ] || mkdir ~/backup      # create it if it's missing
grep -q root /etc/passwd && echo found
\`\`\`

These are great for one-liners. For anything longer, \`if\` is easier to read.`,
    },
    {
      kind: 'task',
      id: 'mkbackup',
      md: 'In one line, create a `~/backup` folder **only if it doesn’t exist yet**, using `[ -d … ]` and `||`.',
      check: { fs: [{ path: '~/backup', type: 'dir' }], nodes: ['andor'] },
      solution: '[ -d ~/backup ] || mkdir ~/backup',
      hints: ['`[ -d ~/backup ] || mkdir ~/backup`'],
    },
    {
      kind: 'predict',
      id: 'p-range',
      md: 'What does this print?',
      code: 'x=5; if [ $x -gt 3 ] && [ $x -lt 10 ]; then echo in; else echo out; fi',
      options: ['in', 'out', 'in\nout', 'An error'],
      answer: 0,
      explain: 'Both tests succeed (5 > 3 and 5 < 10), so `&&` succeeds and the `then` branch runs.',
    },
    {
      kind: 'order',
      id: 'o-if',
      md: 'Put this check in a working order.',
      lines: ['if [ -s ~/evidence/suspicious.txt ]; then', '  echo "Suspicious IPs recorded"', 'else', '  echo "Nothing recorded yet"', 'fi'],
      explain: '`if … then`, the first branch, `else`, the other branch, and `fi` to close.',
    },
    {
      kind: 'fill',
      id: 'f-tests',
      md: 'Fill in the operators.',
      template: 'if [ ___ /etc/passwd ]; then echo "it is a file"; fi\nif [ "$n" ___ 10 ]; then echo "more than ten"; fi',
      answers: [['-f', '-e'], ['-gt']],
      explain: '`-f` tests for a regular file (`-e` just checks that it exists). `-gt` means “greater than” for numbers.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-root',
      md: '**Drill 1.** Print `root login allowed` if `/etc/ssh/sshd_config` contains `PermitRootLogin yes`, otherwise print `root login restricted`.',
      check: { output: 'root login restricted\n', uses: ['grep'] },
      solution: 'if grep -q "PermitRootLogin yes" /etc/ssh/sshd_config; then echo "root login allowed"; else echo "root login restricted"; fi',
      hints: ['Same shape as the first task, with an `else`.'],
    },
    {
      kind: 'task',
      id: 'd-empty',
      md: '**Drill 2.** `~/evidence/notes.txt` exists — but is there anything in it? Print `has content` or `empty` using `-s`.',
      check: { output: 'empty\n' },
      solution: 'if [ -s ~/evidence/notes.txt ]; then echo "has content"; else echo "empty"; fi',
      hints: ['`-s` is true when the file exists **and** isn’t empty.'],
    },
    {
      kind: 'task',
      id: 'd-usage',
      md: '**Drill 3.** Write `~/tools/need-arg.sh`. With no arguments it prints `Usage: need-arg.sh USER` and exits with status `2`; otherwise it prints `Checking USER`. Then run it **without** arguments and print the status as `status N`:\n\n`bash tools/need-arg.sh; echo "status $?"`',
      check: { output: 'Usage: need-arg.sh USER\nstatus 2\n', fs: [{ path: '~/tools/need-arg.sh', contains: 'exit 2' }] },
      solution: `cat > tools/need-arg.sh <<'EOF'
#!/bin/bash
if [ $# -eq 0 ]; then
  echo "Usage: need-arg.sh USER"
  exit 2
fi
echo "Checking $1"
EOF
bash tools/need-arg.sh; echo "status $?"`,
      hints: ['`$#` is 0 when there are no arguments.', '`if [ $# -eq 0 ]; then echo "Usage: …"; exit 2; fi`'],
      explain: 'This “usage guard” is the first thing almost every real tool does.',
    },
    {
      kind: 'task',
      id: 'd-ready',
      md: '**Drill 4.** With a single `[[ ]]`, check that `$USER` is `analyst` **and** `~/evidence` is a directory. Print `ready` if both are true.',
      check: { output: 'ready\n', nodes: ['cond'] },
      solution: '[[ $USER == analyst && -d ~/evidence ]] && echo ready',
      hints: ['Inside `[[ ]]` you can join tests with `&&`.'],
    },
  ],
  debrief: {
    summary: [
      '`if CMD; then …; fi` branches on CMD’s exit status: 0 means true.',
      '`[ ]` tests numbers (`-eq -gt -lt`), strings (`= != -z -n`) and files (`-e -f -d -r -s`). Spaces inside the brackets are required.',
      '`[[ ]]` is safer and adds `&&`, `||` and `==` with patterns.',
      '`elif` and `else` add more branches. `A && B` and `A || B` are one-line shortcuts.',
    ],
    cards: ['c-if', 'c-testspaces', 'c-numops', 'c-strops', 'c-fileops', 'c-dbl', 'c-andor', 'c-elif'],
  },
};
