import { truncate } from './text';
import { RULES } from '../config';
import { stripHtml } from './text';

export type SalaryInterval = 'year' | 'hour';

export interface ParsedSalary {
  min: number | null;
  max: number | null;
  interval: SalaryInterval;
  hourlyRate: number | null;
  isOTE: boolean;
  evidence: string;
}

const AMT = String.raw`(\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d+)?\s?[kK])`;
const DASH = String.raw`\s*(?:-|\u2013|\u2014|to|through|until)\s*`;

/** "$180,200 — $313,000", "$150K–$180K", "USD 120,000 - 160,000" */
const RANGE_RE = new RegExp(String.raw`(?:\$|USD\s?|US\$)\s?${AMT}${DASH}(?:\$|USD\s?)?${AMT}`, 'gi');
/** "180,000 to 230,000 USD", "150000-180000 per year" */
const RANGE_TAIL_RE = new RegExp(String.raw`(?<![\d,.] )${AMT}${DASH}${AMT}\s*(?:USD|usd|per year|a year|annually|\/year)`, 'gi');
/** "$150,000+", "$120/hr", "$150,000 per year", "$9,500/month" */
const SINGLE_RE = new RegExp(String.raw`(?:\$|USD\s?)\s?${AMT}\s*(?:\+|(?:\/|per\s)\s?(?:hour|hr|month|year|annum)|hourly|annually)?`, 'gi');

const NOISE = /communities|users|customers|raised|funding|valuation|revenue|downloads|employees|subscribers|impressions|clicks|records|transactions|members|students|patients|sq\.? ?ft|square feet|budget of|portfolio of/i;
const PAY_CONTEXT = /base (salary|pay|compensation)|salary range|pay range|compensation range|anticipated (salary|pay)|starting (salary|pay)|salary for this position|hourly (rate|pay)|annual salary|salary band/i;
const OTE_CONTEXT = /\bote\b|on-target earnings|total comp|total compensation|inclusive of (equity|bonus)|including (equity|bonus)|equity \+ bonus/i;
const FOREIGN = /\u20ac|\u00a3|\bCAD\b|\bEUR\b|\bGBP\b|\bAUD\b|\bCHF\b|\bINR\b|\bBRL\b|\bMXN\b|\bSGD\b/;

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, '');
  if (/[kK]$/.test(cleaned)) {
    const n = parseFloat(cleaned.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function plausibleAnnual(n: number | null): boolean {
  return n !== null && n >= 40_000 && n <= 1_500_000;
}

interface Candidate extends ParsedSalary {
  score: number;
  index: number;
}

function contextScore(flat: string, index: number, span: number): number {
  const around = flat.slice(Math.max(0, index - 260), Math.min(flat.length, index + span + 260));
  let score = 0;
  if (PAY_CONTEXT.test(around)) score += 4;
  if (OTE_CONTEXT.test(around)) score -= 1;
  if (NOISE.test(around)) score -= 5;
  if (FOREIGN.test(around) && !/\$|USD/.test(around)) score -= 6;
  return score;
}

/**
 * Extracts a compensation range from a job posting.
 *
 * Honesty rules baked in:
 *  - a currency marker is required, so "100,000+ communities" is never pay;
 *  - figures sitting next to headcount/funding/customer noise are rejected;
 *  - pay-range context ("base salary range…") outranks a stray dollar figure;
 *  - hourly figures stay hourly and are separately annualised;
 *  - OTE / total-comp ranges are flagged instead of being passed off as base pay.
 */
export function parseSalaryFromText(text: string, evidenceLabel = 'Job description'): ParsedSalary | null {
  if (!text) return null;
  const flat = text.replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ');
  const candidates: Candidate[] = [];

  const pushRange = (min: number, max: number, index: number, span: number, hourly: boolean) => {
    const score = contextScore(flat, index, span);
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const around = flat.slice(Math.max(0, index - 120), Math.min(flat.length, index + span + 120));
    const isOTE = OTE_CONTEXT.test(around);
    if (hourly) {
      if (lo < 15 || hi > 500) return;
      candidates.push({
        min: Math.round(lo * RULES.hoursPerYear), max: Math.round(hi * RULES.hoursPerYear),
        interval: 'hour', hourlyRate: lo, isOTE, score,
        index, evidence: `${evidenceLabel}: "${truncate(around.trim(), 130)}" (hourly $${lo}\u2013$${hi}/hr annualised at ${RULES.hoursPerYear} hrs)`,
      });
      return;
    }
    if (!plausibleAnnual(lo)) return;
    candidates.push({
      min: lo, max: hi, interval: 'year', hourlyRate: null, isOTE, score, index,
      evidence: `${evidenceLabel}: "${truncate(around.trim(), 130)}"`,
    });
  };

  // 1. Ranges, with the interval decided from the immediate suffix.
  RANGE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RANGE_RE.exec(flat)) !== null) {
    const a = toNumber(match[1]);
    const b = toNumber(match[2]);
    if (a === null || b === null) continue;
    const suffix = flat.slice(match.index + match[0].length, match.index + match[0].length + 24).toLowerCase();
    const hourly = /(\/|per\s)\s?(hour|hr)\b|hourly/.test(suffix) || /\bper hour\b/.test(suffix);
    pushRange(a, b, match.index, match[0].length, hourly);
  }

  // 2. Ranges that carry the currency after the numbers.
  RANGE_TAIL_RE.lastIndex = 0;
  while ((match = RANGE_TAIL_RE.exec(flat)) !== null) {
    const a = toNumber(match[1]);
    const b = toNumber(match[2]);
    if (a === null || b === null) continue;
    pushRange(a, b, match.index, match[0].length, false);
  }

  // 3. Single figures ("$150,000+", "$120/hour", "$9,500/month").
  SINGLE_RE.lastIndex = 0;
  while ((match = SINGLE_RE.exec(flat)) !== null) {
    const value = toNumber(match[1]);
    if (value === null) continue;
    const tail = flat.slice(match.index + match[0].length, match.index + match[0].length + 26).toLowerCase();
    const hourly = /(\/|per\s)\s?(hour|hr)\b|hourly/.test(tail);
    const monthly = /(\/|per\s)\s?month/.test(tail);
    const plus = /^\s*\+/.test(tail);
    const score = contextScore(flat, match.index, match[0].length);
    const around = flat.slice(Math.max(0, match.index - 120), Math.min(flat.length, match.index + 160));
    if (hourly) {
      if (value < 15 || value > 500) continue;
      candidates.push({
        min: Math.round(value * RULES.hoursPerYear), max: null, interval: 'hour', hourlyRate: value,
        isOTE: false, score, index: match.index,
        evidence: `${evidenceLabel}: "${truncate(around.trim(), 120)}" (hourly $${value}/hr annualised at ${RULES.hoursPerYear} hrs)`,
      });
    } else if (monthly) {
      const annual = value * 12;
      if (!plausibleAnnual(annual)) continue;
      candidates.push({
        min: annual, max: null, interval: 'year', hourlyRate: null, isOTE: false, score, index: match.index,
        evidence: `${evidenceLabel}: "${truncate(around.trim(), 120)}" (monthly $${value} \u00d7 12)`,
      });
    } else if (plausibleAnnual(value)) {
      candidates.push({
        min: plus ? value : value, max: plus ? null : null, interval: 'year', hourlyRate: null,
        isOTE: OTE_CONTEXT.test(around), score, index: match.index,
        evidence: `${evidenceLabel}: "${truncate(around.trim(), 120)}"`,
      });
    }
  }

  if (!candidates.length) return null;

  // Prefer genuine pay context, then ranges (more reliable than single figures), then earliest.
  const rank = (c: Candidate): number => c.score * 100 + (c.max !== null ? 12 : 0) + (c.interval === 'year' ? 4 : 0);
  candidates.sort((a, b) => rank(b) - rank(a) || a.index - b.index);
  const best = candidates[0];
  if (best.score <= -3) return null;
  return {
    min: best.min, max: best.max, interval: best.interval,
    hourlyRate: best.hourlyRate, isOTE: best.isOTE, evidence: best.evidence,
  };
}

/**
 * Greenhouse posts pay inside a dedicated `pay-range` block. Reading that block
 * first avoids picking up unrelated dollar figures elsewhere in the posting.
 */
export function parsePayRangeBlock(html: string, evidenceLabel = 'Employer pay range'): ParsedSalary | null {
  if (!html) return null;
  const index = html.search(/pay[-_ ]?range/i);
  if (index === -1) return null;
  // Read a generous window: the numbers sit inside nested inline spans.
  const blockText = stripHtml(html.slice(index, index + 1400)).replace(/\s+/g, ' ').trim();
  const parsed = parseSalaryFromText(blockText, evidenceLabel);
  if (!parsed) return null;
  return { ...parsed, evidence: `${evidenceLabel} block: "${truncate(blockText, 120)}"` };
}

interface AshbyTier {
  minValue?: number | null;
  maxValue?: number | null;
  interval?: string | null;
  currencyCode?: string | null;
  title?: string | null;
}

interface AshbyComponent {
  compensationType?: string | null;
  compensationTierSummary?: string | null;
  compensationTierSummaries?: AshbyTier[] | null;
}

export function parseAshbyCompensation(compensation: unknown): ParsedSalary | null {
  if (!compensation || typeof compensation !== 'object') return null;
  const comp = compensation as {
    compensationTierSummary?: string | null;
    summaryComponents?: AshbyComponent[] | null;
  };

  const components = Array.isArray(comp.summaryComponents) ? comp.summaryComponents : [];
  for (const component of components) {
    const type = (component?.compensationType ?? '').toLowerCase();
    if (!/salary|base/.test(type)) continue;
    const tiers = Array.isArray(component.compensationTierSummaries)
      ? component.compensationTierSummaries
      : [];
    for (const tier of tiers) {
      const currency = (tier.currencyCode ?? 'USD').toUpperCase();
      if (currency !== 'USD') continue;
      if (tier.minValue == null || !Number.isFinite(Number(tier.minValue))) continue;
      const interval = /hour/i.test(String(tier.interval ?? '')) ? 'hour' : 'year';
      const min = Number(tier.minValue);
      const max = tier.maxValue == null ? null : Number(tier.maxValue);
      if (interval === 'hour') {
        return {
          min: Math.round(min * RULES.hoursPerYear),
          max: max === null ? null : Math.round(max * RULES.hoursPerYear),
          interval: 'hour', hourlyRate: min, isOTE: false,
          evidence: `Ashby compensation (base salary): $${min}\u2013$${max ?? '?'}/hr, annualised at ${RULES.hoursPerYear} hrs`,
        };
      }
      if (!plausibleAnnual(min)) continue;
      return {
        min, max, interval: 'year', hourlyRate: null, isOTE: false,
        evidence: `Ashby compensation (base salary): ${tier.title ?? 'published salary tier'}`,
      };
    }
  }

  if (comp.compensationTierSummary) {
    const parsed = parseSalaryFromText(comp.compensationTierSummary, 'Ashby compensation summary');
    if (parsed) {
      parsed.isOTE = parsed.isOTE || OTE_CONTEXT.test(comp.compensationTierSummary);
      return parsed;
    }
  }
  return null;
}

export interface SalaryClassification {
  bucket: 'tab1' | 'tab2' | 'none';
  reason: string;
}

/**
 * Salary banding uses the PUBLISHED MINIMUM only:
 *   min 110,000–130,000 -> Tab 1 | min 150,000+ -> Tab 2 (no ceiling)
 *   min 130,001–149,999 -> neither tab (verification queue)
 */
export function classifySalary(min: number | null, max: number | null, interval: SalaryInterval | null, hourlyRate: number | null = null): SalaryClassification {
  if (min === null) {
    return {
      bucket: 'none',
      reason: max !== null
        ? `Only a maximum figure is published ($${max.toLocaleString('en-US')}); a starting salary is required for placement.`
        : 'No salary information published.',
    };
  }
  if (interval === 'hour') {
    // Master prompt s.5: hourly contracts are annualised at 2,080 hours and placed on the band the
    // equivalent falls into, with the hourly rate identified and the income never shown as guaranteed.
    const rate = hourlyRate ?? Math.round(min / 2080);
    const basis = `Hourly contract at $${rate.toLocaleString('en-US')}/hr \u2014 annualised at 2,080 hours ($${min.toLocaleString('en-US')}). Contract income, not guaranteed salary.`;
    if (min >= RULES.tab2Min) return { bucket: 'tab2', reason: basis };
    if (min >= RULES.tab1Min && min <= RULES.tab1Max) return { bucket: 'tab1', reason: basis };
    if (min > RULES.tab1Max && min < RULES.tab2Min) {
      return { bucket: 'none', reason: `${basis} The annualised equivalent sits in the $130,001\u2013$149,999 gap.` };
    }
    return { bucket: 'none', reason: `${basis} The annualised equivalent is below the $110K floor.` };
  }
  if (min >= RULES.tab2Min) {
    return { bucket: 'tab2', reason: `Published minimum of $${min.toLocaleString('en-US')} meets the $150K+ band.` };
  }
  if (min >= RULES.tab1Min && min <= RULES.tab1Max) {
    return { bucket: 'tab1', reason: `Published minimum of $${min.toLocaleString('en-US')} falls inside $110K\u2013$130K.` };
  }
  if (min > RULES.tab1Max && min < RULES.tab2Min) {
    return {
      bucket: 'none',
      reason: `Published minimum of $${min.toLocaleString('en-US')} sits in the $130,001\u2013$149,999 gap between the two bands.`,
    };
  }
  return { bucket: 'none', reason: `Published minimum of $${min.toLocaleString('en-US')} is below the $110K floor.` };
}
