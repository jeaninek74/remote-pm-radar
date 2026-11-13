import { companyKey, titleKey } from './text';

export interface DedupeRow {
  id: number;
  job_key: string;
  company: string;
  title: string;
  requisition_id?: string | null;
  posted_at?: string | null;
  app_status?: string | null;
  link_type?: string | null;
  bucket?: string | null;
}

export function sharedBoardPostingKey(
  jobKey: string,
  requisitionId?: string | null,
  title?: string | null,
  postedAt?: string | null,
): string | null {
  const oracleMatch = jobKey.match(/^oracle:([^/]+)\/[^:]+:(.+)$/);
  if (oracleMatch) return `oracle-posting:${oracleMatch[1].toLowerCase()}:${oracleMatch[2]}`;

  const postedDate = postedAt?.slice(0, 10);
  if (
    requisitionId?.trim()
    && title?.trim()
    && postedDate
    && /^\d{4}-\d{2}-\d{2}$/.test(postedDate)
  ) {
    return `posting:${requisitionId.trim().toLowerCase()}:${titleKey(title)}:${postedDate}`;
  }
  return null;
}

export function dedupeKeys(row: DedupeRow): string[] {
  const keys = [`${companyKey(row.company)}::${titleKey(row.title)}`];
  const postingKey = sharedBoardPostingKey(row.job_key, row.requisition_id, row.title, row.posted_at);
  if (postingKey) keys.push(postingKey);
  return keys;
}

/** Rows arrive pre-sorted in winner-priority order. */
export function duplicateLosers(rows: DedupeRow[]): Map<number, number> {
  const winners = new Map<string, number>();
  const losers = new Map<number, number>();

  for (const row of rows) {
    const keys = dedupeKeys(row);
    let winnerId: number | undefined;
    for (const key of keys) {
      winnerId = winners.get(key);
      if (winnerId !== undefined) break;
    }
    if (winnerId !== undefined) {
      losers.set(row.id, winnerId);
      continue;
    }
    for (const key of keys) winners.set(key, row.id);
  }
  return losers;
}
