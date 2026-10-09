import { defineFixture } from '../fixtures';
import { dir, GID, home, homeDir, put, UID } from '../fixtures/base';
import type { VFS } from '../../shell/vfs';
import type { Mission } from '../types';

const DEPLOY = Date.UTC(2026, 2, 9, 17, 40, 0); // the web team's last deploy
const BACKUP = Date.UTC(2026, 2, 10, 2, 30, 0); // nightly backup, /etc/crontab 02:30
const BASELINE_AT = Date.UTC(2026, 2, 10, 9, 12, 0); // baseline taken the morning after

export const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Halden Security</title>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header><img src="/assets/logo.svg" alt="Halden Security"></header>
<h1>Detection and response, around the clock</h1>
<p>We watch your systems so you can sleep.</p>
<p><a href="/about.html">About us</a> | <a href="/contact.html">Contact</a></p>
<script src="/assets/app.js"></script>
</body>
</html>
`;

/** web01's site as the web team deployed it on 9 March. */
export const SITE: Record<string, string> = {
  'about.html': `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>About - Halden Security</title>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<h1>About Halden</h1>
<p>Twelve analysts, one job: find it before it finds you.</p>
</body>
</html>
`,
  'assets/app.js': `// app.js - Halden site behaviour
document.addEventListener('DOMContentLoaded', function () {
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
`,
  'assets/logo.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><text x="0" y="24">Halden</text></svg>
`,
  'assets/site.css': `body { font-family: sans-serif; margin: 0 auto; max-width: 42rem; color: #1b1f24; }
h1 { font-size: 1.6rem; }
a { color: #0b5cad; }
`,
  'contact.html': `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Contact - Halden Security</title>
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<h1>Contact</h1>
<p>24/7 incident line: soc@halden.example</p>
</body>
</html>
`,
  'index.html': INDEX_HTML,
  'robots.txt': `User-agent: *
Allow: /
`,
  'uploads/Halden brochure.pdf': `%PDF-1.4
% training sample: brochure placeholder, not a real PDF
%%EOF
`,
};

/** What the attacker left: one line added to index.html, a file in uploads, robots.txt gone. */
export const INJECTED = '<script src="https://files.cdn-share.example/js/analytics.min.js"></script>';
const INDEX_TAMPERED = INDEX_HTML.replace('</body>', `${INJECTED}\n</body>`);
export const SHELL_PHP = '<?php /* training sample: web shell placeholder, does nothing */ ?>\n';

/** sha256 of each original file (computed with sha256sum in the simulator and with GNU sha256sum). */
const HASH: Record<string, string> = {
  'about.html': 'bd49c2347bb0fe71cb56ac8e6a06fb32c5752b78296e78b1262675d1442041eb',
  'assets/app.js': '94700231babf00cc129581cf991f6eeda66778ee4f245bd01d33d829d0d9f3d8',
  'assets/logo.svg': '217d9b2a23c93a96b034596fe3fda23431807d144e867ee7e0338f6676133194',
  'assets/site.css': 'ebaf86686bab252ec3b3c3bc771918e47ab25e22cb077f7e194f1f6b684ee8f6',
  'contact.html': '7115e0d796596c42e0f5ff3279415ad5bf55935403ebee6d882775a2c1442406',
  'index.html': '9d4ce9b945cd120b4d13e406f3b4c4398fe67c1b912f6252836b070ad84e22a9',
  'robots.txt': '16ceb5ee3e0dc13aa9adf31a3ebbe45a1d965b8c2b9f72eaf84e5911e140ed95',
  'uploads/Halden brochure.pdf': '0edf95744d124d0a08714b9aacfb2b097694c9698305141892a8ef7d30d0a08a',
};


/** The web team's baseline: sha256sum format ("HASH  PATH"), sorted by path. */
const BASELINE =
  Object.keys(HASH)
    .sort()
    .map((f) => `${HASH[f]}  /var/www/html/${f}`)
    .join('\n') + '\n';

/** The old web01 web root as we imaged it, the Mar 10 backup of it, and the Mar 10 baseline. */
export function oldWeb01(vfs: VFS) {
  const www = { uid: UID.www, gid: GID.www };
  const bak = { uid: UID.backup, gid: GID.backup };
  for (const [rel, content] of Object.entries(SITE)) {
    put(vfs, `/var/backups/html-2026-03-10/${rel}`, content, { ...bak, mtime: DEPLOY });
    if (rel === 'robots.txt') continue; // deleted on the 13th
    // index.html was edited on the 13th, then its date was set back to match its neighbours.
    put(vfs, `/var/www/html/${rel}`, rel === 'index.html' ? INDEX_TAMPERED : content, { ...www, mtime: DEPLOY });
  }
  put(vfs, '/var/www/html/uploads/shell.php', SHELL_PHP, { ...www, mtime: Date.UTC(2026, 2, 13, 23, 58, 31) });
  dir(vfs, '/var/www/html/assets', { ...www, mtime: DEPLOY });
  dir(vfs, '/var/www/html/uploads', { ...www, mtime: Date.UTC(2026, 2, 13, 23, 58, 31) });
  dir(vfs, '/var/www/html', { ...www, mtime: Date.UTC(2026, 2, 13, 23, 59, 2) });
  for (const d of ['/var/backups/html-2026-03-10/assets', '/var/backups/html-2026-03-10/uploads', '/var/backups/html-2026-03-10']) dir(vfs, d, { ...bak, mtime: BACKUP });
  home(vfs, 'integrity/baseline.sha256', BASELINE, 0o644, BASELINE_AT);
}

defineFixture('day20', (vfs) => {
  oldWeb01(vfs);
  homeDir(vfs, 'cases');
});

const BASE = '~/integrity/baseline.sha256';
const TODAY = '~/integrity/today.sha256';

export const day20: Mission = {
  day: 20,
  week: 3,
  title: 'Integrity Watch',
  topic: 'Baselines, checksums & change detection',
  minutes: 45,
  fixture: 'day20',
  caseId: 'integrity',
  briefing: `web01 is back: wiped, rebuilt from clean images and serving pages again. Before I close the incident, the review keeps circling one question. On the night of the 13th the attacker changed files in the web root, and **nobody noticed** until the clean-up. How do we notice within minutes next time?

The answer is old, boring and reliable: **file integrity monitoring**. While a system is known to be good, you record a fingerprint of every file that matters: a **baseline**. Later you fingerprint them again and compare. Whatever the dates on the files claim, one changed byte changes the hash. AIDE and Tripwire do this across whole fleets; the core of it is a few lines of Bash.

Here’s the painful part. The web team **did** take a baseline of web01’s site on 10 March, after their last deploy. Then nobody ever compared anything with it. I’ve restored the old site into \`/var/www/html\` on your workstation, exactly as we imaged it, and put their baseline in \`~/integrity\`. Find out what it would have told us. Then, in Case 7, build the watchman that will.`,
  objectives: [
    'Explain what a baseline is, and build one with find, sha256sum and sort -k 2',
    'Verify a baseline with sha256sum -c and --quiet, and know what it can’t see',
    'List added and removed files with cut -c 67- and comm, spaces in names included',
    'Keep a baseline where an attacker can’t rewrite it',
  ],
  lesson: [
    {
      kind: 'read',
      id: 'idea',
      title: 'A baseline: what good looked like',
      md: `**File integrity monitoring** is one habit in two steps:

1. While a system is **known to be good**, fingerprint every file that matters and save the list. That list is the **baseline**.
2. Later, fingerprint the files again and compare.

Every difference is one of three findings:

| Finding | Meaning |
|---|---|
| **changed** | same path, different hash |
| **added** | a path the baseline doesn’t have |
| **removed** | a path in the baseline that’s gone |

A baseline is plain \`sha256sum\` output saved to a file: a 64-character hash, **two spaces**, the full path.

\`\`\`
9d4ce9b9…22a9  /var/www/html/index.html
16ceb5ee…ed95  /var/www/html/robots.txt
\`\`\`

The web team’s is \`~/integrity/baseline.sha256\`: eight files, made on 10 March.`,
    },
    {
      kind: 'task',
      id: 'verify',
      md: 'On Day 16 you checked a vendor’s download with `sha256sum -c`. A baseline works the same way, and because it stores **full paths** you can run the check from any folder. Check the old web01 site against the web team’s baseline.',
      check: { output: 'reference', status: 1, uses: ['sha256sum'] },
      solution: `sha256sum -c ${BASE}`,
      hints: ['`-c` means check: read the list, re-hash every file in it, compare.', `\`sha256sum -c ${BASE}\``],
      explain:
        'Six `OK`s and two findings. `index.html: FAILED` means the file is there but its content is different. `robots.txt: FAILED open or read` means it’s gone. Status 1, and the warnings went to stderr. Now look for what *isn’t* in the report: `uploads/shell.php`. `-c` only checks the files **in the list**, so anything added after the baseline is invisible to it.',
    },
    {
      kind: 'predict',
      id: 'p-quiet',
      md: 'A cron job only wants the bad news. `--quiet` drops the `OK` lines. What does this print?',
      code: `sha256sum -c --quiet ${BASE} 2>/dev/null`,
      options: [
        '/var/www/html/index.html: FAILED\n/var/www/html/robots.txt: FAILED open or read',
        '/var/www/html/index.html: FAILED',
        'Nothing at all: --quiet hides every line',
        '/var/www/html/index.html: FAILED\n/var/www/html/robots.txt: FAILED open or read\n/var/www/html/uploads/shell.php: NEW',
      ],
      answer: 0,
      explain: 'Both failures stay; only the `OK` lines go. (`--status` is the one that prints nothing and answers with the exit status alone.) And still no word about `shell.php`: no option makes `-c` look for files it was never told about.',
    },
    {
      kind: 'task',
      id: 'evidence',
      md: 'The hash says **that** `index.html` changed, not **how**. The nightly backup job ran at 02:30 on 10 March, and its copy of the site is in `/var/backups/html-2026-03-10/`.\n\n`diff OLD NEW` prints only the lines that differ: `<` marks a line found only in OLD, `>` a line found only in NEW, and a header such as `4c4` says where. Compare the backup’s `index.html` with the live one, old first.',
      check: { output: 'reference', uses: ['diff'] },
      solution: 'diff /var/backups/html-2026-03-10/index.html /var/www/html/index.html',
      hints: ['`diff OLD NEW`: lines starting `<` are only in OLD, `>` only in NEW.', '`diff /var/backups/html-2026-03-10/index.html /var/www/html/index.html`'],
      explain:
        '`13a14`: after line 13, one line was added. A script tag loading JavaScript from `files.cdn-share.example`, the domain the phishing email linked to on Day 13. On the homepage, for every visitor. Nothing on the page looked different, which is exactly why you check content rather than appearance.',
    },
    {
      kind: 'task',
      id: 'newer',
      md: 'Could you have caught the edit by date instead? Day 18’s `find -newer FILE` matches files modified after FILE. List the regular files under `/var/www/html` modified after the baseline was made.',
      check: { output: 'reference', uses: ['find'] },
      solution: `find /var/www/html -type f -newer ${BASE}`,
      hints: [`The test is \`-newer ${BASE}\`.`, `\`find /var/www/html -type f -newer ${BASE}\``],
      explain:
        'Only `shell.php`. `index.html` was edited on the 13th, yet it isn’t listed: its modification time still says 9 March, and `ls -l` agrees. A file’s date is a label that anyone who can write the file can set back, and attackers do. The hash is computed from the content itself. So far, `-c` missed the added file and the dates missed the edit. You need a full comparison.',
    },
    {
      kind: 'read',
      id: 'build',
      title: 'Building a baseline',
      md: `\`\`\`bash
find /var/www/html -type f -exec sha256sum {} + | sort -k 2 > web01.sha256
\`\`\`

| Piece | Job |
|---|---|
| \`find /var/www/html -type f\` | every regular file, in every subfolder |
| \`-exec sha256sum {} +\` | hash them all in one run; \`{}\` stands for the paths |
| \`sort -k 2\` | sort from field 2 to the end of the line: the **path**, spaces and all |
| \`> web01.sha256\` | save it |

Why sort? A real \`find\` lists files in whatever order the disk stores them, and that order can change. Two lists only line up, and \`comm\` only works, when both are sorted the same way. Sorting by path rather than by hash also keeps each folder’s files together, so a person can read it.

Take baselines **while the system is known-good**: right after a clean install or an approved deploy. A baseline taken after a break-in faithfully records the attacker’s files as normal.`,
    },
    {
      kind: 'widget',
      id: 'w-build',
      md: 'Tap through the pipeline: every file hashed, sorted by path, then just the paths.',
      widget: 'pipeline',
      props: { fixture: 'day20', pipeline: 'find /var/www/html -type f -exec sha256sum {} + | sort -k 2 | cut -c 67-' },
    },
    {
      kind: 'task',
      id: 'snapshot',
      md: `Take today’s snapshot of the site and save it as \`${TODAY}\`. Then count its lines with \`wc -l\`.`,
      check: { output: { regex: '^\\s*8\\b' }, fs: [{ path: TODAY, contains: '  /var/www/html/uploads/shell.php' }] },
      solution: `find /var/www/html -type f -exec sha256sum {} + | sort -k 2 > ${TODAY}; wc -l ${TODAY}`,
      hints: [`The pipeline from the card above, ending in \`> ${TODAY}\`.`, `Then \`wc -l ${TODAY}\`, on the same line after \`;\` or on its own.`],
      explain: 'Eight files, the same as the baseline. That’s the trap: one file in, one file out, and the count doesn’t move. Counting is not comparing.',
    },
    {
      kind: 'task',
      id: 'diff',
      md: 'Compare the two lists line by line with `diff`, the baseline first.',
      check: { output: 'reference', uses: ['diff'] },
      solution: `diff ${BASE} ${TODAY}`,
      hints: ['`diff OLD NEW`', `\`diff ${BASE} ${TODAY}\``],
      explain:
        'Read it like an analyst. A path on both sides, once with `<` and once with `>`, has **changed**: `index.html`. A path only on the `<` side was **removed**: `robots.txt`. Only on the `>` side, **added**: `shell.php`. It’s all there, but you’re doing the sorting in your head. Time to make the shell do it.',
    },
    {
      kind: 'read',
      id: 'comm',
      title: 'comm: only here, only there',
      md: `\`comm A B\` reads two **sorted** lists and prints three columns:

| Column | Lines that are… | Hide it with |
|---|---|---|
| 1 | only in A | \`-1\` |
| 2 | only in B | \`-2\` |
| 3 | in both | \`-3\` |

So \`comm -13 A B\` keeps column 2, lines **only in B**, and \`comm -23 A B\` keeps column 1, lines **only in A**.

Give it the **paths**, not whole lines: a changed hash would make a changed file look removed *and* added. The path starts at character 67 (64 hex characters plus two spaces), so \`cut -c 67-\` takes it, spaces and all. Process substitution \`<( )\` hands both lists to \`comm\` in one line:

\`\`\`bash
comm -13 <(cut -c 67- old.sha256) <(cut -c 67- new.sha256)
\`\`\``,
    },
    {
      kind: 'predict',
      id: 'p-awk',
      md: 'Why not `awk \'{print $2}\'` for the path? What does this print?',
      code: `awk '{print $2}' ${BASE} | tail -1`,
      options: ['/var/www/html/uploads/Halden brochure.pdf', '/var/www/html/uploads/Halden', 'brochure.pdf', '0edf95744d124d0a08714b9aacfb2b097694c9698305141892a8ef7d30d0a08a'],
      answer: 1,
      explain:
        'awk splits on spaces, so `Halden brochure.pdf` is two fields. Your list would name a file that doesn’t exist, and the comparison would report a removal that never happened. `cut -c 67-` counts characters, not words. In a loop, `while read -r hash path` is just as safe: the last variable gets the rest of the line.',
    },
    {
      kind: 'task',
      id: 'added',
      md: 'List the files **added** since the baseline: the paths that are only in today’s list.',
      check: { output: '/var/www/html/uploads/shell.php\n', uses: ['comm'] },
      solution: `comm -13 <(cut -c 67- ${BASE}) <(cut -c 67- ${TODAY})`,
      hints: ['Baseline first, today second. You want column 2 only, so hide columns 1 and 3.', `\`comm -13 <(cut -c 67- ${BASE}) <(cut -c 67- ${TODAY})\``],
      explain:
        'A `.php` file in `uploads/`, the one folder where the site stores files sent in by visitors. That’s the classic home of a **web shell**: a page that runs commands for whoever requests it. This one is a harmless training placeholder (`cat` it and see), but the rule for the real thing is the same: read it, hash it, report it. Never run it, never request it.',
    },
    {
      kind: 'fill',
      id: 'f-removed',
      md: 'Complete the command that lists the files **removed** since the baseline.',
      template: `comm ___ <(cut -c ___ ${BASE}) <(cut -c 67- ${TODAY})`,
      answers: [['-23', '-32'], ['67-']],
      explain: '`-23` hides columns 2 and 3 and leaves column 1: lines only in the first list. It prints `/var/www/html/robots.txt`.',
    },
    {
      kind: 'order',
      id: 'o-load',
      md: 'One more way in. Put these lines in order: load the baseline into an associative array (path → hash), then say how many files it holds.',
      lines: ['declare -A old', 'while read -r hash path; do', '  old[$path]=$hash', `done < ${BASE}`, 'echo "${#old[@]} files in the baseline"'],
      explain:
        '`read -r hash path` gives the first word to `hash` and the rest of the line to `path`, so `Halden brochure.pdf` arrives in one piece. With the array loaded, `${old[$path]}` answers “what was this file’s hash on the 10th?” in one step. That’s the **changed** check, in Drill 3 and in the case.',
    },
    {
      kind: 'read',
      id: 'protect',
      title: 'Who guards the baseline?',
      md: `A baseline is only as honest as the place it’s kept. Had web01’s baseline lived on web01, an attacker with root could have re-run the \`find … | sort -k 2 >\` line after planting \`shell.php\`, and every check after that would have said all clear.

From weakest to strongest:

- **Read-only.** \`chmod a-w baseline.sha256\` stops accidents and other users. It doesn’t stop root.
- **Off the box.** Keep the baseline on another machine, like your workstation, and compare a fresh snapshot against it there.
- **Fingerprint the fingerprint.** Put \`sha256sum baseline.sha256\` in the incident ticket. If anyone edits the baseline, its own hash stops matching.
- **Re-baseline on purpose.** After every approved deploy, and never to make an unexplained change go away.`,
    },
    {
      kind: 'quiz',
      id: 'q-where',
      q: 'An attacker has root on a web server. Where should that server’s baseline live, so they can’t quietly bless their own changes?',
      options: ['In /var/www/html, next to the files it describes', 'In /root, with mode 600', 'Off the server, with its own hash recorded in the ticket', 'In /tmp, rebuilt at every boot'],
      answer: 2,
      explain: 'Root can read and rewrite anything on its own machine, `/root` and read-only files included. The baseline has to live somewhere the attacker doesn’t control, and its recorded hash proves later that nobody touched it.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-alert',
      md: '**Drill 1.** Write the line a cron job would run every ten minutes: check the baseline quietly, throw away **all** of its output (stdout and stderr), and print `ALERT: web01 web root changed` only if the check fails.',
      check: { output: 'ALERT: web01 web root changed\n', uses: ['sha256sum'] },
      solution: `sha256sum -c --quiet ${BASE} > /dev/null 2>&1 || echo "ALERT: web01 web root changed"`,
      hints: ['`> /dev/null 2>&1` throws away both streams.', '`||` runs the next command only when the one before it fails.', `\`sha256sum -c --quiet ${BASE} > /dev/null 2>&1 || echo "ALERT: web01 web root changed"\``],
      explain: 'The exit status is the whole interface: 0 is a quiet night, anything else means look. Remember the blind spot, though: if the attacker had only *added* `shell.php`, this line would have stayed silent. That’s why Case 7 compares the path lists as well.',
    },
    {
      kind: 'task',
      id: 'd-genuine',
      md: '**Drill 2.** Before the backup goes in your report, prove it’s genuine: its `index.html` must have the **same hash** as the one in the 10 March baseline. Take just the hash with `cut -c 1-64`, and `grep` the baseline for it using `$( )`.',
      check: { output: 'reference', uses: ['grep'] },
      solution: `grep "$(sha256sum /var/backups/html-2026-03-10/index.html | cut -c 1-64)" ${BASE}`,
      hints: ['`sha256sum FILE | cut -c 1-64` prints only the hash.', 'Use that, inside `"$( )"`, as the pattern for `grep`.', `\`grep "$(sha256sum /var/backups/html-2026-03-10/index.html | cut -c 1-64)" ${BASE}\``],
      explain: 'One match, on the `index.html` line. The backup is byte for byte the file the web team deployed, so the `diff` you ran earlier shows exactly what the attacker added, and nothing else. Evidence you can’t verify is just a story.',
    },
    {
      kind: 'task',
      id: 'd-changed',
      md: `**Drill 3.** The heart of Case 7. Load the baseline into \`old\` as in the ordering exercise. Then loop over \`${TODAY}\` and print \`CHANGED PATH\` for every path that is in \`old\` with a different hash. One line, parts joined with \`;\`.`,
      check: { output: 'CHANGED /var/www/html/index.html\n', nodes: ['while'] },
      solution: `declare -A old; while read -r hash path; do old[$path]=$hash; done < ${BASE}; while read -r hash path; do if [ -n "\${old[$path]}" ] && [ "\${old[$path]}" != "$hash" ]; then echo "CHANGED $path"; fi; done < ${TODAY}`,
      hints: [
        `Part one: \`declare -A old; while read -r hash path; do old[$path]=$hash; done < ${BASE}\``,
        `Part two reads \`${TODAY}\` with the same \`read -r hash path\`.`,
        'Inside it: `if [ -n "${old[$path]}" ] && [ "${old[$path]}" != "$hash" ]; then echo "CHANGED $path"; fi`',
      ],
      explain:
        'Only `index.html`. `shell.php` has no entry in `old`, so it’s skipped here and left for `comm -13`; `robots.txt` never appears in today’s list, so it’s left for `comm -23`. Three findings, three tools, no overlap. Put them in one script with a summary line and an exit status, and you have Case 7.',
    },
    {
      kind: 'task',
      id: 'd-lock',
      md: '**Drill 4.** Lock the evidence. Remove every write permission from the baseline, then print its own SHA-256 for the incident ticket.',
      check: { output: 'reference', fs: [{ path: BASE, mode: 0o444 }] },
      solution: `chmod a-w ${BASE} && sha256sum ${BASE}`,
      hints: ['`chmod a-w FILE` removes write permission for user, group and others.', `\`chmod a-w ${BASE} && sha256sum ${BASE}\``],
      explain: 'That `0d6fb9e6…` goes in the ticket, which lives on a different system from both web01 and your workstation. `chmod` stops slips and other users, not root. The hash in the ticket is what proves, months from now, that this is the baseline the web team made on 10 March.',
    },
  ],
  debrief: {
    summary: [
      'A **baseline** is fingerprints taken while a system is known-good: `find DIR -type f -exec sha256sum {} + | sort -k 2 > base.sha256`.',
      '`sha256sum -c --quiet base.sha256` reports changed (`FAILED`) and missing (`FAILED open or read`) files with status 1, but it never sees a file that was **added**.',
      'File dates can be set back; hashes can’t. `find -newer` missed the edited `index.html`, and the hash caught it.',
      "Paths with spaces: `cut -c 67-` or `while read -r hash path`, never `awk '{print $2}'`. Then `comm -13` lists added and `comm -23` removed, on two sorted path lists fed with `<( )`.",
      'Keep the baseline off the box, read-only, with its own hash in the ticket. Case 7 is open: Integrity Watch.',
    ],
    cards: ['c-d20-baseline', 'c-d20-build', 'c-d20-sortk2', 'c-d20-check', 'c-d20-blind', 'c-d20-cut67', 'c-d20-readpath', 'c-d20-comm', 'c-d20-mtime', 'c-d20-store'],
  },
  cards: [
    { id: 'c-d20-baseline', day: 20, tag: 'integrity', front: 'What is a baseline, in file integrity monitoring?', back: 'A list of `sha256sum` fingerprints of every file that matters, taken while the system is known-good. Later you hash again and compare: changed, added, removed.' },
    { id: 'c-d20-build', day: 20, tag: 'integrity', front: 'Build a baseline of everything under `/var/www/html`?', back: '`find /var/www/html -type f -exec sha256sum {} + | sort -k 2 > web.sha256`' },
    { id: 'c-d20-sortk2', day: 20, tag: 'integrity', front: 'Why `sort -k 2` on `sha256sum` output?', back: 'It sorts by the path (field 2 to the end of the line). `find`’s order can change between runs, and `comm` and `diff` need both lists in the same order.' },
    { id: 'c-d20-check', day: 20, tag: 'hashing', front: 'Check a baseline and print only the problems?', back: '`sha256sum -c --quiet base.sha256`. `FAILED` means the content changed, `FAILED open or read` means the file is gone. Status 1 if anything failed.' },
    { id: 'c-d20-blind', day: 20, tag: 'integrity', front: 'What can `sha256sum -c` never tell you?', back: 'That a file was **added**: it only checks the files listed in the baseline. Compare the two path lists for that.' },
    { id: 'c-d20-cut67', day: 20, tag: 'integrity', front: 'Take just the paths from a `sha256sum` list, spaces included?', back: "`cut -c 67- base.sha256`: 64 hex characters plus 2 spaces is 66. `awk '{print $2}'` would cut `Halden brochure.pdf` down to `Halden`." },
    { id: 'c-d20-readpath', day: 20, tag: 'integrity', front: 'Loop over `HASH  PATH` lines when paths may contain spaces?', back: '`while read -r hash path; do …; done < base.sha256`. The last variable gets the rest of the line, spaces and all.' },
    { id: 'c-d20-comm', day: 20, tag: 'text', front: '`comm -13 A B` vs `comm -23 A B`?', back: 'Both need sorted input. `-13` prints lines only in B (added); `-23` prints lines only in A (removed). Column 3, hidden by `-3`, is lines in both.' },
    { id: 'c-d20-mtime', day: 20, tag: 'integrity', front: 'Why trust a hash over a file’s date?', back: 'Anyone who can write a file can set its modification time back, so `ls -l` and `find -newer` can be fooled. The hash comes from the content itself.' },
    { id: 'c-d20-store', day: 20, tag: 'integrity', front: 'Where should a server’s baseline live?', back: 'Off that server, read-only, with its own `sha256sum` recorded in the ticket. Root on the server can rewrite anything stored there.' },
  ],
};
