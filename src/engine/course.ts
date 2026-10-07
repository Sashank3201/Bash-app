// Course-level helpers: what's unlocked, what's next.

import { SYLLABUS } from '../content/syllabus';
import type { MissionRecord } from '../store/app';

export function isUnlocked(day: number, missions: Record<number, MissionRecord>): boolean {
  if (day <= 1) return true;
  return !!missions[day - 1]?.done || !!missions[day]?.done;
}

/** The first day that isn't finished (or 22 when everything is done). */
export function currentDay(missions: Record<number, MissionRecord>): number {
  for (const d of SYLLABUS) if (!missions[d.day]?.done) return d.day;
  return SYLLABUS.length + 1;
}

export function missionProgress(rec: MissionRecord | undefined, totalSteps: number): number {
  if (!rec) return 0;
  if (rec.done) return 1;
  const done = Object.values(rec.steps).filter((s) => s.done).length;
  return totalSteps ? done / totalSteps : 0;
}

export function caseUnlocked(day: number, missions: Record<number, MissionRecord>): boolean {
  return isUnlocked(day, missions) && (missions[day]?.done || (missions[day]?.step ?? 0) > 0 || day <= 1);
}
