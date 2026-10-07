import type { Mission } from '../types';
import { day01 } from './day01';
import { day02 } from './day02';
import { day03 } from './day03';
import { day04 } from './day04';
import { day05 } from './day05';
import { day06 } from './day06';
import { day07 } from './day07';

export const MISSIONS: Mission[] = [day01, day02, day03, day04, day05, day06, day07].sort((a, b) => a.day - b.day);

export function getMission(day: number): Mission | undefined {
  return MISSIONS.find((m) => m.day === day);
}
