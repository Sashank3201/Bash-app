import type { Mission } from '../types';
import { day01 } from './day01';

export const MISSIONS: Mission[] = [day01].sort((a, b) => a.day - b.day);

export function getMission(day: number): Mission | undefined {
  return MISSIONS.find((m) => m.day === day);
}
