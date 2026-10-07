// The 21-day plan at a glance (titles show on the Path even before a day is unlocked).

export interface SyllabusDay {
  day: number;
  week: 1 | 2 | 3;
  title: string;
  topic: string;
  caseId?: string;
}

export const SYLLABUS: SyllabusDay[] = [
  { day: 1, week: 1, title: 'First Login', topic: 'The shell, the prompt & your first commands' },
  { day: 2, week: 1, title: 'Finding Your Way', topic: 'Paths, cd, hidden files & tab completion' },
  { day: 3, week: 1, title: 'The Evidence Locker', topic: 'Creating, copying, moving & globbing files' },
  { day: 4, week: 1, title: 'Reading the Logs', topic: 'cat, head, tail, wc & grep' },
  { day: 5, week: 1, title: 'Plumbing', topic: 'Pipes, redirection, sort & uniq' },
  { day: 6, week: 1, title: 'Keys to the Building', topic: 'Users, groups & permissions' },
  { day: 7, week: 1, title: 'Your First Script', topic: 'Shebang, variables, quoting & $( )', caseId: 'snapshot' },
  { day: 8, week: 2, title: 'Taking Orders', topic: 'Arguments, read & exit codes' },
  { day: 9, week: 2, title: 'Decisions', topic: 'if, test, [[ ]] & file checks' },
  { day: 10, week: 2, title: 'Repetition', topic: 'for, while, until & loop control', caseId: 'sweep' },
  { day: 11, week: 2, title: 'Slicing Columns', topic: 'cut, tr, sort -k, sed & awk' },
  { day: 12, week: 2, title: 'Toolkit', topic: 'Functions, local variables & case' },
  { day: 13, week: 2, title: 'Patterns', topic: 'Regular expressions & IOC extraction' },
  { day: 14, week: 2, title: 'Under Attack', topic: 'Case: the brute-force detector', caseId: 'bruteforce' },
  { day: 15, week: 3, title: 'Counting Things', topic: 'Arrays, associative arrays & string tricks' },
  { day: 16, week: 3, title: 'Hidden in Plain Sight', topic: 'Encoding, hashing & decoding payloads', caseId: 'decoder' },
  { day: 17, week: 3, title: 'Timeline', topic: 'Dates, time windows & event timelines', caseId: 'timeline' },
  { day: 18, week: 3, title: 'The Audit', topic: 'find, risky permissions & account review', caseId: 'auditbot' },
  { day: 19, week: 3, title: 'Built to Last', topic: 'Strict mode, traps, logging & getopts' },
  { day: 20, week: 3, title: 'Integrity Watch', topic: 'Baselines, checksums & change detection', caseId: 'integrity' },
  { day: 21, week: 3, title: 'Incident 0x21', topic: 'Capstone: triage a compromised server', caseId: 'capstone' },
];
