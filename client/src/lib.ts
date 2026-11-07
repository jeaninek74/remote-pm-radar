import type { Bootstrap, Employer, Job, Run, SourceHealth } from './types';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const loadBootstrap = () => api<Bootstrap>('/api/bootstrap');
export const loadJobs = () => api<{ jobs: Job[] }>('/api/jobs');
export const loadEmployers = () => api<{ employers: Employer[] }>('/api/employers');
export const loadRuns = () => api<{ runs: Run[]; sources: SourceHealth[] }>('/api/runs?limit=40');

export function saveTracking(id: number, patch: Record<string, string | null>): Promise<{ job: Job }> {
  return api<{ job: Job }>(`/api/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function startRefresh(): Promise<{ runId: number; alreadyRunning: boolean; message: string }> {
  return api('/api/refresh', { method: 'POST', body: JSON.stringify({}) });
}

export interface RunStatus {
  id: number;
  status: string;
  progress: string | null;
  newJobs: number;
  addedTab1: number;
  addedTab2: number;
  queued: number;
}

export async function refreshStatus(): Promise<{ run: RunStatus | null; refreshing: boolean }> {
  const raw = await api<{
    run: {
      id: number; status: string; progress: string | null; new_jobs: number;
      added_tab1: number; added_tab2: number; queued: number;
    } | null;
    refreshing: boolean;
  }>('/api/refresh/status');
  return {
    refreshing: raw.refreshing,
    run: raw.run
      ? {
        id: raw.run.id,
        status: raw.run.status,
        progress: raw.run.progress,
        newJobs: raw.run.new_jobs,
        addedTab1: raw.run.added_tab1,
        addedTab2: raw.run.added_tab2,
        queued: raw.run.queued,
      }
      : null,
  };
}

/* ------------------------------------------------------------- formatting */

/** Human label for the refresh schedule, derived from the cron the server reports. */
export function cronLabel(expression: string | null | undefined): string {
  const expr = (expression ?? '').trim();
  const everyMinutes = /^\*\/(\d+) \* \* \* \*$/.exec(expr);
  if (everyMinutes) return `every ${everyMinutes[1]} minutes`;
  const everyHours = /^0 \*\/(\d+) \* \* \*$/.exec(expr);
  if (everyHours) return `every ${everyHours[1]} hours`;
  if (/^0 \* \* \* \*$/.test(expr)) return 'every hour';
  return expr ? `on schedule ${expr} (UTC)` : 'on a schedule';
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function salaryLabel(job: Job): string {
  if (job.salaryMin === null && job.salaryMax === null) return 'Not published';
  if (job.salaryInterval === 'hour' && job.hourlyRate) {
    return `${money(job.hourlyRate)}/hr`;
  }
  if (job.salaryMin !== null && job.salaryMax !== null) {
    return `${money(job.salaryMin)} – ${money(job.salaryMax)}`;
  }
  return money(job.salaryMin ?? job.salaryMax);
}

export function salarySubLabel(job: Job): string {
  if (job.salaryInterval === 'hour') return `≈ ${money(job.salaryMin)}/yr annualised · contract`;
  if (job.salaryMin !== null) return `starts at ${money(job.salaryMin)}`;
  return '';
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(normaliseTimestamp(value));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

/** Postgres returns "2026-11-06 19:24:07.713395+00"; JS needs a stricter ISO string. */
export function normaliseTimestamp(value: string): string {
  let text = value.trim().replace(' ', 'T');
  text = text.replace(/(\.\d{3})\d+/, '$1');
  if (/[+-]\d{2}$/.test(text)) text = `${text}:00`;
  if (!/[+-]\d{2}:\d{2}$|Z$/.test(text)) text = `${text}Z`;
  return text;
}

export function shortDateTime(value: string | null | undefined): string {
  if (!value) return 'never';
  const d = new Date(normaliseTimestamp(value));
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function ageLabel(postedAt: string | null): { text: string; days: number | null } {
  if (!postedAt) return { text: 'unknown', days: null };
  const posted = new Date(`${postedAt}T00:00:00Z`);
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((utcToday - posted.getTime()) / 86_400_000);
  if (days <= 0) return { text: 'today', days: 0 };
  if (days === 1) return { text: 'yesterday', days: 1 };
  return { text: `${days} days ago`, days };
}

export function categoryClass(category: string): string {
  if (category === 'Technical') return 'tech';
  if (category === 'Hybrid') return 'hybrid';
  return 'nontech';
}

/** "Hybrid" alone reads like a work arrangement, so label the job family explicitly. */
export function categoryLabel(category: string): string {
  if (category === 'Hybrid') return 'Business-tech';
  if (category === 'Nontechnical') return 'Nontechnical';
  return category;
}

export function urgencyClass(urgency: string): string {
  if (urgency === 'High') return 'high';
  if (urgency === 'Medium') return 'medium';
  return '';
}

export function caBadge(job: Job): { label: string; cls: string; title: string } {
  switch (job.caEligibility) {
    case 'confirmed': return { label: 'CA confirmed', cls: 'ca', title: job.caNote };
    case 'us_wide': return { label: 'US-wide', cls: 'ca', title: job.caNote };
    case 'state_restricted': return { label: 'State-restricted', cls: 'warn', title: job.caNote };
    case 'not_us': return { label: 'Non-US', cls: 'warn', title: job.caNote };
    default: return { label: 'CA not stated', cls: 'warn', title: job.caNote };
  }
}

export function matchTone(score: number): string {
  if (score >= 75) return '';
  if (score >= 55) return 'mid';
  return 'low';
}

export function download(path: string): void {
  const link = document.createElement('a');
  link.href = path;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function uniqueValues(jobs: Job[], key: keyof Job): string[] {
  const values = new Set<string>();
  for (const job of jobs) {
    const value = job[key];
    if (typeof value === 'string' && value.trim()) values.add(value.trim());
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

/**
 * Splits a board name so the final word can be accented, e.g. "Remote PM Radar"
 * becomes ["Remote PM", "Radar"]. Family-driven, so any board name works.
 */
export function splitBoardName(name: string): [string, string] {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [name ?? '', ''];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}
