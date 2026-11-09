import { parseSalaryFromText, type ParsedSalary } from './salary';

export const ADP_DEFAULT_CC_ID = '19000101_000001';
const US_STATE_CODES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '),
);

export interface AdpCoordinates {
  cid: string;
  ccId: string;
}

export interface AdpRequisition {
  itemID?: string | number;
  requisitionTitle?: string | null;
  requisitionLocations?: {
    address?: {
      cityName?: string | null;
      countrySubdivisionLevel1?: { codeValue?: string | null } | null;
      postalCode?: string | null;
      countryCode?: string | null;
    } | null;
    nameCode?: { shortName?: string | null } | null;
  }[] | null;
  postDate?: string | null;
  customFieldGroup?: {
    stringFields?: {
      nameCode?: { codeValue?: string | null } | null;
      stringValue?: string | null;
    }[] | null;
    dateFields?: {
      nameCode?: { codeValue?: string | null } | null;
      dateValue?: string | null;
    }[] | null;
  } | null;
  payGradeRange?: unknown;
  requisitionDescription?: string | null;
}

export interface AdpRequisitionsResponse {
  jobRequisitions?: AdpRequisition[];
  meta?: { totalNumber?: number | string };
}

export function adpCoordinates(slug: string): AdpCoordinates | null {
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/([a-z0-9_-]+))?$/i.exec(slug.trim());
  if (!match) return null;
  return { cid: match[1], ccId: match[2] ?? ADP_DEFAULT_CC_ID };
}

export function adpSlug(coordinates: AdpCoordinates): string {
  return coordinates.ccId === ADP_DEFAULT_CC_ID
    ? coordinates.cid
    : `${coordinates.cid}/${coordinates.ccId}`;
}

export function adpCoordinatesFromSource(source: string): AdpCoordinates | null {
  const normalized = source
    .replace(/&amp;/gi, '&')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/');
  const found = new Map<string, AdpCoordinates>();
  for (const match of normalized.matchAll(
    /https?:\/\/workforcenow\.adp\.com\/mascsr\/default\/mdf\/recruitment\/recruitment\.html(?:\?[^"'<>\\\s]*)?/gi,
  )) {
    const candidate = match[0].replace(/[),.;\]]+$/, '');
    try {
      const url = new URL(candidate);
      const cid = url.searchParams.get('cid') ?? '';
      const ccId = url.searchParams.get('ccId') ?? ADP_DEFAULT_CC_ID;
      const coordinates = adpCoordinates(`${cid}/${ccId}`);
      if (coordinates) found.set(adpSlug(coordinates).toLowerCase(), coordinates);
    } catch {
      continue;
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

export function adpBoardUrl(coordinates: AdpCoordinates): string {
  const url = new URL('https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html');
  url.searchParams.set('cid', coordinates.cid);
  url.searchParams.set('ccId', coordinates.ccId);
  url.searchParams.set('lang', 'en_US');
  return url.toString();
}

export function adpApplyUrl(coordinates: AdpCoordinates, itemId: string): string {
  const url = new URL(adpBoardUrl(coordinates));
  url.searchParams.set('jobId', itemId);
  return url.toString();
}

export function adpListUrl(
  coordinates: AdpCoordinates,
  top: number,
  skip: number,
): string {
  const url = new URL('https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions');
  url.searchParams.set('cid', coordinates.cid);
  url.searchParams.set('lang', 'en_US');
  url.searchParams.set('ccId', coordinates.ccId);
  url.searchParams.set('locale', 'en_US');
  url.searchParams.set('$top', String(top));
  url.searchParams.set('$skip', String(skip));
  return url.toString();
}

export function adpDetailUrl(coordinates: AdpCoordinates, itemId: string): string {
  const url = new URL('https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions');
  url.pathname += `/${encodeURIComponent(itemId)}`;
  url.searchParams.set('cid', coordinates.cid);
  url.searchParams.set('lang', 'en_US');
  url.searchParams.set('ccId', coordinates.ccId);
  url.searchParams.set('locale', 'en_US');
  return url.toString();
}

interface AdpStringField {
  nameCode?: { codeValue?: string | null } | null;
  stringValue?: string | null;
}

function fieldValue(fields: AdpStringField[] | null | undefined, name: string): string | null {
  if (!Array.isArray(fields)) return null;
  const field = fields.find((item) => item.nameCode?.codeValue?.trim().toLowerCase() === name.toLowerCase());
  return typeof field?.stringValue === 'string' && field.stringValue.trim() ? field.stringValue.trim() : null;
}

export function adpStringField(requisition: AdpRequisition, name: string): string | null {
  return fieldValue(requisition.customFieldGroup?.stringFields, name);
}

export function adpExternalJobId(requisition: AdpRequisition): string | null {
  return adpStringField(requisition, 'ExternalJobID');
}

export function adpPostingDate(requisition: AdpRequisition): string | null {
  const field = requisition.customFieldGroup?.dateFields?.find(
    (item) => item.nameCode?.codeValue?.trim().toLowerCase() === 'postingdate',
  );
  return field?.dateValue?.trim() || requisition.postDate?.trim() || null;
}

function currencyName(code: string | null): string | null {
  if (!code) return null;
  if (/^(?:USD|US\$|US DOLLARS?)$/i.test(code.trim())) return 'USD';
  try {
    const display = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code.trim().toUpperCase());
    return display && !/^unknown currency$/i.test(display) ? display : code.trim();
  } catch {
    return code.trim();
  }
}

function normalizeAdpSalary(value: string, label: string): ParsedSalary | null {
  const match = /^\s*(?:USD\s*|\$\s*)?([\d,]+(?:\.\d+)?)\s*(?:to|[-–—])\s*(?:USD\s*|\$\s*)?([\d,]+(?:\.\d+)?)\s*(?:\(\s*([A-Z]{3})\s*\)|\s+([A-Z]{3}))?\s*(Annually|Annual|Yearly|Per\s+Year|Hourly|Per\s+Hour|Per\s+Hr|Hour)\s*$/i.exec(value);
  if (!match) return null;
  const currency = match[3] ?? match[4] ?? (/\bUSD\b|\$/i.test(value) ? 'USD' : '');
  if (currency && !/^(?:USD|US\$|US DOLLARS?)$/i.test(currency)) return null;
  const min = Number(match[1].replace(/,/g, ''));
  const max = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return null;
  const hourly = /hour|hr/i.test(match[5]);
  const format = (amount: number) => hourly && !Number.isInteger(amount)
    ? amount.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : Math.round(amount).toLocaleString('en-US');
  const interval = hourly ? 'hour' : 'year';
  return parseSalaryFromText(
    `USD ${format(min)} to USD ${format(max)} per ${interval}`,
    label,
  );
}

function payGradeSalary(value: unknown): ParsedSalary | null {
  if (typeof value === 'string') return normalizeAdpSalary(value, 'ADP pay grade range');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = Object.entries(value as Record<string, unknown>);
  const amount = (part: unknown): number | null => {
    const parsed = typeof part === 'number' ? part : typeof part === 'string' ? Number(part.replace(/[$,\s]/g, '')) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const get = (pattern: RegExp): unknown => fields.find(([key]) => pattern.test(key.toLowerCase()))?.[1];
  const min = amount(get(/^(?:minimum|min)(?:value|amount)?$/));
  const max = amount(get(/^(?:maximum|max)(?:value|amount)?$/));
  const currency = currencyName(String(get(/^(?:currency|currencycode)$/) ?? ''));
  const unit = String(get(/(?:unit|period|frequency)/) ?? '').toLowerCase();
  if ((min === null && max === null) || (currency && currency !== 'USD')) return null;
  const hourly = /hour|hr/.test(unit);
  const annual = /year|annual|annum|yr/.test(unit);
  if (!hourly && !annual) return null;
  const format = (amountValue: number) => hourly && !Number.isInteger(amountValue)
    ? amountValue.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : Math.round(amountValue).toLocaleString('en-US');
  const interval = hourly ? 'hour' : 'year';
  const range = min !== null && max !== null
    ? `USD ${format(min)} to USD ${format(max)}`
    : `USD ${format(min ?? max!)}`;
  return parseSalaryFromText(`${range} per ${interval}`, 'ADP pay grade range');
}

export function adpSalary(salaryRange: unknown, payGradeRange?: unknown): ParsedSalary | null {
  if (typeof salaryRange === 'string') {
    const parsed = normalizeAdpSalary(salaryRange, 'ADP SalaryRange');
    if (parsed) return parsed;
  }
  return payGradeSalary(payGradeRange);
}

export function adpLocationFields(requisition: AdpRequisition): { locations: string[]; restrictions: string[] } {
  const locations: string[] = [];
  const restrictions: string[] = [];
  for (const location of requisition.requisitionLocations ?? []) {
    const address = location.address ?? {};
    const city = address.cityName?.trim() ?? '';
    const state = address.countrySubdivisionLevel1?.codeValue?.trim() ?? '';
    const postal = address.postalCode?.trim() ?? '';
    const code = address.countryCode?.trim() ?? '';
    const knownUsState = US_STATE_CODES.has(state.toUpperCase());
    const fallback = location.nameCode?.shortName?.trim() ?? '';
    const fallbackState = /\b([A-Z]{2})\b(?=\s*(?:,|$))/.exec(fallback)?.[1];
    const fallbackCountry = /\b(?:Canada|United Kingdom|UK|India|Australia|Mexico|Israel|Spain|Philippines|Germany|France|Ireland|Brazil)\b/i.exec(fallback)?.[0];
    let country = '';
    if (/^(?:US|USA)$/i.test(code)) country = 'United States';
    else if (code) {
      try {
        country = new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
      } catch {
        country = code;
      }
    }
    else if (knownUsState) country = 'United States';
    else if (fallbackCountry) country = fallbackCountry;
    else if (fallbackState && US_STATE_CODES.has(fallbackState)) country = 'United States';
    const addressLabel = [city, state, postal].filter(Boolean).join(', ');
    const label = addressLabel
      ? [addressLabel, country].filter(Boolean).join(', ')
      : fallback
        ? country && !new RegExp(`\\b${country}\\b`, 'i').test(fallback) ? `${fallback}, ${country}` : fallback
        : country;
    if (label) locations.push(label);
    if (country && country !== 'United States') restrictions.push('Outside the United States');
  }
  return { locations: [...new Set(locations)], restrictions: [...new Set(restrictions)] };
}
