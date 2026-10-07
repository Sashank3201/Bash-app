// Global app state, persisted on this device (localStorage). Export/import makes it portable.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { BADGES, type BadgeSnapshot } from '../engine/badges';
import { dayKey, newCard, review as reviewCard, type CardState, type Grade } from '../engine/progress';

export type ThemePref = 'system' | 'light' | 'dark';

export interface StepRecord {
  done: boolean;
  wrong: number;
  hints: number;
  revealed?: boolean;
}

export interface MissionRecord {
  step: number;
  phase: 'briefing' | 'lesson' | 'drills' | 'debrief';
  steps: Record<string, StepRecord>;
  done: boolean;
  doneAt?: number;
}

export interface ChallengeRecord {
  solved: boolean;
  solvedAt?: number;
  hints: number;
  attempts: number;
  revealed?: boolean;
  xp: number;
}

export interface Toast {
  id: number;
  kind: 'xp' | 'badge' | 'rank' | 'info';
  title: string;
  body?: string;
}

export interface AppState {
  schema: 1;
  profile: { name: string; onboarded: boolean; startedAt: number | null };
  settings: { theme: ThemePref; fontScale: number; haptics: boolean; sounds: boolean; typewriter: boolean };
  missions: Record<number, MissionRecord>;
  challenges: Record<string, ChallengeRecord>;
  drafts: Record<string, string>;
  xp: number;
  activity: string[];
  lastActiveHour: number | null;
  badges: Record<string, number>;
  cards: Record<string, CardState>;
  stats: BadgeSnapshot['stats'];
  toasts: Toast[];

  // actions
  setProfile(p: Partial<AppState['profile']>): void;
  setSettings(p: Partial<AppState['settings']>): void;
  touch(): void;
  addXp(n: number, reason?: string): void;
  mission(day: number): MissionRecord;
  updateMission(day: number, fn: (m: MissionRecord) => void): void;
  completeMission(day: number, cardIds: string[]): void;
  solveChallenge(id: string, kind: 'task' | 'case' | 'arena', xp: number, hints: number, revealed?: boolean): void;
  useHint(id: string): void;
  attempt(id: string): void;
  setDraft(id: string, text: string): void;
  unlockCards(ids: string[]): void;
  reviewCard(id: string, g: Grade): void;
  bump(stat: keyof AppState['stats'], n?: number): void;
  maxStat(stat: keyof AppState['stats'], v: number): void;
  pushToast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  evaluateBadges(): void;
  exportCode(): string;
  exportJson(): string;
  importData(text: string): { ok: boolean; error?: string };
  reset(): void;
}

const emptyStats = (): BadgeSnapshot['stats'] => ({ commands: 0, scripts: 0, reviews: 0, manPages: 0, sudo: 0, longestPipe: 0, exports: 0 });

const initial = () => ({
  schema: 1 as const,
  profile: { name: '', onboarded: false, startedAt: null },
  settings: { theme: 'system' as ThemePref, fontScale: 1, haptics: true, sounds: false, typewriter: true },
  missions: {},
  challenges: {},
  drafts: {},
  xp: 0,
  activity: [] as string[],
  lastActiveHour: null,
  badges: {},
  cards: {},
  stats: emptyStats(),
  toasts: [] as Toast[],
});

let toastId = 1;

export function snapshot(s: AppState): BadgeSnapshot {
  const missionsDone = Object.entries(s.missions)
    .filter(([, m]) => m.done)
    .map(([d]) => Number(d));
  const solved = Object.entries(s.challenges).filter(([, c]) => c.solved);
  return {
    missionsDone,
    challengesSolved: solved.map(([id, c]) => ({ id, hints: c.hints, kind: id.startsWith('case:') ? 'case' : id.startsWith('arena:') ? 'arena' : 'task' })),
    casesSolved: solved.filter(([id]) => id.startsWith('case:')).length,
    arenaSolved: solved.filter(([id]) => id.startsWith('arena:')).length,
    activity: s.activity,
    stats: s.stats,
    perfectMissions: Object.values(s.missions).filter((m) => m.done && Object.values(m.steps).every((st) => st.wrong === 0 && st.hints === 0)).length,
    lastActiveHour: s.lastActiveHour,
  };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...initial(),

      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),

      touch: () => {
        const k = dayKey();
        const hour = new Date().getHours();
        set((s) => ({ activity: s.activity.includes(k) ? s.activity : [...s.activity, k], lastActiveHour: hour }));
      },

      addXp: (n, reason) => {
        if (n <= 0) return;
        set((s) => ({ xp: s.xp + n }));
        get().touch();
        if (reason) get().pushToast({ kind: 'xp', title: `+${n} XP`, body: reason });
        get().evaluateBadges();
      },

      mission: (day) => get().missions[day] ?? { step: 0, phase: 'briefing', steps: {}, done: false },

      updateMission: (day, fn) =>
        set((s) => {
          const m: MissionRecord = structuredClone(s.missions[day] ?? { step: 0, phase: 'briefing', steps: {}, done: false });
          fn(m);
          return { missions: { ...s.missions, [day]: m } };
        }),

      completeMission: (day, cardIds) => {
        const already = get().missions[day]?.done;
        get().updateMission(day, (m) => {
          m.done = true;
          m.phase = 'debrief';
          m.doneAt = m.doneAt ?? Date.now();
        });
        get().unlockCards(cardIds);
        if (!already) get().addXp(100, `Mission ${day} complete`);
        get().evaluateBadges();
      },

      solveChallenge: (id, _kind, xp, hints, revealed) => {
        const prev = get().challenges[id];
        if (prev?.solved) return;
        set((s) => ({
          challenges: { ...s.challenges, [id]: { ...(prev ?? { attempts: 0 }), solved: true, solvedAt: Date.now(), hints, revealed, xp } },
        }));
        get().addXp(xp);
      },

      useHint: (id) =>
        set((s) => {
          const c = s.challenges[id] ?? { solved: false, hints: 0, attempts: 0, xp: 0 };
          return { challenges: { ...s.challenges, [id]: { ...c, hints: c.hints + 1 } } };
        }),

      attempt: (id) =>
        set((s) => {
          const c = s.challenges[id] ?? { solved: false, hints: 0, attempts: 0, xp: 0 };
          return { challenges: { ...s.challenges, [id]: { ...c, attempts: c.attempts + 1 } } };
        }),

      setDraft: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),

      unlockCards: (ids) =>
        set((s) => {
          const cards = { ...s.cards };
          for (const id of ids) if (!cards[id]) cards[id] = newCard();
          return { cards };
        }),

      reviewCard: (id, g) => {
        set((s) => ({ cards: { ...s.cards, [id]: reviewCard(s.cards[id] ?? newCard(), g) } }));
        get().bump('reviews');
        get().addXp(3);
      },

      bump: (stat, n = 1) => {
        set((s) => ({ stats: { ...s.stats, [stat]: s.stats[stat] + n } }));
        get().evaluateBadges();
      },

      maxStat: (stat, v) => {
        if (get().stats[stat] >= v) return;
        set((s) => ({ stats: { ...s.stats, [stat]: v } }));
        get().evaluateBadges();
      },

      pushToast: (t) => {
        const id = toastId++;
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
        setTimeout(() => get().dismissToast(id), t.kind === 'badge' || t.kind === 'rank' ? 5200 : 2600);
      },

      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      evaluateBadges: () => {
        const s = get();
        const snap = snapshot(s);
        const earned: string[] = [];
        for (const b of BADGES) if (!s.badges[b.id] && b.earned(snap)) earned.push(b.id);
        if (!earned.length) return;
        const now = Date.now();
        set((st) => ({ badges: { ...st.badges, ...Object.fromEntries(earned.map((id) => [id, now])) } }));
        for (const id of earned) {
          const b = BADGES.find((x) => x.id === id)!;
          get().pushToast({ kind: 'badge', title: b.title, body: b.blurb });
        }
      },

      exportJson: () => {
        const s = get();
        const data = {
          app: 'ink-and-shell',
          schema: 1,
          exportedAt: new Date().toISOString(),
          state: {
            profile: s.profile,
            settings: s.settings,
            missions: s.missions,
            challenges: s.challenges,
            drafts: s.drafts,
            xp: s.xp,
            activity: s.activity,
            badges: s.badges,
            cards: s.cards,
            stats: s.stats,
          },
        };
        get().bump('exports');
        return JSON.stringify(data, null, 2);
      },

      exportCode: () => compressToEncodedURIComponent(get().exportJson()),

      importData: (text) => {
        let raw = text.trim();
        try {
          if (!raw.startsWith('{')) raw = decompressFromEncodedURIComponent(raw) ?? '';
          const data = JSON.parse(raw);
          if (data.app !== 'ink-and-shell' || !data.state) return { ok: false, error: 'This doesn’t look like an Ink & Shell backup.' };
          const st = data.state;
          set(() => ({
            ...initial(),
            profile: { ...initial().profile, ...st.profile },
            settings: { ...initial().settings, ...st.settings },
            missions: st.missions ?? {},
            challenges: st.challenges ?? {},
            drafts: st.drafts ?? {},
            xp: Number(st.xp) || 0,
            activity: Array.isArray(st.activity) ? st.activity : [],
            badges: st.badges ?? {},
            cards: st.cards ?? {},
            stats: { ...emptyStats(), ...st.stats },
          }));
          return { ok: true };
        } catch {
          return { ok: false, error: 'Couldn’t read that backup — make sure you pasted the whole code.' };
        }
      },

      reset: () => set(() => ({ ...initial() })),
    }),
    {
      name: 'ink-shell',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { toasts: _t, ...rest } = s;
        void _t;
        return rest as unknown as AppState;
      },
      version: 1,
    },
  ),
);
