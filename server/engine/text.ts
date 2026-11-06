const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019',
  lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', mdash: '\u2014', ndash: '\u2013',
  hellip: '\u2026', bull: '\u2022', middot: '\u00b7', deg: '\u00b0', eacute: '\u00e9',
};

/** Decodes HTML entities repeatedly: ATS payloads are often escaped twice. */
function decodeEntities(input: string): string {
  let output = input;
  for (let pass = 0; pass < 4; pass++) {
    const next = output.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name: string) => {
      if (name.startsWith('#')) {
        const code = name[1] === 'x' || name[1] === 'X'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : match;
      }
      return ENTITIES[name.toLowerCase()] ?? match;
    });
    if (next === output) break;
    output = next;
  }
  return output;
}

/** Turns job-posting HTML into readable plain text. */
export function stripHtml(html: string): string {
  if (!html) return '';
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lowercased, punctuation-light search text. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9$%+.'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max - 1)}\u2026`;
}

export function isoDate(value: Date | string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === 'number') d = new Date(value < 1e12 ? value * 1000 : value);
  else {
    const raw = String(value).trim();
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      d = new Date(n < 1e12 ? n * 1000 : n);
    } else {
      d = new Date(raw);
    }
  }
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string | null, to = new Date()): number | null {
  if (!fromIso) return null;
  const from = new Date(`${fromIso}T00:00:00Z`);
  if (Number.isNaN(from.getTime())) return null;
  const toDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  return Math.round((toDay.getTime() - from.getTime()) / 86_400_000);
}

export function slugify(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const LEGAL_SUFFIX = /\b(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|group|holdings|technologies|technology|solutions|systems|services|the)\b/g;

/** Stable key for comparing the same employer across job boards. */
export function companyKey(name: string): string {
  return norm(name)
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function titleKey(title: string): string {
  return norm(title)
    .replace(/\b(sr|snr)\b/g, 'senior')
    .replace(/\bjr\b/g, 'junior')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/** Collapses a free-text salary literal for display. */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '\u2014';
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
