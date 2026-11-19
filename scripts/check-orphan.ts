import { runIsOrphaned } from '../server/engine/orphan';

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

for (const { label, input, expected } of cases) {
  const actual = runIsOrphaned(input);
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  console.log(`PASS ${label}`);
}

console.log(`check-orphan: ${cases.length} checks passed`);
