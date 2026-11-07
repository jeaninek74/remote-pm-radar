import { q } from '../db';
import { ACTIVE_ROLE_FAMILY } from './roles/active';
import { norm } from './text';

/**
 * Company discovery from public remote-job aggregators.
 *
 * The brief (§10) allows job boards for *discovery* as long as the application
 * link is the employer's own. Rather than importing aggregator listings as jobs
 * — which would put third-party links on the board — this module only harvests
 * **employer names**, then hands them to the existing ATS prober. Every job that
 * eventually reaches a tab therefore comes from the employer's own board.
 *
 * That is what lets coverage grow without hand-listing companies: aggregators
 * already know who is hiring, and the prober finds out whether their board is
 * machine-readable.
 */

const TIMEOUT_MS = 20_000;

export interface DiscoveredCompany {
  name: string;
  source: string;
}

const US_HINTS = /\b(usa|u\.s\.|united states|anywhere|worldwide|north america|remote)\b/i;
const NON_US = /\b(europe|emea|apac|latam|united kingdom|uk|ireland|germany|france|spain|portugal|netherlands|poland|india|pakistan|philippines|australia|new zealand|singapore|japan|korea|china|brazil|argentina|mexico|colombia|chile|south africa|nigeria|kenya|canada|israel|uae)\b/i;

/** Aggregator response shapes, normalised to `{ title, company, location }`. */
interface Listing {
  title: string;
  company: string;
  location: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'RemotePMRadar/1.0 (employer discovery)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function remotive(term: string): Promise<Listing[]> {
  const data = await fetchJson<{ jobs?: { title?: string; company_name?: string; candidate_required_location?: string }[] }>(
    `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=100`,
  );
  return (data?.jobs ?? []).map((job) => ({
    title: job.title ?? '',
    company: job.company_name ?? '',
    location: job.candidate_required_location ?? '',
  }));
}

async function jobicy(term: string): Promise<Listing[]> {
  const data = await fetchJson<{ jobs?: { jobTitle?: string; companyName?: string; jobGeo?: string }[] }>(
    `https://jobicy.com/api/v2/remote-jobs?count=50&geo=usa&industry=${encodeURIComponent(term)}`,
  );
  return (data?.jobs ?? []).map((job) => ({
    title: job.jobTitle ?? '',
    company: job.companyName ?? '',
    location: job.jobGeo ?? 'usa',
  }));
}

async function himalayas(term: string): Promise<Listing[]> {
  const data = await fetchJson<{ jobs?: { title?: string; companyName?: string; locationRestrictions?: string[] }[] }>(
    `https://himalayas.app/jobs/api?limit=50&title=${encodeURIComponent(term)}`,
  );
  return (data?.jobs ?? []).map((job) => ({
    title: job.title ?? '',
    company: job.companyName ?? '',
    location: (job.locationRestrictions ?? []).join(' '),
  }));
}

const SOURCES: { id: string; fetch: (term: string) => Promise<Listing[]> }[] = [
  { id: 'Remotive', fetch: remotive },
  { id: 'Jobicy', fetch: jobicy },
  { id: 'Himalayas', fetch: himalayas },
];

/** True when the listing is plausibly open to a US-remote candidate. */
function isUsRemote(listing: Listing): boolean {
  const location = listing.location.trim();
  if (!location) return true; // most aggregators omit it when the role is fully remote
  if (NON_US.test(location) && !US_HINTS.test(location)) return false;
  return US_HINTS.test(location) || location.length === 0;
}

/**
 * Harvests employer names for the active role family and queues them for ATS
 * probing. Returns the number of genuinely new companies queued.
 */
export async function discoverCompanies(limit = 120): Promise<number> {
  const terms = ACTIVE_ROLE_FAMILY.searchTerms;
  const found = new Map<string, string>();

  for (const source of SOURCES) {
    for (const term of terms) {
      const listings = await source.fetch(term);
      for (const listing of listings) {
        const company = listing.company.trim();
        if (company.length < 2 || company.length > 80) continue;
        if (!isUsRemote(listing)) continue;
        const key = norm(company);
        if (!key || found.has(key)) continue;
        found.set(key, source.id);
      }
    }
  }

  let queued = 0;
  for (const [key, source] of [...found].slice(0, limit)) {
    // Store the display name; the normalised key is only used for de-duplication.
    const display = key.replace(/\b\w/g, (c) => c.toUpperCase());
    const rows = await q<{ id: number }>(
      `INSERT INTO discovery_queue (name, industry, status)
       VALUES ($1, NULL, 'pending')
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [display],
    );
    if (rows.length) queued += 1;
    void source;
  }
  return queued;
}
