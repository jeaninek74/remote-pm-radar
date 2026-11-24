import { msToNextSlot } from '../server/engine/discovery-budget';
import {
  heapIsHigh,
  RECYCLE_HEAP_FRACTION,
  RECYCLE_SLOT_HEADROOM_MS,
  shouldRecycle,
} from '../server/engine/memory';

let failures = 0;

function check(label: string, passed: boolean): void {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}

const eligible = {
  heapUsed: 750,
  heapLimit: 1_000,
  refreshing: false,
  discoveryRunning: false,
  msToNextSlot: RECYCLE_SLOT_HEADROOM_MS,
};
check('recycle at the heap threshold with enough slot headroom', shouldRecycle(eligible));
check('do not recycle below the heap threshold', !shouldRecycle({ ...eligible, heapUsed: 749 }));
check('do not recycle during a sweep', !shouldRecycle({ ...eligible, refreshing: true }));
check('do not recycle during discovery', !shouldRecycle({ ...eligible, discoveryRunning: true }));
check('do not recycle too close to the next slot',
  !shouldRecycle({ ...eligible, msToNextSlot: RECYCLE_SLOT_HEADROOM_MS - 1 }));
check('heap is high at the recycle threshold', heapIsHigh(750, 1_000));
check('heap is not high below the recycle threshold', !heapIsHigh(749, 1_000));
check('heap threshold is 75 percent', RECYCLE_HEAP_FRACTION === 0.75);
check('slot headroom is three minutes', RECYCLE_SLOT_HEADROOM_MS === 3 * 60_000);

const slotStart = Date.UTC(2026, 0, 1);
check('20 minutes remain at :10', msToNextSlot(slotStart + 10 * 60_000) === 20 * 60_000);
check('one millisecond remains before the slot', msToNextSlot(slotStart + 30 * 60_000 - 1) === 1);
check('a slot boundary advances to the following slot',
  msToNextSlot(slotStart + 30 * 60_000) === 30 * 60_000);

if (failures) throw new Error(`${failures} memory check(s) failed`);
