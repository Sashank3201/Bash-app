import type { CaseFile } from '../types';
import { case01 } from './case01';
import { case02 } from './case02';
import { case03 } from './case03';

export const CASES: CaseFile[] = [case01, case02, case03];

export function getCase(id: string): CaseFile | undefined {
  return CASES.find((c) => c.id === id);
}
