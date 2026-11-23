export const RECYCLE_HEAP_FRACTION = 0.75;
export const RECYCLE_SLOT_HEADROOM_MS = 3 * 60_000;

export function shouldRecycle({
  heapUsed,
  heapLimit,
  refreshing,
  discoveryRunning,
  msToNextSlot,
}: {
  heapUsed: number;
  heapLimit: number;
  refreshing: boolean;
  discoveryRunning: boolean;
  msToNextSlot: number;
}): boolean {
  return heapUsed >= RECYCLE_HEAP_FRACTION * heapLimit
    && !refreshing
    && !discoveryRunning
    && msToNextSlot >= RECYCLE_SLOT_HEADROOM_MS;
}
