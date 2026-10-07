// Fixture registry: every mission / case / challenge names the filesystem it starts from.

import type { VFS } from '../../shell/vfs';
import { baseSystem } from './base';

export type FixtureFn = (vfs: VFS, now: number) => void;

const REGISTRY = new Map<string, FixtureFn[]>();

/** Register a fixture; `extends` lets fixtures build on each other. */
export function defineFixture(id: string, fn: FixtureFn, extendsId?: string) {
  const chain = extendsId ? [...(REGISTRY.get(extendsId) ?? []), fn] : [fn];
  REGISTRY.set(id, chain);
}

export function hasFixture(id: string): boolean {
  return id === 'base' || REGISTRY.has(id);
}

export function buildFixture(id: string, now: number = Date.now()): VFS {
  const vfs = baseSystem(now);
  if (id === 'base') return vfs;
  const chain = REGISTRY.get(id);
  if (!chain) throw new Error(`Unknown fixture "${id}"`);
  for (const fn of chain) fn(vfs, now);
  return vfs;
}
