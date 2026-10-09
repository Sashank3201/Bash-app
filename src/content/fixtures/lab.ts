// The free-practice Lab: a lived-in home directory.

import { defineFixture } from './index';
import { home, homeDir } from './base';
import { accessLog, authLog } from './gen';

defineFixture('lab', (vfs) => {
  home(
    vfs,
    'welcome.txt',
    `Welcome to the Lab.

This is your sandbox: a full copy of the Halden workstation that belongs only
to you. Break things, delete things, write scripts. Nothing here can hurt the
real network, and everything you create is saved on this device.

Ideas to try:
  ls -la                         look around (including hidden files)
  cat practice/notes/todo.txt    read a file
  grep -c Failed practice/logs/auth.log
  nano scripts/hello.sh          edit a script, then: bash scripts/hello.sh
  man grep                       read a manual page

— Mara
`,
  );
  homeDir(vfs, 'practice/logs');
  home(vfs, 'practice/logs/auth.log', authLog({ seed: 99, attackers: [{ ip: '198.51.100.23', count: 18, users: ['admin', 'root', 'test', 'oracle'] }, { ip: '203.0.113.7', count: 9 }] }));
  home(vfs, 'practice/logs/access.log', accessLog({ seed: 5, scanners: [{ ip: '203.0.113.140', count: 22 }] }));
  home(vfs, 'practice/notes/todo.txt', '- learn grep\n- learn pipes\n- write my first script\n- read Mara\'s notes on log analysis\n');
  home(vfs, 'practice/notes/.secret_plan', 'If you can read this, you found a hidden file. Nice.\n');
  home(vfs, 'scripts/hello.sh', '#!/bin/bash\n# My first script\nname=${1:-analyst}\necho "Hello, $name! Today is $(date +%A)."\n', 0o755);
});
