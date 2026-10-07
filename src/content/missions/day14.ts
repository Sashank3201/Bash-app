import { defineFixture } from '../fixtures';
import { homeDir, put } from '../fixtures/base';
import { authLog, STORY_END } from '../fixtures/gen';
import type { Mission } from '../types';

/** web01's auth.log for the week of the brute-force attack. One attacker got in. */
export const ATTACK_LOG = authLog({
  seed: 14,
  noise: 30,
  attackers: [
    { ip: '203.0.113.7', count: 14, users: ['root'], at: Date.UTC(2026, 2, 13, 2, 10) },
    { ip: '198.51.100.23', count: 31, users: ['admin', 'root', 'raj', 'backup'], at: Date.UTC(2026, 2, 13, 23, 5), spreadMin: 45, success: 'raj' },
    { ip: '192.0.2.66', count: 9, users: ['test', 'oracle'], at: Date.UTC(2026, 2, 11, 14, 30) },
    { ip: '198.51.100.140', count: 12, users: ['ubuntu', 'pi'], at: Date.UTC(2026, 2, 12, 6, 0) },
  ],
});

defineFixture('day14', (vfs) => {
  put(vfs, '/var/log/auth.log', ATTACK_LOG, { mode: 0o640, uid: 104, gid: 4, mtime: STORY_END });
  homeDir(vfs, 'cases');
});

const FAILED_BY_IP = `grep "Failed password" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn`;

export const day14: Mission = {
  day: 14,
  week: 2,
  title: 'Under Attack',
  topic: 'Case: the brute-force detector',
  minutes: 45,
  fixture: 'day14',
  caseId: 'bruteforce',
  briefing: `It happened again last night, and this time it’s worse. Someone hammered \`web01\` over SSH from several addresses — and at 23:51 the log shows a **successful** password login for **raj** from one of them.

Raj was asleep. His password has been reset and the session killed, but Mara wants a tool so this never again waits until morning to be noticed: **a brute-force detector** that reads an auth log, flags every IP over a threshold, and shouts if any of them got in.

You already know every piece: grep, awk, sort, uniq, if, loops, arguments, exit codes. Today you put them together — and then you build it for real in Case 3.`,
  objectives: ['Pull fields from the end of a line with $NF', 'Rank and threshold counts with awk', 'Avoid the pipe-into-while subshell trap', 'Review Week 2 before the case'],
  lesson: [
    {
      kind: 'read',
      id: 'plan',
      title: 'The plan',
      md: `A detector is a pipeline with a decision at the end:

1. **Find** the failed attempts — \`grep "Failed password"\`
2. **Extract** the source IP from each line — \`awk\`
3. **Count** per IP and rank — \`sort | uniq -c | sort -rn\`
4. **Decide** — keep IPs at or over a threshold
5. **Check** whether any of those IPs also logged in successfully

One snag at step 2: the IP isn’t always in the same column. \`Failed password for root from IP …\` and \`Failed password for invalid user admin from IP …\` have different numbers of words. But counted **from the end**, the IP is always in the same place: \`$NF\` is the last field, so the IP is \`$(NF-3)\`.`,
    },
    {
      kind: 'task',
      id: 'rank',
      md: 'Steps 1–3: count the failed logins per source IP, biggest first.',
      check: { output: 'reference', uses: ['grep', 'awk', 'sort', 'uniq'] },
      solution: FAILED_BY_IP,
      hints: ["`awk '{print $(NF-3)}'` prints the 4th field from the end.", 'Then `| sort | uniq -c | sort -rn`.'],
    },
    {
      kind: 'task',
      id: 'threshold',
      md: 'Step 4: from that ranking, keep only IPs with **10 or more** failures, printed as `IP COUNT`. Add an awk filter at the end:\n\n`… | awk \'$1 >= 10 {print $2, $1}\'`',
      check: { output: 'reference', uses: ['awk'] },
      solution: `${FAILED_BY_IP} | awk '$1 >= 10 {print $2, $1}'`,
      hints: ['Press ↑ and add the awk stage.'],
      explain: 'Three IPs over the line. `192.0.2.66` tried 9 times, so it’s just under — thresholds are always a trade-off between noise and missed attacks.',
    },
    {
      kind: 'task',
      id: 'accepted',
      md: 'Step 5: show every **successful password** login in the log.',
      check: { output: 'reference', uses: ['grep'] },
      solution: 'grep "Accepted password" /var/log/auth.log',
      hints: ['`grep "Accepted password" /var/log/auth.log`'],
      explain: 'Same IP as the biggest attacker, a few minutes after the burst of failures. Brute force followed by success is about the clearest compromise signal an auth log can give you.',
    },
    {
      kind: 'read',
      id: 'subshell',
      title: 'The pipe-into-while trap',
      md: `You’ll want to loop over the ranking and keep a count. This looks right, but **it isn’t**:

\`\`\`bash
n=0
grep … | … | while read -r count ip; do
  n=$((n + 1))
done
echo "$n"        # prints 0!
\`\`\`

Each side of a pipe runs in its own **subshell** — a copy of the shell. The loop increments the copy’s \`n\`, and the copy disappears when the pipe ends.

The fix is to feed the loop with **process substitution** \`< <( … )\` instead of a pipe, so the loop runs in your shell:

\`\`\`bash
while read -r count ip; do
  n=$((n + 1))
done < <(grep … | …)
\`\`\``,
    },
    {
      kind: 'predict',
      id: 'p-subshell',
      md: 'What does this print?',
      code: "n=0; printf 'a\\nb\\n' | while read -r x; do n=$((n+1)); done; echo $n",
      options: ['0', '2', '1', 'An error'],
      answer: 0,
      explain: 'The loop ran in a subshell: it counted to 2 in its own copy of `n`, and that copy was thrown away.',
    },
    {
      kind: 'task',
      id: 'count-alerts',
      md: 'Count the IPs with 10+ failures **in a loop**, without falling into the trap, and print `Suspicious IPs: N`.',
      check: { output: 'Suspicious IPs: 3\n', nodes: ['while'] },
      solution: `n=0; while read -r count ip; do if [ "$count" -ge 10 ]; then n=$((n + 1)); fi; done < <(${FAILED_BY_IP}); echo "Suspicious IPs: $n"`,
      hints: ['Start with `n=0`.', 'Loop: `while read -r count ip; do if [ "$count" -ge 10 ]; then n=$((n + 1)); fi; done < <(PIPELINE)`', 'After the loop: `echo "Suspicious IPs: $n"`.'],
    },
    {
      kind: 'quiz',
      id: 'q-review-args',
      q: 'Week 2 review. A script is run as `bash check.sh web01 "db 01"`. Inside it, what is `$2`?',
      options: ['db', 'db 01', '"db 01"', 'web01 db 01'],
      answer: 1,
      explain: 'The quotes group the words into one argument; the quote characters themselves are removed.',
    },
    {
      kind: 'quiz',
      id: 'q-review-z',
      q: 'What does `[ -z "$2" ]` check?',
      options: ['That $2 is zero', 'That $2 is empty (or not given)', 'That $2 is a file', 'That $2 has a z in it'],
      answer: 1,
      explain: '`-z` is true for an empty string — a common way to give an optional argument a default.',
    },
    {
      kind: 'quiz',
      id: 'q-review-default',
      q: 'What does `threshold=${2:-10}` do?',
      options: ['Sets threshold to 2 minus 10', 'Uses $2 if it’s set and not empty, otherwise 10', 'Always sets threshold to 10', 'Sets $2 to 10'],
      answer: 1,
      explain: '`${var:-default}` means “the value, or this default if it’s missing or empty”. Perfect for optional arguments.',
    },
    {
      kind: 'quiz',
      id: 'q-review-nf',
      q: 'For the line `a b c d e`, what does `awk \'{print $(NF-1)}\'` print?',
      options: ['e', 'd', '4', 'a'],
      answer: 1,
      explain: '`NF` is 5, so `$(NF-1)` is `$4` — the second-to-last field.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-targets',
      md: '**Drill 1.** Which usernames did `198.51.100.23` try, and how many times each? In the failed lines the username is `$(NF-5)`.',
      check: { output: 'reference', uses: ['awk'] },
      solution: "grep \"Failed password\" /var/log/auth.log | grep \"198.51.100.23 \" | awk '{print $(NF-5)}' | sort | uniq -c | sort -rn",
      hints: ['Filter the failed lines to that IP with a second `grep`.', "`awk '{print $(NF-5)}'`, then rank."],
      explain: 'They tried `raj` among the usual suspects. Attackers often get real usernames from a company website or an old data breach.',
    },
    {
      kind: 'task',
      id: 'd-first',
      md: '**Drill 2.** When did `198.51.100.23` **first** fail? Print just the date and time (the first three fields) of its first `Failed password` line.',
      check: { output: 'reference', uses: ['head', 'awk'] },
      solution: "grep \"Failed password\" /var/log/auth.log | grep \"198.51.100.23 \" | head -1 | awk '{print $1, $2, $3}'",
      hints: ['`head -1` keeps the first match.', "`awk '{print $1, $2, $3}'`"],
    },
  ],
  debrief: {
    summary: [
      '`$NF` is the last field; `$(NF-3)` counts from the end — handy when lines vary in length.',
      "`… | uniq -c | awk '$1 >= 10'` turns a ranking into alerts.",
      '`cmd | while …` runs the loop in a subshell, so its variables are lost. Use `while …; done < <(cmd)`.',
      '`${2:-10}` gives an optional argument a default.',
      'Case 3 is open: the Brute-Force Detector.',
    ],
    cards: ['c-nf', 'c-threshold', 'c-subshell', 'c-procsub', 'c-default', 'c-bruteforce'],
  },
};
