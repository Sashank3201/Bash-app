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
];

const BY_ID = new Map(FLASHCARDS.map((c) => [c.id, c]));
export function getCard(id: string): Flashcard | undefined {
  return BY_ID.get(id);
}
