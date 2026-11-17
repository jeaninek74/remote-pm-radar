import { isRetryableBoardError, workdayDetailClosed, workdayStoredKeyNeedsRecheck } from '../server/engine/sources';

let failures = 0;

function check(label: string, passed: boolean): void {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}

check('403 S22 is confirmed closed', workdayDetailClosed(403, { errorCode: 'S22' }));
check('404 S21 is confirmed closed', workdayDetailClosed(404, { errorCode: 'S21' }));
check('Cloudflare HTML 403 is not confirmed closed', !workdayDetailClosed(403, '<html>cloudflare'));
check('other 403 error is not confirmed closed', !workdayDetailClosed(403, { errorCode: 'X' }));
check('429 is not confirmed closed', !workdayDetailClosed(429, {}));
check('500 S22 is not confirmed closed', !workdayDetailClosed(500, { errorCode: 'S22' }));
check('200 live response is not confirmed closed', !workdayDetailClosed(200, { jobPostingInfo: {} }));
check('network unreachable errors are retryable',
  isRetryableBoardError(new Error('connect ENETUNREACH 1.2.3.4:443')));

const collectedKey = 'Workday:/job/London-GBR/Regional-Real-Estate-Portfolio-Manager_REQ545119';
const collectedKeys = new Set([`Workday:${collectedKey.slice('Workday:'.length)}`.slice(0, 190)]);
check('already-collected Workday keys are not rechecked',
  !workdayStoredKeyNeedsRecheck(collectedKey, collectedKeys));
check('uncollected Workday keys can be rechecked',
  workdayStoredKeyNeedsRecheck('Workday:/job/Warsaw-POL/Role_REQ1', collectedKeys));
const truncatedKey = `Workday:/job/${'x'.repeat(177)}`;
check('190-character Workday keys are not rechecked',
  truncatedKey.length === 190 && !workdayStoredKeyNeedsRecheck(truncatedKey, new Set()));

if (failures) throw new Error(`${failures} Workday check(s) failed`);
