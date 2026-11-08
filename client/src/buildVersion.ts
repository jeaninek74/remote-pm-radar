function htmlAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function buildIdFromAssetUrls(urls: string[]): string | null {
  const basenames = urls
    .map((url) => url.replace(/[?#].*$/, '').split('/').pop() ?? '')
    .filter(Boolean)
    .sort();
  return basenames.length ? basenames.join('+') : null;
}

export function buildIdFromHtml(html: string): string | null {
  const urls: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = htmlAttribute(match[0], 'src');
    if (src && /\.js(?:[?#]|$)/i.test(src)) urls.push(src);
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const href = htmlAttribute(tag, 'href');
    if (htmlAttribute(tag, 'rel')?.toLowerCase() === 'stylesheet' && href && /\.css(?:[?#]|$)/i.test(href)) {
      urls.push(href);
    }
  }
  return buildIdFromAssetUrls(urls);
}

export function reloadIfBuildChanged(
  previous: string | null,
  next: string | null | undefined,
  interactionBlocked: boolean,
  reload: () => void,
): boolean {
  if (previous === null || !next || previous === next || interactionBlocked) return false;
  reload();
  return true;
}
