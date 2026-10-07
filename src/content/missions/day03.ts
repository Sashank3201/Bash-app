import { defineFixture } from '../fixtures';
import { home, homeDir } from '../fixtures/base';
import type { Mission } from '../types';

defineFixture('day03', (vfs) => {
  homeDir(vfs, 'inbox');
  home(vfs, 'inbox/auth.log.1', 'Mar 12 22:01:13 web01 sshd[901]: Failed password for root from 203.0.113.7 port 50122 ssh2\n');
  home(vfs, 'inbox/auth.log.2', 'Mar 11 08:15:42 web01 sshd[455]: Accepted publickey for mara from 10.20.0.8 port 51990 ssh2\n');
  home(vfs, 'inbox/access.log', '10.0.0.9 - - [14/Mar/2026:09:00:03 +0000] "GET /admin HTTP/1.1" 404 210\n');
  home(vfs, 'inbox/notes.txt', 'Attacker tried root over SSH. Check auth logs 1 and 2.\n');
  home(vfs, 'inbox/screenshot1.png', '(image data)\n');
  home(vfs, 'inbox/screenshot2.png', '(image data)\n');
  home(vfs, 'inbox/report_draft.docx', '(document)\n');
  home(vfs, 'inbox/report_final.docx', '(document)\n');
  home(vfs, 'inbox/tmp_123.tmp', 'scratch\n');
  home(vfs, 'inbox/tmp_456.tmp', 'scratch\n');
  home(vfs, 'inbox/.DS_Store', 'junk from a Mac\n');
});

export const day03: Mission = {
  day: 3,
  week: 1,
  title: 'The Evidence Locker',
  topic: 'Creating, copying, moving & globbing files',
  minutes: 40,
  fixture: 'day03',
  briefing: `Raj dumped everything from yesterday’s investigation into a folder called \`inbox\`: logs, screenshots, report drafts, temp files — the lot.

Evidence needs order. If a log goes missing or a screenshot gets overwritten, the case falls apart. Your job today is to build a proper **evidence locker** and file everything where it belongs.

Along the way you’ll learn bash’s secret weapon for handling many files at once: **wildcards**.`,
  objectives: ['Create folders and files with mkdir and touch', 'Copy, move and rename with cp and mv', 'Use * ? and [ ] to match many files at once', 'Delete safely with rm — and know why it’s dangerous'],
  lesson: [
    {
      kind: 'read',
      id: 'verbs',
      title: 'Five verbs for files',
      md: `| Command | Does |
|---|---|
| \`mkdir DIR\` | make a directory (\`-p\` makes parents too) |
| \`touch FILE\` | create an empty file |
| \`cp SRC DEST\` | copy (\`-r\` for folders) |
| \`mv SRC DEST\` | move — and rename |
| \`rm FILE\` | remove (\`-r\` for folders) |

When the destination is an existing folder, \`cp\` and \`mv\` put the file **inside** it. Otherwise the destination is the new name.`,
    },
    {
      kind: 'task',
      id: 'mkdir',
      md: 'Create a folder called `evidence` in your home.',
      check: { fs: [{ path: '~/evidence', type: 'dir' }], uses: ['mkdir'] },
      solution: 'mkdir evidence',
      hints: ['`mkdir` + the name.'],
    },
    {
      kind: 'task',
      id: 'mkdir-p',
      md: 'Inside it, create two sub-folders — `evidence/logs` and `evidence/images` — with **one** command.',
      check: { fs: [{ path: '~/evidence/logs', type: 'dir' }, { path: '~/evidence/images', type: 'dir' }], uses: ['mkdir'] },
      solution: 'mkdir evidence/logs evidence/images',
      hints: ['`mkdir` accepts several names at once.', '`mkdir evidence/logs evidence/images`'],
      explain: '`mkdir -p evidence/logs` would also work even if `evidence` didn’t exist yet — `-p` creates any missing parents.',
    },
    {
      kind: 'task',
      id: 'cp-access',
      md: 'Copy `inbox/access.log` into `evidence/logs`.',
      check: { fs: [{ path: '~/evidence/logs/access.log', exists: true }, { path: '~/inbox/access.log', exists: true }], uses: ['cp'] },
      solution: 'cp inbox/access.log evidence/logs/',
      hints: ['`cp SOURCE DESTINATION`', '`cp inbox/access.log evidence/logs/`'],
      explain: 'A copy leaves the original in place — exactly what you want with evidence.',
    },
    {
      kind: 'read',
      id: 'globs',
      title: 'Wildcards (globs)',
      md: `Typing every file name gets old fast. Bash lets you describe names with patterns:

- \`*\` matches any run of characters (even none): \`*.log\`
- \`?\` matches exactly one character: \`auth.log.?\`
- \`[abc]\` matches one character from a set: \`screenshot[12].png\`

The key idea: **bash expands the pattern before the command runs**. \`ls *.png\` becomes \`ls screenshot1.png screenshot2.png\` — \`ls\` never even sees the star.`,
    },
    {
      kind: 'example',
      id: 'echo-glob',
      md: 'See the expansion for yourself — `echo` just prints whatever bash hands it:',
      code: 'echo inbox/*.png',
    },
    {
      kind: 'task',
      id: 'mv-png',
      md: 'Move **all** the PNG screenshots from `inbox` into `evidence/images` with one command.',
      check: {
        fs: [
          { path: '~/evidence/images/screenshot1.png', exists: true },
          { path: '~/evidence/images/screenshot2.png', exists: true },
          { path: '~/inbox/screenshot1.png', exists: false },
        ],
        uses: ['mv'],
      },
      solution: 'mv inbox/*.png evidence/images/',
      hints: ['Use `*.png` to match both screenshots.', '`mv inbox/*.png evidence/images/`'],
    },
    {
      kind: 'task',
      id: 'cp-auth',
      md: 'Copy both rotated auth logs — `auth.log.1` and `auth.log.2` — into `evidence/logs`, using the `?` wildcard.',
      check: { fs: [{ path: '~/evidence/logs/auth.log.1', exists: true }, { path: '~/evidence/logs/auth.log.2', exists: true }], uses: ['cp'] },
      solution: 'cp inbox/auth.log.? evidence/logs/',
      hints: ['`?` stands for exactly one character: `auth.log.?`', '`cp inbox/auth.log.? evidence/logs/`'],
    },
    {
      kind: 'quiz',
      id: 'q-glob',
      q: 'Which pattern matches `report_draft.docx` and `report_final.docx` — but not `notes.txt`?',
      options: ['report.*', '*.docx', 'report?.docx', '[rR]eport.docx'],
      answer: 1,
      explain: '`*.docx` matches anything ending in `.docx`. `report.*` would need a dot right after “report”, and `?` matches just one character.',
    },
    {
      kind: 'task',
      id: 'mv-rename',
      md: 'Move `inbox/notes.txt` into the locker **and** rename it to `case-notes.txt` in one step.',
      check: { fs: [{ path: '~/evidence/case-notes.txt', exists: true }, { path: '~/inbox/notes.txt', exists: false }], uses: ['mv'] },
      solution: 'mv inbox/notes.txt evidence/case-notes.txt',
      hints: ['If the destination isn’t an existing folder, it becomes the new name.', '`mv inbox/notes.txt evidence/case-notes.txt`'],
    },
    {
      kind: 'read',
      id: 'rm',
      title: 'rm: there is no undo',
      md: `\`rm\` deletes immediately. No recycle bin, no “are you sure?”. Combined with a wildcard it can wipe out far more than you meant.

A professional habit: **preview with \`ls\` first**. If \`ls inbox/tmp_*\` shows exactly the files you expect, then swap \`ls\` for \`rm\`.

\`rm -r\` deletes folders and everything in them. \`rmdir\` only removes *empty* folders — a safer choice when that’s all you need.`,
    },
    {
      kind: 'task',
      id: 'rm-tmp',
      md: 'Delete the two temporary files in `inbox` (they start with `tmp_` and end in `.tmp`). Preview with `ls` first if you like.',
      check: { fs: [{ path: '~/inbox/tmp_123.tmp', exists: false }, { path: '~/inbox/tmp_456.tmp', exists: false }, { path: '~/inbox/report_final.docx', exists: true }], uses: ['rm'] },
      solution: 'rm inbox/tmp_*.tmp',
      hints: ['`tmp_*.tmp` matches both.', '`rm inbox/tmp_*.tmp`'],
    },
    {
      kind: 'predict',
      id: 'p-sort',
      md: 'What does this print?',
      code: 'mkdir t && cd t && touch b.txt a.txt c.log && echo *.txt',
      options: ['b.txt a.txt', 'a.txt b.txt', '*.txt', 'a.txt b.txt c.log'],
      answer: 1,
      explain: 'Bash sorts the matches alphabetically before handing them to `echo`. `c.log` doesn’t end in `.txt`, so it isn’t included.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-touch',
      md: '**Drill 1.** Create an empty file `evidence/findings.txt`.',
      check: { fs: [{ path: '~/evidence/findings.txt', type: 'file' }], uses: ['touch'] },
      solution: 'touch evidence/findings.txt',
      hints: ['`touch` creates empty files.'],
    },
    {
      kind: 'task',
      id: 'd-cpr',
      md: '**Drill 2.** Back up the whole `evidence` folder to a new folder called `evidence_backup`.',
      check: { fs: [{ path: '~/evidence_backup/logs/access.log', exists: true }, { path: '~/evidence_backup/images/screenshot1.png', exists: true }], uses: ['cp'] },
      solution: 'cp -r evidence evidence_backup',
      hints: ['Copying a folder needs `-r` (recursive).', '`cp -r evidence evidence_backup`'],
    },
    {
      kind: 'task',
      id: 'd-rm-draft',
      md: '**Drill 3.** The draft report is obsolete. Remove `inbox/report_draft.docx`.',
      check: { fs: [{ path: '~/inbox/report_draft.docx', exists: false }, { path: '~/inbox/report_final.docx', exists: true }], uses: ['rm'] },
      solution: 'rm inbox/report_draft.docx',
      hints: ['`rm` + the path.'],
    },
    {
      kind: 'task',
      id: 'd-ls-inbox',
      md: '**Drill 4.** What’s left in `inbox`? List it, **including hidden files**.',
      check: { uses: ['ls'], output: { contains: ['.DS_Store', 'report_final.docx'] } },
      solution: 'ls -a inbox',
      hints: ['`-a` shows hidden files.'],
    },
  ],
  debrief: {
    summary: [
      '`mkdir -p`, `touch`, `cp -r`, `mv`, `rm -r` — create, copy, move, delete.',
      '`mv` renames when the destination isn’t a folder.',
      'Wildcards `*` `?` `[ ]` are expanded by bash before the command runs, in sorted order.',
      'There’s no undo for `rm`: preview the pattern with `ls` first.',
    ],
    cards: ['c-mkdirp', 'c-cpr', 'c-mvrename', 'c-star', 'c-question', 'c-rm', 'c-expansion'],
  },
};
