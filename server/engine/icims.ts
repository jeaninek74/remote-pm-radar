import { USER_AGENT } from '../config';

export interface IcimsJobUrl {
  id: string;
  slug: string;
  url: string;
}

export function icimsHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const match = /^([a-z0-9-]+)\.icims\.com$/.exec(host);
  if (!match || /^(?:www|cdn[a-z0-9-]*|login[a-z0-9-]*|marketing[a-z0-9-]*)$/.test(match[1])) return null;
  return host;
}

export function icimsHostFrom(source: string): string | null {
  const pattern = /(?<![a-z0-9.-])(?:https?:\/\/)?([a-z0-9.-]+\.icims\.com)(?=[:/?#"'<>\\\s]|$)/gi;
  for (const match of source.matchAll(pattern)) {
    const host = icimsHost(match[1]);
    if (host) return host;
  }
  return null;
}

export function forbiddenIcimsPath(pathname: string): boolean {
  return /^\/connect/i.test(pathname)
    || /^\/jobs\/.*referral/i.test(pathname)
    || /(?:^|\/)[^/]*(?:login|candidate)[^/]*(?:\/|$)/i.test(pathname);
}

export function icimsJobUrl(value: string, host: string): IcimsJobUrl | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== host || forbiddenIcimsPath(url.pathname)) return null;
    const match = /^\/jobs\/(\d+)\/([^/]+)\/job\/?$/i.exec(url.pathname);
    if (!match) return null;
    let slug: string;
    try {
      slug = decodeURIComponent(match[2]);
    } catch {
      return null;
    }
    url.search = '';
    url.hash = '';
    return { id: match[1], slug, url: url.toString() };
  } catch {
    return null;
  }
}

export function icimsSitemapJobs(xml: string, host: string): IcimsJobUrl[] {
  const jobs = new Map<string, IcimsJobUrl>();
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const url = match[1].replace(/&amp;/gi, '&');
    const job = icimsJobUrl(url, host);
    if (job && !jobs.has(job.id)) jobs.set(job.id, job);
  }
  return [...jobs.values()];
}

export function icimsDetailUrl(job: IcimsJobUrl): string {
  const url = new URL(job.url);
  url.searchParams.set('in_iframe', '1');
  return url.toString();
}

export async function fetchIcimsText(url: string, host: string, timeoutMs: number): Promise<string> {
  let current = new URL(url);
  const deadline = Date.now() + timeoutMs;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('iCIMS request timed out');
    if (
      current.protocol !== 'https:'
      || current.hostname.toLowerCase() !== host
      || forbiddenIcimsPath(current.pathname)
    ) {
      throw new Error(`iCIMS request blocked for ${current.hostname}${current.pathname}`);
    }
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(remaining),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`iCIMS redirect ${response.status} had no location`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`iCIMS HTTP ${response.status}`);
    return response.text();
  }
  throw new Error('iCIMS redirect limit exceeded');
}
