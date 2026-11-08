import { RULES } from '../config';
import { explicitWorkplaceArrangement, hasRemoteLocationOption } from './location';
import type { ParsedSalary } from './salary';

export interface PhenomConfig {
  widgetApiEndpoint: string;
  pageHost: string;
  refNum: string;
  locale: string;
  siteType: string;
  baseUrl: string;
  pageName: string;
  companyName: string | null;
}

export interface PhenomJob {
  title: string;
  jobSeqNo: string;
  jobId: string;
  reqId: string;
  dateCreated: string;
  postedDate: string;
  description: string;
  location: string;
  locations: string[];
  applyUrl: string;
  jobUrl: string;
}

export interface PhenomResponse {
  totalHits: number;
  itemsCount: number;
  jobs: PhenomJob[];
}

export function phenomEndpointMatchesPageHost(endpoint: string, pageHost: string): boolean {
  try {
    return new URL(endpoint).host.toLowerCase() === pageHost.toLowerCase();
  } catch {
    return false;
  }
}

export function phenomDetailRedirectTarget(
  currentUrl: string,
  location: string,
  pageHost: string,
  redirectsFollowed: number,
): string | null {
  if (!location || redirectsFollowed >= 5) return null;
  try {
    const current = new URL(currentUrl);
    const target = new URL(location, current);
    return current.protocol === target.protocol && phenomEndpointMatchesPageHost(target.toString(), pageHost)
      ? target.toString()
      : null;
  } catch {
    return null;
  }
}

export function phenomPrimaryLocations(feedLocations: string[], detailLocations: string[]): string[] {
  if (!feedLocations.length) return detailLocations;
  const remoteDetailLocations = detailLocations.filter((location) => hasRemoteLocationOption([location]));
  return [...new Set([...feedLocations, ...remoteDetailLocations])];
}

export function phenomRemoteInfo(
  feedLocations: string[],
  jobLocationType: string | null,
  detailLocations: string[] = [],
): { isRemote: boolean | null; workplaceType: string | null } {
  const arrangement = explicitWorkplaceArrangement(detailLocations, jobLocationType);
  if (hasRemoteLocationOption(detailLocations) || hasRemoteLocationOption(jobLocationType ? [jobLocationType] : [])) {
    return { isRemote: true, workplaceType: 'remote' };
  }
  if (arrangement === 'hybrid') return { isRemote: false, workplaceType: arrangement };
  if (hasRemoteLocationOption(feedLocations)) return { isRemote: true, workplaceType: 'remote' };
  if (arrangement === 'onsite') return { isRemote: false, workplaceType: arrangement };
  if (jobLocationType) return { isRemote: false, workplaceType: jobLocationType };
  return { isRemote: null, workplaceType: null };
}

export function phenomJobUrl(path: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(path, base).toString();
}

export interface PhenomBaseSalary {
  currency?: string;
  value?: {
    minValue?: number | string;
    maxValue?: number | string;
    value?: number | string;
    unitText?: string;
  };
}

export function parsePhenomBaseSalary(baseSalary: PhenomBaseSalary | undefined): ParsedSalary | null {
  const value = baseSalary?.value;
  if (!baseSalary || !value || !/^USD$/i.test(baseSalary.currency ?? '')) return null;
  const amount = (input: number | string | undefined): number | null => {
    if (input === undefined) return null;
    const parsed = Number(String(input).replace(/[,$\s]/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const rawMinimum = value.minValue ?? value.value;
  const rawMaximum = value.maxValue;
  const minimum = amount(rawMinimum);
  const maximum = amount(rawMaximum);
  if ((rawMinimum != null && minimum === null) || (rawMaximum != null && maximum === null)) return null;
  if (minimum === null && maximum === null) return null;

  const unit = value.unitText?.toLowerCase().trim() ?? '';
  const hourly = /hour|hr/.test(unit);
  const factor = hourly
    ? RULES.hoursPerYear
    : /week/.test(unit) ? 52
      : /month/.test(unit) ? 12
        : /year|annual|annum/.test(unit) ? 1 : null;
  if (factor === null) return null;
  const min = minimum === null ? null : Math.round(minimum * factor);
  const max = maximum === null ? null : Math.round(maximum * factor);
  if (min !== null && max !== null && max < min) return null;
  const format = (amountValue: number) => amountValue.toLocaleString('en-US');
  const amountText = min === null
    ? `maximum $${format(max!)}`
    : max === null ? `minimum $${format(min)}` : `$${format(min)} - $${format(max)}`;
  return {
    min,
    max,
    interval: hourly ? 'hour' : 'year',
    hourlyRate: hourly ? minimum : null,
    isOTE: false,
    evidence: `Phenom structured baseSalary: ${amountText}${hourly ? ' hourly, annualised at 2,080 hours' : ''}`,
  };
}

export function selectPhenomSalary(
  structured: ParsedSalary | null,
  description: ParsedSalary | null,
  descriptionText = '',
): ParsedSalary | null {
  if (structured && structured.min !== null) return structured;
  if (description && description.min !== null) {
    if (structured?.min === null && structured.max !== null) {
      const descriptionRange = description.max !== null && description.min < description.max;
      const explicitMinimum = description.max === null
        && /\b(?:starting\s+at|from)\s+(?:USD\s*)?[$\d]/i.test(descriptionText);
      return descriptionRange || explicitMinimum ? description : structured;
    }
    return description;
  }
  return structured?.min === null ? structured : description;
}


function stringField(source: string, field: string): string {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']*)["']`, 'i').exec(source)?.[1] ?? '';
}

function pageTitle(html: string): string | null {
  return /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ?? null;
}

export function parsePhenomConfig(html: string, pageUrl: string): PhenomConfig | null {
  const widgetApiEndpoint = stringField(html, 'widgetApiEndpoint');
  if (!widgetApiEndpoint) return null;
  const page = new URL(pageUrl);
  const baseUrl = stringField(html, 'baseUrl') || page.toString();
  let companyName = stringField(html, 'companyName') || stringField(html, 'siteName');
  if (!companyName) {
    companyName = /<meta\b[^>]*(?:property|name)=["'](?:og:site_name|application-name)["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ?? '';
  }
  const title = pageTitle(html) ?? '';
  const titleName = title.split('|').pop()?.trim()
    .replace(/^.*?\bat\s+/i, '')
    .replace(/\s*(?:careers?|jobs?)\s*$/i, '')
    .trim();
  return {
    widgetApiEndpoint: new URL(widgetApiEndpoint, page).toString(),
    pageHost: page.host.toLowerCase(),
    refNum: stringField(html, 'refNum'),
    locale: stringField(html, 'locale'),
    siteType: stringField(html, 'siteType'),
    baseUrl,
    pageName: stringField(html, 'pageName'),
    companyName: companyName || titleName || title,
  };
}

export function parsePhenomResponse(value: unknown): PhenomResponse {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const refineSearch = root.refineSearch && typeof root.refineSearch === 'object'
    ? root.refineSearch as Record<string, unknown>
    : {};
  const data = refineSearch.data && typeof refineSearch.data === 'object'
    ? refineSearch.data as Record<string, unknown>
    : {};
  const total = Number(refineSearch.totalHits ?? data.totalHits);
  if (!Number.isFinite(total) || total < 0) throw new Error('Phenom response had no numeric totalHits');
  const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];
  const jobs: PhenomJob[] = [];
  for (const raw of rawJobs) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const jobSeqNo = typeof item.jobSeqNo === 'string' ? item.jobSeqNo.trim() : '';
    const jobId = typeof item.jobId === 'string' || typeof item.jobId === 'number' ? String(item.jobId) : '';
    if (!title || (!jobSeqNo && !jobId)) continue;
    const text = (key: string) => typeof item[key] === 'string' ? item[key] as string : '';
    jobs.push({
      title, jobSeqNo, jobId, reqId: text('reqId'),
      dateCreated: text('dateCreated'), postedDate: text('postedDate'),
      description: text('description') || text('descriptionTeaser'),
      location: text('location') || text('cityStateCountry') || text('city'),
      locations: Array.isArray(item.multi_location)
        ? item.multi_location.filter((value): value is string => typeof value === 'string' && !!value.trim())
        : [text('location') || text('cityStateCountry') || text('city')].filter(Boolean),
      applyUrl: text('applyUrl'), jobUrl: text('jobUrl') || text('url'),
    });
  }
  return { totalHits: total, itemsCount: rawJobs.length, jobs };
}
