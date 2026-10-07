import { defineFixture } from '../fixtures';
import { home, homeDir } from '../fixtures/base';
import type { Mission } from '../types';

defineFixture('day01', (vfs) => {
  home(
    vfs,
    'welcome.txt',
    `Welcome to Halden Security!

You're on the Detection & Response desk with me this month. Every
investigation we run starts in a terminal like the one you're using now.

House rules are in rules.txt. Your first case folder is cases/.

The phrase for today's check-in is: blue-heron

— Mara
`,
  );
  home(
    vfs,
    'rules.txt',
    `1. Never run a command you don't understand on a production server.
2. Read before you delete. Copy before you change.
3. Logs are evidence. Treat them gently.
4. When in doubt, ask. Then write it down.
`,
  );
  home(vfs, 'schedule.txt', 'Mon  shell basics\nTue  navigation\nWed  files & folders\nThu  searching text\nFri  pipes\n');
  homeDir(vfs, 'cases');
  home(vfs, 'cases/README', 'Case files go here. Empty for now — that changes next week.\n');
});

export const day01: Mission = {
  day: 1,
  week: 1,
  title: 'First Login',
  topic: 'The shell, the prompt & your first commands',
  minutes: 30,
  fixture: 'day01',
  briefing: `Morning, and welcome to Halden. I’m Mara Okafor — I run the Detection & Response desk, which makes me your mentor for the next three weeks.

Here’s the honest truth about this job: our dashboards are pretty, but every real investigation ends up in a **terminal**. Logs live on servers. Servers speak text. The analysts who move fastest are the ones who are comfortable typing commands.

So that’s where we start. Today you’ll log in, read the prompt like a pro, and run your first commands. Nothing you do here can break anything — this workstation is yours.

I left a welcome note in your home folder. Let’s go and find it.`,
  objectives: ['Tell a terminal, a shell and bash apart', 'Read every part of the prompt', 'Run echo, whoami, pwd, ls, cat and date', 'Understand command · options · arguments', 'Open a manual page with man'],
  lesson: [
    {
      kind: 'read',
      id: 'what',
      title: 'Terminal, shell, bash',
      md: `Three words get mixed up all the time, so let’s pin them down:

- The **terminal** is the window — the dark panel below (or beside) this text.
- The **shell** is the program inside it that reads what you type, runs it, and prints the result.
- **Bash** is the specific shell we use. It’s the default on most Linux servers you’ll ever touch.

The rhythm is always the same: you type a **command**, press **Enter**, bash runs it and prints **output**, then it shows the **prompt** again to say “ready for the next one.”`,
    },
    {
      kind: 'widget',
      id: 'prompt',
      md: 'The prompt isn’t decoration — it tells you three important things. Tap each part.',
      widget: 'anatomy',
    },
    {
      kind: 'example',
      id: 'echo-ex',
      md: '`echo` prints whatever you give it. Tap **Run** to send this to the terminal — or type it yourself (typing is better for your memory).',
      code: 'echo "Hello from the terminal"',
    },
    {
      kind: 'task',
      id: 'hello',
      md: 'Your turn. Use `echo` to print exactly:\n\n```output\nHello, Halden\n```',
      check: { output: 'Hello, Halden\n', uses: ['echo'] },
      solution: 'echo "Hello, Halden"',
      hints: ['Start with the command name: `echo`, then a space, then the text.', 'Wrap the text in double quotes so the comma and space are kept: `echo "…"`.'],
      explain: 'Quotes keep the text together as one argument. Without them it would still work here — but quoting text is a good habit you’ll be glad of later.',
    },
    {
      kind: 'task',
      id: 'whoami',
      md: 'Who does the shell think you are? Run the command `whoami`.',
      check: { output: 'reference', uses: ['whoami'] },
      solution: 'whoami',
      hints: ['It’s one word, no spaces: `whoami`.'],
      explain: 'You’re logged in as **analyst** — the same name you saw at the start of the prompt.',
    },
    {
      kind: 'task',
      id: 'pwd',
      md: 'Where are you? `pwd` (**p**rint **w**orking **d**irectory) shows the folder you’re currently in. Run it.',
      check: { output: 'reference', uses: ['pwd'] },
      solution: 'pwd',
      hints: ['Type `pwd` and press Enter.'],
      explain: '`/home/analyst` is your **home directory**. In the prompt it’s shortened to `~` (tilde). Same place, shorter name.',
    },
    {
      kind: 'task',
      id: 'ls',
      md: 'What’s in here? `ls` **l**i**s**ts the files in the current folder. Run it.',
      check: { output: 'reference', uses: ['ls'] },
      solution: 'ls',
      hints: ['Just `ls` — two letters.'],
      explain: 'Folders (like `cases`) show in blue; plain files in the normal colour.',
    },
    {
      kind: 'task',
      id: 'cat',
      md: 'Found it — `welcome.txt`. To print a file’s contents, use `cat` followed by the file name. Read Mara’s note.',
      check: { output: 'reference', uses: ['cat'] },
      solution: 'cat welcome.txt',
      hints: ['The pattern is `cat FILENAME`.', 'Try `cat welcome.txt`. Tip: type `cat wel` and press **Tab** to complete the name.'],
      explain: 'Remember the check-in phrase — and remember **Tab completion**. Pressing Tab finishes file names for you, so you never fight typos.',
    },
    {
      kind: 'read',
      id: 'anatomy',
      title: 'The anatomy of a command',
      md: `Most commands follow the same shape:

\`\`\`
ls   -l   /var/log
│    │    └── argument: what to work on
│    └─────── option: how to do it
└──────────── command: what to do
\`\`\`

- The **command** comes first.
- **Options** (also called flags) usually start with \`-\` and change the behaviour. \`-l\` means “long format”.
- **Arguments** are the things the command acts on — files, folders, text.

Spaces separate the parts. \`ls-l\` is not the same as \`ls -l\` — bash would look for a command literally called “ls-l”.`,
    },
    {
      kind: 'quiz',
      id: 'q-option',
      q: 'In `grep -i error app.log`, what is `-i`?',
      options: ['The command', 'An option', 'An argument', 'The prompt'],
      answer: 1,
      explain: '`grep` is the command, `-i` is an option (it means “ignore case”), and `error` and `app.log` are arguments.',
    },
    {
      kind: 'task',
      id: 'ls-l',
      md: 'Now list your files in **long format** by adding the `-l` option to `ls`.',
      check: { output: 'reference', uses: ['ls'] },
      solution: 'ls -l',
      hints: ['Command, space, option: `ls -l` (that’s a lowercase L).'],
      explain: 'Long format shows permissions, owner, size and the date each file changed. We’ll decode every column on Day 6.',
    },
    {
      kind: 'read',
      id: 'help',
      title: 'Getting help & keeping tidy',
      md: `Nobody memorises every option. Professionals look things up constantly:

- \`man ls\` opens the **manual page** for \`ls\`. Every command in this app has one.
- \`clear\` wipes the screen (or press **Ctrl-L**).
- Press **↑** to bring back your previous command, then edit it. It saves a lot of typing.

On a phone, the key bar above the keyboard has ↑, Tab, Ctrl-C and the symbols bash loves.`,
    },
    {
      kind: 'task',
      id: 'man',
      md: 'Open the manual page for `ls`. Skim it, then close it.',
      check: { uses: ['man'] },
      solution: 'man ls',
      hints: ['`man` followed by the command you want help with.'],
      explain: 'Whenever you meet an unfamiliar command in this course, `man` it.',
    },
    {
      kind: 'predict',
      id: 'p-spaces',
      md: 'Before you run it — what will this print?',
      code: 'echo one   two      three',
      options: ['one   two      three', 'one two three', 'onetwothree', 'An error'],
      answer: 1,
      explain: 'Without quotes, bash splits the line into separate words and `echo` prints them separated by single spaces. Quotes (`echo "one   two"`) would preserve the spacing exactly.',
    },
  ],
  drills: [
    {
      kind: 'task',
      id: 'd-date',
      md: '**Drill 1.** Show the current date and time.',
      check: { uses: ['date'], output: { regex: '\\d{2}:\\d{2}:\\d{2}' } },
      solution: 'date',
      hints: ['The command is named exactly what it does.'],
    },
    {
      kind: 'task',
      id: 'd-varlog',
      md: '**Drill 2.** List what’s inside the `/var/log` directory — the folder where Linux keeps its logs.',
      check: { output: 'reference', uses: ['ls'] },
      solution: 'ls /var/log',
      hints: ['`ls` can take a folder as its argument.', '`ls /var/log`'],
    },
    {
      kind: 'task',
      id: 'd-hidden',
      md: '**Drill 3.** Some files are hidden: their names start with a dot. List **all** files in your home folder, including hidden ones. (Check `man ls` if you need the option.)',
      check: { uses: ['ls'], output: { contains: ['.bashrc', 'welcome.txt'] } },
      solution: 'ls -a',
      hints: ['The option is `-a`, for “all”.', '`ls -a` — or `ls -la` for the long version.'],
    },
    {
      kind: 'task',
      id: 'd-rules',
      md: '**Drill 4.** Print the house rules in `rules.txt`.',
      check: { output: 'reference', uses: ['cat'] },
      solution: 'cat rules.txt',
      hints: ['Same as how you read the welcome note.'],
    },
  ],
  debrief: {
    summary: [
      'The terminal is the window; bash is the shell that runs your commands.',
      '`analyst@halden-ws01:~$` = user @ machine : folder, and `$` means a normal user (`#` means root).',
      'Commands follow command → options → arguments, separated by spaces.',
      '`echo`, `whoami`, `pwd`, `ls`, `cat`, `date`, `man`, `clear` are now yours.',
      'Tab completes names, ↑ recalls history.',
    ],
    cards: ['c-shell', 'c-prompt', 'c-pwd', 'c-ls', 'c-cat', 'c-anatomy', 'c-man', 'c-tilde'],
  },
};
