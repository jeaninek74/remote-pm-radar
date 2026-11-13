import { duplicateLosers, sharedBoardPostingKey } from '../server/engine/dedupe';

let failures = 0;

function check(name: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures += 1;
}

function row(
  id: number,
  company: string,
  title: string,
  jobKey = `greenhouse:${id}`,
  requisitionId: string | null = null,
  postedAt: string | null = null,
  appStatus = 'Not Applied',
) {
  return {
    id,
    job_key: jobKey,
    company,
    title,
    requisition_id: requisitionId,
    posted_at: postedAt,
    app_status: appStatus,
  };
}

const pencilLosers = duplicateLosers([
  row(1, 'Pencil', 'AI Transformation Lead', 'greenhouse:pencil:1', 'a1b2c3d4-1', '2026-11-04'),
  row(2, 'Pencil', 'AI Transformation Lead', 'greenhouse:pencil:2', 'a1b2c3d4-2', '2026-11-04'),
  row(3, 'Pencil', 'AI Transformation Lead', 'greenhouse:pencil:3', 'a1b2c3d4-3', '2026-11-04'),
]);
check('same company/title rows with different requisition IDs point to first row',
  pencilLosers.size === 2 && pencilLosers.get(2) === 1 && pencilLosers.get(3) === 1);

const precisionLosers = duplicateLosers([
  row(10, 'Precision AQ', 'Program Manager', 'greenhouse:precision-aq:7352', '7352', '2026-11-04'),
  row(11, 'Precision Medicine Group', 'Program Manager', 'greenhouse:precision-medicine:7352', '7352', '2026-11-04'),
]);
check('same requisition/title/date deduplicates across companies',
  precisionLosers.size === 1 && precisionLosers.get(11) === 10);

check('same requisition/title/date at unrelated companies stays distinct',
  duplicateLosers([
    row(12, 'Acme Health', 'Program Manager', 'greenhouse:acme:7352', '7352', '2026-11-04'),
    row(13, 'Brightline Staffing', 'Program Manager', 'greenhouse:brightline:7352', '7352', '2026-11-04'),
  ]).size === 0);

check('Phenom shared requisition/title/date still deduplicates across tenants',
  duplicateLosers([
    row(14, 'Bon Secours', 'Sourcing Program Manager', 'phenom:bonsecours:1', 'R289400', '2026-11-04'),
    row(15, 'Mercy', 'Sourcing Program Manager', 'phenom:mercy:1', 'R289400', '2026-11-04'),
  ]).get(15) === 14);

check('same requisition/title on different posted dates stays distinct',
  duplicateLosers([
    row(20, 'Company One', 'Program Manager', 'greenhouse:one:7352', '7352', '2026-11-04'),
    row(21, 'Company Two', 'Program Manager', 'greenhouse:two:7352', '7352', '2026-11-05'),
  ]).size === 0);

check('same title at different companies without requisition IDs stays distinct',
  duplicateLosers([
    row(30, 'Company One', 'Program Manager'),
    row(31, 'Company Two', 'Program Manager'),
  ]).size === 0);

const trackedLosers = duplicateLosers([
  row(40, 'Company One', 'Tracked Program Manager', 'greenhouse:one:40', null, null, 'Viewed'),
  row(41, 'Company One', 'Tracked Program Manager', 'greenhouse:one:41'),
]);
check('pre-sorted tracked row wins', trackedLosers.size === 1 && trackedLosers.get(41) === 40);

check('Oracle shared-board key is preserved',
  sharedBoardPostingKey('oracle:tenant/site:ABC123', 'Oracle Company') === 'oracle-posting:tenant:ABC123');
check('generic requisition key applies across sources',
  sharedBoardPostingKey('greenhouse:tenant:123', 'Precision AQ', ' 7352 ', 'Program Manager', '2026-11-04')
    === 'posting:precision:7352:programmanager:2026-11-04');
check('generic requisition key requires a valid date',
  sharedBoardPostingKey('greenhouse:tenant:123', 'Precision AQ', '7352', 'Program Manager', null) === null);

if (failures) throw new Error(`${failures} dedupe check(s) failed`);
