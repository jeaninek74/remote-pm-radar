import { runIsOrphaned } from '../server/engine/orphan';
import { forEachWhileLocked } from '../server/engine/sweep-guard';

const cases = [
  {
    label: 'no running row is not orphaned',
    input: { runningRunId: null, refreshingHere: false, lockHeldElsewhere: false },
    expected: false,
  },
  {
    label: 'a run owned by this process is not orphaned',
    input: { runningRunId: 1, refreshingHere: true, lockHeldElsewhere: false },
    expected: false,
  },
  {
    label: 'a run with a held refresh lock is not orphaned',
    input: { runningRunId: 1, refreshingHere: false, lockHeldElsewhere: true },
    expected: false,
  },
  {
    label: 'a running row without a local owner or held lock is orphaned',
    input: { runningRunId: 1, refreshingHere: false, lockHeldElsewhere: false },
    expected: true,
  },
];

async function main(): Promise<void> {
  for (const { label, input, expected } of cases) {
    const actual = runIsOrphaned(input);
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
    console.log(`PASS ${label}`);
  }

  let calls = 0;
  const completed = await forEachWhileLocked(
    Array.from({ length: 10 }, (_item, index) => index),
    3,
    { held: true },
    async () => { calls += 1; },
  );
  if (completed.stoppedEarly || calls !== 10) {
    throw new Error(`held lock: expected 10 calls and no early stop, got ${calls} and ${completed.stoppedEarly}`);
  }
  console.log('PASS held lock processes every item');

  let callsBeforeLoss = 0;
  const lock = { held: true };
  const stopped = await forEachWhileLocked(
    Array.from({ length: 20 }, (_item, index) => index),
    2,
    lock,
    async () => {
      callsBeforeLoss += 1;
      if (callsBeforeLoss === 3) lock.held = false;
    },
  );
  if (!stopped.stoppedEarly || callsBeforeLoss > 4) {
    throw new Error(`lost lock: expected early stop and at most 4 calls, got ${callsBeforeLoss} and ${stopped.stoppedEarly}`);
  }
  console.log('PASS lost lock stops starting new items');

  let callsAfterLoss = 0;
  const alreadyLost = await forEachWhileLocked(
    Array.from({ length: 10 }, (_item, index) => index),
    2,
    { held: false },
    async () => { callsAfterLoss += 1; },
  );
  if (!alreadyLost.stoppedEarly || callsAfterLoss !== 0) {
    throw new Error(`already-lost lock: expected early stop and zero calls, got ${callsAfterLoss} and ${alreadyLost.stoppedEarly}`);
  }
  console.log('PASS lost lock at start skips all items');
  console.log(`check-orphan: ${cases.length + 3} checks passed`);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
