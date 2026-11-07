import type { Ats } from './types';

const PAGE_TIMEOUT_MS = 15_000;
const BROWSER_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const WORKDAY_URL = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^"'?#\s/]+)/i;
const ATS_PATTERNS: { ats: Exclude<Ats, 'workday' | 'recruitee'>; re: RegExp }[] = [
  { ats: 'greenhouse', re: /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9-]+)/i },
  { ats: 'lever', re: /jobs\.lever\.co\/([a-z0-9-]+)/i },
  { ats: 'ashby', re: /jobs\.ashbyhq\.com\/([a-z0-9-]+)/i },
  { ats: 'workable', re: /apply\.workable\.com\/([a-z0-9-]+)/i },
  { ats: 'smartrecruiters', re: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9-]+)/i },
];

const UNREADABLE_PLATFORMS: { platform: string; re: RegExp }[] = [
  { platform: 'iCIMS', re: /icims\.com/i },
  { platform: 'Phenom', re: /phenompeople|phenom/i },
  { platform: 'SAP SuccessFactors', re: /successfactors|jobs\.sap\.com/i },
  { platform: 'Avature', re: /avature\.net/i },
  { platform: 'Oracle Cloud HCM', re: /oraclecloud\.com/i },
  { platform: 'Taleo', re: /taleo\.net/i },
  { platform: 'Eightfold', re: /eightfold\.ai/i },
  { platform: 'TalentBrew', re: /talentbrew|tbcdn/i },
  { platform: 'Paradox', re: /paradox\.ai/i },
  { platform: 'Dayforce', re: /dayforcehcm\.com/i },
  { platform: 'UKG/UltiPro', re: /ultipro\.com|ukg/i },
  { platform: 'Jobvite', re: /jobvite\.com/i },
  { platform: 'ADP Workforce Now', re: /(?:workforcenow\.adp\.com|adp\.com\/workforcenow)/i },
  { platform: 'Cornerstone OnDemand', re: /csod\.com/i },
  { platform: 'Rippling', re: /rippling/i },
];

const NAME_NOISE = /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|companies|group|holdings|plc|the|and|of)\b/g;

export type BoardDetection =
  | { kind: 'board'; ats: Ats; slug: string; workday?: { tenant: string; wd: string; site: string } }
  | { kind: 'unreadable'; platform: string }
  | { kind: 'none' };

export type BoardResolution =
  | { kind: 'board'; ats: Ats; slug: string; careersUrl: string; total: number }
  | { kind: 'unreadable'; platform: string }
  | { kind: 'unknown'; reason: string };

export function nameTokens(value: string): string[] {
  return value.toLowerCase().replace(/&/g, ' and ').replace(NAME_NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/**
 * A board belongs to the company only when the board's own account name agrees with the company
 * name. Multi-word names must have every word of the shorter name present in the longer one
 * ("Carver Federal Savings Bank" within "Carver Bancorp Inc. (Carver Federal Savings Bank)").
 */
export function namesAgree(company: string, boardName: string | null | undefined): boolean {
  if (!boardName) return false;
  const a = nameTokens(company);
  const b = nameTokens(boardName);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 1) {
    if (long.length === 1) return short[0] === long[0];
    return long.length === 2 && long[0] === short[0] && short[0].length >= 6;
  }
  return short.every((token) => long.includes(token));
}

export function detect(html: string, finalUrl: string): BoardDetection {
  const workdayMatch = WORKDAY_URL.exec(finalUrl) ?? WORKDAY_URL.exec(html);
  if (workdayMatch) {
    const tenant = workdayMatch[1].toLowerCase();
    const wd = workdayMatch[2].toLowerCase();
    const site = workdayMatch[3];
    return { kind: 'board', ats: 'workday', slug: `${tenant}/${site}`, workday: { tenant, wd, site } };
  }
  for (const pattern of ATS_PATTERNS) {
    const match = pattern.re.exec(finalUrl) ?? pattern.re.exec(html);
    if (match) return { kind: 'board', ats: pattern.ats, slug: match[1].toLowerCase() };
  }
  const source = `${finalUrl}\n${html}`;
  for (const signature of UNREADABLE_PLATFORMS) {
    if (signature.re.test(source)) return { kind: 'unreadable', platform: signature.platform };
  }
  return { kind: 'none' };
}

function timeoutFor(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('resolution deadline exceeded');
  return Math.min(PAGE_TIMEOUT_MS, remaining);
}

async function fetchJson<T>(url: string, deadline: number, method: 'GET' | 'POST' = 'GET', body?: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': BROWSER_USER_AGENT,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    body,
    redirect: 'follow',
    headers,
    signal: AbortSignal.timeout(timeoutFor(deadline)),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function numericTotal(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function validateCandidate(name: string, candidate: Extract<BoardDetection, { kind: 'board' }>, deadline: number): Promise<BoardResolution> {
  try {
    if (candidate.ats === 'workday' && candidate.workday) {
      const { tenant, wd, site } = candidate.workday;
      const data = await fetchJson<{ total?: unknown }>(
        `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
        deadline,
        'POST',
        JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' }),
      );
      if (typeof data.total !== 'number' || !Number.isFinite(data.total)) {
        return { kind: 'unknown', reason: 'Workday response had no numeric total' };
      }
      return {
        kind: 'board',
        ats: 'workday',
        slug: candidate.slug,
        careersUrl: `https://${tenant}.${wd}.myworkdayjobs.com/${site}`,
        total: data.total,
      };
    }

    if (candidate.ats === 'greenhouse') {
      const data = await fetchJson<{ jobs?: unknown[] }>(`https://boards-api.greenhouse.io/v1/boards/${candidate.slug}/jobs?content=false`, deadline);
      if (!Array.isArray(data.jobs) || !data.jobs.length) return { kind: 'unknown', reason: 'Greenhouse board has no jobs' };
      const meta = await fetchJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${candidate.slug}`, deadline);
      if (!namesAgree(name, meta.name)) return { kind: 'unknown', reason: 'Greenhouse board name did not match employer' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://boards.greenhouse.io/${candidate.slug}`, total: data.jobs.length };
    }

    if (candidate.ats === 'smartrecruiters') {
      const data = await fetchJson<{ content?: unknown[]; totalFound?: unknown }>(
        `https://api.smartrecruiters.com/v1/companies/${candidate.slug}/postings?limit=1`,
        deadline,
      );
      if (!Array.isArray(data.content) || !data.content.length) return { kind: 'unknown', reason: 'SmartRecruiters board has no jobs' };
      const meta = await fetchJson<{ name?: string }>(`https://api.smartrecruiters.com/v1/companies/${candidate.slug}`, deadline);
      if (!namesAgree(name, meta.name)) return { kind: 'unknown', reason: 'SmartRecruiters board name did not match employer' };
      return {
        kind: 'board',
        ats: candidate.ats,
        slug: candidate.slug,
        careersUrl: `https://jobs.smartrecruiters.com/${candidate.slug}`,
        total: numericTotal(data.totalFound, data.content.length),
      };
    }

    if (candidate.ats === 'workable') {
      const data = await fetchJson<{ name?: string; jobs?: unknown[] }>(
        `https://apply.workable.com/api/v1/widget/accounts/${candidate.slug}`,
        deadline,
      );
      if (!Array.isArray(data.jobs) || !data.jobs.length) return { kind: 'unknown', reason: 'Workable board has no jobs' };
      if (!namesAgree(name, data.name)) return { kind: 'unknown', reason: 'Workable board name did not match employer' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://apply.workable.com/${candidate.slug}`, total: data.jobs.length };
    }

    if (candidate.ats === 'lever') {
      const jobs = await fetchJson<unknown[]>(`https://api.lever.co/v0/postings/${candidate.slug}?mode=json`, deadline);
      if (!Array.isArray(jobs) || !jobs.length) return { kind: 'unknown', reason: 'Lever board has no jobs' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://jobs.lever.co/${candidate.slug}`, total: jobs.length };
    }

    if (candidate.ats === 'ashby') {
      const data = await fetchJson<{ jobs?: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${candidate.slug}`, deadline);
      if (!Array.isArray(data.jobs) || !data.jobs.length) return { kind: 'unknown', reason: 'Ashby board has no jobs' };
      return { kind: 'board', ats: candidate.ats, slug: candidate.slug, careersUrl: `https://jobs.ashbyhq.com/${candidate.slug}`, total: data.jobs.length };
    }
  } catch (error) {
    return { kind: 'unknown', reason: `${candidate.ats} validation failed: ${(error as Error).message.slice(0, 120)}` };
  }
  return { kind: 'unknown', reason: `Unsupported ATS candidate: ${candidate.ats}` };
}

export async function resolveBoard(name: string, careersUrl: string, deadline: number): Promise<BoardResolution> {
  try {
    const response = await fetch(careersUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutFor(deadline)),
    });
    const html = (await response.text()).slice(0, 400_000);
    const finalUrl = response.url || careersUrl;
    const detected = detect(html, finalUrl);
    if (detected.kind === 'board') return validateCandidate(name, detected, deadline);
    if (detected.kind === 'unreadable') return detected;
    return {
      kind: 'unknown',
      reason: response.ok ? `HTTP ${response.status}: no supported board link found` : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { kind: 'unknown', reason: `fetch failed: ${(error as Error).message.slice(0, 120)}` };
  }
}
