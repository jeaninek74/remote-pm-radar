import { workdayDetailClosed } from '../server/engine/sources';

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

if (failures) throw new Error(`${failures} Workday check(s) failed`);
