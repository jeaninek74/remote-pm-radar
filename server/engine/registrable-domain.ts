export function registrableDomain(value: string): string {
  let hostname: string;
  try {
    hostname = new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return '';
  }
  const parts = hostname.replace(/\.$/, '').split('.').filter(Boolean);
  if (!parts.length) return '';
  if (
    parts.length > 2
    && ['co', 'com', 'org'].includes(parts[parts.length - 2])
    && parts[parts.length - 1].length === 2
  ) {
    return parts.slice(-3).join('.');
  }
  return parts.length > 1 ? parts.slice(-2).join('.') : parts[0];
}
