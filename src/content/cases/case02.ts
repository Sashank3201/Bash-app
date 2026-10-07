import { defineFixture } from '../fixtures';
import { dir, put } from '../fixtures/base';
import { appLog } from '../fixtures/gen';
import type { CaseFile } from '../types';

defineFixture('case-sweep', () => {}, 'day10');

// Hidden: an archive with a spaced filename, an empty log and files that must be ignored.
defineFixture(
  'case-sweep-archive',
  (vfs) => {
    dir(vfs, '/srv/archive');
    put(vfs, '/srv/archive/old server.log', appLog({ seed: 201, lines: 20, errors: 2, warnings: 3, service: 'legacy' }));
    put(vfs, '/srv/archive/auth-gw.log', appLog({ seed: 202, lines: 30, errors: 6, service: 'gateway' }));
    put(vfs, '/srv/archive/empty.log', '');
    put(vfs, '/srv/archive/notes.txt', 'ERROR ERROR ERROR — not a log, ignore me\n');
    put(vfs, '/srv/archive/rotated.log.1', appLog({ seed: 203, lines: 10, errors: 9, service: 'gateway' }));
  },
  'case-sweep',
);

defineFixture(
  'case-sweep-empty',
  (vfs) => {
    dir(vfs, '/srv/empty');
    put(vfs, '/srv/empty/readme.txt', 'Nothing has been collected here yet.\n');
  },
  'case-sweep',
);

export const case02: CaseFile = {
  id: 'sweep',
  number: 2,
  title: 'Log Folder Sweep',
  day: 10,
  difficulty: 2,
  minutes: 30,
  brief: `Every morning someone opens each log from the night before, scrolls, and writes “looks fine” in the shift notes. It takes twenty minutes, and nobody really reads file number nine.

Write \`sweep.sh\`. Point it at a folder and it should go through **every \`.log\` file** in it, count the lines, errors and warnings in each, and finish with totals and the worst file. Twenty minutes becomes two seconds.

I’ll test it on folders you haven’t seen. Some filenames have spaces in them. One folder has no logs at all.

— Mara`,
  requirements: [
    'Takes one argument: the folder to sweep. If it’s missing, or isn’t a directory, print a usage message and **exit with status 2**.',
    'First line: `Sweep of DIR` (the argument exactly as given).',
    'Then one line per `.log` file, in the order the glob `*.log` gives you: `NAME lines=N errors=N warnings=N`. NAME is the filename without the folder.',
    'An error is a line containing `ERROR`; a warning is a line containing `WARN`. Files that don’t end in `.log` are ignored.',
    'Then `Files: N  Errors: N` — the number of log files and the total of all their errors.',
    'Last line: `Worst: NAME` — the file with the most errors (the first one wins a tie), or `Worst: none` if there were no errors at all.',
  ],
  usage: 'bash ~/cases/sweep.sh /home/analyst/logs',
  sampleOutput: `Sweep of /home/analyst/logs
db01.log lines=25 errors=4 warnings=1
mail01.log lines=15 errors=1 warnings=0
web01.log lines=48 errors=3 warnings=5
web02.log lines=36 errors=0 warnings=2
Files: 4  Errors: 8
Worst: db01.log`,
  scriptPath: '~/cases/sweep.sh',
  fixture: 'case-sweep',
  starter: `#!/bin/bash
# sweep.sh DIR — summarise every .log file in DIR
# Usage: bash ~/cases/sweep.sh /home/analyst/logs

dir=$1

# TODO: if no folder was given, or it isn't a directory: print usage and exit 2

echo "Sweep of $dir"
for f in "$dir"/*.log; do
  name=$(basename "$f")    # basename strips the folder: /a/b/web01.log -> web01.log
  # TODO: count lines, errors and warnings for this file
  echo "$name"
done

# TODO: totals and the worst file
`,
  tests: [
    { name: 'Sweep the four server logs', args: ['/home/analyst/logs'], check: { output: 'reference', looseSpace: true } },
    { name: 'Hidden archive: spaces, an empty log, files to ignore', args: ['/srv/archive'], fixture: 'case-sweep-archive', check: { output: 'reference', looseSpace: true } },
    { name: 'A folder with no logs at all', args: ['/srv/empty'], fixture: 'case-sweep-empty', check: { output: 'reference', looseSpace: true } },
    { name: 'No argument → usage, status 2', args: [], check: { status: 2 } },
    { name: 'Not a folder → usage, status 2', args: ['/etc/passwd'], check: { status: 2 } },
  ],
  solution: `#!/bin/bash
# sweep.sh DIR — summarise every .log file in DIR
# Usage: bash ~/cases/sweep.sh /home/analyst/logs

dir=$1
if [ $# -ne 1 ] || [ ! -d "$dir" ]; then
  echo "Usage: sweep.sh DIR" >&2
  exit 2
fi

echo "Sweep of $dir"
files=0
total=0
worst=none
worst_n=0
for f in "$dir"/*.log; do
  [ -f "$f" ] || continue      # no .log files: the glob stays as literal text
  name=$(basename "$f")
  lines=$(wc -l < "$f")
  errors=$(grep -c ERROR "$f")
  warnings=$(grep -c WARN "$f")
  echo "$name lines=$lines errors=$errors warnings=$warnings"
  files=$((files + 1))
  total=$((total + errors))
  if [ "$errors" -gt "$worst_n" ]; then
    worst=$name
    worst_n=$errors
  fi
done
echo "Files: $files  Errors: $total"
echo "Worst: $worst"
`,
  walkthrough: `**How it works**

- **The usage guard comes first.** \`[ $# -ne 1 ] || [ ! -d "$dir" ]\` catches both a missing argument and a path that isn’t a folder. \`>&2\` sends the message to stderr, where error messages belong, so it never mixes with real output that someone might pipe somewhere.
- **\`"$dir"/*.log\`** — the quotes protect a folder name with spaces, and the \`*\` stays outside them so it still works as a glob.
- **The empty-folder trap.** When nothing matches, bash leaves the pattern as it is, and the loop runs **once** with \`f\` set to the literal text \`/srv/empty/*.log\`. The line \`[ -f "$f" ] || continue\` skips that. (Day 19 shows another fix: \`shopt -s nullglob\`.)
- **Quoting \`"$f"\` everywhere** is what makes \`old server.log\` work. Without the quotes, \`wc\` would go looking for two files called \`old\` and \`server.log\`.
- **The running maximum** is the classic pattern: keep the best so far, and replace it only when you see something strictly bigger. That’s why the first file wins a tie.`,
  hints: [
    'Usage guard: `if [ $# -ne 1 ] || [ ! -d "$dir" ]; then echo "Usage: sweep.sh DIR"; exit 2; fi`',
    'Per file: `lines=$(wc -l < "$f")`, `errors=$(grep -c ERROR "$f")`, and the same for `WARN`.',
    'Before the loop set `files=0`, `total=0`, `worst=none`, `worst_n=0`. Inside, add to them with `$(( ))` and update the worst file when `errors` is bigger than `worst_n`.',
    'If a folder has no `.log` files, the loop still runs once with the literal pattern. Skip it: `[ -f "$f" ] || continue`.',
  ],
  xp: 250,
};
