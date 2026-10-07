import type { Mission } from '../types';
import { day01 } from './day01';
import { day02 } from './day02';
import { day03 } from './day03';
import { day04 } from './day04';
import { day05 } from './day05';
import { day06 } from './day06';
import { day07 } from './day07';
import { day08 } from './day08';
import { day09 } from './day09';
import { day10 } from './day10';
import { day11 } from './day11';
import { day12 } from './day12';
import { day13 } from './day13';
import { day14 } from './day14';

export const MISSIONS: Mission[] = [day01, day02, day03, day04, day05, day06, day07, day08, day09, day10, day11, day12, day13, day14].sort((a, b) => a.day - b.day);

export function getMission(day: number): Mission | undefined {
  return MISSIONS.find((m) => m.day === day);
}
