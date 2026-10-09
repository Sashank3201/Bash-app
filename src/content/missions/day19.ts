import { defineFixture } from '../fixtures';
import { home, homeDir, put } from '../fixtures/base';
import { appLog, STORY_END } from '../fixtures/gen';
import type { Mission } from '../types';
import { ATTACK_LOG } from './day14';

/** Raj's draft, saved by Mara for review. Works on a good night; lies on a bad one. */
const FRAGILE = `#!/bin/bash
# errors.sh DIR - count the ERROR lines in a folder of logs
# Raj's draft. Saved as fragile.sh for review.
dir=$1
tmp=/tmp/errors.tmp
cd $dir
grep ERROR *.log > $tmp
echo "Report for $dir"
echo "Errors: $(wc -l < $tmp)"
`;

/** Strict mode on, and one honest grep that kills it. */
const COUNT = `#!/bin/bash
# count.sh - ERROR lines per log, strict mode on
set -euo pipefail
for f in "$HOME"/logs/*.log; do
  n=$(grep -c ERROR "$f")
  echo "\${f##*/}: $n"
done
`;

/** The reviewed tool: options, validation, logging, colour only on a terminal. */
const SCAN = `#!/bin/bash
# scan.sh - flag IPs with too many failed SSH logins
set -euo pipefail

usage() {
  echo "Usage: scan.sh [-t THRESHOLD] [-v] [-h] LOGFILE"
  echo "  -t N   alert at N or more failed logins (default 10)"
  echo "  -v     verbose: progress messages on stderr"
  echo "  -h     show this help"
}
log() { printf '[%s] %s: %s\\n' "$(date +%T)" "$1" "$2" >&2; }
die() { log ERROR "$1"; exit "\${2:-1}"; }

threshold=10
verbose=0
while getopts "t:vh" opt; do
  case $opt in
    t) threshold=$OPTARG ;;
    v) verbose=1 ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

if [ $# -ne 1 ]; then
  usage >&2
  exit 2
fi
logfile=$1
[[ $threshold =~ ^[0-9]+$ ]] || die "threshold must be a whole number: $threshold" 2
[ -r "$logfile" ] || die "cannot read $logfile"

if [ -t 1 ]; then
  red=$(tput setaf 1)
  reset=$(tput sgr0)
else
  red=""
  reset=""
fi

if [ "$verbose" -eq 1 ]; then log INFO "scanning $logfile, threshold $threshold"; fi
n=0
while read -r count ip; do
  if [ "$count" -ge "$threshold" ]; then
    echo "\${red}ALERT\${reset} $ip $count"
    n=$((n + 1))
  fi
done < <(grep "Failed password" "$logfile" | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn)
if [ "$verbose" -eq 1 ]; then log INFO "done: $n suspicious IPs"; fi
echo "Suspicious IPs: $n"
`;

defineFixture('day19', (vfs) => {
  const pulled = Date.UTC(2026, 2, 14, 9, 30, 0);
  put(vfs, '/var/log/auth.log', ATTACK_LOG, { mode: 0o640, uid: 104, gid: 4, mtime: STORY_END });
  home(vfs, 'logs/db01.log', appLog({ seed: 191, lines: 25, errors: 4, warnings: 2, service: 'postgres' }), 0o644, pulled);
  home(vfs, 'logs/mail01.log', appLog({ seed: 192, lines: 15, warnings: 1, service: 'postfix' }), 0o644, pulled);
  home(vfs, 'logs/web01.log', appLog({ seed: 193, lines: 40, errors: 3, warnings: 4, service: 'portal' }), 0o644, pulled);
  home(vfs, 'ops logs/web02.log', appLog({ seed: 194, lines: 20, errors: 2, warnings: 1, service: 'portal' }), 0o644, pulled);
  home(vfs, 'incoming/README.txt', 'Ops drops each night\'s logs here at 02:00. Empty until then.\n', 0o644, pulled);
  home(vfs, 'tools/fragile.sh', FRAGILE, 0o755, Date.UTC(2026, 2, 13, 17, 40, 0));
  home(vfs, 'tools/count.sh', COUNT, 0o755, pulled);
  home(vfs, 'tools/scan.sh', SCAN, 0o755, pulled);
  homeDir(vfs, 'lab');
});

const TYPO_SH = `#!/bin/bash
set -u
logdir=~/logs
echo "Scanning $log_dir"
echo "Done"
`;

const COUNT_FIXED = `cat > ~/tools/count.sh <<'EOF'
#!/bin/bash
# count.sh - ERROR lines per log, strict mode on
set -euo pipefail
for f in "$HOME"/logs/*.log; do
  n=$(grep -c ERROR "$f" || true)
  echo "\${f##*/}: $n"
done
EOF
bash ~/tools/count.sh`;

const TIDY_SH = `#!/bin/bash
set -euo pipefail
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
grep -h ERROR "$1"/*.log > "$tmp"
echo "Errors: $(wc -l < "$tmp")"
`;

const OPTS = `cat > ~/lab/opts.sh <<'EOF'
#!/bin/bash
set -euo pipefail
threshold=10
verbose=0
while getopts "t:v" opt; do
  case $opt in
    t) threshold=$OPTARG ;;
    v) verbose=1 ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))
echo "threshold=$threshold verbose=$verbose file=\${1:-none}"
EOF
bash ~/lab/opts.sh -v -t 5 auth.log; bash ~/lab/opts.sh`;

/** fragile.sh after review: the same job, fit for cron. */
const HARDENED = `#!/bin/bash
# errors.sh DIR - count the ERROR lines in a folder of logs
set -euo pipefail

log() { printf '[%s] %s: %s\\n' "$(date +%T)" "$1" "$2" >&2; }
die() { log ERROR "$1"; exit "\${2:-1}"; }

dir=\${1:-}
[ -n "$dir" ] || die "usage: \${0##*/} DIR" 2
[ -d "$dir" ] || die "no such folder: $dir"

shopt -s nullglob
logs=("$dir"/*.log)
[ "\${#logs[@]}" -gt 0 ] || die "no .log files in $dir"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

grep -h ERROR "\${logs[@]}" > "$tmp" || true
echo "Report for $dir"
echo "Errors: $(wc -l < "$tmp")"
`;

export const day19: Mission = {
  day: 19,
  week: 3,
  title: 'Built to Last',
  topic: 'Strict mode, traps, logging & getopts',
  minutes: 45,
  fixture: 'day19',
  briefing: `Ops wants every team’s scripts running from **cron** on every server by the end of the month, and they’ve asked me to sign each one off first. Cron runs at 02:00 with nobody watching. A script that carries on after an error, leaves files lying in \`/tmp\`, or has to be edited to change a setting doesn’t get my signature.

First on my desk is Raj’s log counter, saved as \`~/tools/fragile.sh\`. On a good night it works. On a bad night it reports zero errors, exits with status 0, and nobody finds out until the morning after.

Today my review checklist becomes your toolkit: **strict mode**, so a script stops at the first failure; **traps**, so it cleans up whatever happens; **logging** to stderr; **getopts** for proper options; and validation that refuses bad input before it does damage. By the end of the day, Raj’s script is ready for production.`,
  objectives: [
    'Stop scripts at the first failure with `set -euo pipefail`, and know where it bites',
    'Clean up temp files on every exit with `mktemp` and `trap … EXIT`',
    'Log timestamped messages to stderr and fail loudly with `die`',
    'Take options with `getopts` and refuse bad input before using it',
  ],
  lesson: [
    {
      kind: 'read',
      id: 'checklist',
      title: 'Mara’s review checklist',
      md: `Cron runs your script at 02:00 with nobody watching. Everything you would normally notice yourself, the script has to handle. Every script Mara signs off answers yes to six questions:

| # | Question | Today’s tool |
|---|---|---|
| 1 | Does it stop at the first failure? | \`set -e\`, \`set -o pipefail\` |
| 2 | Does a misspelled variable stop it? | \`set -u\` |
| 3 | Does it clean up, even when it fails? | \`mktemp\`, \`trap … EXIT\` |
| 4 | Do its messages go to stderr, with a time and a level? | \`log\`, \`die\` |
| 5 | Can you change its settings without editing it? | \`getopts\` |
| 6 | Does it refuse bad input before using it? | \`[[ =~ ]]\`, \`nullglob\` |

Raj’s draft fails all six. Start by watching it fail.`,
    },
    {
      kind: 'task',
      id: 't-lie',
      md: `Raj’s draft, \`~/tools/fragile.sh\`:

\`\`\`bash
dir=$1
tmp=/tmp/errors.tmp
cd $dir
grep ERROR *.log > $tmp
echo "Report for $dir"
echo "Errors: $(wc -l < $tmp)"
\`\`\`

Run it on a folder that doesn’t exist, hide its error messages, print its exit status, then list \`/tmp\`:

\`bash ~/tools/fragile.sh ~/nope 2>/dev/null; echo "exit: $?"; ls /tmp\``,
      check: { output: 'reference', uses: ['bash', 'ls'] },
      solution: 'bash ~/tools/fragile.sh ~/nope 2>/dev/null; echo "exit: $?"; ls /tmp',
      hints: ['`2>/dev/null` throws away the script’s error messages; `$?` is its exit status.', 'All on one line: `bash ~/tools/fragile.sh ~/nope 2>/dev/null; echo "exit: $?"; ls /tmp`'],
      explain: 'A report, “Errors: 0” and exit status 0. Cron records a success and the morning shift reads about a quiet night, yet the script never read a single log: `cd` failed, `grep` failed, and bash simply ran the next line each time, because that’s what it does by default. `errors.tmp` is still in `/tmp` too, where other users can read it and the next run will overwrite it.',
    },
    {
      kind: 'read',
      id: 'strict',
      title: 'Strict mode: three switches',
      md: `Put one line straight under the shebang of every script:

\`\`\`bash
#!/bin/bash
set -euo pipefail
\`\`\`

| Switch | Without it | With it |
|---|---|---|
| \`-e\` | a failed command is ignored and the next line runs | the script stops at the first command that fails |
| \`-u\` | an unset variable quietly expands to nothing | using an unset variable is an error, and the script stops |
| \`-o pipefail\` | a pipeline’s status is its **last** command’s | a pipeline fails if **any** of its commands fails |

These belong in scripts. Don’t type \`set -e\` at your own prompt: the first command that failed would close your terminal.`,
    },
    {
      kind: 'task',
      id: 't-typo',
      md: `A classic one-letter slip: the script sets \`logdir\` but reads \`$log_dir\`. Without \`-u\`, bash would print \`Scanning \` and carry on. Write \`~/lab/typo.sh\` with \`nano\` (or a heredoc):

\`\`\`bash
${TYPO_SH}\`\`\`

Then run it: \`bash ~/lab/typo.sh\``,
      check: { output: '', status: 1 },
      solution: `cat > ~/lab/typo.sh <<'EOF'\n${TYPO_SH}EOF\nbash ~/lab/typo.sh`,
      hints: [
        '`nano ~/lab/typo.sh`, type the five lines, then Save & close.',
        'Run it with `bash ~/lab/typo.sh`.',
        'The red message is the point: `log_dir: unbound variable`.',
      ],
      explain: 'Nothing on stdout, `log_dir: unbound variable` on stderr, exit status 1: the script stopped at line 4 instead of scanning nothing. Now imagine the same slip in `rm -rf "$backup_dir"/*`. Without `-u`, the empty variable turns it into `rm -rf /*`.',
    },
    {
      kind: 'predict',
      id: 'p-pipefail',
      md: 'Last week’s rotated log, `/var/log/auth.log.1`, hasn’t been copied to this machine. What reaches stdout?',
      code: 'set -o pipefail\ngrep "Failed password" /var/log/auth.log.1 | wc -l\necho "status: $?"',
      options: ['0\nstatus: 0', '0\nstatus: 2', 'status: 2', '0\nstatus: 1'],
      answer: 1,
      explain: '`wc` counted zero lines and succeeded. Without `pipefail`, that success would be the pipeline’s status, and a missing log would look exactly like a week with no attacks. With `pipefail`, grep’s 2 (“no such file”) wins, and under `set -e` the script would stop right there.',
    },
    {
      kind: 'task',
      id: 't-count',
      md: `Mara’s \`~/tools/count.sh\` already has the header:

\`\`\`bash
set -euo pipefail
for f in "$HOME"/logs/*.log; do
  n=$(grep -c ERROR "$f")
  echo "\${f##*/}: $n"
done
\`\`\`

\`~/logs\` holds three logs. Run it and print its exit status.`,
      check: { output: 'db01.log: 4\nexit: 1\n' },
      solution: 'bash ~/tools/count.sh; echo "exit: $?"',
      hints: ['Run it with `bash`, then `echo "exit: $?"` on the same line.', '`bash ~/tools/count.sh; echo "exit: $?"`'],
      explain: 'One log, then silence and status 1. `mail01.log` has no errors, so `grep -c` printed `0` **and exited with status 1**, which is how grep says “no match”. `set -e` took that for a failure and stopped the script without a word. It’s the most common surprise of strict mode.',
    },
    {
      kind: 'read',
      id: 'bites',
      title: 'Where strict mode bites',
      md: `Three things look like failures to \`set -e\` and \`set -u\`, but aren’t:

| Line | Why it stops the script | Fix |
|---|---|---|
| \`n=$(grep -c ERROR "$f")\` | no match: grep exits 1 | \`n=$(grep -c ERROR "$f" \\|\\| true)\` |
| \`((n++))\` with \`n=0\` | \`n++\` gives the old value, 0, and \`(( 0 ))\` exits 1 | \`n=$((n + 1))\` |
| \`file=$1\` with no arguments | \`$1\` is unset | \`file=\${1:-}\`, then test it with \`[ -z "$file" ]\` |

\`|| true\` means “a failure here is fine”, so use it only where you mean it. \`set -e\` also ignores a command that fails inside an \`if\` condition or on the left of \`&&\` or \`||\`. That’s why \`cd "$dir" || exit 1\` is safe in a strict script.`,
    },
    {
      kind: 'task',
      id: 't-fix',
      md: 'Fix `count.sh`: add `|| true` inside the `$( )`, so a log with no errors counts as 0 instead of stopping the script. Edit the line with `nano ~/tools/count.sh` (or rewrite the file with a heredoc), then run it.',
      check: { output: 'db01.log: 4\nmail01.log: 0\nweb01.log: 3\n', fs: [{ path: '~/tools/count.sh', contains: '|| true' }] },
      solution: COUNT_FIXED,
      hints: ['The line to change is `n=$(grep -c ERROR "$f")`.', 'It becomes `n=$(grep -c ERROR "$f" || true)`. Save & close.', 'Then run `bash ~/tools/count.sh`.'],
      explain: '`mail01.log: 0`, the line that used to kill the script, is the best news in the report: a mail server with a clean night. `|| true` turns grep’s “no match” back into success, and `grep -c` has already printed its 0.',
    },
    {
      kind: 'predict',
      id: 'p-incr',
      md: 'One more strict-mode trap. What does this script print?',
      code: `cat > t.sh <<'EOF'
set -e
n=0
((n++))
echo "done: $n"
EOF
bash t.sh`,
      options: ['done: 1', 'done: 0', 'Nothing at all', 'An error message about (( ))'],
      answer: 2,
      explain: 'Nothing, with exit status 1. `n++` hands back the old value, 0; `(( ))` treats 0 as false and returns 1; `set -e` stops the script before the `echo`. Counters in strict scripts use `n=$((n + 1))`, which always succeeds.',
    },
    {
      kind: 'read',
      id: 'trap',
      title: 'Clean up, whatever happens',
      md: `\`\`\`bash
tmp=$(mktemp)                  # e.g. /tmp/tmp.k3Jd8Qx1Za
trap 'rm -f "$tmp"' EXIT       # runs when the script exits, for any reason
\`\`\`

- **\`mktemp\`** creates an empty file with a random name, readable only by you (mode 600). Two runs at once never share a file, and nobody can guess the name in advance and plant something there.
- **\`trap 'COMMANDS' EXIT\`** runs the commands when the script ends: after the last line, at an \`exit\`, or when \`set -e\` stops it.
- The single quotes keep \`$tmp\` from being expanded until the trap actually runs.

Set the trap straight after \`mktemp\`, before any line that could fail.`,
    },
    {
      kind: 'task',
      id: 't-trap',
      md: `Write \`~/lab/tidy.sh\` with \`nano\` (or a heredoc). It counts the errors in a folder through a temp file:

\`\`\`bash
${TIDY_SH}\`\`\`

Run it on \`~/logs\`, then on \`~/incoming\` (no logs until 02:00, so that run will fail: hide its error), then list \`/tmp\`, all on one line:

\`bash ~/lab/tidy.sh ~/logs; bash ~/lab/tidy.sh ~/incoming 2>/dev/null; ls /tmp\``,
      check: { output: 'reference', fs: [{ path: '~/lab/tidy.sh', contains: 'trap' }] },
      solution: `cat > ~/lab/tidy.sh <<'EOF'\n${TIDY_SH}EOF\nbash ~/lab/tidy.sh ~/logs; bash ~/lab/tidy.sh ~/incoming 2>/dev/null; ls /tmp`,
      hints: [
        '`nano ~/lab/tidy.sh`, type the six lines, then Save & close.',
        'Then the three commands on one line: `bash ~/lab/tidy.sh ~/logs; bash ~/lab/tidy.sh ~/incoming 2>/dev/null; ls /tmp`',
        'If `/tmp` shows a `tmp.…` file, the `trap` line is missing or misspelled. Fix it, remove the leftovers with `rm /tmp/tmp.*`, and run the line again.',
      ],
      explain: 'Seven errors from the first run. The second run died at `grep` with status 2, before its `echo`, yet `/tmp` holds only Raj’s `errors.tmp` from earlier. Both temp files came and went, because the trap runs on every exit, failures included. Clean up after Raj while you’re there: `rm /tmp/errors.tmp`.',
    },
    {
      kind: 'read',
      id: 'logging',
      title: 'Talk to people on stderr',
      md: `A script has two audiences. **stdout** is the product: the report someone saves to a file or feeds into an alert. **stderr** is the conversation: progress, warnings, errors. Keep them apart, and \`> report.txt\` captures a clean report while the messages still reach the screen, or cron’s email.

\`\`\`bash
log() { printf '[%s] %s: %s\\n' "$(date +%T)" "$1" "$2" >&2; }
die() { log ERROR "$1"; exit "\${2:-1}"; }

log INFO "scanning $logfile"
[ -r "$logfile" ] || die "cannot read $logfile"
\`\`\`

- \`date +%T\` stamps the time (\`02:00:13\`), and the level (\`INFO\`, \`WARN\`, \`ERROR\`) lets you \`grep\` the log later.
- \`>&2\` sends the line to stderr.
- \`die\` logs and exits in one step. Its optional second argument is the exit status: 1 by default, 2 for “called wrongly”.`,
    },
    {
      kind: 'task',
      id: 't-scan',
      md: '`~/tools/scan.sh` is the Day 14 detector after Mara’s review, built with exactly these two functions. Its `-v` option switches on `INFO` messages.\n\nRun it with `-v -t 20` on `/var/log/auth.log`, appending its stderr to `~/lab/scan.log` with `2>>`. Only the report should reach your screen.',
      check: { output: 'reference', fs: [{ path: '~/lab/scan.log', contains: 'INFO: scanning /var/log/auth.log, threshold 20' }] },
      solution: 'bash ~/tools/scan.sh -v -t 20 /var/log/auth.log 2>> ~/lab/scan.log',
      hints: ['Options go before the log file: `scan.sh -v -t 20 /var/log/auth.log`.', '`2>> FILE` appends stderr to FILE.', '`bash ~/tools/scan.sh -v -t 20 /var/log/auth.log 2>> ~/lab/scan.log`'],
      explain: 'One IP over 20: the one that got in. `cat ~/lab/scan.log` shows the two timestamped `INFO` lines. Under cron that split is exactly what you want: the report goes wherever the job sends stdout, and the diagnostics wait in a log until someone needs them.',
    },
    {
      kind: 'read',
      id: 'getopts',
      title: 'getopts: real options',
      md: `\`scan.sh -v -t 20 FILE\`, \`scan.sh -t 20 -v FILE\` and \`scan.sh -vt20 FILE\` all mean the same thing. This loop makes that work:

\`\`\`bash
threshold=10; verbose=0            # defaults first
while getopts "t:vh" opt; do
  case $opt in
    t) threshold=$OPTARG ;;
    v) verbose=1 ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;        # unknown option, or -t without a value
  esac
done
shift $((OPTIND - 1))              # drop the options: $1 is now the log file
\`\`\`

- \`"t:vh"\` lists the letters. A \`:\` after a letter means it takes a value, which arrives in **\`$OPTARG\`**.
- Each round puts one letter in \`opt\`. A bad option becomes \`?\` and lands in \`*)\`.
- **\`$OPTIND\`** is the number of the next argument to read, so \`shift $((OPTIND - 1))\` removes every option at once.
- \`-h\` prints help to stdout and exits 0, because the user asked for it. A mistake prints it to stderr and exits 2.`,
    },
    {
      kind: 'fill',
      id: 'f-getopts',
      md: 'Complete the option loop for a script that takes `-n COUNT` and a `-q` switch, then drops the options so `$1` is the file.',
      template: 'while getopts "___" opt; do\n  case $opt in\n    n) count=___ ;;\n    q) quiet=1 ;;\n    *) exit 2 ;;\n  esac\ndone\nshift $((___ - 1))',
      answers: [['n:q', 'qn:'], ['$OPTARG', '"$OPTARG"', '${OPTARG}'], ['OPTIND', '$OPTIND']],
      explain: '`n:` because `-n` takes a value; `q` alone because it’s a switch. The value arrives in `$OPTARG`, and `OPTIND` points just past the last option, so the shift leaves only the operands.',
    },
    {
      kind: 'read',
      id: 'polish',
      title: 'Empty globs and honest colour',
      md: `**Empty globs.** When nothing matches, bash leaves the pattern as plain text: before 02:00, \`for f in ~/incoming/*.log\` runs once, with \`f\` set to \`/home/analyst/incoming/*.log\`. After **\`shopt -s nullglob\`**, a pattern with no matches expands to nothing:

\`\`\`bash
shopt -s nullglob
logs=(~/incoming/*.log)        # an empty array, not the pattern
echo "\${#logs[@]} new logs"    # 0 new logs
\`\`\`

**Colour only for people.** \`tput setaf 1\` prints the code for red and \`tput sgr0\` resets it (\`printf '\\033[31m'\` and \`printf '\\033[0m'\` do the same by hand). In a file or a cron email those codes turn into junk like \`^[[31m\`. **\`[ -t 1 ]\`** is true only when stdout is a terminal, so ask first:

\`\`\`bash
if [ -t 1 ]; then red=$(tput setaf 1); reset=$(tput sgr0); else red=""; reset=""; fi
\`\`\``,
    },
    {
      kind: 'task',
      id: 't-colour',
      md: 'Paint one alert by hand. Save the codes from `tput` in `red` and `reset`, then print `ALERT 198.51.100.23 31` with only the word `ALERT` in red.',
      check: { output: 'ALERT 198.51.100.23 31\n', uses: ['tput'] },
      solution: 'red=$(tput setaf 1); reset=$(tput sgr0); echo "${red}ALERT${reset} 198.51.100.23 31"',
      hints: [
        '`red=$(tput setaf 1)` stores the code instead of printing it. Do the same for `reset` with `tput sgr0`.',
        'The braces matter: `$redALERT` would be a variable called `redALERT`.',
        '`red=$(tput setaf 1); reset=$(tput sgr0); echo "${red}ALERT${reset} 198.51.100.23 31"`',
      ],
      explain: 'The checker strips colour codes before comparing, the way any program reading your output would want them stripped. That’s why `scan.sh` only fills `red` when `[ -t 1 ]` says a person is watching: `scan.sh … > alerts.txt` and cron both get clean text.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-guards',
      md: '**Drill 1.** Test the scanner’s guards the way a reviewer would. Loop over the thresholds `10`, `ten` and `-5`. For each one, run `scan.sh -t "$t" /var/log/auth.log` with all its output thrown away (`> /dev/null 2>&1`), then print `THRESHOLD -> STATUS`.',
      check: { output: '10 -> 0\nten -> 2\n-5 -> 2\n', nodes: ['for'] },
      solution: 'for t in 10 ten -5; do bash ~/tools/scan.sh -t "$t" /var/log/auth.log > /dev/null 2>&1; echo "$t -> $?"; done',
      hints: ['`for t in 10 ten -5; do …; done`', 'Inside: run the scanner with `> /dev/null 2>&1`, then `echo "$t -> $?"`.', '`for t in 10 ten -5; do bash ~/tools/scan.sh -t "$t" /var/log/auth.log > /dev/null 2>&1; echo "$t -> $?"; done`'],
      explain: '`-5` got past getopts (an option that takes a value takes the next word, dash or not) and was stopped by the `[[ =~ ^[0-9]+$ ]]` check. Delete that one line and `-t ten` doesn’t fail at all: every `[ "$count" -ge "$threshold" ]` prints `integer expression expected`, counts as false, and the report ends `Suspicious IPs: 0` with status 0. Validation is what turns a confident lie into a refusal.',
    },
    {
      kind: 'task',
      id: 'd-glob',
      md: '**Drill 2.** It’s 01:59 and `~/incoming` is still empty. On one line: switch on `nullglob`, load `~/incoming/*.log` into an array `logs`, print `N new logs`, then switch it off again with `shopt -u nullglob`.',
      check: { output: '0 new logs\n', uses: ['shopt'] },
      solution: 'shopt -s nullglob; logs=(~/incoming/*.log); echo "${#logs[@]} new logs"; shopt -u nullglob',
      hints: ['`shopt -s nullglob` first, then `logs=(~/incoming/*.log)`.', '`${#logs[@]}` is the number of items.', '`shopt -s nullglob; logs=(~/incoming/*.log); echo "${#logs[@]} new logs"; shopt -u nullglob`'],
      explain: 'Zero, which is the truth. Without `nullglob` the array holds one item, the pattern itself, and a script would go on to `grep` a file called `*.log`. Why switch it off again? With `nullglob` on, `ls ~/incoming/*.log` becomes a bare `ls` and lists the current folder instead. Turn it on inside scripts, where you control every glob, not at your prompt.',
    },
    {
      kind: 'task',
      id: 'd-opts',
      md: '**Drill 3.** Write `~/lab/opts.sh`, a test bench for getopts. It takes `-t VALUE` (default `10`) and `-v` (default `0`), then one optional operand, and prints `threshold=… verbose=… file=…`. With no operand it prints `file=none`: use `${1:-none}`, or `set -u` will stop it. Put strict mode at the top.\n\nThen run `bash ~/lab/opts.sh -v -t 5 auth.log; bash ~/lab/opts.sh`.',
      check: { output: 'threshold=5 verbose=1 file=auth.log\nthreshold=10 verbose=0 file=none\n', fs: [{ path: '~/lab/opts.sh', contains: 'getopts' }] },
      solution: OPTS,
      hints: [
        'Copy the shape of the loop in `scan.sh` (`cat ~/tools/scan.sh`), with the letters `"t:v"`.',
        'After the loop, `shift $((OPTIND - 1))`, then one `echo` with `$threshold`, `$verbose` and `${1:-none}`.',
        'The loop: `while getopts "t:v" opt; do case $opt in t) threshold=$OPTARG ;; v) verbose=1 ;; *) exit 2 ;; esac; done`',
      ],
      explain: 'The second run had no arguments at all: getopts found nothing, `shift $((OPTIND - 1))` shifted by zero, and `${1:-none}` kept `set -u` happy. Try `bash ~/lab/opts.sh -x` as well: getopts complains on stderr, and the `*)` branch exits with status 2.',
    },
    {
      kind: 'task',
      id: 'd-harden',
      md: `**Drill 4.** Ship it. Rewrite \`~/tools/fragile.sh\` so it passes the checklist, using \`scan.sh\` as your model:

- \`set -euo pipefail\`, plus the \`log\` and \`die\` functions;
- \`dir=\${1:-}\`: if it’s empty, \`die\` with a usage message and status 2; if it isn’t a folder, \`die\`;
- no \`cd\`: with \`nullglob\` on, collect \`"$dir"/*.log\` into an array, and \`die\` if it’s empty;
- a temp file from \`mktemp\`, removed by a trap;
- \`grep … || true\`, so a folder with no errors reports \`Errors: 0\`.

Keep the two output lines (\`Report for DIR\`, \`Errors: N\`). Then run it on the folder with a space in its name, and on the empty drop folder:

\`bash ~/tools/fragile.sh ~/"ops logs"; bash ~/tools/fragile.sh ~/incoming 2>/dev/null || echo "refused: $?"\``,
      check: {
        output: 'Report for /home/analyst/ops logs\nErrors: 2\nrefused: 1\n',
        fs: [
          { path: '~/tools/fragile.sh', contains: 'pipefail' },
          { path: '~/tools/fragile.sh', contains: 'trap' },
        ],
      },
      solution: `cat > ~/tools/fragile.sh <<'EOF'\n${HARDENED}EOF\nbash ~/tools/fragile.sh ~/"ops logs"; bash ~/tools/fragile.sh ~/incoming 2>/dev/null || echo "refused: $?"`,
      hints: [
        'Start from the header and the two functions in `scan.sh`, then the guards: `dir=${1:-}`, `[ -n "$dir" ] || die "usage: fragile.sh DIR" 2`, `[ -d "$dir" ] || die "no such folder: $dir"`.',
        'The logs: `shopt -s nullglob`, `logs=("$dir"/*.log)`, then `[ "${#logs[@]}" -gt 0 ] || die "no .log files in $dir"`.',
        'The work: `tmp=$(mktemp)`, `trap \'rm -f "$tmp"\' EXIT`, `grep -h ERROR "${logs[@]}" > "$tmp" || true`, then the two `echo` lines with `"$tmp"` quoted.',
      ],
      explain: 'Same job, new manners. The folder with a space works because nothing is unquoted and nothing needs `cd`. The empty drop folder is refused with status 1 instead of being reported as a clean night: “no logs” and “no errors” are different answers, and only one of them is good news. And whatever happens, the temp file is gone. That’s a script Mara can sign.',
    },
  ],
  debrief: {
    summary: [
      '`set -euo pipefail` under the shebang: stop at a failed command, at an unset variable, and at a failure anywhere in a pipeline. It belongs in scripts, not at your prompt.',
      'Strict mode bites on `grep` with no match (`|| true`), on `((n++))` from 0 (`n=$((n + 1))`) and on a missing `$1` (`${1:-}`).',
      '`tmp=$(mktemp)` plus `trap \'rm -f "$tmp"\' EXIT` cleans up on every exit, including when `set -e` stops the script.',
      '`log` writes `[time] LEVEL: message` to stderr and `die` logs and exits, so stdout stays a clean report.',
      '`getopts "t:vh"` with `$OPTARG` and `shift $((OPTIND - 1))` gives a script real options. Check values with `[[ =~ ]]`, empty globs with `nullglob`, and colour only when `[ -t 1 ]`.',
    ],
    cards: ['c-d19-strict', 'c-d19-pipefail', 'c-d19-grepok', 'c-d19-incr', 'c-d19-optarg', 'c-d19-trap', 'c-d19-log', 'c-d19-getopts', 'c-d19-nullglob', 'c-d19-tty'],
  },
  cards: [
    { id: 'c-d19-strict', day: 19, tag: 'scripting', front: 'The strict-mode header, and what each part does?', back: '`set -euo pipefail`: `-e` stops at a failed command, `-u` stops at an unset variable, `pipefail` makes a pipeline fail if any stage fails.' },
    { id: 'c-d19-pipefail', day: 19, tag: 'scripting', front: 'Without `pipefail`, what is the status of `grep x missing.log | wc -l`?', back: '0, from `wc`, so the missing file goes unnoticed. With `set -o pipefail` it’s grep’s 2.' },
    { id: 'c-d19-grepok', day: 19, tag: 'scripting', front: 'Count matches in a strict script without dying when there are none?', back: '`n=$(grep -c ERROR "$f" || true)` — grep exits 1 on no match, and `set -e` would stop the script.' },
    { id: 'c-d19-incr', day: 19, tag: 'scripting', front: 'Why does `((n++))` stop a strict script when `n` is 0? The fix?', back: '`n++` returns the old value, 0, and `(( 0 ))` exits 1. Write `n=$((n + 1))`.' },
    { id: 'c-d19-optarg', day: 19, tag: 'scripting', front: 'Read an optional `$1` in a script with `set -u`?', back: '`file=${1:-}`, then test it: `[ -n "$file" ] || die "usage: …" 2`.' },
    { id: 'c-d19-trap', day: 19, tag: 'scripting', front: 'Delete a temp file however the script ends?', back: '`tmp=$(mktemp)`, then `trap \'rm -f "$tmp"\' EXIT`. It runs after the last line, at `exit`, and when `set -e` stops the script.' },
    { id: 'c-d19-log', day: 19, tag: 'scripting', front: 'A `log` function that writes `[02:00:13] WARN: message` to stderr, and a `die` to go with it?', back: "`log() { printf '[%s] %s: %s\\n' \"$(date +%T)\" \"$1\" \"$2\" >&2; }` and `die() { log ERROR \"$1\"; exit \"${2:-1}\"; }`" },
    { id: 'c-d19-getopts', day: 19, tag: 'scripting', front: 'Take `-t VALUE` and `-v`, then leave only the operands in `$@`?', back: '`while getopts "t:v" opt; do case $opt in t) t=$OPTARG ;; v) v=1 ;; *) exit 2 ;; esac; done; shift $((OPTIND - 1))`' },
    { id: 'c-d19-nullglob', day: 19, tag: 'scripting', front: 'Make `*.log` expand to nothing when no file matches?', back: '`shopt -s nullglob`. Then `logs=(*.log)` is an empty array instead of the literal pattern. Use it in scripts, not at your prompt.' },
    { id: 'c-d19-tty', day: 19, tag: 'scripting', front: 'Print colour only when a person is watching?', back: '`if [ -t 1 ]; then red=$(tput setaf 1); reset=$(tput sgr0); else red=""; reset=""; fi`. `[ -t 1 ]` is true only when stdout is a terminal.' },
  ],
};
