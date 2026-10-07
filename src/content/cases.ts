import type { CaseFile } from './types';

export const CASES: CaseFile[] = [];

export function getCase(id: string): CaseFile | undefined {
  return CASES.find((c) => c.id === id);
}
