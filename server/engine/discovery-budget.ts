const SWEEP_SLOT_MS = 30 * 60_000;
const SWEEP_HEADROOM_MS = 60_000;
const DISCOVERY_START_GUARD_MS = 90_000;

export function discoveryBudget(now: number, budgetMs: number): number | null {
  const nextSlot = Math.ceil((now + 1) / SWEEP_SLOT_MS) * SWEEP_SLOT_MS;
  const timeToSlot = nextSlot - now;
  if (timeToSlot < DISCOVERY_START_GUARD_MS) return null;
  return Math.min(budgetMs, timeToSlot - SWEEP_HEADROOM_MS);
}
