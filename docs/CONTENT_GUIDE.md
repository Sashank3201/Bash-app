# Ink & Shell — content guide

How missions, cases, arena challenges and flashcards are written, checked and kept consistent.
Read this before adding or changing anything under `src/content/`.

## 1. Who it's for

- A **total beginner** learning Bash in 21 days, **on a phone**, 30–45 minutes a day, aiming at defensive security work.
- Every task must be typeable on a phone keyboard: short one-liners, or a script written with `nano` in the app.
- The tone is a premium editorial product, not a textbook. No filler, no emoji, no "Great job!".

## 2. Story canon (keep every detail consistent)

| Thing | Canon |
|---|---|
| Firm | **Halden Security** (detection & response) |
| Mentor | **Mara Okafor**, Senior Analyst, Detection & Response. She writes briefings and case briefs, signs case briefs `— Mara` |
| Colleague | **Raj Menon**, analyst. His password was guessed on web01 (Week 2) |
| Learner | account `analyst` (uid 1000) on workstation **halden-ws01**; rank Intern → Junior Analyst → Analyst → Senior Analyst → Lead Analyst |
| Accounts on the workstation | root 0, daemon 1, bin 2, sys 3, www-data 33, backup 34, syslog 104, sshd 105, analyst 1000, mara 1001, raj 1002, nobody 65534 |
| Groups | `adm` (syslog, analyst, mara) can read logs; `sudo` (mara, analyst) — sudo needs no password in the simulator |
| Servers | web01 10.20.0.21, web02 10.20.0.23, db01 10.20.0.22, mail01 10.20.0.30; workstation 10.20.0.15; **web03** is the capstone host |
| Story week | Mon 9 – Sat 14 March **2026** (`STORY_START`, `STORY_END` in `fixtures/gen.ts`). Logs carry no year; it is always 2026 |
| Week 1 attack | `203.0.113.7`, 14 failed root logins (`/var/log/auth.log` in the base fixture) |
| Week 2 breach (web01) | `198.51.100.23`: 31 failures from Mar 13 23:05, then **Accepted password for raj at Mar 13 23:51**. Others: `203.0.113.7` (14), `198.51.100.140` (12), `192.0.2.66` (9). See `ATTACK_LOG` in `missions/day14.ts` |
| Web scanners (Day 11) | `185.220.101.4` (45 × 404), `45.95.147.229` (15) — legacy; **new content uses documentation ranges only** |
| Phishing (Day 13) | from `security@northw1nd-secure.example`, mail server `198.51.100.77`, sender laptop `203.0.113.45`; links to `northw1nd-secure.example`, `files.cdn-share.example` |
| Payload host | `198.51.100.77` also serves `u.sh` (the cron payload decoded on Day 16) |

**Addresses and names:** IPs only from `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, and `10.20.0.0/24` for Halden's own machines. Domains only under `.example` (and `halden.example` for Halden). Never use a real brand or company.

## 3. Scope and safety (non-negotiable)

- **Defensive only:** log analysis, incident response, auditing, hardening, integrity, encoding.
- **Never** teach network scanning or recon automation, password cracking, exploitation, persistence or evasion. The coach tells learners that `nc`, `nmap`, `ping` and `curl` aren't in the simulator.
- Malicious commands appear **only as artifacts** that the learner finds, decodes and reports: a base64 cron line, a `cmd=` query parameter in a log. Learners never run them, and the text says so ("decode to read, never pipe to bash").
- No working malware, no real reverse-shell one-liners, no credential dumping. Fake binaries are a few ASCII bytes with a magic header (`MZ…PE\0\0`, `\x7fELF`) plus the words "training sample".
- Fixtures are ASCII. The VFS stores JS strings, and bytes ≥ 0x80 turn into UTF-8 pairs, so checksums and `xxd` would surprise you.

## 4. Files and wiring

| What | Where |
|---|---|
| Missions | `src/content/missions/dayNN.ts`, exports `dayNN: Mission` (registered in `missions/index.ts`) |
| Cases | `src/content/cases/case0N.ts`, exports `case0N: CaseFile` (registered in `cases/index.ts`) |
| Arena | `src/content/arena/<topic>.ts`, exports `challenges: Challenge[]` |
| Flashcards | days 1–14: `src/content/flashcards.ts`. Day 15 and later: `cards: Flashcard[]` **inside the mission object** (each with `day` = that day, and each listed in `debrief.cards`) |
| Fixtures | `defineFixture(id, (vfs, now) => {…}, extendsId?)`, declared in the same file that uses them |
| Shapes | `src/content/types.ts` |

Never edit the index files, `flashcards.ts`, `tests/`, `src/shell/`, `src/engine/` or another unit's files from a content task. If the simulator lacks something, work around it and report the gap.

### Fixture helpers (`fixtures/base.ts`, `fixtures/gen.ts`)

- `put(vfs, path, content, {mode, uid, gid, mtime})` writes any file and creates its parent folders.
- `dir(vfs, path, {mode, uid, gid})` creates a folder.
- `home(vfs, 'rel/path', content, mode?, mtime?)` writes a file owned by analyst under `/home/analyst`.
- `homeDir(vfs, 'rel')` creates a folder owned by analyst.
- `UID`, `GID`: number maps for the accounts and groups.
- Log generators:
  - `authLog({seed, host, noise, attackers:[{ip,count,users,at,spreadMin,success}], logins})`
  - `accessLog({seed, normal, scanners, extra})`
  - `appLog({seed, lines, errors, warnings, service, inject})`
  - `sysLog()`
- Time helpers: `syslogTime(ms)`, `apacheTime(ms)`, `STORY_START`, `STORY_END`.
- The base system (`baseSystem`) is a Halden Ubuntu 24.04 box:
  - `/var/log/auth.log` is mode 640, owned `syslog:adm` (readable through `adm`).
  - `/etc/shadow` is mode 640, owned `root:shadow` (not readable by analyst).
  - It also has an sshd_config with `PermitRootLogin prohibit-password` and `PasswordAuthentication yes`, `/etc/crontab`, and SUID `sudo`, `passwd`, `chsh` and `mount`.
- Base files are dated **2026-01-20**. The VFS clock is the real clock (`Date.now()`), and the content tests use the real clock too.
  - For `find -mtime` or `-newer` work, set mtimes relative to the fixture's `now` argument, e.g. `now - 86400000`.
  - Otherwise use fixed story dates.

## 5. Missions

A mission: `briefing` (3 short paragraphs, Mara's voice, markdown) → `objectives` (4) → `lesson` steps (10–15) → `drills` (3–4 tasks, `**Drill N.**` prefix) → `debrief` (`summary` of 4–5 bullets, `cards` of 6–10 ids). `minutes` 40–45. `caseId` opens that case.

### Step kinds
- `read` {title, md}: short, one idea, a code block or table, ≤ ~150 words.
- `note` {md}: an aside from Mara.
- `example` {code, md?}: a "Try it" command.
- `task` {md, check, solution, hints[], explain?}: the core. `explain` appears after success; use it to add the real-world point.
- `quiz` {q, options, answer, explain}: distractors must be plausible; no duplicate options.
- `predict` {code, options, answer, explain}: the test **runs `code` on a fresh copy of the mission fixture** and compares stdout with the answer option, using `\n` for newlines. Options containing "error" or "nothing" aren't run.
- `fill` {template with `___`, answers: string[][]}: each blank lists its accepted answers.
- `order` {lines, explain}: the lines in the correct order; together they must parse.
- `widget`:
  - `permissions` {start: 0o640}
  - `pipeline` {pipeline, fixture}: **always pass the mission's fixture**
  - `expansion` {setup, line}
  - `regex` {regex, text}
  - `paths`, `anatomy` (no props)

### How tasks are checked (`src/engine/grader.ts` → `checkCommand`)
All of a mission's tasks run **in order in one terminal**, so files, cwd, variables and functions carry over. A solution is submitted line by line (multi-line solutions and heredocs are fine). **Only the last command's record is checked**: `uses` and `nodes` apply to the last line typed.

Check fields:
- `output`:
  - `'reference'`: stdout must equal what `solution` prints when run on a clone of the filesystem **as it was just before the learner's command**, from the same cwd.
  - A literal string.
  - `{regex}`, `{contains: []}` or `{lines: n}`.
  - Output is normalised: ANSI codes stripped, trailing spaces and trailing blank lines removed. Add `looseSpace` to collapse inner spaces, `anyOrder` to sort lines.
- `fs`: `{path, exists | type | content | contains | mode | executable}`. `~` means `/home/analyst`.
- `uses: ['grep']`: command names that must appear. `sudo`, `time` and `command` prefixes count, as do commands run by `xargs`/`find -exec`.
- `forbid`: command names that must not appear.
- `nodes`:
  - Allowed values: `pipeline`, `andor`, `if`, `for`, `cfor`, `while` (also matches `until`), `case`, `function`, `cond` (`[[ ]]`), `arith`, `subshell`, `redirect`, `cmdsub`, `heredoc`, `variable`.
  - `< <(…)` counts as `redirect`, not `cmdsub`.
- `status`: the required exit status. Set it **only** when the task is about a failure; then stderr may be non-empty.
- `cwd`, `vars: {name: value}`.

**`'reference'` pitfalls:**
- When the learner writes a script and then runs it, a reference that only *runs* the script passes vacuously (the reference runs the learner's broken file).
- Either make the solution rewrite the file and then run it (`printf … > f && bash f`, or a heredoc), or check a literal output.

**Hard rules, enforced by `tests/content`:**
- Every solution passes its own check.
- Every solution writes **nothing to stderr** unless `check.status` is set.
- Predictions match the simulator.
- Step ids are unique.
- Every task has hints.
- Every debrief card exists.

## 6. Cases (graded projects)

`CaseFile` fields:
- `brief`: Mara's request, signed `— Mara`.
- `requirements`: precise, testable bullets.
- `usage`.
- `sampleOutput`: **must equal the visible fixture's real output**.
- `scriptPath`: `~/cases/<name>.sh`.
- `starter`: runs but is incomplete, with TODOs.
- `fixture`.
- `tests`, `solution`.
- `walkthrough`: "How it works" bullets.
- `hints`: 3–4, progressive.
- `xp`.

How `gradeCase` works: for each test it builds a **fresh** fixture (`test.fixture ?? case.fixture`) twice. It writes the learner's script into one copy and the reference into the other (mode 755). It then runs `bash SCRIPT ARGS…`, or the `run` snippet (where `$SCRIPT` is the absolute script path).
- Stdout is compared using the check: `'reference'` by default, or a literal, `regex` or `contains`, with the same normalisation as missions.
- The exit status must equal the reference's, unless `check.status` sets it.
- `check.fs` is evaluated on the learner's filesystem afterwards.

Requirements:
- **≥ 3 tests**, and the hidden ones use different fixtures (`defineFixture('case-x-variant', fn, 'case-x')`) so a hard-coded answer fails.
- Include edge cases the brief warns about: spaces in names, empty input, nothing to report.
- Include usage errors with explicit `check: { status: N }`. Usage messages go to stderr.
- The reference solution writes nothing to stderr except in status tests.
- Outputs differ between tests.
- **The starter must fail at least one test.**
- Avoid ties in sorted output unless the requirement defines a tie-break.
- Use only Bash taught by that day (or explained in the brief).
- The solution is a model answer: commented sparingly, quoting everything, `local` in functions, and guards first.

## 7. Arena challenges

`{id, title, topic, difficulty: easy|medium|hard, unlockDay, md, fixture, check, solution, hints, xp}`.
- One terminal command or a short script, checked like a mission task, in a fresh session on `fixture`.
- XP: easy 40, medium 70, hard 120.
- `unlockDay` is the day that teaches everything the challenge needs.
- Checks must accept reasonable alternative solutions. Prefer `output` checks over `uses` unless the point is the tool. Don't over-fit `nodes`.

## 8. Writing style

- **Mara's voice:** direct, warm and dry, second person, short sentences, real-world stakes. Briefings open in the story ("Overnight, …"). No exclamation-mark cheerleading.
- Prose uses typographic quotes and apostrophes (’ “ ”); code uses straight quotes. Bold for the key term on first use.
- **Markdown inside TS template literals:**
  - escape `` ` `` as `` \` `` and `${` as `\${`
  - in tables, write `|` inside a cell as `\\|`
  - in single-quoted strings, escape backslashes (`'\\n'` for the two characters `\n`)
- **Hints:** first a nudge, last nearly the answer. The **explain** adds the analyst's "so what".
- Every task teaches something; no busywork. Prefer the story's real evidence (logs, cron, configs) over toy text.

## 9. The simulator (what works, what doesn't)

Commands available:
`awk base64 basename bash bc cat chgrp chmod chown clear cmp column comm cp crontab cut date df diff dirname du egrep env expr fgrep file find fold free getent grep groups head hexdump hostname id kill last lastb less ln ls man md5sum mkdir mktemp more mv nano nl nproc paste passwd printenv ps readlink realpath rev rm rmdir sed seq sha1sum sha256sum sha512sum shuf sleep sort ss stat strings su sudo systemctl tac tail tee touch tput tr tree uname uniq uptime w wc which who whoami xargs xxd yes`

The shell itself supports:
- builtins: `echo printf read cd pwd export local declare readonly mapfile test [ [[ (( shift getopts source . return exit break continue set shopt trap type alias history`
- arrays and associative arrays
- every `${…}` form except `@` transformations
- `$(…)`, `<(…)`, heredocs and here-strings
- `set -euo pipefail` and traps

Known gaps (avoid them, or teach them in prose only):
- no `od` and no `cat -v`
- no `${x@Q}`
- no `date -d "… +2 hours"` arithmetic: compute with epoch seconds instead
- `date -d` accepts:
  - ISO dates
  - `Mon DD HH:MM:SS YYYY`
  - `DD Mon YYYY HH:MM:SS`
  - `@EPOCH`
  - `N units ago`
  - `yesterday`/`tomorrow`
  - It doesn't accept Apache's `13/Mar/2026:23:58:10` (real GNU `date` rejects that too).
- real bash exits **127** for an unbound variable under `bash -c 'set -u …'` but **1** in a script file: teach `set -u` with script files.

When unsure how real Bash behaves, run it: `/bin/bash` is installed. Use `LC_ALL=C.UTF-8 TZ=UTC`. Content must match real Bash.

## 10. Checking your work

```bash
FOCUS=day16 npm run -s focus          # one mission: runs every task in order, prints outputs
FOCUS=case:decoder npm run -s focus   # one case: prints the reference output of every test
FOCUS=arena:security npm run -s focus # one arena file
SNIPS=/path/snips.txt FX=day16 npm run -s focus   # try snippets (separated by "----" lines) on a fixture
npx vitest run tests/content tests/diff && npx tsc -b && npx eslint src tests   # the full gate
```

While other units are still being written, `completeness > no stub content remains` is expected to fail; nothing else may.
