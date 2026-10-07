import { defineFixture } from '../fixtures';
import { homeDir } from '../fixtures/base';
import type { Mission } from '../types';

defineFixture('day07', (vfs) => {
  homeDir(vfs, 'cases');
});

export const day07: Mission = {
  day: 7,
  week: 1,
  title: 'Your First Script',
  topic: 'Shebang, variables, quoting & $( )',
  minutes: 45,
  fixture: 'day07',
  caseId: 'snapshot',
  briefing: `You’ve typed a lot of commands this week. Here’s a secret: half of them were the same commands, typed again.

A **script** is just those commands saved in a file, so you can run them all with one word — tomorrow, next month, or on fifty servers at once. Every tool you’ll build in this course starts as a script.

Today you write your first one, learn to store values in **variables**, and capture a command’s output with \`$( )\`. Then I’m handing you your first real case file.`,
  objectives: ['Write and run a script (shebang, chmod +x, bash)', 'Store values in variables and use them with $', 'Know when to use double vs single quotes', 'Capture command output with $( )'],
  lesson: [
    {
      kind: 'read',
      id: 'script',
      title: 'What a script is',
      md: `A script is a text file of commands that bash runs from top to bottom.

\`\`\`bash
#!/bin/bash
# snapshot.sh — print a few facts about this machine
echo "Host: $(hostname)"
echo "User: $(whoami)"
\`\`\`

- Line 1, the **shebang** (\`#!\`), tells the system which program should run the file.
- Lines starting with \`#\` are **comments** — notes for humans.
- Run it with \`bash snapshot.sh\`, or make it executable (\`chmod +x\`) and run \`./snapshot.sh\`.`,
    },
    {
      kind: 'task',
      id: 'write',
      md: 'Create `hello.sh` in your home with the editor: run `nano hello.sh`, type these two lines, then tap **Save & close**.\n\n```bash\n#!/bin/bash\necho "Hello from my first script"\n```',
      check: { fs: [{ path: '~/hello.sh', contains: 'echo' }, { path: '~/hello.sh', contains: '#!/bin/bash' }] },
      solution: 'printf \'#!/bin/bash\\necho "Hello from my first script"\\n\' > hello.sh',
      hints: ['Type `nano hello.sh` and press Enter — an editor opens.', 'Type both lines exactly, then Save & close.'],
    },
    {
      kind: 'task',
      id: 'run-bash',
      md: 'Run it with `bash`.',
      check: { output: 'Hello from my first script\n' },
      solution: 'bash hello.sh',
      hints: ['`bash hello.sh`'],
    },
    {
      kind: 'task',
      id: 'run-dot',
      md: 'Now make it executable and run it directly as `./hello.sh`. (Two commands — `chmod` first.)',
      check: { output: 'Hello from my first script\n', fs: [{ path: '~/hello.sh', executable: true }] },
      solution: 'chmod +x hello.sh && ./hello.sh',
      hints: ['`chmod +x hello.sh` then `./hello.sh`.'],
      explain: 'Real tools work this way: executable, with a shebang, runnable by name.',
    },
    {
      kind: 'read',
      id: 'vars',
      title: 'Variables',
      md: `\`\`\`bash
host=web01          # set — NO spaces around =
echo "$host"        # use — with a $
echo "\${host}-01"   # braces mark where the name ends
\`\`\`

The no-spaces rule trips up everyone. \`host = web01\` makes bash run a command called \`host\` with the arguments \`=\` and \`web01\`.`,
    },
    {
      kind: 'task',
      id: 'set-var',
      md: 'Create a variable called `server` holding the value `web01`.',
      check: { vars: { server: 'web01' } },
      solution: 'server=web01',
      hints: ['`name=value`, no spaces.'],
    },
    {
      kind: 'task',
      id: 'use-var',
      md: 'Print `Checking web01` using your variable (not by typing web01 again).',
      check: { output: 'Checking web01\n', nodes: ['variable'] },
      solution: 'echo "Checking $server"',
      hints: ['Put `$server` inside double quotes.'],
    },
    {
      kind: 'read',
      id: 'quotes',
      title: 'Double quotes, single quotes, $( )',
      md: `- **Double quotes** \`"…"\` keep text together **and** expand \`$variables\` and \`$(commands)\` inside.
- **Single quotes** \`'…'\` keep everything **literally** — no expansion at all.
- \`$(command)\` runs the command and drops its output in place: \`echo "Today is $(date +%A)"\`.

Rule of thumb: put variables in double quotes, always. \`"$file"\` survives spaces in names; \`$file\` doesn’t.`,
    },
    {
      kind: 'widget',
      id: 'exp',
      md: 'Watch bash expand a line step by step. Try deleting the quotes around `$files` — or around `$name`.',
      widget: 'expansion',
      props: { setup: 'name="Mara Okafor"; files="a.log b.log"', line: 'echo "$name has" $files' },
    },
    {
      kind: 'task',
      id: 'cmdsub',
      md: 'Print `Report for ` followed by today’s date in `YYYY-MM-DD` format, using `$(date +%F)`.',
      check: { output: { regex: '^Report for \\d{4}-\\d{2}-\\d{2}$' }, nodes: ['cmdsub'] },
      solution: 'echo "Report for $(date +%F)"',
      hints: ['`$(date +%F)` inside double quotes.'],
    },
    {
      kind: 'predict',
      id: 'p-quotes',
      md: 'What does this print?',
      code: "name=Mara; echo 'Hi $name' \"Hi $name\"",
      options: ['Hi Mara Hi Mara', 'Hi $name Hi Mara', 'Hi $name Hi $name', 'Hi Mara Hi $name'],
      answer: 1,
      explain: 'Single quotes print `$name` literally; double quotes expand it.',
    },
    {
      kind: 'order',
      id: 'o-script',
      md: 'Put this little script in a working order.',
      lines: ['#!/bin/bash', '# count failed logins', 'count=$(grep -c "Failed password" /var/log/auth.log)', 'echo "Failed logins: $count"'],
      explain: 'Shebang first, then comments, then you must set `count` before you can print it.',
    },
    {
      kind: 'fill',
      id: 'f-vars',
      md: 'Complete the script so it stores the hostname in a variable and prints it.',
      template: 'host=___(hostname)\necho "This machine is ___host"',
      answers: [['$'], ['$']],
      explain: '`$( )` captures output; `$host` reads the variable.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-me',
      md: '**Drill 1.** Store the output of `whoami` in a variable called `me`.',
      check: { vars: { me: 'analyst' }, nodes: ['cmdsub'] },
      solution: 'me=$(whoami)',
      hints: ['`me=$(whoami)`'],
    },
    {
      kind: 'task',
      id: 'd-iam',
      md: '**Drill 2.** Print `I am analyst on halden-ws01` using `$(whoami)` and `$(hostname)`.',
      check: { output: 'I am analyst on halden-ws01\n', nodes: ['cmdsub'] },
      solution: 'echo "I am $(whoami) on $(hostname)"',
      hints: ['Two command substitutions in one double-quoted string.'],
    },
    {
      kind: 'task',
      id: 'd-hostscript',
      md: '**Drill 3.** Write `~/cases/host.sh` that prints `Host: ` followed by the hostname, then run it with `bash`. (Use `nano`, or `echo`/`printf` with `>`.)',
      check: { output: 'Host: halden-ws01\n', fs: [{ path: '~/cases/host.sh', contains: 'hostname' }] },
      solution: 'printf \'#!/bin/bash\\necho "Host: $(hostname)"\\n\' > ~/cases/host.sh && bash ~/cases/host.sh',
      hints: ['In nano, write `echo "Host: $(hostname)"`.', 'Then `bash ~/cases/host.sh`.'],
    },
  ],
  debrief: {
    summary: [
      'A script is commands in a file: shebang `#!/bin/bash`, comments with `#`.',
      'Run with `bash script.sh`, or `chmod +x` and `./script.sh`.',
      '`name=value` (no spaces) sets; `"$name"` uses. `$(cmd)` captures output.',
      'Double quotes expand, single quotes don’t. Quote your variables.',
      'Case 1 is open: the System Snapshot.',
    ],
    cards: ['c-shebang', 'c-runscript', 'c-varset', 'c-quotes', 'c-cmdsub', 'c-braces'],
  },
};
