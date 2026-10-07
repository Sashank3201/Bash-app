import { dayKey, isDue } from '../../engine/progress';
import { useApp } from '../../store/app';

export function useDueCount(): number {
  const cards = useApp((s) => s.cards);
  const today = dayKey();
  return Object.values(cards).filter((c) => isDue(c, today)).length;
}
