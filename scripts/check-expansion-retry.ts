import { matchesRetryResult } from './expansion-retry';

function check(name: string, condition: boolean): void {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) process.exitCode = 1;
}

check('unknown records remain eligible when retrying the output file', matchesRetryResult({ kind: 'unknown' }, null));
check('retry from skips already resolved records', !matchesRetryResult({ kind: 'board' }, null));
check('retry platform selects matching unreadable records',
  matchesRetryResult({ kind: 'unreadable', platform: 'Phenom' }, 'phenom'));
check('retry platform skips other unreadable platforms',
  !matchesRetryResult({ kind: 'unreadable', platform: 'Avature' }, 'phenom'));
