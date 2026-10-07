// Achievements, drawn as ink seals.

import { streakInfo } from './progress';

export interface BadgeSnapshot {
  missionsDone: number[];
  challengesSolved: { id: string; hints: number; kind: 'task' | 'case' | 'arena' }[];
  casesSolved: number;
  arenaSolved: number;
  activity: string[];
  stats: { commands: number; scripts: number; reviews: number; manPages: number; sudo: number; longestPipe: number; exports: number };
  perfectMissions: number;
  lastActiveHour: number | null;
}

export interface Badge {
  id: string;
  title: string;
  blurb: string;
  glyph: string; // short mark shown in the seal
  earned: (s: BadgeSnapshot) => boolean;
}

export const BADGES: Badge[] = [
  { id: 'first-contact', title: 'First Contact', blurb: 'Ran your first command.', glyph: '$_', earned: (s) => s.stats.commands >= 1 },
  { id: 'day-one', title: 'Day One', blurb: 'Completed your first mission.', glyph: 'I', earned: (s) => s.missionsDone.length >= 1 },
  { id: 'hello-script', title: 'Hello, Script', blurb: 'Ran your first script.', glyph: '#!', earned: (s) => s.stats.scripts >= 1 },
  { id: 'pipe-dreamer', title: 'Pipe Dreamer', blurb: 'Chained four commands with pipes.', glyph: '|||', earned: (s) => s.stats.longestPipe >= 4 },
  { id: 'curious', title: 'Well Read', blurb: 'Opened ten manual pages.', glyph: 'man', earned: (s) => s.stats.manPages >= 10 },
  { id: 'with-great-power', title: 'With Great Power', blurb: 'Used sudo for the first time.', glyph: '#', earned: (s) => s.stats.sudo >= 1 },
  { id: 'chapter-1', title: 'Chapter I', blurb: 'Finished week one — Foundations.', glyph: 'I', earned: (s) => [1, 2, 3, 4, 5, 6, 7].every((d) => s.missionsDone.includes(d)) },
  { id: 'chapter-2', title: 'Chapter II', blurb: 'Finished week two — Logic.', glyph: 'II', earned: (s) => [8, 9, 10, 11, 12, 13, 14].every((d) => s.missionsDone.includes(d)) },
  { id: 'chapter-3', title: 'Chapter III', blurb: 'Finished week three — Security scripting.', glyph: 'III', earned: (s) => [15, 16, 17, 18, 19, 20, 21].every((d) => s.missionsDone.includes(d)) },
  { id: 'case-closed', title: 'Case Closed', blurb: 'Solved your first case file.', glyph: '✓', earned: (s) => s.casesSolved >= 1 },
  { id: 'caseload', title: 'Caseload', blurb: 'Solved five case files.', glyph: 'V', earned: (s) => s.casesSolved >= 5 },
  { id: 'unassisted', title: 'Unassisted', blurb: 'Solved ten challenges without a single hint.', glyph: '0', earned: (s) => s.challengesSolved.filter((c) => c.hints === 0).length >= 10 },
  { id: 'clean-sheet', title: 'Clean Sheet', blurb: 'Finished a mission with no hints and no wrong answers.', glyph: '★', earned: (s) => s.perfectMissions >= 1 },
  { id: 'arena-regular', title: 'Arena Regular', blurb: 'Solved ten Arena challenges.', glyph: '10', earned: (s) => s.arenaSolved >= 10 },
  { id: 'streak-3', title: 'Three in a Row', blurb: 'Studied three days running.', glyph: '3', earned: (s) => streakInfo(s.activity).best >= 3 },
  { id: 'streak-7', title: 'Full Week', blurb: 'A seven-day streak.', glyph: '7', earned: (s) => streakInfo(s.activity).best >= 7 },
  { id: 'streak-14', title: 'Fortnight', blurb: 'A fourteen-day streak.', glyph: '14', earned: (s) => streakInfo(s.activity).best >= 14 },
  { id: 'night-owl', title: 'Night Shift', blurb: 'Studied between midnight and 4 a.m.', glyph: '☾', earned: (s) => s.lastActiveHour !== null && s.lastActiveHour < 4 },
  { id: 'reviewer', title: 'Sharp Memory', blurb: 'Reviewed fifty flashcards.', glyph: '50', earned: (s) => s.stats.reviews >= 50 },
  { id: 'archivist', title: 'Archivist', blurb: 'Exported a backup of your progress.', glyph: '⇩', earned: (s) => s.stats.exports >= 1 },
  { id: 'centurion', title: 'Centurion', blurb: 'Ran a hundred commands.', glyph: 'C', earned: (s) => s.stats.commands >= 100 },
  { id: 'lead', title: 'Lead Analyst', blurb: 'Closed the capstone incident.', glyph: 'L', earned: (s) => s.missionsDone.includes(21) },
];
