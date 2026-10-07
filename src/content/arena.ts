import type { Challenge } from './types';

export const ARENA: Challenge[] = [];

export function getChallenge(id: string): Challenge | undefined {
  return ARENA.find((c) => c.id === id);
}
