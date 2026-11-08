export interface NeogovFeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  jobId: string;
  jobNumberSingle: string;
  advertiseFromDateUTC: string;
  minimumSalary: string;
  maximumSalary: string;
  salaryCurrency: string;
  salaryInterval: string;
  jobType: string;
  department: string;
  examplesOfDuties: string;
  qualifications: string;
  supplementalInformation: string;
  location: string;
  employerZipcode: string;
}

function decodeXmlText(value: string): string {
  const content = value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, '$1');
  return content.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint = entity[1].toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    const entities: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
    };
    return entities[entity.toLowerCase()] ?? match;
  }).trim();
}

function tagValue(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i').exec(xml);
  return match ? decodeXmlText(match[1]) : '';
}

export function parseNeogovFeed(xml: string): NeogovFeedItem[] {
  if (!/<rss\b/i.test(xml)) throw new Error('NEOGOV response was not an RSS feed');
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].map((match) => {
    const item = match[1];
    const parsed: NeogovFeedItem = {
      title: tagValue(item, 'title'),
      description: tagValue(item, 'description'),
      link: tagValue(item, 'link'),
      pubDate: tagValue(item, 'pubDate'),
      jobId: tagValue(item, 'joblisting:jobId'),
      jobNumberSingle: tagValue(item, 'joblisting:jobNumberSingle'),
      advertiseFromDateUTC: tagValue(item, 'joblisting:advertiseFromDateUTC'),
      minimumSalary: tagValue(item, 'joblisting:minimumSalary'),
      maximumSalary: tagValue(item, 'joblisting:maximumSalary'),
      salaryCurrency: tagValue(item, 'joblisting:salaryCurrency'),
      salaryInterval: tagValue(item, 'joblisting:salaryInterval'),
      jobType: tagValue(item, 'joblisting:jobType'),
      department: tagValue(item, 'joblisting:department'),
      examplesOfDuties: tagValue(item, 'joblisting:examplesofduties'),
      qualifications: tagValue(item, 'joblisting:qualifications'),
      supplementalInformation: tagValue(item, 'joblisting:supplementalinformation'),
      location: tagValue(item, 'joblisting:location'),
      employerZipcode: tagValue(item, 'joblisting:employerzipcode'),
    };
    if (!parsed.title || !parsed.link || !parsed.jobId) {
      throw new Error('NEOGOV RSS item was missing its title, link, or job ID');
    }
    return parsed;
  });
  return items;
}
