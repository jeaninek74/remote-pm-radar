function canonicalCareersUrlObject(value: string): URL {
  const url = new URL(value);
  if (url.protocol === 'http:') url.protocol = 'https:';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  return url;
}

export function canonicalCareersUrl(value: string): string {
  return canonicalCareersUrlObject(value).toString();
}

function sortedQuery(url: URL): string {
  const sortedParams = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return new URLSearchParams(sortedParams).toString();
}

export function normalizedCareersUrl(value: string): string {
  const url = canonicalCareersUrlObject(value);
  const query = sortedQuery(url);
  return `${url.host.toLowerCase()}${url.pathname.toLowerCase()}${query ? `?${query}` : ''}`;
}

export function careersSlug(value: string): string {
  const url = canonicalCareersUrlObject(value);
  const query = sortedQuery(url);
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.host.toLowerCase()}${path}${query ? `?${query}` : ''}`;
}
