import type { CompanySize } from '../engine/types';

/**
 * Workday employers, resolved from their public careers pages.
 *
 * Workday exposes a documented public JSON search endpoint at
 *   https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 * so these boards are fully searchable by the refresh cycle even though they are
 * invisible to the open-ATS APIs. Every row here was verified by
 * `scripts/resolve-careers.ts`: the careers page answered and the tenant, pod and
 * site were read from the live redirect.
 *
 * This list is where most of the market actually lives — large corporations,
 * health systems, utilities, consulting firms and government contractors.
 */
export interface WorkdayEmployer {
  name: string;
  industry: string;
  size: CompanySize;
  hq: string;
  /** Workday tenant, e.g. "accenture". */
  tenant: string;
  /** Workday pod, e.g. "wd103". */
  wd: string;
  /** Career site name inside the tenant, e.g. "AccentureCareers". */
  site: string;
}

export const WORKDAY_EMPLOYERS: WorkdayEmployer[] = [
  { name: 'Accenture', industry: 'Consulting', size: 'Enterprise', hq: 'IL', tenant: 'accenture', wd: 'wd103', site: 'AccentureCareers' },
  { name: 'Guidehouse', industry: 'Consulting', size: 'Large', hq: 'VA', tenant: 'guidehouse', wd: 'wd1', site: 'External' },
  { name: 'Protiviti', industry: 'Consulting', size: 'Large', hq: 'CA', tenant: 'roberthalf', wd: 'wd1', site: 'ProtivitiNA' },
  { name: 'Huron Consulting Group', industry: 'Consulting', size: 'Large', hq: 'IL', tenant: 'huron', wd: 'wd1', site: 'huroncareers' },
  { name: 'Ankura', industry: 'Consulting', size: 'Large', hq: 'DC', tenant: 'ankura', wd: 'wd5', site: 'Ankura' },
  { name: 'RAND Corporation', industry: 'Consulting', size: 'Large', hq: 'CA', tenant: 'rand', wd: 'wd5', site: 'External_Career_Site' },
  { name: 'Public Consulting Group', industry: 'Consulting', size: 'Large', hq: 'MA', tenant: 'pcg', wd: 'wd1', site: 'PCG_External_Careers' },
  { name: 'Booz Allen Hamilton', industry: 'Government Contracting', size: 'Enterprise', hq: 'VA', tenant: 'bah', wd: 'wd1', site: 'BAH_Jobs' },
  { name: 'Geisinger', industry: 'Healthcare', size: 'Large', hq: 'PA', tenant: 'geisinger', wd: 'wd5', site: 'GeisingerExternal' },
  { name: 'Ochsner Health', industry: 'Healthcare', size: 'Large', hq: 'LA', tenant: 'ochsner', wd: 'wd1', site: 'Ochsner' },
  { name: 'Houston Methodist', industry: 'Healthcare', size: 'Large', hq: 'TX', tenant: 'houstonmethodist', wd: 'wd12', site: 'GTI' },
  { name: 'Stanford Health Care', industry: 'Healthcare', size: 'Large', hq: 'CA', tenant: 'stanfordmedicine', wd: 'wd115', site: 'SHC_External_Career_Site' },
  { name: 'Highmark Health', industry: 'Health Insurance', size: 'Enterprise', hq: 'PA', tenant: 'highmarkhealth', wd: 'wd1', site: 'highmark' },
  { name: 'Elevance Health', industry: 'Health Insurance', size: 'Enterprise', hq: 'IN', tenant: 'elevancehealth', wd: 'wd1', site: 'ANT' },
  { name: 'Bank of America', industry: 'Financial Services', size: 'Enterprise', hq: 'NC', tenant: 'ghr', wd: 'wd1', site: 'lateral-us' },
  { name: 'Citigroup', industry: 'Financial Services', size: 'Enterprise', hq: 'NY', tenant: 'citi', wd: 'wd5', site: '2' },
  { name: 'Capital One', industry: 'Financial Services', size: 'Enterprise', hq: 'VA', tenant: 'capitalone', wd: 'wd12', site: 'Capital_One' },
  { name: 'Mastercard', industry: 'Financial Services', size: 'Enterprise', hq: 'NY', tenant: 'mastercard', wd: 'wd1', site: 'CorporateCareers' },
  { name: 'State Street', industry: 'Financial Services', size: 'Enterprise', hq: 'MA', tenant: 'statestreet', wd: 'wd1', site: 'Global' },
  { name: 'Northern Trust', industry: 'Financial Services', size: 'Enterprise', hq: 'IL', tenant: 'ntrs', wd: 'wd1', site: 'northerntrust' },
  { name: 'Prudential Financial', industry: 'Insurance', size: 'Enterprise', hq: 'NJ', tenant: 'pru', wd: 'wd5', site: 'Careers' },
  { name: 'Nationwide', industry: 'Insurance', size: 'Enterprise', hq: 'OH', tenant: 'nationwide', wd: 'wd1', site: 'Nationwide_Career' },
  { name: 'Xcel Energy', industry: 'Utilities', size: 'Enterprise', hq: 'MN', tenant: 'xcelenergy', wd: 'wd1', site: 'External' },
  { name: 'Target', industry: 'Retail', size: 'Enterprise', hq: 'MN', tenant: 'target', wd: 'wd5', site: 'targetcareers' },
  { name: 'Nordstrom', industry: 'Retail', size: 'Enterprise', hq: 'WA', tenant: 'nordstrom', wd: 'wd501', site: 'nordstrom_careers' },
  { name: 'Nike', industry: 'Consumer Products', size: 'Enterprise', hq: 'OR', tenant: 'nike', wd: 'wd1', site: 'nke2' },
  { name: 'The Coca-Cola Company', industry: 'Consumer Products', size: 'Enterprise', hq: 'GA', tenant: 'coke', wd: 'wd1', site: 'coca-cola-careers' },
  { name: 'General Mills', industry: 'Consumer Products', size: 'Enterprise', hq: 'MN', tenant: 'genmills', wd: 'wd1', site: 'GMI_External_Careers' },
];

/** Public careers URL for a Workday employer. */
export function workdayCareersUrl(employer: WorkdayEmployer): string {
  return `https://${employer.tenant}.${employer.wd}.myworkdayjobs.com/${employer.site}`;
}
