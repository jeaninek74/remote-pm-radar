export interface SuccessFactorsItem {
  title: string;
  description: string;
  link: string;
  id: string;
  location: string;
  employer: string;
  expirationDate: string;
}

export interface SuccessFactorsFeed {
  title: string;
  items: SuccessFactorsItem[];
}

function xmlText(value: string): string {
  const unwrapped = value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, '$1');
  return unwrapped.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    const lower = token.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    const codePoint = lower.startsWith('#x')
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  }).trim();
}

function tagValue(xml: string, tag: string, decode = true): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i').exec(xml)?.[1] ?? '';
  return decode ? xmlText(value) : value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, '$1').trim();
}

export function parseSuccessFactorsFeed(xml: string): SuccessFactorsFeed {
  if (!/<rss\b[^>]*\bversion\s*=\s*["']2\.0["'][^>]*>/i.test(xml) || !/<channel\b[^>]*>/i.test(xml)) {
    throw new Error('SuccessFactors sitemap is not an RSS 2.0 feed');
  }
  const channel = /<channel\b[^>]*>([\s\S]*?)<\/channel\s*>/i.exec(xml)?.[1];
  if (!channel) throw new Error('SuccessFactors sitemap has no RSS channel');
  const items = [...channel.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].map((match) => {
    const item = match[1];
    return {
      title: tagValue(item, 'title'),
      description: tagValue(item, 'description', false),
      link: tagValue(item, 'link'),
      id: tagValue(item, 'g:id') || tagValue(item, 'guid'),
      location: tagValue(item, 'g:location'),
      employer: tagValue(item, 'g:employer'),
      expirationDate: tagValue(item, 'g:expiration_date'),
    };
  });
  if (items.some((item) => !item.title || !item.link || !item.id)) {
    throw new Error('SuccessFactors RSS item is missing a title, link, or id');
  }
  if (!/<g:location\b/i.test(channel)) {
    throw new Error('SuccessFactors RSS feed has no Google for Jobs location fields');
  }
  return { title: tagValue(channel, 'title'), items };
}
