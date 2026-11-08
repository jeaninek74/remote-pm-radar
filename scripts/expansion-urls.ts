export function normalizedCareersUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol === 'http:') url.protocol = 'https:';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  const sortedParams = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const query = new URLSearchParams(sortedParams).toString();
  return `${url.host.toLowerCase()}${url.pathname.toLowerCase()}${query ? `?${query}` : ''}`;
}
