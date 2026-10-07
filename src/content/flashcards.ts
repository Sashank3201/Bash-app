// Spaced-repetition cards, unlocked by finishing missions.

import type { Flashcard } from './types';

export const FLASHCARDS: Flashcard[] = [
  // Day 1
  { id: 'c-shell', day: 1, tag: 'basics', front: 'Terminal vs shell vs bash?', back: 'The **terminal** is the window. The **shell** is the program that reads and runs your commands. **Bash** is the shell we use.' },
  { id: 'c-prompt', day: 1, tag: 'basics', front: 'Decode `analyst@halden-ws01:~$`', back: '**analyst** = user, **halden-ws01** = machine, **~** = current folder (home), **$** = normal user (**#** would mean root).' },
  { id: 'c-pwd', day: 1, tag: 'navigation', front: 'Which command prints the folder you are in?', back: '`pwd` — print working directory.' },
  { id: 'c-ls', day: 1, tag: 'files', front: 'List files including hidden ones, in long format?', back: '`ls -la` (`-l` long, `-a` all).' },
  { id: 'c-cat', day: 1, tag: 'files', front: 'Print a file’s contents to the screen?', back: '`cat FILE`' },
  { id: 'c-anatomy', day: 1, tag: 'basics', front: 'Name the three parts of `ls -l /var/log`', back: '**command** `ls` · **option** `-l` · **argument** `/var/log`.' },
  { id: 'c-man', day: 1, tag: 'basics', front: 'How do you read the manual for a command?', back: '`man COMMAND`, e.g. `man grep`.' },
  { id: 'c-tilde', day: 1, tag: 'navigation', front: 'What does `~` mean?', back: 'Your home directory — here `/home/analyst`.' },

  // Day 2
  { id: 'c-abs-rel', day: 2, tag: 'navigation', front: 'Absolute vs relative path?', back: 'Absolute starts with `/` and works from anywhere (`/var/log`). Relative starts from where you are (`logs/app.log`).' },
  { id: 'c-dotdot', day: 2, tag: 'navigation', front: 'What do `.` and `..` mean?', back: '`.` = this directory. `..` = the parent directory.' },
  { id: 'c-cdhome', day: 2, tag: 'navigation', front: 'Fastest way home?', back: '`cd` with no argument (or `cd ~`).' },
  { id: 'c-cddash', day: 2, tag: 'navigation', front: 'Jump back to the previous directory?', back: '`cd -`' },
  { id: 'c-hidden', day: 2, tag: 'files', front: 'What makes a file hidden, and how do you see it?', back: 'Its name starts with a dot. `ls -a` shows it.' },
  { id: 'c-varlog', day: 2, tag: 'navigation', front: 'Where do Linux logs live?', back: '`/var/log` — e.g. `/var/log/auth.log` for logins and sudo.' },
  { id: 'c-etc', day: 2, tag: 'navigation', front: 'What lives in `/etc`?', back: 'System configuration files, e.g. `/etc/passwd`, `/etc/ssh/sshd_config`.' },
  // Day 3
  { id: 'c-mkdirp', day: 3, tag: 'files', front: 'Create `a/b/c` even if `a` doesn’t exist?', back: '`mkdir -p a/b/c`' },
  { id: 'c-cpr', day: 3, tag: 'files', front: 'Copy a whole folder?', back: '`cp -r SRC DEST` (add `-p` to keep timestamps).' },
  { id: 'c-mvrename', day: 3, tag: 'files', front: 'How do you rename a file?', back: '`mv old.txt new.txt` — mv renames when the destination isn’t a folder.' },
  { id: 'c-star', day: 3, tag: 'globs', front: 'What does `*` match in a glob?', back: 'Any run of characters, including none. `*.log` = every name ending in .log.' },
  { id: 'c-question', day: 3, tag: 'globs', front: 'What does `?` match in a glob?', back: 'Exactly one character. `auth.log.?` matches auth.log.1 but not auth.log.10.' },
  { id: 'c-rm', day: 3, tag: 'files', front: 'Safe habit before `rm` with a wildcard?', back: 'Run the same pattern with `ls` first and check exactly what matches. rm has no undo.' },
  { id: 'c-expansion', day: 3, tag: 'globs', front: 'Who expands `*.png` — bash or the command?', back: 'Bash, before the command runs. The command just receives the list of matching names.' },
  // Day 4
  { id: 'c-head', day: 4, tag: 'text', front: 'First 3 lines of a file?', back: '`head -n 3 FILE` (or `head -3`)' },
  { id: 'c-tail', day: 4, tag: 'text', front: 'Last 20 lines of a log?', back: '`tail -n 20 FILE`' },
  { id: 'c-wcl', day: 4, tag: 'text', front: 'Count the lines in a file?', back: '`wc -l FILE` (or `wc -l < FILE` for just the number)' },
  { id: 'c-grep', day: 4, tag: 'grep', front: 'Show lines containing “Failed password”?', back: '`grep "Failed password" FILE` — quote patterns with spaces.' },
  { id: 'c-grepc', day: 4, tag: 'grep', front: 'Count matching lines with grep?', back: '`grep -c PATTERN FILE` — counts lines, not matches.' },
  { id: 'c-grepi', day: 4, tag: 'grep', front: 'Match ERROR, error and Error at once?', back: '`grep -i error FILE`' },
  { id: 'c-grepv', day: 4, tag: 'grep', front: 'Show lines that do NOT match?', back: '`grep -v PATTERN FILE`' },
  { id: 'c-authlog', day: 4, tag: 'security', front: 'Which log records SSH logins and sudo?', back: '`/var/log/auth.log` (on Red Hat systems: `/var/log/secure`).' },
  // Day 5
  { id: 'c-pipe', day: 5, tag: 'pipes', front: 'What does `A | B` do?', back: 'Sends the stdout of A into the stdin of B.' },
  { id: 'c-streams', day: 5, tag: 'pipes', front: 'Name the three standard streams and their numbers.', back: 'stdin (0), stdout (1), stderr (2).' },
  { id: 'c-sortuniq', day: 5, tag: 'pipes', front: 'Why `sort` before `uniq`?', back: '`uniq` only collapses NEIGHBOURING duplicates, so equal lines must be next to each other.' },
  { id: 'c-topn', day: 5, tag: 'pipes', front: 'The “top N” ranking pipeline?', back: '`… | sort | uniq -c | sort -rn | head -N`' },
  { id: 'c-redirect', day: 5, tag: 'redirection', front: '`>` vs `>>`?', back: '`>` overwrites the file, `>>` appends to it.' },
  { id: 'c-append', day: 5, tag: 'redirection', front: 'Save errors to a file?', back: '`cmd 2> errors.txt`' },
  { id: 'c-devnull', day: 5, tag: 'redirection', front: 'Throw away error messages?', back: '`cmd 2>/dev/null`' },
  { id: 'c-21', day: 5, tag: 'redirection', front: 'Output AND errors into one file?', back: '`cmd > file 2>&1` (or `cmd &> file`)' },
  // Day 6
  { id: 'c-uid0', day: 6, tag: 'permissions', front: 'Which UID is root?', back: 'UID 0 — whatever the account is named. Any extra UID-0 account is a red flag.' },
  { id: 'c-passwd', day: 6, tag: 'permissions', front: 'Fields of an /etc/passwd line?', back: 'name : x : UID : GID : description : home : shell' },
  { id: 'c-rwx', day: 6, tag: 'permissions', front: 'Decode `-rwxr-x---`', back: 'File. Owner rwx, group r-x, others nothing (750).' },
  { id: 'c-octal', day: 6, tag: 'permissions', front: 'Octal values of r, w, x?', back: 'r = 4, w = 2, x = 1. Add per column: rw- = 6, r-x = 5.' },
  { id: 'c-chmodx', day: 6, tag: 'permissions', front: 'Make a script executable?', back: '`chmod +x script.sh`' },
  { id: 'c-600', day: 6, tag: 'permissions', front: 'Mode for a private key file?', back: '`600` (rw-------): only the owner can read/write.' },
  { id: 'c-sudo', day: 6, tag: 'permissions', front: 'What does sudo do, and where is it recorded?', back: 'Runs one command as root. Every use is logged in `/var/log/auth.log`.' },
  { id: 'c-dirx', day: 6, tag: 'permissions', front: 'What does `x` mean on a directory?', back: 'Permission to enter it (cd into it / access files inside).' },
  // Day 7
  { id: 'c-shebang', day: 7, tag: 'scripting', front: 'What is `#!/bin/bash`?', back: 'The shebang: tells the system to run the file with bash.' },
  { id: 'c-runscript', day: 7, tag: 'scripting', front: 'Two ways to run `snap.sh`?', back: '`bash snap.sh`, or `chmod +x snap.sh` then `./snap.sh`.' },
  { id: 'c-varset', day: 7, tag: 'scripting', front: 'Why does `x = 5` fail?', back: 'Spaces make bash run a command called `x`. Write `x=5`.' },
  { id: 'c-quotes', day: 7, tag: 'scripting', front: 'Single vs double quotes?', back: 'Double quotes expand `$vars` and `$(cmds)`; single quotes keep everything literal.' },
  { id: 'c-cmdsub', day: 7, tag: 'scripting', front: 'Store a command’s output in a variable?', back: '`var=$(command)`' },
  { id: 'c-braces', day: 7, tag: 'scripting', front: 'Print the value of `host` followed by `-01`?', back: '`echo "${host}-01"` — braces mark where the name ends.' },
  // Day 8
  { id: 'c-positional', day: 8, tag: 'scripting', front: 'Inside a script, where is the first argument?', back: '`$1` (then `$2`, `$3`…). `$0` is the script’s own name.' },
  { id: 'c-argcount', day: 8, tag: 'scripting', front: 'How many arguments did the script get?', back: '`$#`' },
  { id: 'c-atquote', day: 8, tag: 'scripting', front: 'Pass all of a script’s arguments on, keeping each one intact?', back: '`"$@"` — with the quotes.' },
  { id: 'c-exitcode', day: 8, tag: 'scripting', front: 'What does exit status 0 mean?', back: 'Success. Anything from 1 to 255 means some kind of failure.' },
  { id: 'c-dollarq', day: 8, tag: 'scripting', front: 'Where is the exit status of the last command?', back: '`$?` — read it straight away, because the next command overwrites it.' },
  { id: 'c-exitn', day: 8, tag: 'scripting', front: 'End a script with “wrong usage”?', back: '`exit 2` (by convention 1 = general failure, 2 = usage error).' },
  { id: 'c-grepq', day: 8, tag: 'grep', front: 'What does `grep -q` do?', back: 'Prints nothing; it only sets the exit status: 0 = found, 1 = not found.' },
  { id: 'c-read', day: 8, tag: 'scripting', front: 'Ask the user for a value with a prompt?', back: '`read -r -p "Prompt: " var` — `-r` keeps backslashes literal.' },
  // Day 9
  { id: 'c-if', day: 9, tag: 'logic', front: 'What does `if` actually test?', back: 'The exit status of the command after it. 0 runs `then`; anything else skips to `elif`/`else`.' },
  { id: 'c-testspaces', day: 9, tag: 'logic', front: 'Why does `[$x -eq 1]` fail?', back: '`[` is a command and `]` is its last argument. Both need spaces: `[ "$x" -eq 1 ]`.' },
  { id: 'c-numops', day: 9, tag: 'logic', front: 'Number comparisons inside `[ ]`?', back: '`-eq -ne -lt -le -gt -ge`' },
  { id: 'c-strops', day: 9, tag: 'logic', front: 'String tests inside `[ ]`?', back: '`=` equal, `!=` not equal, `-z` empty, `-n` not empty.' },
  { id: 'c-fileops', day: 9, tag: 'logic', front: 'File tests: exists, regular file, directory, non-empty?', back: '`-e`, `-f`, `-d`, `-s` (and `-r -w -x` for permissions).' },
  { id: 'c-dbl', day: 9, tag: 'logic', front: '`[[ ]]` vs `[ ]`?', back: '`[[ ]]` is bash-only and safer: no word splitting, `&&`/`||` inside, `==` with patterns, `=~` for regex.' },
  { id: 'c-andor', day: 9, tag: 'logic', front: '`A && B` vs `A || B`?', back: '`&&` runs B only if A succeeded. `||` runs B only if A failed.' },
  { id: 'c-elif', day: 9, tag: 'logic', front: 'Three-way branch syntax?', back: '`if …; then …; elif …; then …; else …; fi`' },
  // Day 10
  { id: 'c-for', day: 10, tag: 'loops', front: 'Loop over three hostnames?', back: '`for h in web01 db01 mail01; do echo "$h"; done`' },
  { id: 'c-forglob', day: 10, tag: 'loops', front: 'Loop over every .log file in a folder safely?', back: '`for f in "$dir"/*.log; do … "$f" …; done` — quote the variable, not the `*`.' },
  { id: 'c-whileread', day: 10, tag: 'loops', front: 'Process a file line by line?', back: '`while read -r line; do …; done < file`' },
  { id: 'c-ifs', day: 10, tag: 'loops', front: 'Split /etc/passwd lines into fields with read?', back: '`while IFS=: read -r name _ uid _; do …; done < /etc/passwd`' },
  { id: 'c-arith', day: 10, tag: 'loops', front: 'Add n to a running total?', back: '`total=$((total + n))` (or `((total += n))`).' },
  { id: 'c-continue', day: 10, tag: 'loops', front: '`continue` vs `break`?', back: '`continue` skips to the next item. `break` leaves the loop completely.' },
  { id: 'c-until', day: 10, tag: 'loops', front: 'What does `until` do?', back: 'Repeats its body until the condition becomes true — `while` turned inside out.' },
  { id: 'c-forcat', day: 10, tag: 'loops', front: 'Why not `for line in $(cat file)`?', back: 'It splits on every space, not on lines. Use `while read -r line`.' },
];

const BY_ID = new Map(FLASHCARDS.map((c) => [c.id, c]));
export function getCard(id: string): Flashcard | undefined {
  return BY_ID.get(id);
}
