import type { CaseFile } from '../types';
import { case01 } from './case01';
import { case02 } from './case02';

export const CASES: CaseFile[] = [case01, case02];

export function getCase(id: string): CaseFile | undefined {
  return CASES.find((c) => c.id === id);
}
