// XP, ranks, streaks and spaced repetition.

export interface Rank {
  id: string;
  title: string;
  min: number;
  blurb: string;
}

export const RANKS: Rank[] = [
  { id: 'intern', title: 'Intern', min: 0, blurb: 'Learning the floor plan and the shell.' },
  { id: 'junior', title: 'Junior Analyst', min: 1800, blurb: 'Trusted with logs and your first scripts.' },
  { id: 'analyst', title: 'Analyst', min: 4200, blurb: 'You automate the boring parts of every shift.' },
  { id: 'senior', title: 'Senior Analyst', min: 7200, blurb: 'Audits, integrity checks, real incidents.' },
  { id: 'lead', title: 'Lead Analyst', min: 10500, blurb: 'You run the triage. Others read your scripts.' },
];

export function rankFor(xp: number): { rank: Rank; next: Rank | null; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].min) i++;
  const rank = RANKS[i];
  const next = RANKS[i + 1] ?? null;
  const progress = next ? (xp - rank.min) / (next.min - rank.min) : 1;
  return { rank, next, progress: Math.max(0, Math.min(1, progress)) };
}

export const XP = {
  quizFirst: 20,
  quizRetry: 8,
  task: 30,
  missionBonus: 100,
  review: 3,
  arena: { easy: 40, medium: 70, hard: 120 },
};

/** XP for a solved challenge after hints (each hint halves, floor 25%). */
export function xpAfterHints(base: number, hints: number, revealed: boolean): number {
  if (revealed) return Math.round(base * 0.2);
  return Math.max(Math.round(base * 0.25), Math.round(base / 2 ** hints));
}

// ------------------------------------------------------------------ dates & streaks

export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dayKey(dt);
}

export function streakInfo(activity: string[], today = dayKey()): { current: number; best: number; activeToday: boolean } {
  const set = new Set(activity);
  const activeToday = set.has(today);
  let current = 0;
  let cursor = activeToday ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of sorted) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { current, best, activeToday };
}

// ------------------------------------------------------------------ SM-2 spaced repetition

export interface CardState {
  ease: number;
  interval: number; // days
  reps: number;
  lapses: number;
  due: string; // day key
  seen: number;
}

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export function newCard(today = dayKey()): CardState {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: today, seen: 0 };
}

export function review(c: CardState, g: Grade, today = dayKey()): CardState {
  const n = { ...c, seen: c.seen + 1 };
  if (g === 'again') {
    n.reps = 0;
    n.lapses++;
    n.interval = 0;
    n.ease = Math.max(1.3, n.ease - 0.2);
    n.due = today;
    return n;
  }
  if (g === 'hard') {
    n.interval = Math.max(1, Math.round(Math.max(1, n.interval) * 1.2));
    n.ease = Math.max(1.3, n.ease - 0.15);
  } else {
    const base = n.reps === 0 ? 1 : n.reps === 1 ? 3 : Math.round(n.interval * n.ease);
    n.interval = g === 'easy' ? Math.round(base * 1.4) + 1 : base;
    if (g === 'easy') n.ease += 0.15;
  }
  n.reps++;
  n.due = addDays(today, n.interval);
  return n;
}

export function isDue(c: CardState, today = dayKey()): boolean {
  return c.due <= today;
}
