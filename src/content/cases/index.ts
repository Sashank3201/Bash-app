import type { CaseFile } from '../types';
import { case01 } from './case01';
import { case02 } from './case02';
import { case03 } from './case03';
import { case04 } from './case04';
import { case05 } from './case05';
import { case06 } from './case06';
import { case07 } from './case07';
import { case08 } from './case08';

export const CASES: CaseFile[] = [case01, case02, case03, case04, case05, case06, case07, case08];

export function getCase(id: string): CaseFile | undefined {
  return CASES.find((c) => c.id === id);
}
