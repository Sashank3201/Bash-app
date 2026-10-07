// Shapes of all course content.

export type NodeKind =
  | 'pipeline'
  | 'andor'
  | 'if'
  | 'for'
  | 'cfor'
  | 'while'
  | 'case'
  | 'function'
  | 'cond'
  | 'arith'
  | 'subshell'
  | 'redirect'
  | 'cmdsub'
  | 'heredoc'
  | 'variable';

export type FsExpect =
  | { path: string; exists: boolean }
  | { path: string; type: 'file' | 'dir' }
  | { path: string; content: string }
  | { path: string; contains: string }
  | { path: string; mode: number }
  | { path: string; executable: boolean };

export interface Check {
  /**
   * 'reference' → stdout must match running `solution` on a copy of the same filesystem.
   * string → exact expected stdout. regex / contains → looser checks.
   */
  output?: 'reference' | string | { regex: string; flags?: string } | { contains: string[] } | { lines: number };
  /** Compare outputs ignoring line order. */
  anyOrder?: boolean;
  /** Ignore spacing differences inside lines. */
  looseSpace?: boolean;
  fs?: FsExpect[];
  /** Command names that must be used, e.g. ['grep', 'wc']. */
  uses?: string[];
  /** Constructs that must appear. */
  nodes?: NodeKind[];
  /** Command names that must NOT be used. */
  forbid?: string[];
  status?: number;
  /** Expected working directory afterwards (~ allowed). */
  cwd?: string;
  /** Expected shell variable values afterwards. */
  vars?: Record<string, string>;
}

export interface TaskStep {
  kind: 'task';
  id: string;
  md: string;
  check: Check;
  solution: string;
  hints: string[];
  xp?: number;
  /** Shown after success. */
  explain?: string;
}

export type WidgetKind = 'permissions' | 'pipeline' | 'expansion' | 'regex' | 'paths' | 'anatomy';

export type Step =
  | { kind: 'read'; id: string; md: string; title?: string }
  | { kind: 'note'; id: string; md: string }
  | { kind: 'example'; id: string; md?: string; code: string; caption?: string }
  | TaskStep
  | { kind: 'quiz'; id: string; q: string; options: string[]; answer: number; explain: string }
  | { kind: 'predict'; id: string; md?: string; code: string; options: string[]; answer: number; explain: string }
  | { kind: 'fill'; id: string; md: string; template: string; answers: string[][]; explain: string }
  | { kind: 'order'; id: string; md: string; lines: string[]; explain: string }
  | { kind: 'widget'; id: string; md?: string; widget: WidgetKind; props?: Record<string, unknown> };

export interface Mission {
  day: number;
  week: 1 | 2 | 3;
  title: string;
  topic: string;
  minutes: number;
  briefing: string;
  objectives: string[];
  fixture: string;
  lesson: Step[];
  drills: TaskStep[];
  caseId?: string;
  debrief: { summary: string[]; cards: string[] };
}

export interface CaseTest {
  name: string;
  args?: string[];
  stdin?: string;
  /** Extra setup on top of the case fixture for this test. */
  fixture?: string;
  check?: Check;
}

export interface CaseFile {
  id: string;
  number: number;
  title: string;
  day: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  minutes: number;
  brief: string;
  requirements: string[];
  usage: string;
  sampleOutput?: string;
  scriptPath: string;
  starter: string;
  fixture: string;
  tests: CaseTest[];
  solution: string;
  walkthrough: string;
  hints: string[];
  xp: number;
}

export interface Challenge {
  id: string;
  title: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  unlockDay: number;
  md: string;
  fixture: string;
  check: Check;
  solution: string;
  hints: string[];
  xp: number;
}

export interface Flashcard {
  id: string;
  day: number;
  front: string;
  back: string;
  tag: string;
}

export interface RefEntry {
  name: string;
  summary: string;
  usage: string;
  options: [string, string][];
  examples: [string, string][];
  security?: string;
  related?: string[];
  kind?: 'command' | 'builtin' | 'concept';
}
