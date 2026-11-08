import { norm } from './text';

export type RemoteKind = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type CaEligibility = 'confirmed' | 'us_wide' | 'state_restricted' | 'not_us' | 'unknown';

export interface LocationInput {
  locations: string[];
  workplaceType?: string | null;
  isRemote?: boolean | null;
  restrictions?: string[] | null;
  description?: string | null;
}

export interface LocationVerdict {
  remote: RemoteKind;
  ca: CaEligibility;
  note: string;
  states: string[];
  remoteLabel: string;
  /** True when the posting demands routine travel that undermines genuine remote work. */
  travelHeavy: boolean;
  /** The largest travel share stated in the posting, when one is stated. */
  travelShare: number | null;
}

/**
 * Master prompt s.6 excludes "positions requiring routine travel incompatible with genuine remote
 * work". We read the stated travel share and treat 40%+ (or an unquantified "extensive/frequent
 * travel") as disqualifying. Occasional travel is normal for remote PM roles and is not penalised.
 */
function travelBurden(text: string): { heavy: boolean; share: number | null } {
  if (!text) return { heavy: false, share: null };
  const body = text.slice(0, 20_000);
  let share: number | null = null;
  for (const match of body.matchAll(/(\d{1,3})\s?%\s*(?:of the time\s*)?(?:travel|travelling|traveling)/gi)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value <= 100) share = Math.max(share ?? 0, value);
  }
  for (const match of body.matchAll(/travel\s*(?:of\s*)?(?:up to\s*)?(\d{1,3})\s?%/gi)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value <= 100) share = Math.max(share ?? 0, value);
  }
  const unquantified = /\b(?:extensive|significant|frequent|heavy|constant)\s+travel\b/i.test(body)
    || /\b(?:travel|travelling|traveling)\s+(?:is\s+)?(?:required|expected)\s+(?:extensively|frequently|weekly)/i.test(body);
  return { heavy: (share !== null && share >= 40) || unquantified, share };
}

const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

const STATE_CODES = new Set(Object.values(STATE_NAMES));

/** Two-letter codes that are also common words/abbreviations; require context. */
const AMBIGUOUS_CODES = new Set(['IN', 'OR', 'ME', 'OK', 'HI', 'DE', 'AL', 'CO', 'LA', 'MS', 'MD', 'PA', 'VA', 'AR', 'ID', 'MT', 'NE']);

// Workday lists offices and the remote option side by side ("US - VA, McLean, US - Remote (Any
// location)"); the "US - Remote" entry is a nationwide scope, not a second office. A bare
// "Remote (Any location)" says nothing about the country and is not treated as US.
const US_MARKERS = /\b(united states|u\.s\.a\.?|usa|u\.s\.|nationwide|anywhere in the (?:us|u\.s\.|united states)|us[- ]based|us\s*-?\s*remote|united states\s*-\s*remote|remote[,\s-]+(?:us|usa|united states)|remote within the (?:us|united states)|conus)\b/i;
const REGION_MARKERS = /\b(emea|apac|latam|europe|european union|eu only|united kingdom|uk|ireland|germany|france|spain|portugal|netherlands|poland|india|pakistan|philippines|australia|new zealand|singapore|japan|korea|china|brazil|argentina|mexico|colombia|chile|south africa|nigeria|kenya|africa|asia|canada|ontario|quebec|toronto|vancouver|israel|uae|dubai)\b/i;
const HYBRID_MARKERS = /\b(hybrid|partially remote|part remote|in[- ]office|on[- ]?site|onsite|commutable|days? (?:a|per) week (?:in|on[- ]?site))\b/i;
const HYBRID_DESCRIPTION_MARKERS = /\b(hybrid|partially remote|part remote|in[- ]office|commutable)\b/i;
const EXPLICIT_ONSITE_MARKERS = /\b(?:in[- ]person\s+(?:role|position|work)\b|in[- ]person\s+(?:at|in)\s+(?:the|our)\s+(?:[a-z]+\s+)?(?:office|headquarters|workplace|facility)\b|on[- ]?site\s+(?:role|position|work|requirement)\b|on[- ]?site\s+(?:at|in)\s+(?:the|our)\s+(?:[a-z]+\s+)?(?:office|headquarters|workplace|facility)\b|in (?:the|our) office|office[- ]based|must (?:live|reside) within (?:a )?(?:commut\w*|\d+\s*(?:miles?|mi|km|minutes?))|within commuting distance|(?:must|required to|willing(?:ness)? to|expected to|need to) relocate|relocation (?:is )?required)\b/i;
const REMOTE_MARKERS = /\b(remote|anywhere|distributed|work(?:ing)? (?:from|at) home|wfh|telecommut\w*|virtual|home[- ]based)\b/i;
const REMOTE_DESCRIPTION = /(?:\b(fully remote|100% remote|remote[- ]first|(?:this|the) (?:is a |role is |position is )?(?:fully )?remote (?:role|position|opportunity|job)|work (?:fully )?remotely|remote (?:team|environment|work environment|(?:[\w/-]+\s+){1,3}team))\b|#LI-Remote\b)/i;
const TEXAS_HQ_TRAP = /austin|dallas|houston/i;

function detectStates(text: string): string[] {
  const found = new Set<string>();
  const lower = ` ${text.toLowerCase()} `;
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (lower.includes(` ${name} `) || lower.includes(`, ${name}`) || lower.includes(`${name},`)) {
      found.add(code);
      continue;
    }
    // "Remote - TX", "(TX)", "TX, USA"
    const codeRe = new RegExp('[\\s,\\-()]' + code + '(?=[\\s,\\-)|])');
    if (codeRe.test(text)) {
      const ambiguous = AMBIGUOUS_CODES.has(code) && !/(,|\(|remote|united states)/i.test(text);
      if (!ambiguous) found.add(code);
    }
  }
  return [...found];
}

function parseRestrictionStates(restrictions: string[]) {
  const excluded = new Set<string>();
  const includedText = restrictions.map((restriction) =>
    restriction.replace(
      /\b(?:except|excluding|other than|not (?:available|eligible) in|with the exception of)\b[^;]*/gi,
      (clause) => {
        for (const state of detectStates(`${clause} |`)) excluded.add(state);
        return ' ';
      },
    ),
  ).join(' | ');
  const included = detectStates(`${includedText} |`).filter((state) => !excluded.has(state));
  return { includedText, included, excluded };
}

function residencyRestriction(description: string): string[] {
  const matches = description.match(
    /(?:must|required to|need to|have to)\s+(?:be\s+)?(?:reside|live|be located|be based)\s+in\s+([A-Z][A-Za-z .]{2,28})/g,
  );
  if (!matches) return [];
  const states = new Set<string>();
  for (const raw of matches) {
    for (const code of detectStates(raw)) states.add(code);
  }
  return [...states];
}

/**
 * Decides (a) whether a role is genuinely remote and (b) whether a California
 * resident may take it. Restricted or unprovable eligibility never reaches the
 * salary tabs.
 */
function evaluateLocationCore(input: LocationInput): Omit<LocationVerdict, 'travelHeavy' | 'travelShare'> {
  const locations = (input.locations ?? []).map((l) => String(l ?? '').replace(/_/g, ' ').trim()).filter(Boolean);
  const restrictions = (input.restrictions ?? []).map((r) => String(r ?? '').trim()).filter(Boolean);
  const locText = locations.join(' | ');
  const restrictionText = restrictions.join(' | ');
  const restrictionStateInfo = parseRestrictionStates(restrictions);
  const scopeText = `${locText} | ${restrictionText}`;
  const nationwideUsOnly = locations.length > 0
    && locations.every((location) =>
      US_MARKERS.test(location) || /^(?:united states|us|usa|united states of america)$/i.test(location),
    )
    && detectStates(`${locText.toUpperCase()} |`).length === 0
    && !REGION_MARKERS.test(locText);
  const workplace = String(input.workplaceType ?? '').toLowerCase();
  const description = (input.description ?? '').slice(0, 25_000);
  const descLower = description.toLowerCase();

  const labels = [...locations, ...restrictions].join(', ') || 'Not stated';

  // --- Remote determination -------------------------------------------------
  // A posting offered in several locations qualifies when one of them is fully remote
  // ("New York (Hybrid); United States (Remote)"); a single "Remote/Hybrid" label does not.
  const remoteOption = locations.some((l) => REMOTE_MARKERS.test(l) && !HYBRID_MARKERS.test(l));
  let remote: RemoteKind = 'unknown';
  if (remoteOption && !/hybrid|onsite|on-site|in[- ]person/.test(workplace)) {
    remote = 'remote';
  } else if (/hybrid/.test(workplace) || (HYBRID_MARKERS.test(locText) && !/fully remote|100% remote/i.test(locText))) {
    remote = 'hybrid';
  } else if (/onsite|on-site|in[- ]person/.test(workplace)) {
    remote = 'onsite';
  } else if (workplace === 'remote' || input.isRemote === true) {
    remote = 'remote';
  } else if (REMOTE_MARKERS.test(scopeText)) {
    remote = REMOTE_MARKERS.test(locText) || restrictions.length > 0 ? 'remote' : 'unknown';
  } else if (
    nationwideUsOnly
    && REMOTE_DESCRIPTION.test(descLower)
    && !HYBRID_DESCRIPTION_MARKERS.test(descLower)
    && !EXPLICIT_ONSITE_MARKERS.test(descLower)
    && !/\b\d\s*days? (?:a|per) week\b/.test(descLower)
  ) {
    remote = 'remote';
  } else if (
    nationwideUsOnly
    && !HYBRID_DESCRIPTION_MARKERS.test(descLower)
    && !EXPLICIT_ONSITE_MARKERS.test(descLower)
    && !/\b\d\s*days? (?:a|per) week\b/.test(descLower)
  ) {
    remote = 'unknown';
  } else if (!locations.length && !restrictions.length) {
    remote = 'unknown';
  } else if (HYBRID_MARKERS.test(descLower) && !/fully remote|100% remote/i.test(descLower)) {
    remote = 'hybrid';
  } else {
    remote = 'onsite';
  }

  if (remote !== 'remote' && !(remote === 'unknown' && nationwideUsOnly)) {
    return {
      remote,
      ca: 'unknown',
      note: remote === 'hybrid'
        ? `Hybrid schedule (${labels}) \u2014 excluded: fully remote only.`
        : remote === 'onsite'
          ? `On-site role (${labels}) \u2014 excluded: fully remote only.`
          : 'Work arrangement not stated.',
      states: detectStates(scopeText),
      remoteLabel: labels,
    };
  }

  // --- California eligibility ----------------------------------------------
  const listedStates = detectStates(`${locText} | ${restrictionStateInfo.includedText} |`);
  const restrictionStates = restrictionStateInfo.included;
  const residencyStates = residencyRestriction(description);
  const allStates = [...new Set([...listedStates, ...residencyStates])]
    .filter((state) => !restrictionStateInfo.excluded.has(state));

  if (restrictionStateInfo.excluded.has('CA')) {
    return {
      remote,
      ca: 'state_restricted',
      note: 'Posting excludes California from eligible locations.',
      states: allStates,
      remoteLabel: labels,
    };
  }

  if (restrictionStates.length && !restrictionStates.includes('CA')) {
    return {
      remote,
      ca: 'state_restricted',
      note: `Posting restricts work to ${restrictionStates.join(', ')} — California not eligible.`,
      states: restrictionStates,
      remoteLabel: labels,
    };
  }

  if (allStates.includes('CA')) {
    return {
      remote,
      ca: 'confirmed',
      note: 'Posting names California as an eligible work location.',
      states: allStates,
      remoteLabel: labels,
    };
  }

  if (residencyStates.length) {
    return {
      remote,
      ca: 'state_restricted',
      note: `Posting requires residency in ${residencyStates.join(', ')} \u2014 California not eligible.`,
      states: residencyStates,
      remoteLabel: labels,
    };
  }

  const hasUsScope = nationwideUsOnly
    || US_MARKERS.test(scopeText)
    || restrictions.some((r) => /united states|worldwide|anywhere|global/i.test(r))
    || usEligibilityFromText(description);
  const hasRegionScope = REGION_MARKERS.test(scopeText);

  if (allStates.length && !allStates.includes('CA')) {
    // A remote posting that lists specific states but not California is a restriction.
    if (!hasUsScope) {
      return {
        remote,
        ca: 'state_restricted',
        note: `Remote but limited to ${allStates.join(', ')} \u2014 California not listed.`,
        states: allStates,
        remoteLabel: labels,
      };
    }
  }

  if (hasUsScope && !hasRegionScope) {
    return {
      remote,
      ca: 'us_wide',
      note: remote === 'unknown'
        ? 'Nationwide US location, but remote work arrangement needs verification.'
        : US_MARKERS.test(scopeText)
        ? 'US-wide remote posting with no state restriction stated; California residents may apply.'
        : 'Posting states US-only eligibility and names no excluded states; California residents may apply.',
      states: allStates,
      remoteLabel: labels,
    };
  }

  if (hasRegionScope && !hasUsScope) {
    return {
      remote,
      ca: 'not_us',
      note: `Remote role scoped to ${labels} outside the United States \u2014 excluded.`,
      states: allStates,
      remoteLabel: labels,
    };
  }

  if (hasUsScope && hasRegionScope) {
    return {
      remote,
      ca: 'us_wide',
      note: 'Multi-region remote posting that includes the United States.',
      states: allStates,
      remoteLabel: labels,
    };
  }

  if (/worldwide|anywhere|global/i.test(scopeText)) {
    return {
      remote,
      ca: 'us_wide',
      note: 'Worldwide remote posting \u2014 California eligible.',
      states: allStates,
      remoteLabel: labels,
    };
  }

  return {
    remote,
    ca: 'unknown',
    note: `Remote, but the posting never names California (${labels}). Jeanine's standing instruction is to keep these visible: eligibility is unconfirmed, so confirm with the recruiter before applying.`,
    states: allStates,
    remoteLabel: labels,
  };
}

export function caLabel(ca: CaEligibility): string {
  switch (ca) {
    case 'confirmed': return 'CA confirmed';
    case 'us_wide': return 'US-wide remote';
    case 'state_restricted': return 'State-restricted';
    case 'not_us': return 'Non-US';
    default: return 'CA not stated';
  }
}

export { detectStates, TEXAS_HQ_TRAP, norm };

/**
 * True only when the posting text states US eligibility in so many words.
 * A bare "Remote" location with no US statement stays unverified on purpose.
 */
function usEligibilityFromText(description: string): boolean {
  if (!description) return false;
  const text = description.slice(0, 12_000);
  return /(?:must|should|required to|need to)\s+(?:be\s+)?(?:reside|live|be based|be located|work)\s+(?:in\s+)?(?:the\s+)?(?:united states|u\.?s\.?a?\.?)\b/i.test(text)
    || /\b(?:u\.?s\.?|united states)[- ](?:based|only|remote)\b/i.test(text)
    || /remote\s+(?:within|in|across)\s+(?:the\s+)?(?:united states|u\.?s\.?a?\.?)\b/i.test(text)
    || /(?:authorized|eligible)\s+to\s+work\s+in\s+(?:the\s+)?(?:united states|u\.?s\.?a?\.?)\b/i.test(text)
    || /open\s+to\s+(?:candidates\s+)?(?:residing\s+in\s+)?(?:the\s+)?(?:united states|u\.?s\.?a?\.?)\b/i.test(text);
}

/**
 * Public entry point: adds the travel verdict to the location verdict.
 * Heavy travel disqualifies a role under master prompt s.6.
 */
export function evaluateLocation(input: LocationInput): LocationVerdict {
  const core = evaluateLocationCore(input);
  const burden = travelBurden(String(input.description ?? ''));
  return { ...core, travelHeavy: burden.heavy, travelShare: burden.share };
}
