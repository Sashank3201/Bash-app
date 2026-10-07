import { defineFixture } from '../fixtures';
import { home, homeDir } from '../fixtures/base';
import type { Mission } from '../types';

defineFixture('day02', (vfs) => {
  homeDir(vfs, 'cases/2026/march');
  homeDir(vfs, 'cases/2026/february');
  homeDir(vfs, 'downloads');
  home(vfs, 'cases/2026/march/incident-notes.txt', 'Mar 13 02:10 — repeated root login failures on web01.\nSource: 203.0.113.7. Blocked at 02:41.\n');
  home(vfs, 'cases/2026/march/.timeline.txt', '02:10 first failed login\n02:24 fourteen attempts so far\n02:41 IP blocked at the firewall\n');
  home(vfs, 'cases/2026/february/closed.txt', 'Phishing wave — closed.\n');
  home(vfs, 'notes/todo.txt', 'Learn cd properly\nAsk Raj about the VPN logs\n');
  home(vfs, 'notes/meeting.txt', 'Weekly sync: Thursday 10:00\n');
  home(vfs, '.config/halden/settings', 'theme=dark\nalerts=on\n');
  home(vfs, '.hidden_drafts/draft.txt', 'Draft: the codeword for Friday is "kestrel".\n');
  home(vfs, 'downloads/readme.txt', 'Nothing to see here.\n');
});

export const day02: Mission = {
  day: 2,
  week: 1,
  title: 'Finding Your Way',
  topic: 'Paths, cd, hidden files & tab completion',
  minutes: 35,
  fixture: 'day02',
  briefing: `Yesterday you met the terminal. Today you learn to **move**.

A Linux machine keeps everything in one big tree of folders. Logs are in one corner, configuration in another, people’s home folders in a third. When an alert fires at 2 a.m., the analysts who know their way around get to the evidence first.

Raj left last night’s incident notes somewhere in your home folder — and, knowing Raj, at least one file is hidden. Find them.`,
  objectives: ['Picture the filesystem as a tree starting at /', 'Tell absolute and relative paths apart', 'Move with cd, cd .., cd ~ and cd -', 'Reveal hidden files with ls -a', 'Let Tab do your typing'],
  lesson: [
    {
      kind: 'read',
      id: 'tree',
      title: 'One tree, one root',
      md: `Every file on a Linux system lives somewhere under a single starting point called the **root**, written as a lone slash: \`/\`.

| Folder | What lives there |
|---|---|
| \`/home\` | Users’ personal folders (yours is \`/home/analyst\`) |
| \`/etc\` | System configuration |
| \`/var/log\` | Logs — the analyst’s favourite place |
| \`/tmp\` | Temporary files anyone can write |
| \`/usr/bin\` | Installed programs (yes, \`ls\` is a file in here) |

A **path** is the list of folders you walk through to reach something, separated by \`/\`. \`/var/log/auth.log\` means: start at the root, go into \`var\`, then \`log\`, then the file \`auth.log\`.`,
    },
    {
      kind: 'widget',
      id: 'explorer',
      md: 'Tap folders to move around this tree. Watch how the same move can be written as an **absolute** or a **relative** path.',
      widget: 'paths',
    },
    {
      kind: 'task',
      id: 'cd-varlog',
      md: '`cd` changes your current directory. Go to the system log folder: `/var/log`.',
      check: { cwd: '/var/log', uses: ['cd'] },
      solution: 'cd /var/log',
      hints: ['`cd` followed by the path.', '`cd /var/log`'],
      explain: 'Look at your prompt — it now ends in `/var/log$`. The prompt always tells you where you are.',
    },
    {
      kind: 'task',
      id: 'ls-varlog',
      md: 'You’re in `/var/log`. List what’s here.',
      check: { output: 'reference', uses: ['ls'] },
      solution: 'ls',
      hints: ['No path needed: `ls` lists the current directory.'],
      explain: 'These are the machine’s logs. `auth.log` records logins and sudo use — you’ll spend a lot of time with it.',
    },
    {
      kind: 'read',
      id: 'relative',
      title: 'Shortcuts: . .. ~ and -',
      md: `An **absolute** path starts with \`/\` and works from anywhere. A **relative** path starts from where you are now.

- \`.\` means “this folder”.
- \`..\` means “the folder above this one” (the parent).
- \`~\` means your home folder, \`/home/analyst\`.
- \`cd\` on its own takes you home.
- \`cd -\` jumps back to wherever you were before.

So from \`/var/log\`, \`cd ..\` takes you to \`/var\`, and \`cd ../../etc\` takes you up two levels and into \`/etc\`.`,
    },
    {
      kind: 'task',
      id: 'cd-up',
      md: 'Go **up one level** from `/var/log` using a relative path.',
      check: { cwd: '/var', uses: ['cd'] },
      solution: 'cd ..',
      hints: ['Two dots mean “the parent folder”.', '`cd ..` — note the space after cd.'],
    },
    {
      kind: 'task',
      id: 'cd-home',
      md: 'Now go straight back to your home folder.',
      check: { cwd: '~', uses: ['cd'] },
      solution: 'cd',
      hints: ['`cd` with no argument goes home. `cd ~` works too.'],
      explain: 'The prompt shows `~` again: you’re home.',
    },
    {
      kind: 'quiz',
      id: 'q-rel',
      q: 'You are in `/home/analyst/cases`. Where does `cd ../notes` take you?',
      options: ['/home/analyst/cases/notes', '/home/analyst/notes', '/notes', '/home/notes'],
      answer: 1,
      explain: '`..` climbs from `cases` up to `/home/analyst`, then `notes` goes down into `/home/analyst/notes`.',
    },
    {
      kind: 'task',
      id: 'cd-march',
      md: 'Raj’s notes are in `cases/2026/march` inside your home. Go there with a **relative** path. Tip: type `cd ca` and press **Tab** — let completion do the work.',
      check: { cwd: '~/cases/2026/march', uses: ['cd'] },
      solution: 'cd cases/2026/march',
      hints: ['From `~`, the relative path is `cases/2026/march`.', 'Press Tab after each partial name: `cd ca⇥20⇥ma⇥`.'],
      explain: 'Tab completion saves typing and prevents typos. If Tab does nothing, there’s no match — check what you typed so far.',
    },
    {
      kind: 'task',
      id: 'ls-la',
      md: 'A plain `ls` shows only one file here. Hidden files start with a dot and only appear with `-a`. List **everything** in long format.',
      check: { uses: ['ls'], output: { contains: ['.timeline.txt', 'incident-notes.txt'] } },
      solution: 'ls -la',
      hints: ['Combine `-l` (long) and `-a` (all).', '`ls -la`'],
      explain: 'There it is: `.timeline.txt`. Attackers hide things the same way — always look with `-a`.',
    },
    {
      kind: 'task',
      id: 'cat-timeline',
      md: 'Read the hidden timeline file.',
      check: { output: 'reference', uses: ['cat'] },
      solution: 'cat .timeline.txt',
      hints: ['The dot is part of the name: `cat .timeline.txt`.'],
    },
    {
      kind: 'read',
      id: 'tree-cmd',
      title: 'The big picture',
      md: '`tree` draws a folder and everything inside it. It’s the fastest way to get your bearings in an unfamiliar place. Add `-a` to include hidden files.',
    },
    {
      kind: 'task',
      id: 'tree-home',
      md: 'From where you are, draw the tree of your **home** folder (use `~`).',
      check: { output: 'reference', uses: ['tree'] },
      solution: 'tree ~',
      hints: ['`tree` takes a folder as its argument.', '`tree ~`'],
    },
    {
      kind: 'predict',
      id: 'p-cd',
      md: 'What does this print?',
      code: 'cd /tmp; cd ..; pwd',
      options: ['/tmp', '/', '/home/analyst', '..'],
      answer: 1,
      explain: 'The parent of `/tmp` is the root, `/`. (The `;` simply runs one command after another.)',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-ssh',
      md: '**Drill 1.** SSH server settings live in `/etc/ssh`. Go there.',
      check: { cwd: '/etc/ssh', uses: ['cd'] },
      solution: 'cd /etc/ssh',
      hints: ['Use an absolute path.'],
    },
    {
      kind: 'task',
      id: 'd-hidden-home',
      md: '**Drill 2.** Without leaving `/etc/ssh`, list **all** files (hidden too) in your home folder.',
      check: { uses: ['ls'], output: { contains: ['.config', '.hidden_drafts'] } },
      solution: 'ls -a ~',
      hints: ['`ls` can take `~` as its argument.', '`ls -a ~`'],
    },
    {
      kind: 'task',
      id: 'd-draft',
      md: '**Drill 3.** There’s a hidden folder in your home called `.hidden_drafts`. Read the `draft.txt` inside it — from wherever you are.',
      check: { output: 'reference', uses: ['cat'] },
      solution: 'cat ~/.hidden_drafts/draft.txt',
      hints: ['Build the path from `~`: `~/.hidden_drafts/draft.txt`.'],
    },
    {
      kind: 'task',
      id: 'd-back',
      md: '**Drill 4.** Go home with `cd`, then use today’s shortcut to jump straight back to `/etc/ssh` without typing the path.',
      check: { cwd: '/etc/ssh', uses: ['cd'] },
      solution: 'cd ~ && cd -',
      hints: ['First `cd` (home). Then `cd -` returns to the previous directory.'],
    },
  ],
  debrief: {
    summary: [
      'Everything lives under `/`. Absolute paths start with `/`; relative paths start from where you are.',
      '`.` is here, `..` is the parent, `~` is home, `cd -` goes back.',
      'Names starting with `.` are hidden — `ls -a` reveals them.',
      '`tree` shows a whole folder at a glance. Tab completes names.',
    ],
    cards: ['c-abs-rel', 'c-dotdot', 'c-cdhome', 'c-cddash', 'c-hidden', 'c-varlog', 'c-etc'],
  },
};
