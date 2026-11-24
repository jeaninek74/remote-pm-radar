import { REFRESH } from '../config';

const SWEEP_SLOT_MS = 30 * 60_000;
const SWEEP_HEADROOM_MS = Math.ceil(Math.max(2 * 60_000, 4 * REFRESH.timeoutMs + 18_000) / 60_000) * 60_000;
const DISCOVERY_START_GUARD_MS = SWEEP_HEADROOM_MS + 30_000;

export { DISCOVERY_START_GUARD_MS, SWEEP_HEADROOM_MS };

export function msToNextSlot(now: number): number {
  const nextSlot = Math.ceil((now + 1) / SWEEP_SLOT_MS) * SWEEP_SLOT_MS;
  return nextSlot - now;
}

export function discoveryBudget(now: number, budgetMs: number): number | null {
  const timeToSlot = msToNextSlot(now);
  if (timeToSlot < DISCOVERY_START_GUARD_MS) return null;
  return Math.min(budgetMs, timeToSlot - SWEEP_HEADROOM_MS);
}
