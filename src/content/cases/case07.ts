import { defineFixture } from '../fixtures';
import { dir, GID, put, UID } from '../fixtures/base';
import type { CaseFile } from '../types';

// Visible: the old web01 web root and the web team's Mar 10 baseline (Day 20).
defineFixture('case-integrity', () => {}, 'day20');

// Hidden: a staff portal the analyst can edit, with folders inside folders, spaces in names,
// and docs-archive.txt next to docs/ (find walks docs/ first; sort puts docs-archive.txt first).
// Plus an empty folder.
const ANALYST = { uid: UID.analyst, gid: GID.analyst, mtime: Date.UTC(2026, 2, 2, 10, 0, 0) };
defineFixture(
  'case-integrity-site',
  (vfs) => {
    put(vfs, '/srv/site/index.html', '<!doctype html>\n<title>Halden staff portal</title>\n<h1>Staff portal</h1>\n', ANALYST);
    put(vfs, '/srv/site/docs/handbook.txt', 'Halden analyst handbook, v3\nRule 1: never paste credentials into tickets.\n', ANALYST);
    put(vfs, '/srv/site/docs/On call rota.txt', 'Mon-Wed: mara\nThu-Sat: raj\nSun: analyst\n', ANALYST);
    put(vfs, '/srv/site/docs-archive.txt', 'Old handbook versions, kept for audit.\n', ANALYST);
    put(vfs, '/srv/site/img/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><text y="20">Halden</text></svg>\n', ANALYST);
    put(vfs, '/srv/site/img/icons/alert.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="8" fill="red"/></svg>\n', ANALYST);
    put(vfs, '/srv/site/img/icons/ok.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="8" fill="green"/></svg>\n', ANALYST);
    for (const d of ['/srv/site', '/srv/site/docs', '/srv/site/img', '/srv/site/img/icons', '/srv/empty']) dir(vfs, d, ANALYST);
  },
  'case-integrity',
);

const BASE = '/home/analyst/integrity';

const SOLUTION = `#!/bin/bash
# integrity.sh - record a baseline of a folder, then report what changed
# Usage: integrity.sh init DIR BASELINE
#        integrity.sh check DIR BASELINE

usage() {
  if [ -n "$1" ]; then echo "integrity.sh: $1" >&2; fi
  echo "Usage: integrity.sh init|check DIR BASELINE" >&2
  exit 2
}

# One "HASH  PATH" line per regular file under $1, sorted by path
snapshot() {
  find "$1" -type f -exec sha256sum {} + | sort -k 2
}

do_init() {
  local dir=$1 baseline=$2
  snapshot "$dir" > "$baseline"
  echo "Baseline: $(wc -l < "$baseline") files"
}

do_check() {
  local dir=$1 baseline=$2
  local hash path changed=0 added=0 removed=0
  local -A old
  while read -r hash path; do
    old[$path]=$hash
  done < "$baseline"

  # Same path, different hash. The snapshot is sorted, so these come out sorted.
  while read -r hash path; do
    if [ -n "\${old[$path]}" ] && [ "\${old[$path]}" != "$hash" ]; then
      echo "CHANGED $path"
      changed=$((changed + 1))
    fi
  done < <(snapshot "$dir")

  # Paths only in today's list, then paths only in the baseline
  while read -r path; do
    echo "ADDED $path"
    added=$((added + 1))
  done < <(comm -13 <(cut -c 67- "$baseline") <(snapshot "$dir" | cut -c 67-))
  while read -r path; do
    echo "REMOVED $path"
    removed=$((removed + 1))
  done < <(comm -23 <(cut -c 67- "$baseline") <(snapshot "$dir" | cut -c 67-))

  echo "Summary: $changed changed, $added added, $removed removed"
  if [ $((changed + added + removed)) -gt 0 ]; then
    return 1
  fi
}

[ $# -eq 3 ] || usage "expected 3 arguments, got $#"
cmd=$1
dir=$2
baseline=$3
[ -d "$dir" ] || usage "not a folder: $dir"

case $cmd in
  init)
    do_init "$dir" "$baseline"
    ;;
  check)
    [ -f "$baseline" ] || usage "no baseline at $baseline"
    do_check "$dir" "$baseline"
    ;;
  *)
    usage "unknown command: $cmd"
    ;;
esac
`;

const TAMPER = [
  `bash "$SCRIPT" init /srv/site ${BASE}/site.sha256`,
  'echo "Sun: raj (swapped)" >> "/srv/site/docs/On call rota.txt"',
  'echo "<!-- build 2 -->" >> /srv/site/img/icons/ok.svg',
  'rm /srv/site/docs-archive.txt',
  'mkdir "/srv/site/img/icons/new set"',
  'echo "<svg/>" > "/srv/site/img/icons/new set/bell.svg"',
  'echo "<p>Draft</p>" > "/srv/site/docs/new page.html"',
  'touch /srv/site/index.html',
  'chmod 600 /srv/site/img/logo.svg',
  `bash "$SCRIPT" check /srv/site ${BASE}/site.sha256`,
].join(' && ');

export const case07: CaseFile = {
  id: 'integrity',
  number: 7,
  title: 'Integrity Watch',
  day: 20,
  difficulty: 4,
  minutes: 45,
  brief: `web01 is rebuilt, and I’m done finding things out by accident. On the night of the 13th someone edited our homepage, dropped a file into \`uploads/\` and deleted another. The web team had a perfectly good baseline from the 10th. Nobody ever compared anything with it.

Write \`integrity.sh\`, our own small Tripwire. It does two jobs. \`init\` records a baseline of every file under a folder. \`check\` hashes the folder again and says exactly what **changed**, what was **added** and what was **removed**, and its exit status tells cron whether to wake someone up.

I’ll test it on the old web01 copy against the web team’s baseline, on a tree with folders inside folders and spaces in the names, and on a folder with nothing in it. It will run unattended, so usage errors must be clean: a message on stderr, status 2, and no half-written baseline.

— Mara`,
  requirements: [
    'Usage: `integrity.sh init DIR BASELINE` or `integrity.sh check DIR BASELINE`.',
    'Usage errors → a message on **stderr** and **exit 2**, before anything is written: not exactly 3 arguments, a first argument other than `init` or `check`, a DIR that isn’t a folder, or (for `check`) a BASELINE file that doesn’t exist.',
    '**init** writes BASELINE: one line for every regular file under DIR, subfolders included, in `sha256sum` format (`HASH  PATH`, two spaces), sorted by path as `sort -k 2` sorts them. Each PATH is written the way `find DIR` prints it. Then it prints `Baseline: N files` (always “files”) and exits 0.',
    '**check** hashes the files under DIR the same way and compares them with BASELINE, path by path. It prints `CHANGED PATH` for each path in both whose hash differs, then `ADDED PATH` for each path that is only under DIR, then `REMOVED PATH` for each path that is only in BASELINE. Each group is sorted by path.',
    'A file whose content is unchanged is never reported, whatever happened to its date or permissions.',
    'Last line of check: `Summary: C changed, A added, R removed`. Exit **0** when all three are 0, otherwise **1**.',
    'Filenames may contain spaces. Pass DIR to `check` spelled the same way as to `init`.',
  ],
  usage: 'bash ~/cases/integrity.sh check /var/www/html ~/integrity/baseline.sha256',
  sampleOutput: `CHANGED /var/www/html/index.html
ADDED /var/www/html/uploads/shell.php
REMOVED /var/www/html/robots.txt
Summary: 1 changed, 1 added, 1 removed`,
  scriptPath: '~/cases/integrity.sh',
  fixture: 'case-integrity',
  starter: `#!/bin/bash
# integrity.sh - record a baseline of a folder, then report what changed
# Usage: integrity.sh init DIR BASELINE
#        integrity.sh check DIR BASELINE

usage() {
  echo "Usage: integrity.sh init|check DIR BASELINE" >&2
  exit 2
}

# TODO: guards first - exactly 3 arguments, and DIR must be a folder

cmd=$1
dir=$2
baseline=$3

case $cmd in
  init)
    # TODO: sort the lines by path
    find "$dir" -type f -exec sha256sum {} + > "$baseline"
    echo "Baseline: $(wc -l < "$baseline") files"
    ;;
  check)
    # TODO: a missing baseline is a usage error
    # TODO: CHANGED lines - same path, different hash
    # TODO: ADDED and REMOVED lines - compare the two lists of paths with comm
    # TODO: the Summary line, then exit 1 if anything changed
    sha256sum -c --quiet "$baseline"
    ;;
  *)
    usage
    ;;
esac
`,
  tests: [
    { name: 'The web01 copy against the Mar 10 baseline', args: ['check', '/var/www/html', `${BASE}/baseline.sha256`], check: { output: 'reference' } },
    {
      name: 'init writes a sha256sum baseline',
      run: `bash "$SCRIPT" init /var/www/html ${BASE}/today.sha256 && cat ${BASE}/today.sha256`,
      check: { output: 'reference', fs: [{ path: '~/integrity/today.sha256', contains: '  /var/www/html/uploads/Halden brochure.pdf' }] },
    },
    {
      name: 'Hidden: init on a nested tree, sorted by path, then check it untouched',
      run: `bash "$SCRIPT" init /srv/site ${BASE}/site.sha256 && cut -c 67- ${BASE}/site.sha256 && bash "$SCRIPT" check /srv/site ${BASE}/site.sha256`,
      fixture: 'case-integrity-site',
      check: { output: 'reference' },
    },
    { name: 'Hidden: edits, new folders and spaces in names', run: TAMPER, fixture: 'case-integrity-site', check: { output: 'reference' } },
    {
      name: 'Hidden: an empty folder',
      run: `bash "$SCRIPT" init /srv/empty ${BASE}/empty.sha256 && bash "$SCRIPT" check /srv/empty ${BASE}/empty.sha256`,
      fixture: 'case-integrity-site',
      check: { output: 'reference' },
    },
    { name: 'No arguments → usage on stderr only, exit 2', run: 'bash "$SCRIPT" 2>/dev/null; echo "exit $?"', check: { output: 'exit 2\n' } },
    { name: 'Unknown command “verify” → exit 2', args: ['verify', '/var/www/html', `${BASE}/baseline.sha256`], check: { status: 2 } },
    { name: 'Missing BASELINE argument → exit 2', args: ['check', '/var/www/html'], check: { status: 2 } },
    {
      name: 'DIR is not a folder → exit 2, nothing written',
      args: ['init', '/etc/passwd', `${BASE}/passwd.sha256`],
      check: { status: 2, fs: [{ path: '~/integrity/passwd.sha256', exists: false }] },
    },
    { name: 'Baseline file missing → exit 2', args: ['check', '/var/www/html', `${BASE}/nope.sha256`], check: { status: 2 } },
  ],
  solution: SOLUTION,
  walkthrough: `**How it works**

- **Guards first.** Argument count, then the folder, then the command and the baseline file. Every refusal goes to stderr with status 2 *before* anything is written, so a typo in a cron line can’t leave a half-made baseline behind.
- **One \`snapshot\` function makes both sides.** \`find "$1" -type f -exec sha256sum {} + | sort -k 2\`: every regular file, hashed in one \`sha256sum\` run, sorted by path. \`init\` saves it; \`check\` makes a fresh one. Because both come from the same function, they line up path for path.
- **Why \`sort -k 2\`?** A real \`find\` lists files in the order the disk stores them, which can change from one day to the next. \`-k 2\` sorts on the path (field 2 to the end of the line), and \`comm\` needs sorted input. Look at the hidden tree: \`docs-archive.txt\` sorts before \`docs/…\`, because \`-\` comes before \`/\`.
- **Spaces in names.** \`while read -r hash path\` gives the first word to \`hash\` and the **rest of the line** to \`path\`, spaces and all. \`cut -c 67-\` does the same for whole lists: 64 hex characters plus two spaces is 66, so the path starts at column 67. \`awk '{print $2}'\` would turn \`On call rota.txt\` into \`On\`.
- **CHANGED** loads the baseline into \`local -A old\` (path → hash), then walks today’s snapshot: a path that’s in \`old\` with a different hash has changed. Paths that aren’t in \`old\` are left for the next step.
- **ADDED and REMOVED** are \`comm -13\` and \`comm -23\` on the two sorted path lists, fed with \`<( )\`. The \`done < <( … )\` loops keep the counters in the main shell (Day 14’s trap).
- **The exit status is the alert.** \`return 1\` from \`do_check\` becomes the script’s status, so cron can run \`integrity.sh check … > report.txt || …\` and only raise an alarm when something moved.

**Going further:** AIDE and Tripwire also record owners, permissions and sizes, so a \`chmod\` would show up too. Keep the baseline **off the server** it describes (an attacker with root there can simply re-run \`init\`), re-baseline after every approved deploy, and never after a change nobody can explain.`,
  hints: [
    'Guards first: `[ $# -eq 3 ] || usage`, then `[ -d "$dir" ] || usage`. Then `case $cmd in init) … ;; check) … ;; *) usage ;; esac`, and in `check`, `[ -f "$baseline" ] || usage`.',
    'Write one function and use it for both sides: `snapshot() { find "$1" -type f -exec sha256sum {} + | sort -k 2; }`. `init` is `snapshot "$dir" > "$baseline"`, then `wc -l < "$baseline"` for the count.',
    'CHANGED: `declare -A old; while read -r hash path; do old[$path]=$hash; done < "$baseline"`. Then loop over `< <(snapshot "$dir")` and print the path when `"${old[$path]}"` isn’t empty and isn’t `"$hash"`.',
    'ADDED: `comm -13 <(cut -c 67- "$baseline") <(snapshot "$dir" | cut -c 67-)`; REMOVED is the same with `-23`. Count each group in a `while read -r path; do …; done < <(…)` loop, print the Summary, and exit 1 if the total isn’t 0.',
  ],
  xp: 450,
};
