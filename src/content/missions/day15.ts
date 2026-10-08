import { defineFixture } from '../fixtures';
import { home, put } from '../fixtures/base';
import { STORY_END } from '../fixtures/gen';
import type { Mission } from '../types';
import { ATTACK_LOG } from './day14';

defineFixture('day15', (vfs) => {
  put(vfs, '/var/log/auth.log', ATTACK_LOG, { mode: 0o640, uid: 104, gid: 4, mtime: STORY_END });
  home(
    vfs,
    'data/files.txt',
    ['/var/log/auth.log.1', '/var/backups/passwd.bak', '/home/raj/.ssh/authorized_keys', '/tmp/.x/update.sh', '/var/www/html/uploads/invoice.pdf.exe', '/etc/cron.d/.sysupdate', '/home/mara/notes.txt'].join('\n') + '\n',
  );
});

const TALLY = `declare -A fails; while read -r u; do ((fails[$u]++)); done < <(grep "Failed password" /var/log/auth.log | awk '{print $(NF-5)}'); for u in "\${!fails[@]}"; do echo "$u \${fails[$u]}"; done | sort -k2 -rn | head -5`;

export const day15: Mission = {
  day: 15,
  week: 3,
  title: 'Counting Things',
  topic: 'Arrays, associative arrays & string tricks',
  minutes: 45,
  fixture: 'day15',
  briefing: `Welcome to Week 3 — and congratulations, you’re an **Analyst** now. Your scripts from now on will run on real servers, against real incidents.

Last week, every list you kept was a string with spaces in it, like \`suspects="$suspects $ip"\`. That works until the day a value contains a space — and then it silently breaks.

Today you get proper containers. **Arrays** hold lists. **Associative arrays** hold *key → value* pairs, so you can count events per user or per IP in a single pass. And a handful of **string tricks** let you slice paths and names without calling a single extra command.`,
  objectives: ['Build, loop over and grow indexed arrays', 'Load a command’s output into an array with mapfile', 'Count anything per key with declare -A', 'Trim, replace and change case with ${…} expansions'],
  lesson: [
    {
      kind: 'read',
      id: 'arrays',
      title: 'Arrays: real lists',
      md: `\`\`\`bash
hosts=(web01 db01 "file server")   # three items — quotes keep one together
echo "\${hosts[0]}"                  # web01 (counting starts at 0)
echo "\${#hosts[@]}"                 # 3 — how many items
hosts+=(mail01)                     # add to the end
for h in "\${hosts[@]}"; do          # every item, each kept whole
  echo "$h"
done
\`\`\`

The magic incantation is \`"\${hosts[@]}"\`, **with** the quotes: every item comes out as its own word, spaces and all.`,
    },
    {
      kind: 'task',
      id: 'arr-count',
      md: 'Create an array `servers` holding `web01 web02 db01 mail01`, then print how many items it has.',
      check: { output: '4\n', nodes: ['variable'] },
      solution: 'servers=(web01 web02 db01 mail01); echo "${#servers[@]}"',
      hints: ['`servers=(… … … …)`', '`${#servers[@]}` is the count.'],
    },
    {
      kind: 'task',
      id: 'arr-loop',
      md: 'Loop over the array and print `Checking web01` and so on. (Redefine it on the same line so the check can see it.)',
      check: { output: 'Checking web01\nChecking web02\nChecking db01\nChecking mail01\n', nodes: ['for'] },
      solution: 'servers=(web01 web02 db01 mail01); for s in "${servers[@]}"; do echo "Checking $s"; done',
      hints: ['`for s in "${servers[@]}"; do …; done`'],
    },
    {
      kind: 'task',
      id: 'mapfile',
      md: '`mapfile -t NAME < <(command)` loads a command’s output into an array, one line per item. Load every username from `/etc/passwd` into `users`, then print:\n\n`12 accounts, first: root, last: raj`\n\n(`${users[-1]}` is the last item.)',
      check: { output: '12 accounts, first: root, last: raj\n', uses: ['mapfile'] },
      solution: 'mapfile -t users < <(cut -d: -f1 /etc/passwd); echo "${#users[@]} accounts, first: ${users[0]}, last: ${users[-1]}"',
      hints: ['`mapfile -t users < <(cut -d: -f1 /etc/passwd)`', 'Then one `echo` using `${#users[@]}`, `${users[0]}` and `${users[-1]}`.'],
    },
    {
      kind: 'read',
      id: 'assoc',
      title: 'Associative arrays: counting per key',
      md: `An associative array uses **names** instead of numbers as its keys. You must declare it first:

\`\`\`bash
declare -A fails
fails[root]=3
((fails[admin]++))              # missing keys start at 0
echo "\${fails[root]}"           # 3
echo "\${!fails[@]}"             # all the keys
\`\`\`

This is the analyst’s tally sheet: one pass over a log, \`((count[$key]++))\` for each event, then print the totals. The keys come out in no particular order, so pipe the result through \`sort\`.`,
    },
    {
      kind: 'task',
      id: 'tally',
      md: 'Tally the failed logins **per username** in `/var/log/auth.log` (the username is `$(NF-5)` on those lines), then print the top 5 as `user count`, biggest first:\n\n```bash\ndeclare -A fails\nwhile read -r u; do ((fails[$u]++)); done < <(grep "Failed password" /var/log/auth.log | awk \'{print $(NF-5)}\')\nfor u in "${!fails[@]}"; do echo "$u ${fails[$u]}"; done | sort -k2 -rn | head -5\n```\n\nType it on one line, joined with `;`.',
      check: { output: 'reference', nodes: ['while', 'for'] },
      solution: TALLY,
      hints: ['Three parts: declare, the counting loop, the printing loop.', 'Join them with `;` on one line.'],
      explain: 'root and admin, as always — plus `raj`, a real employee. That’s what made this attack targeted rather than random noise.',
    },
    {
      kind: 'read',
      id: 'strings',
      title: 'String surgery with ${ }',
      md: `Bash can cut strings apart without calling any extra commands:

| Expansion | With \`f=/var/log/auth.log.1\` | Meaning |
|---|---|---|
| \`\${f##*/}\` | \`auth.log.1\` | strip the longest \`*/\` from the front (basename) |
| \`\${f%/*}\` | \`/var/log\` | strip the shortest \`/*\` from the end (dirname) |
| \`\${f%.*}\` | \`/var/log/auth.log\` | drop the last extension |
| \`\${f##*.}\` | \`1\` | keep only the last extension |
| \`\${#f}\` | \`19\` | length |
| \`\${f/log/LOG}\` | \`/var/LOG/auth.log.1\` | replace the first match (\`//\` replaces all) |
| \`\${f^^}\` / \`\${f,,}\` | | upper / lower case |
| \`\${f:0:4}\` | \`/var\` | substring: from 0, length 4 |

To remember them: \`#\` trims from the **front**, \`%\` from the **end**. Doubled (\`##\`, \`%%\`) means the longest match.`,
    },
    {
      kind: 'widget',
      id: 'w-exp',
      md: 'Watch the trims happen. Try changing `##` to `#`, or `%` to `%%`.',
      widget: 'expansion',
      props: { setup: 'f=/var/log/auth.log.1', line: 'echo "${f##*/}" "${f%.*}" "${#f}"' },
    },
    {
      kind: 'task',
      id: 'basename',
      md: 'Set `f=/var/backups/passwd.bak` and print just the filename — **without** the `basename` command.',
      check: { output: 'passwd.bak\n', forbid: ['basename'] },
      solution: 'f=/var/backups/passwd.bak; echo "${f##*/}"',
      hints: ['`${f##*/}`'],
    },
    {
      kind: 'task',
      id: 'names',
      md: '`~/data/files.txt` lists suspicious paths, one per line. Print just the **filename** of each one, using `while read` and `${…##*/}`.',
      check: { output: 'reference', nodes: ['while'], forbid: ['basename'] },
      solution: 'while read -r p; do echo "${p##*/}"; done < ~/data/files.txt',
      hints: ['`while read -r p; do echo "${p##*/}"; done < ~/data/files.txt`'],
      explain: 'See `invoice.pdf.exe`? A double extension is a classic trick: on systems that hide known extensions, it looks like a harmless PDF.',
    },
    {
      kind: 'predict',
      id: 'p-trim',
      md: 'What does this print?',
      code: 'f=report.final.pdf; echo "${f%.*} ${f%%.*}"',
      options: ['report.final report', 'report report.final', 'pdf final.pdf', 'report.final.pdf report'],
      answer: 0,
      explain: '`%` removes the **shortest** `.*` from the end (`.pdf`); `%%` removes the **longest** (`.final.pdf`).',
    },
    {
      kind: 'task',
      id: 'upper',
      md: 'Set `level=warn` and print it in upper case with `${…^^}`.',
      check: { output: 'WARN\n', nodes: ['variable'], forbid: ['tr'] },
      solution: 'level=warn; echo "${level^^}"',
      hints: ['`${level^^}`'],
    },
    {
      kind: 'quiz',
      id: 'q-quote',
      q: '`files=("q1 report.txt" notes.txt)`. How many times does `for f in ${files[@]}` (no quotes) run its body?',
      options: ['2', '3', '1', '0'],
      answer: 1,
      explain: 'Without quotes, word splitting breaks `q1 report.txt` into two. `"${files[@]}"` gives the 2 items you meant.',
    },
    {
      kind: 'fill',
      id: 'f-arr',
      md: 'Complete: print how many items `ips` has, then its first item.',
      template: 'echo "${___ips[@]}"\necho "${ips[___]}"',
      answers: [['#'], ['0']],
      explain: '`${#arr[@]}` is the count; indexes start at 0.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-sum',
      md: '**Drill 1.** Put the numbers `3 14 9 31` in an array `nums` and print their sum with a loop.',
      check: { output: '57\n', nodes: ['for'] },
      solution: 'nums=(3 14 9 31); total=0; for n in "${nums[@]}"; do total=$((total + n)); done; echo "$total"',
      hints: ['`total=0`, then add each item with `$(( ))`.'],
    },
    {
      kind: 'task',
      id: 'd-accepted',
      md: '**Drill 2.** Count the **successful** logins (`Accepted` lines) per user with an associative array. The user is field 9. Print `user count`, sorted by name.',
      check: { output: 'reference', nodes: ['while', 'for'] },
      solution: 'declare -A ok; while read -r u; do ((ok[$u]++)); done < <(grep Accepted /var/log/auth.log | awk \'{print $9}\'); for u in "${!ok[@]}"; do echo "$u ${ok[$u]}"; done | sort',
      hints: ['Same shape as the tally, with `grep Accepted` and `awk \'{print $9}\'`.', 'Finish with `| sort`.'],
    },
    {
      kind: 'task',
      id: 'd-defang',
      md: '**Drill 3.** Defang an IP with pure bash: set `ip=203.0.113.7` and replace **every** `.` with `[.]`.',
      check: { output: '203[.]0[.]113[.]7\n', forbid: ['sed', 'tr'] },
      solution: 'ip=203.0.113.7; echo "${ip//./[.]}"',
      hints: ['`${var//find/replace}` replaces all matches.'],
    },
    {
      kind: 'task',
      id: 'd-hidden',
      md: '**Drill 4.** From `~/data/files.txt`, print the full paths of the **hidden** files — the ones whose filename starts with a dot.',
      check: { output: '/etc/cron.d/.sysupdate\n', nodes: ['while'] },
      solution: 'while read -r p; do n=${p##*/}; if [[ $n == .* ]]; then echo "$p"; fi; done < ~/data/files.txt',
      hints: ['Take the filename with `${p##*/}` first.', 'Then `[[ $n == .* ]]`.'],
      explain: 'Only one — but look again at the list. `/tmp/.x/update.sh` and `/home/raj/.ssh/authorized_keys` sit inside hidden **folders**, and checking only the filename misses them. A second pass with `[[ $p == */.* ]]` catches both.',
    },
  ],
  debrief: {
    summary: [
      '`arr=(a b c)`, `"${arr[@]}"` for all items, `${#arr[@]}` for the count, `arr+=(d)` to append, `${arr[-1]}` for the last.',
      '`mapfile -t arr < <(cmd)` loads a command’s output, one line per item.',
      '`declare -A m; ((m[$key]++))` counts per key; `${!m[@]}` lists the keys.',
      '`${f##*/}` basename, `${f%/*}` dirname, `${f%.*}` drop the extension, `${f//a/b}` replace all, `${f^^}` upper case.',
    ],
    cards: ['c-array', 'c-arrayall', 'c-arraylen', 'c-mapfile', 'c-assoc', 'c-assockeys', 'c-trimfront', 'c-trimend', 'c-replace', 'c-strcase'],
  },
  cards: [
    { id: 'c-array', day: 15, tag: 'arrays', front: 'Create an array of three hosts, one with a space in its name?', back: '`hosts=(web01 db01 "file server")`' },
    { id: 'c-arrayall', day: 15, tag: 'arrays', front: 'Loop over every item of `hosts`, keeping spaces intact?', back: '`for h in "${hosts[@]}"; do …; done` — the quotes matter.' },
    { id: 'c-arraylen', day: 15, tag: 'arrays', front: 'Number of items in an array? The last item?', back: '`${#arr[@]}` and `${arr[-1]}`' },
    { id: 'c-mapfile', day: 15, tag: 'arrays', front: 'Load a command’s output into an array, one line per item?', back: '`mapfile -t arr < <(command)`' },
    { id: 'c-assoc', day: 15, tag: 'arrays', front: 'Count events per username in one pass?', back: '`declare -A n; ((n[$user]++))` for each event, then print the totals.' },
    { id: 'c-assockeys', day: 15, tag: 'arrays', front: 'List the keys of associative array `n`?', back: '`"${!n[@]}"` — the order is random, so pipe the output through `sort`.' },
    { id: 'c-trimfront', day: 15, tag: 'strings', front: 'Basename of `$f` without a command?', back: '`${f##*/}` — `#` trims from the front; `##` takes the longest match.' },
    { id: 'c-trimend', day: 15, tag: 'strings', front: 'Drop the last extension / the folder part of `$f`?', back: '`${f%.*}` / `${f%/*}` — `%` trims from the end.' },
    { id: 'c-replace', day: 15, tag: 'strings', front: 'Replace every `.` in `$ip` with `[.]`?', back: '`${ip//./[.]}` — one `/` replaces the first match, `//` replaces all.' },
    { id: 'c-strcase', day: 15, tag: 'strings', front: 'Upper-case / lower-case a variable?', back: '`${v^^}` / `${v,,}`' },
  ],
};
