// Arena: extra practice outside the story, one module per topic.
import { challenges as files } from './files';
import { challenges as text } from './text';
import { challenges as columns } from './columns';
import { challenges as logic } from './logic';
import { challenges as scripting } from './scripting';
import { challenges as security } from './security';
import type { Challenge } from '../types';

export const ARENA_BY_FILE: Record<string, Challenge[]> = { files, text, columns, logic, scripting, security };

export const ARENA: Challenge[] = Object.values(ARENA_BY_FILE).flat();

export function getChallenge(id: string): Challenge | undefined {
  return ARENA.find((c) => c.id === id);
}
