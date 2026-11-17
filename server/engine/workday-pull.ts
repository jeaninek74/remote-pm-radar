import type { EmployerRow, RawJob } from './types';

export interface WorkdayPullFlags {
  workdayViaRunner: boolean;
}

export interface WorkdayPullEmployer extends EmployerRow {
  known: string[];
  stored: string[];
}

export interface WorkdayIngestResult {
  jobs: RawJob[];
  totalListed: number;
  truncated: boolean;
  closedKeys?: string[];
}

export type WorkdayIngestPayload =
  | { employerId: number; result: WorkdayIngestResult }
  | { employerId: number; error: string };

export function sweepSkipsEmployer(
  employer: Pick<EmployerRow, 'ats'>,
  flags: WorkdayPullFlags,
): boolean {
  return flags.workdayViaRunner && employer.ats === 'workday';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isParsedSalary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const nullableNumber = (item: unknown) =>
    item === null || (typeof item === 'number' && Number.isFinite(item));
  return nullableNumber(value.min)
    && nullableNumber(value.max)
    && typeof value.interval === 'string'
    && nullableNumber(value.hourlyRate)
    && typeof value.isOTE === 'boolean'
    && typeof value.evidence === 'string';
}

function isWorkdayRawJob(value: unknown): value is RawJob {
  if (!isRecord(value)) return false;
  if (
    value.source !== 'Workday'
    || value.ats !== 'workday'
    || typeof value.externalId !== 'string'
    || !value.externalId.startsWith('/')
    || typeof value.company !== 'string'
    || typeof value.title !== 'string'
    || !isStringArray(value.locations)
    || value.linkType !== 'employer'
    || typeof value.applyUrl !== 'string'
  ) return false;
  try {
    const url = new URL(value.applyUrl);
    if (url.protocol !== 'https:' || !/\.myworkdayjobs\.com$/i.test(url.hostname)) return false;
  } catch {
    return false;
  }

  for (const field of [
    'board',
    'workplaceType',
    'descriptionHtml',
    'descriptionText',
    'postedAt',
    'employmentType',
    'salarySource',
    'requisitionId',
    'industry',
    'companySize',
    'hqState',
    'companyWebsite',
  ] as const) {
    if (value[field] !== undefined && !isNullableString(value[field])) return false;
  }
  if (value.isRemote !== undefined && value.isRemote !== null && typeof value.isRemote !== 'boolean') return false;
  if (value.restrictions !== undefined
    && value.restrictions !== null
    && !isStringArray(value.restrictions)) return false;
  if (value.postedConfidence !== undefined
    && !['confirmed', 'inferred', 'unknown'].includes(value.postedConfidence as string)) return false;
  if (value.salary !== undefined && value.salary !== null && !isParsedSalary(value.salary)) return false;
  if (value.unchanged !== undefined && typeof value.unchanged !== 'boolean') return false;
  return true;
}

export function isWorkdayIngestPayload(value: unknown): value is WorkdayIngestPayload {
  if (!isRecord(value) || !Number.isSafeInteger(value.employerId) || (value.employerId as number) <= 0) {
    return false;
  }
  const hasResult = Object.hasOwn(value, 'result');
  const hasError = Object.hasOwn(value, 'error');
  if (hasResult === hasError) return false;
  if (hasError) return typeof value.error === 'string' && value.error.trim().length > 0;

  if (!isRecord(value.result)) return false;
  const result = value.result;
  return Array.isArray(result.jobs)
    && result.jobs.every(isWorkdayRawJob)
    && Number.isSafeInteger(result.totalListed)
    && (result.totalListed as number) >= 0
    && typeof result.truncated === 'boolean'
    && (result.closedKeys === undefined
      || (Array.isArray(result.closedKeys)
        && result.closedKeys.every((key) =>
          typeof key === 'string' && key.startsWith('Workday:') && key.length < 190)));
}
