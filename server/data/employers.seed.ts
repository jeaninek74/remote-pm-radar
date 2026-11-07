import type { Ats, CompanySize } from '../engine/types';
import { ROLE_FAMILIES } from '../engine/roles';
import { WORKDAY_EMPLOYERS, workdayCareersUrl } from './workday-employers';

export interface SeedEmployer {
  name: string;
  ats: Ats;
  slug: string;
  industry: string;
  size: CompanySize;
  hq: string;
  /**
   * Role families this employer is a productive source for. Derived from the
   * industry unless a row overrides it, so the registry carries no assumption
   * that every employer is being searched for the same profession.
   */
  roleFamilies: string[];
  /** Explicit careers URL; derived from the ATS and slug when omitted. */
  careersUrl?: string;
}

/** [name, ats, slug, industry, size, hq, optional explicit role families] */
type Row = [string, Ats, string, string, CompanySize, string, string[]?];

/**
 * Maps an employer's industry onto the role families that recruit there.
 *
 * Each family publishes its own `employerIndustries` list, so this function has
 * no profession baked in: adding a family automatically makes every matching
 * employer available to it. Industries nothing claims stay available to all
 * families rather than silently disappearing from every board.
 */
export function familiesForIndustry(industry: string): string[] {
  const needle = (industry ?? '').trim().toLowerCase();
  if (!needle) return ROLE_FAMILIES.map((family) => family.id);
  const matched = ROLE_FAMILIES.filter((family) =>
    family.employerIndustries.some((candidate) => {
      const value = candidate.trim().toLowerCase();
      return value === needle || needle.includes(value) || value.includes(needle);
    }),
  ).map((family) => family.id);
  return matched.length ? matched : ROLE_FAMILIES.map((family) => family.id);
}

/**
 * Seed inventory of employers with PUBLIC applicant-tracking-system job feeds.
 *
 * Coverage is deliberately spread across industries (healthcare, government,
 * construction, energy, marketing, nonprofits, financial services, retail,
 * manufacturing, logistics), sizes (startups to enterprises) and headquarter
 * states, because those industries are where the seeded role families hire.
 *
 * The inventory is shared across role families: `roleFamilies` records which
 * boards are worth searching for which profession, and `employersForRoleFamily`
 * is how the refresh cycle asks for its slice. Slugs are verified live during
 * the first refresh: any board that does not answer is marked inactive instead
 * of being reported as searched.
 */
const RAW: Row[] = [
  // ------------------------------------------------------------ documented Black-owned businesses (see data/ownership.ts)
  ['SoLa Impact', 'workable', 'solaimpact', 'Real Estate', 'Midsize', 'CA'],
  ['BlocPower', 'greenhouse', 'blocpower', 'Renewable Energy', 'Midsize', 'NY'],
  ['Mayvenn', 'workable', 'mayvenn', 'Consumer Products', 'Midsize', 'CA'],
  // ------------------------------------------------------------ AI
  ['OpenAI', 'ashby', 'openai', 'AI', 'Large', 'CA'],
  ['Anthropic', 'greenhouse', 'anthropic', 'AI', 'Large', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Stripe', 'greenhouse', 'stripe', 'Financial Services', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Defense
  ['SpaceX', 'greenhouse', 'spacex', 'Defense', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Software
  ['Databricks', 'greenhouse', 'databricks', 'Software', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Energy
  ['Crusoe', 'ashby', 'crusoe', 'Energy', 'Midsize', 'CO'],

  // ------------------------------------------------------------ Defense
  ['Shield AI', 'lever', 'shieldai', 'Defense', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Software
  ['Snowflake', 'ashby', 'snowflake', 'Software', 'Large', 'CA'],

  // ------------------------------------------------------------ Technology
  ['Pure Storage', 'greenhouse', 'purestorage', 'Technology', 'Large', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Brex', 'greenhouse', 'brex', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Software
  ['Datadog', 'greenhouse', 'datadog', 'Software', 'Enterprise', 'NY'],

  // ------------------------------------------------------------ Defense
  ['Planet Labs', 'greenhouse', 'planetlabs', 'Defense', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Manufacturing
  ['Formlabs', 'greenhouse', 'formlabs', 'Manufacturing', 'Midsize', 'MA'],
  ['Lucid Motors', 'greenhouse', 'lucidmotors', 'Manufacturing', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Software
  ['MongoDB', 'greenhouse', 'mongodb', 'Software', 'Enterprise', 'NY'],
  ['Relativity', 'greenhouse', 'relativity', 'Software', 'Large', 'IL'],

  // ------------------------------------------------------------ Human Resources Services
  ['Justworks', 'greenhouse', 'justworks', 'Human Resources Services', 'Large', 'NY'],

  // ------------------------------------------------------------ Software
  ['Braze', 'greenhouse', 'braze', 'Software', 'Large', 'NY'],

  // ------------------------------------------------------------ Technology
  ['Pinterest', 'greenhouse', 'pinterest', 'Technology', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ AI
  ['Harvey', 'ashby', 'harvey', 'AI', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Cybersecurity
  ['Okta', 'greenhouse', 'okta', 'Cybersecurity', 'Large', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Block', 'greenhouse', 'block', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ AI
  ['Scale AI', 'greenhouse', 'scaleai', 'AI', 'Large', 'CA'],

  // ------------------------------------------------------------ Cybersecurity
  ['Cloudflare', 'greenhouse', 'cloudflare', 'Cybersecurity', 'Large', 'CA'],

  // ------------------------------------------------------------ Health Insurance
  ['Oscar Health', 'greenhouse', 'oscar', 'Health Insurance', 'Large', 'NY'],

  // ------------------------------------------------------------ Software
  ['Notion', 'ashby', 'notion', 'Software', 'Large', 'CA'],

  // ------------------------------------------------------------ Defense
  ['Astranis', 'greenhouse', 'astranis', 'Defense', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Coinbase', 'greenhouse', 'coinbase', 'Financial Services', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Renewable Energy
  ['Form Energy', 'ashby', 'formenergy', 'Renewable Energy', 'Midsize', 'MA'],
  ['Redwood Materials', 'greenhouse', 'redwoodmaterials', 'Renewable Energy', 'Midsize', 'NV'],

  // ------------------------------------------------------------ Software
  ['Appian', 'greenhouse', 'appian', 'Software', 'Midsize', 'VA'],
  ['Cohere', 'ashby', 'cohere', 'Software', 'Midsize', 'CA'],
  ['Cursor', 'ashby', 'cursor', 'Software', 'Startup', 'CA'],
  ['GitLab', 'greenhouse', 'gitlab', 'Software', 'Large', 'CA'],
  ['Klaviyo', 'greenhouse', 'klaviyo', 'Software', 'Large', 'MA'],
  ['Qualtrics', 'greenhouse', 'qualtrics', 'Software', 'Large', 'UT'],

  // ------------------------------------------------------------ Cybersecurity
  ['Zscaler', 'greenhouse', 'zscaler', 'Cybersecurity', 'Large', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Affirm', 'greenhouse', 'affirm', 'Financial Services', 'Large', 'CA'],
  ['Altruist', 'greenhouse', 'altruist', 'Financial Services', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Software
  ['Grafana Labs', 'greenhouse', 'grafanalabs', 'Software', 'Large', 'NY'],
  ['Intercom', 'greenhouse', 'intercom', 'Software', 'Midsize', 'CA'],
  ['Writer', 'ashby', 'writer', 'Software', 'Startup', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Robinhood', 'greenhouse', 'robinhood', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Software
  ['Asana', 'greenhouse', 'asana', 'Software', 'Large', 'CA'],

  // ------------------------------------------------------------ Technology
  ['Airbnb', 'greenhouse', 'airbnb', 'Technology', 'Large', 'CA'],
  ['Reddit', 'greenhouse', 'reddit', 'Technology', 'Large', 'CA'],

  // ------------------------------------------------------------ Transportation
  ['Lyft', 'greenhouse', 'lyft', 'Transportation', 'Large', 'CA'],

  // ------------------------------------------------------------ AI
  ['ElevenLabs', 'ashby', 'elevenlabs', 'AI', 'Midsize', 'NY'],

  // ------------------------------------------------------------ B2B
  ['Nex', 'greenhouse', 'nex', 'B2B', 'Startup', 'CA'],

  // ------------------------------------------------------------ Banking
  ['Mercury', 'greenhouse', 'mercury', 'Banking', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Consumer Products
  ['Hasbro', 'greenhouse', 'hasbro', 'Consumer Products', 'Large', 'RI'],

  // ------------------------------------------------------------ Defense
  ['Palantir', 'lever', 'palantir', 'Defense', 'Enterprise', 'CO'],

  // ------------------------------------------------------------ E-Commerce
  ['Instacart', 'greenhouse', 'instacart', 'E-Commerce', 'Large', 'CA'],

  // ------------------------------------------------------------ Government
  ['OpenGov', 'ashby', 'opengov', 'Government', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Software
  ['ZoomInfo', 'greenhouse', 'zoominfo', 'Software', 'Enterprise', 'WA'],

  // ------------------------------------------------------------ Financial Services
  ['Juniper Square', 'ashby', 'junipersquare', 'Financial Services', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Government Services
  ['Nava PBC', 'greenhouse', 'navapbc', 'Government Services', 'Midsize', 'DC'],

  // ------------------------------------------------------------ Software
  ['Dropbox', 'greenhouse', 'dropbox', 'Software', 'Enterprise', 'CA'],
  ['Toast', 'greenhouse', 'toast', 'Software', 'Large', 'MA'],

  // ------------------------------------------------------------ Technology
  ['Match Group', 'lever', 'matchgroup', 'Technology', 'Large', 'TX'],

  // ------------------------------------------------------------ AI
  ['Sierra', 'ashby', 'sierra', 'AI', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Business Process Outsourcing
  ['TTEC Digital', 'lever', 'ttecdigital', 'Business Process Outsourcing', 'Large', 'CO'],

  // ------------------------------------------------------------ Cloud Services
  ['Twilio', 'greenhouse', 'twilio', 'Cloud Services', 'Large', 'CO'],

  // ------------------------------------------------------------ Education
  ['Duolingo', 'greenhouse', 'duolingo', 'Education', 'Midsize', 'PA'],

  // ------------------------------------------------------------ Financial Services
  ['Bottomline Technologies', 'greenhouse', 'bottomlinetechnologies', 'Financial Services', 'Large', 'NH'],
  ['Carta', 'greenhouse', 'carta', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Healthcare
  ['Hinge Health', 'ashby', 'hinge-health', 'Healthcare', 'Large', 'CA'],
  ['Lyra Health', 'lever', 'lyrahealth', 'Healthcare', 'Large', 'CA'],
  ['Talkiatry', 'ashby', 'talkiatry', 'Healthcare', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Nonprofit
  ['GiveDirectly', 'greenhouse', 'givedirectly', 'Nonprofit', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Software
  ['Figma', 'greenhouse', 'figma', 'Software', 'Large', 'CA'],
  ['Fivetran', 'greenhouse', 'fivetran', 'Software', 'Large', 'CA'],
  ['Gorgias', 'ashby', 'gorgias', 'Software', 'Midsize', 'CA'],
  ['Snorkel AI', 'greenhouse', 'snorkelai', 'Software', 'Midsize', 'CA'],

  // ------------------------------------------------------------ AI
  ['Perplexity', 'ashby', 'perplexity', 'AI', 'Midsize', 'CA'],

  // ------------------------------------------------------------ B2B
  ['Eloquent AI', 'ashby', 'eloquentai', 'B2B', 'Startup', 'CA'],
  ['Halluminate', 'ashby', 'halluminate', 'B2B', 'Startup', 'CA'],
  ['KERNEL', 'ashby', 'kernel', 'B2B', 'Startup', 'CA'],
  ['Lance', 'ashby', 'lance', 'B2B', 'Startup', 'CA'],

  // ------------------------------------------------------------ Cloud Services
  ['Fastly', 'greenhouse', 'fastly', 'Cloud Services', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Consulting
  ['Cognizant', 'smartrecruiters', 'CognizantTechnologies2', 'Consulting', 'Enterprise', 'NJ'],
  ['Globant', 'smartrecruiters', 'Globant2', 'Consulting', 'Large', 'CA'],
  ['Thoughtworks', 'greenhouse', 'thoughtworks', 'Consulting', 'Enterprise', 'IL'],

  // ------------------------------------------------------------ Defense
  ['Epirus', 'greenhouse', 'epirus', 'Defense', 'Startup', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Bill.com', 'greenhouse', 'billcom', 'Financial Services', 'Large', 'CA'],
  ['Chime', 'greenhouse', 'chime', 'Financial Services', 'Large', 'CA'],
  ['Nasdaq', 'greenhouse', 'nasdaq', 'Financial Services', 'Enterprise', 'NY'],

  // ------------------------------------------------------------ Healthcare
  ['Headway', 'ashby', 'headway', 'Healthcare', 'Midsize', 'NY'],
  ['Included Health', 'lever', 'includedhealth', 'Healthcare', 'Large', 'CA'],

  // ------------------------------------------------------------ Hospitality
  ['ClassPass', 'greenhouse', 'classpass', 'Hospitality', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Human Resources Services
  ['BetterUp', 'ashby', 'betterup', 'Human Resources Services', 'Large', 'CA'],
  ['Culture Amp', 'greenhouse', 'cultureamp', 'Human Resources Services', 'Midsize', 'CA'],
  ['Gusto', 'greenhouse', 'gusto', 'Human Resources Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Industrials
  ['Human Archive', 'ashby', 'humanarchive', 'Industrials', 'Startup', 'CA'],

  // ------------------------------------------------------------ Logistics
  ['Flexport', 'greenhouse', 'flexport', 'Logistics', 'Large', 'CA'],
  ['project44', 'greenhouse', 'project44', 'Logistics', 'Midsize', 'IL'],

  // ------------------------------------------------------------ Marketing
  ['Attentive', 'greenhouse', 'attentive', 'Marketing', 'Large', 'NY'],

  // ------------------------------------------------------------ Nonprofit
  ['Sponsors for Educational Opportunity', 'greenhouse', 'sponsorsforeducationalopportunity', 'Nonprofit', 'Midsize', 'NY'],
  ['Mozilla', 'greenhouse', 'mozilla', 'Nonprofit', 'Large', 'CA'],

  // ------------------------------------------------------------ Renewable Energy
  ['Arcadia', 'lever', 'arcadia', 'Renewable Energy', 'Midsize', 'DC'],

  // ------------------------------------------------------------ Software
  ['Abridge', 'ashby', 'abridge', 'Software', 'Startup', 'PA'],
  ['Elastic', 'greenhouse', 'elastic', 'Software', 'Large', 'CA'],
  ['Lucid Software', 'greenhouse', 'lucidsoftware', 'Software', 'Midsize', 'UT'],
  ['Mixpanel', 'greenhouse', 'mixpanel', 'Software', 'Midsize', 'CA'],
  ['OneTrust', 'greenhouse', 'onetrust', 'Software', 'Large', 'GA'],
  ['Tailscale', 'greenhouse', 'tailscale', 'Software', 'Startup', 'CA'],

  // ------------------------------------------------------------ Staffing
  ['Turing', 'greenhouse', 'turing', 'Staffing', 'Large', 'CA'],

  // ------------------------------------------------------------ Technology
  ['Discord', 'greenhouse', 'discord', 'Technology', 'Large', 'CA'],
  ['Roblox', 'greenhouse', 'roblox', 'Technology', 'Large', 'CA'],

  // ------------------------------------------------------------ B2B
  ['AgentMail', 'ashby', 'agentmail', 'B2B', 'Startup', 'CA'],
  ['Constellation Space', 'ashby', 'constellationspace', 'B2B', 'Startup', 'CA'],
  ['Latent', 'ashby', 'latent', 'B2B', 'Startup', 'CA'],
  ['Moss', 'ashby', 'moss', 'B2B', 'Startup', 'CA'],
  ['Orchestra', 'greenhouse', 'orchestra', 'B2B', 'Startup', 'CA'],
  ['Preload', 'greenhouse', 'preload', 'B2B', 'Startup', 'CA'],
  ['Rivet', 'ashby', 'rivet', 'B2B', 'Startup', 'CA'],
  ['Sapien', 'ashby', 'sapien', 'B2B', 'Startup', 'CA'],
  ['burnt', 'greenhouse', 'burnt', 'B2B', 'Startup', 'CA'],

  // ------------------------------------------------------------ Banking
  ['Relay', 'ashby', 'relay', 'Banking', 'Startup', 'CA'],

  // ------------------------------------------------------------ Biotechnology
  ['Insitro', 'ashby', 'insitro', 'Biotechnology', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Construction
  ['Fieldwire', 'greenhouse', 'fieldwire', 'Construction', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Consumer Products
  ['Peloton', 'greenhouse', 'peloton', 'Consumer Products', 'Large', 'NY'],

  // ------------------------------------------------------------ Education
  ['Instructure', 'ashby', 'instructure', 'Education', 'Large', 'UT'],

  // ------------------------------------------------------------ Financial Services
  ['Betterment', 'greenhouse', 'betterment', 'Financial Services', 'Midsize', 'NY'],
  ['Plaid', 'ashby', 'plaid', 'Financial Services', 'Large', 'CA'],
  ['Ramp', 'ashby', 'ramp', 'Financial Services', 'Large', 'NY'],

  // ------------------------------------------------------------ Government
  ['PayIt', 'greenhouse', 'payit', 'Government', 'Midsize', 'VA'],

  // ------------------------------------------------------------ Healthcare
  ['Abound', 'ashby', 'abound', 'Healthcare', 'Startup', 'KY'],
  ['Maven Clinic', 'greenhouse', 'mavenclinic', 'Healthcare', 'Midsize', 'NY'],
  ['Omada Health', 'greenhouse', 'omadahealth', 'Healthcare', 'Midsize', 'CA'],
  ['Unite Us', 'greenhouse', 'uniteus', 'Healthcare', 'Midsize', 'NY'],
  ['Zocdoc', 'greenhouse', 'zocdoc', 'Healthcare', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Hospitality
  ['Mindbody', 'greenhouse', 'mindbody', 'Hospitality', 'Large', 'CA'],

  // ------------------------------------------------------------ Human Resources Services
  ['Handshake', 'ashby', 'handshake', 'Human Resources Services', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Industrials
  ['9 Mothers', 'ashby', '9-mothers', 'Industrials', 'Startup', 'CA'],
  ['Flai', 'ashby', 'flai', 'Industrials', 'Startup', 'CA'],
  ['Nox Metals', 'ashby', 'nox-metals', 'Industrials', 'Startup', 'CA'],

  // ------------------------------------------------------------ Media
  ['Hearst', 'greenhouse', 'hearst', 'Media', 'Enterprise', 'NY'],

  // ------------------------------------------------------------ Nonprofit
  ['Charity: Water', 'lever', 'charitywater', 'Nonprofit', 'Midsize', 'NY'],
  ['Code for America', 'greenhouse', 'codeforamerica', 'Nonprofit', 'Midsize', 'CA'],
  ['Wikimedia Foundation', 'greenhouse', 'wikimedia', 'Nonprofit', 'Midsize', 'CA'],
  ['iMentor', 'lever', 'imentor', 'Nonprofit', 'Small', 'NY'],

  // ------------------------------------------------------------ Renewable Energy
  ['ChargePoint', 'greenhouse', 'chargepoint', 'Renewable Energy', 'Large', 'CA'],

  // ------------------------------------------------------------ Software
  ['6sense', 'greenhouse', '6sense', 'Software', 'Large', 'CA'],
  ['Ambience Healthcare', 'ashby', 'ambiencehealthcare', 'Software', 'Startup', 'CA'],
  ['Collibra', 'greenhouse', 'collibra', 'Software', 'Midsize', 'NY'],
  ['Docebo', 'ashby', 'docebo', 'Software', 'Midsize', 'GA'],
  ['LaunchDarkly', 'greenhouse', 'launchdarkly', 'Software', 'Midsize', 'CA'],
  ['PlanetScale', 'greenhouse', 'planetscale', 'Software', 'Startup', 'CA'],
  ['Replit', 'ashby', 'replit', 'Software', 'Midsize', 'CA'],
  ['Salesloft', 'greenhouse', 'salesloft', 'Software', 'Midsize', 'GA'],
  ['Sentry', 'ashby', 'sentry', 'Software', 'Midsize', 'CA'],
  ['Smartsheet', 'greenhouse', 'smartsheet', 'Software', 'Large', 'WA'],
  ['Squarespace', 'greenhouse', 'squarespace', 'Software', 'Large', 'NY'],
  ['Temporal', 'ashby', 'temporal', 'Software', 'Midsize', 'WA'],
  ['Together AI', 'greenhouse', 'togetherai', 'Software', 'Startup', 'CA'],
  ['Vanta', 'ashby', 'vanta', 'Software', 'Midsize', 'CA'],
  ['WalkMe', 'lever', 'walkme', 'Software', 'Large', 'CA'],

  // ------------------------------------------------------------ Technology
  ['Groupon', 'greenhouse', 'groupon', 'Technology', 'Large', 'IL'],

  // ------------------------------------------------------------ Travel
  ['TripAdvisor', 'greenhouse', 'tripadvisor', 'Travel', 'Large', 'MA'],

  // ------------------------------------------------------------ Utilities
  ['EnergyHub', 'greenhouse', 'energyhub', 'Utilities', 'Midsize', 'NY'],

  // ------------------------------------------------------------ B2B
  ['Assemble', 'ashby', 'assemble', 'B2B', 'Startup', 'CA'],
  ['Autumn', 'ashby', 'autumn', 'B2B', 'Startup', 'CA'],
  ['Bernard', 'ashby', 'bernard', 'B2B', 'Startup', 'CA'],
  ['BootLoop', 'ashby', 'bootloop', 'B2B', 'Startup', 'CA'],
  ['Cardboard', 'ashby', 'cardboard', 'B2B', 'Startup', 'CA'],
  ['Chronicle Labs', 'ashby', 'chronicle-labs', 'B2B', 'Startup', 'CA'],
  ['Comena', 'ashby', 'comena', 'B2B', 'Startup', 'CA'],
  ['Complir', 'ashby', 'complir', 'B2B', 'Startup', 'CA'],
  ['Dedalus Labs', 'ashby', 'dedalus-labs', 'B2B', 'Startup', 'CA'],
  ['DiligenceSquared', 'ashby', 'diligencesquared', 'B2B', 'Startup', 'CA'],
  ['Doe', 'ashby', 'doe', 'B2B', 'Startup', 'CA'],
  ['Finto', 'ashby', 'finto', 'B2B', 'Startup', 'CA'],
  ['Fleetline', 'ashby', 'fleetline', 'B2B', 'Startup', 'CA'],
  ['Foresight', 'ashby', 'foresight', 'B2B', 'Startup', 'CA'],
  ['Fulcrum', 'ashby', 'fulcrum', 'B2B', 'Startup', 'CA'],
  ['Hexa', 'ashby', 'hexa', 'B2B', 'Startup', 'CA'],
  ['Hopper', 'ashby', 'hopper', 'B2B', 'Startup', 'CA'],
  ['Hypercubic', 'ashby', 'hypercubic', 'B2B', 'Startup', 'CA'],
  ['Interfere', 'ashby', 'interfere', 'B2B', 'Startup', 'CA'],
  ['Kiwi', 'ashby', 'kiwi', 'B2B', 'Startup', 'CA'],
  ['Lapel', 'ashby', 'lapel', 'B2B', 'Startup', 'CA'],
  ['Lark', 'ashby', 'lark', 'B2B', 'Startup', 'CA'],
  ['Limrun', 'greenhouse', 'limrun', 'B2B', 'Startup', 'CA'],
  ['Litmus', 'ashby', 'litmus', 'B2B', 'Startup', 'CA'],
  ['MangoDesk', 'ashby', 'mangodesk', 'B2B', 'Startup', 'CA'],
  ['Mantis', 'greenhouse', 'mantis', 'B2B', 'Startup', 'CA'],
  ['Marble', 'ashby', 'marble', 'B2B', 'Startup', 'CA'],
  ['Maven', 'ashby', 'maven', 'B2B', 'Startup', 'CA'],
  ['Miso Labs', 'ashby', 'misolabs', 'B2B', 'Startup', 'CA'],
  ['Mosaic', 'ashby', 'mosaic', 'B2B', 'Startup', 'CA'],
  ['Nexus', 'greenhouse', 'nexus', 'B2B', 'Startup', 'CA'],
  ['OpenWork', 'greenhouse', 'openwork', 'B2B', 'Startup', 'CA'],
  ['Parameter', 'ashby', 'parameter', 'B2B', 'Startup', 'CA'],
  ['Polymath', 'ashby', 'polymath', 'B2B', 'Startup', 'CA'],
  ['Praxis', 'greenhouse', 'praxis', 'B2B', 'Startup', 'CA'],
  ['Prism', 'ashby', 'prism', 'B2B', 'Startup', 'CA'],
  ['Proto', 'greenhouse', 'proto', 'B2B', 'Startup', 'CA'],
  ['Reacher', 'ashby', 'reacher', 'B2B', 'Startup', 'CA'],
  ['Relling', 'ashby', 'relling', 'B2B', 'Startup', 'CA'],
  ['River', 'ashby', 'river', 'B2B', 'Startup', 'CA'],
  ['SF Tensor', 'ashby', 'sf-tensor', 'B2B', 'Startup', 'CA'],
  ['Sazabi', 'ashby', 'sazabi', 'B2B', 'Startup', 'CA'],
  ['Sila', 'lever', 'sila', 'B2B', 'Startup', 'CA'],
  ['Stilta', 'ashby', 'stilta', 'B2B', 'Startup', 'CA'],
  ['Tenor', 'ashby', 'tenor', 'B2B', 'Startup', 'CA'],
  ['The Token Company', 'ashby', 'the-token-company', 'B2B', 'Startup', 'CA'],
  ['Tolmo', 'ashby', 'tolmo', 'B2B', 'Startup', 'CA'],
  ['Trellis', 'lever', 'trellis', 'B2B', 'Startup', 'CA'],
  ['Uplane', 'ashby', 'uplane', 'B2B', 'Startup', 'CA'],
  ['Wafer', 'ashby', 'wafer', 'B2B', 'Startup', 'CA'],
  ['Whitespace', 'greenhouse', 'whitespace', 'B2B', 'Startup', 'CA'],
  ['hillclimb', 'ashby', 'hillclimb', 'B2B', 'Startup', 'CA'],
  ['idler', 'ashby', 'idler', 'B2B', 'Startup', 'CA'],
  ['sieve', 'ashby', 'sieve', 'B2B', 'Startup', 'CA'],

  // ------------------------------------------------------------ Banking
  ['Found', 'greenhouse', 'found', 'Banking', 'Startup', 'CA'],
  ['Novo', 'ashby', 'novo', 'Banking', 'Startup', 'NY'],

  // ------------------------------------------------------------ Cloud Services
  ['Kinsta', 'lever', 'kinsta', 'Cloud Services', 'Midsize', 'CA'],
  ['Pantheon', 'greenhouse', 'pantheon', 'Cloud Services', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Consumer
  ['AnswerThis', 'ashby', 'answerthis', 'Consumer', 'Startup', 'CA'],
  ['Blue', 'lever', 'blue', 'Consumer', 'Startup', 'CA'],
  ['Moonshot', 'ashby', 'moonshot', 'Consumer', 'Startup', 'CA'],
  ['Opennote', 'ashby', 'opennote', 'Consumer', 'Startup', 'CA'],
  ['Pax Historia', 'ashby', 'pax-historia', 'Consumer', 'Startup', 'CA'],
  ['Pocket', 'ashby', 'pocket', 'Consumer', 'Startup', 'CA'],
  ['Quippy', 'ashby', 'quippy', 'Consumer', 'Startup', 'CA'],
  ['Raven', 'greenhouse', 'raven', 'Consumer', 'Startup', 'CA'],
  ['Tsenta', 'ashby', 'tsenta', 'Consumer', 'Startup', 'CA'],

  // ------------------------------------------------------------ Consumer Products
  ['Away', 'ashby', 'away', 'Consumer Products', 'Midsize', 'NY'],
  ['Glossier', 'greenhouse', 'glossier', 'Consumer Products', 'Midsize', 'NY'],

  // ------------------------------------------------------------ E-Commerce
  ['Rent the Runway', 'greenhouse', 'renttherunway', 'E-Commerce', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Education
  ['Springboard', 'greenhouse', 'springboard', 'Education', 'Small', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['AngelList', 'lever', 'angellist', 'Financial Services', 'Midsize', 'CA'],
  ['Current', 'greenhouse', 'current', 'Financial Services', 'Midsize', 'NY'],
  ['Range', 'greenhouse', 'range', 'Financial Services', 'Startup', 'CA'],
  ['SoFi', 'greenhouse', 'sofi', 'Financial Services', 'Enterprise', 'CA'],
  ['Vise', 'ashby', 'vise', 'Financial Services', 'Startup', 'NY'],
  ['Wealthfront', 'lever', 'wealthfront', 'Financial Services', 'Midsize', 'CA'],
  ['Wealthsimple', 'ashby', 'wealthsimple', 'Financial Services', 'Large', 'NY'],

  // ------------------------------------------------------------ Fintech
  ['Fernstone', 'ashby', 'fernstone', 'Fintech', 'Startup', 'CA'],
  ['Forward', 'greenhouse', 'forward', 'Fintech', 'Startup', 'CA'],
  ['Hedge', 'ashby', 'hedge', 'Fintech', 'Startup', 'CA'],
  ['Veritus', 'ashby', 'veritus', 'Fintech', 'Startup', 'CA'],

  // ------------------------------------------------------------ Government Services
  ['Agile Six', 'greenhouse', 'agilesix', 'Government Services', 'Small', 'CA'],
  ['Oddball', 'greenhouse', 'oddball', 'Government Services', 'Small', 'CA'],

  // ------------------------------------------------------------ Healthcare
  ['Clara', 'greenhouse', 'clara', 'Healthcare', 'Startup', 'CA'],
  ['Elite', 'greenhouse', 'elite', 'Healthcare', 'Startup', 'CA'],
  ['Firefly Health', 'workable', 'firefly-health', 'Healthcare', 'Startup', 'MA'],
  ['Harbor', 'ashby', 'harbor', 'Healthcare', 'Startup', 'CA'],
  ['Infera', 'ashby', 'infera', 'Healthcare', 'Startup', 'CA'],
  ['Juno', 'greenhouse', 'juno', 'Healthcare', 'Startup', 'CA'],
  ['Klarify', 'ashby', 'klarify', 'Healthcare', 'Startup', 'CA'],
  ['Remedy', 'greenhouse', 'remedy', 'Healthcare', 'Startup', 'CA'],
  ['ShiftKey', 'ashby', 'shiftkey', 'Healthcare', 'Midsize', 'TX'],
  ['Trusted Health', 'ashby', 'trustedhealth', 'Healthcare', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Human Resources Services
  ['Oyster', 'ashby', 'oyster', 'Human Resources Services', 'Midsize', 'CA'],
  ['Remote', 'greenhouse', 'remote', 'Human Resources Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Industrials
  ['Asimov', 'ashby', 'asimov', 'Industrials', 'Startup', 'CA'],
  ['Axial', 'greenhouse', 'axial', 'Industrials', 'Startup', 'CA'],
  ['Beyond Reach Labs', 'ashby', 'beyondreachlabs', 'Industrials', 'Startup', 'CA'],
  ['Brumby', 'ashby', 'brumby', 'Industrials', 'Startup', 'CA'],
  ['Cosmic Robotics', 'ashby', 'cosmic-robotics', 'Industrials', 'Startup', 'CA'],
  ['Darwin', 'ashby', 'darwin', 'Industrials', 'Startup', 'CA'],
  ['Dispatch', 'ashby', 'dispatch', 'Industrials', 'Startup', 'CA'],
  ['GUILD', 'ashby', 'guild', 'Industrials', 'Startup', 'CA'],
  ['General Astronautics', 'ashby', 'generalastronautics', 'Industrials', 'Startup', 'CA'],
  ['Icarus', 'greenhouse', 'icarus', 'Industrials', 'Startup', 'CA'],
  ['Madrone', 'ashby', 'madrone', 'Industrials', 'Startup', 'CA'],
  ['Mantle', 'ashby', 'mantle', 'Industrials', 'Startup', 'CA'],
  ['One Robot', 'ashby', 'onerobot', 'Industrials', 'Startup', 'CA'],
  ['Sygaldry Technologies', 'ashby', 'sygaldry-technologies', 'Industrials', 'Startup', 'CA'],

  // ------------------------------------------------------------ Insurance
  ['Ethos', 'greenhouse', 'ethos', 'Insurance', 'Midsize', 'CA'],
  ['Ladder', 'ashby', 'ladder', 'Insurance', 'Midsize', 'CA'],
  ['MetLife', 'lever', 'metlife', 'Insurance', 'Enterprise', 'NY'],
  ['Sure', 'lever', 'sure', 'Insurance', 'Startup', 'CA'],

  // ------------------------------------------------------------ Media
  ['The New York Times', 'greenhouse', 'thenewyorktimes', 'Media', 'Large', 'NY'],
  ['Vox Media', 'greenhouse', 'voxmedia', 'Media', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Nonprofit
  ['DonorsChoose', 'greenhouse', 'donorschoose', 'Nonprofit', 'Small', 'NY'],
  ['ProPublica', 'greenhouse', 'propublica', 'Nonprofit', 'Small', 'NY'],
  ['Saga Education', 'greenhouse', 'sagaeducation', 'Nonprofit', 'Small', 'NY'],
  ['The Trevor Project', 'lever', 'thetrevorproject', 'Nonprofit', 'Small', 'CA'],

  // ------------------------------------------------------------ Retail
  ['Dillard\'s', 'greenhouse', 'dillards', 'Retail', 'Enterprise', 'AR'],

  // ------------------------------------------------------------ Software
  ['ActiveCampaign', 'lever', 'activecampaign', 'Software', 'Large', 'IL'],
  ['Airbyte', 'ashby', 'airbyte', 'Software', 'Midsize', 'CA'],
  ['Airship', 'greenhouse', 'airship', 'Software', 'Midsize', 'OR'],
  ['Airtable', 'greenhouse', 'airtable', 'Software', 'Large', 'CA'],
  ['Amplitude', 'ashby', 'amplitude', 'Software', 'Large', 'CA'],
  ['Appcues', 'ashby', 'appcues', 'Software', 'Midsize', 'MA'],
  ['Bubble', 'ashby', 'bubble', 'Software', 'Midsize', 'NY'],
  ['Buffer', 'ashby', 'buffer', 'Software', 'Startup', 'CA'],
  ['Calendly', 'greenhouse', 'calendly', 'Software', 'Midsize', 'GA'],
  ['Circle', 'ashby', 'circle', 'Software', 'Startup', 'NY'],
  ['ClickHouse', 'ashby', 'clickhouse', 'Software', 'Midsize', 'CA'],
  ['Close', 'ashby', 'close', 'Software', 'Startup', 'CA'],
  ['Cognism', 'greenhouse', 'cognism', 'Software', 'Midsize', 'NY'],
  ['Contentsquare', 'lever', 'contentsquare', 'Software', 'Large', 'NY'],
  ['Customer.io', 'greenhouse', 'customerio', 'Software', 'Midsize', 'OR'],
  ['Demandbase', 'ashby', 'demandbase', 'Software', 'Large', 'CA'],
  ['Descript', 'greenhouse', 'descript', 'Software', 'Midsize', 'CA'],
  ['FullStory', 'ashby', 'fullstory', 'Software', 'Midsize', 'GA'],
  ['Ghost', 'greenhouse', 'ghost', 'Software', 'Startup', 'CA'],
  ['Glide', 'greenhouse', 'glide', 'Software', 'Midsize', 'CA'],
  ['Help Scout', 'ashby', 'helpscout', 'Software', 'Midsize', 'MA'],
  ['Hex', 'ashby', 'hex', 'Software', 'Startup', 'CA'],
  ['Hightouch', 'ashby', 'hightouch', 'Software', 'Startup', 'CA'],
  ['Honeycomb', 'greenhouse', 'honeycomb', 'Software', 'Midsize', 'CA'],
  ['Hootsuite', 'greenhouse', 'hootsuite', 'Software', 'Large', 'WA'],
  ['Hugging Face', 'workable', 'huggingface', 'Software', 'Midsize', 'NY'],
  ['Iterable', 'ashby', 'iterable', 'Software', 'Large', 'CA'],
  ['Labelbox', 'greenhouse', 'labelbox', 'Software', 'Midsize', 'CA'],
  ['Later', 'greenhouse', 'later', 'Software', 'Midsize', 'CA'],
  ['Linear', 'ashby', 'linear', 'Software', 'Startup', 'CA'],
  ['LogRocket', 'lever', 'logrocket', 'Software', 'Midsize', 'MA'],
  ['Mattermost', 'greenhouse', 'mattermost', 'Software', 'Midsize', 'CA'],
  ['Miro', 'ashby', 'miro', 'Software', 'Large', 'CA'],
  ['Nabla', 'ashby', 'nabla', 'Software', 'Startup', 'NY'],
  ['Neon', 'ashby', 'neon', 'Software', 'Startup', 'CA'],
  ['Netlify', 'greenhouse', 'netlify', 'Software', 'Midsize', 'CA'],
  ['New Relic', 'greenhouse', 'newrelic', 'Software', 'Large', 'OR'],
  ['Outreach', 'lever', 'outreach', 'Software', 'Midsize', 'WA'],
  ['PagerDuty', 'greenhouse', 'pagerduty', 'Software', 'Large', 'CA'],
  ['Pendo', 'greenhouse', 'pendo', 'Software', 'Large', 'NC'],
  ['People.ai', 'lever', 'people-ai', 'Software', 'Midsize', 'CA'],
  ['Planable', 'greenhouse', 'planable', 'Software', 'Startup', 'CA'],
  ['PostHog', 'ashby', 'posthog', 'Software', 'Startup', 'DE'],
  ['Quantum Metric', 'lever', 'quantummetric', 'Software', 'Large', 'CO'],
  ['Render', 'ashby', 'render', 'Software', 'Startup', 'CA'],
  ['Sprout Social', 'greenhouse', 'sproutsocial', 'Software', 'Large', 'IL'],
  ['Suki', 'greenhouse', 'suki', 'Software', 'Startup', 'CA'],
  ['Supabase', 'ashby', 'supabase', 'Software', 'Startup', 'DE'],
  ['Thinkific', 'ashby', 'thinkific', 'Software', 'Midsize', 'WA'],
  ['Thunkable', 'lever', 'thunkable', 'Software', 'Startup', 'CA'],
  ['Vercel', 'greenhouse', 'vercel', 'Software', 'Midsize', 'CA'],
  ['Vibe', 'ashby', 'vibe', 'Software', 'Startup', 'CA'],
  ['Weave', 'greenhouse', 'weave', 'Software', 'Midsize', 'UT'],
  ['Webflow', 'ashby', 'webflow', 'Software', 'Large', 'CA'],
  ['Zapier', 'ashby', 'zapier', 'Software', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Staffing
  ['Andela', 'ashby', 'andela', 'Staffing', 'Large', 'NY'],
  ['Toptal', 'lever', 'toptal', 'Staffing', 'Large', 'CA'],

  // ------------------------------------------------------------ Technology
  ['Angi', 'ashby', 'angi', 'Technology', 'Large', 'IN'],
  ['CarGurus', 'greenhouse', 'cargurus', 'Technology', 'Large', 'MA'],
  ['GoDaddy', 'greenhouse', 'godaddy', 'Technology', 'Large', 'AZ'],

  // ------------------------------------- coverage expansion (verified live boards)
  // Probed with scripts/expand-employers.ts: every slug below answered its public
  // ATS API with live postings at the time of the audit.
  ['Monks', 'greenhouse', 'monks', 'Marketing', 'Large', 'NY'],
  ['WPP', 'greenhouse', 'wpp', 'Marketing', 'Enterprise', 'NY'],
  ['AlixPartners', 'greenhouse', 'alixpartners', 'Consulting', 'Large', 'NY'],
  ['Code and Theory', 'greenhouse', 'codeandtheory', 'Marketing', 'Midsize', 'NY'],
  ['Ogilvy', 'greenhouse', 'ogilvy', 'Marketing', 'Large', 'NY'],
  ['AKQA', 'greenhouse', 'akqa', 'Marketing', 'Large', 'CA'],
  ['Expeditors', 'smartrecruiters', 'expeditors', 'Logistics', 'Enterprise', 'WA'],
  ['Local Initiatives Support Corporation', 'greenhouse', 'lisc', 'Nonprofit', 'Midsize', 'NY'],
  ['Planned Parenthood Federation of America', 'lever', 'ppfa', 'Nonprofit', 'Large', 'NY'],
  ['ACLU', 'greenhouse', 'aclu', 'Nonprofit', 'Large', 'NY'],
  ['FourKites', 'greenhouse', 'fourkites', 'Logistics', 'Midsize', 'IL'],
  ['Brookings Institution', 'lever', 'brookings', 'Nonprofit', 'Midsize', 'DC'],
  ['KIPP Foundation', 'smartrecruiters', 'kipp', 'Nonprofit', 'Large', 'NY'],
  ['Uber Freight', 'greenhouse', 'uberfreight', 'Logistics', 'Large', 'IL'],
  ['Coursera', 'greenhouse', 'coursera', 'Education', 'Large', 'CA'],
  ['Virta Health', 'ashby', 'virtahealth', 'Healthcare', 'Midsize', 'CO'],
  ['Weber Shandwick', 'greenhouse', 'webershandwick', 'Marketing', 'Large', 'NY'],
  ['Wieden+Kennedy', 'greenhouse', 'wk', 'Marketing', 'Midsize', 'OR'],
  ['CACI International', 'smartrecruiters', 'caci', 'Government Contracting', 'Enterprise', 'VA'],
  ['R/GA', 'greenhouse', 'rga', 'Marketing', 'Midsize', 'NY'],
  ['Candid', 'greenhouse', 'candid', 'Nonprofit', 'Midsize', 'NY'],
  ['RTI International', 'greenhouse', 'rti', 'Consulting', 'Large', 'NC'],
  ['Palantir Technologies', 'smartrecruiters', 'palantir', 'Software', 'Large', 'CO'],
  ['Doximity', 'greenhouse', 'doximity', 'Healthcare', 'Large', 'CA'],
  ['Ashoka', 'lever', 'ashoka', 'Nonprofit', 'Midsize', 'VA'],
  ['HealthPartners', 'smartrecruiters', 'healthpartners', 'Healthcare', 'Large', 'MN'],
  ['GoodRx', 'ashby', 'goodrx', 'Healthcare', 'Large', 'CA'],
  ['Constellation Energy', 'ashby', 'constellation', 'Energy', 'Enterprise', 'MD'],
  ['Acumen', 'greenhouse', 'acumen', 'Nonprofit', 'Small', 'NY'],
  ['Sierra Club', 'lever', 'sierraclub', 'Nonprofit', 'Midsize', 'CA'],
  ['Golin', 'greenhouse', 'golin', 'Marketing', 'Midsize', 'IL'],
  ['Nonprofit Finance Fund', 'greenhouse', 'nonprofitfinancefund', 'Nonprofit', 'Small', 'NY'],
  ['Khan Academy', 'greenhouse', 'khanacademy', 'Nonprofit', 'Midsize', 'CA'],
  ['Clearway Energy Group', 'greenhouse', 'clearway', 'Renewable Energy', 'Midsize', 'CA'],
  ['Catchafire', 'ashby', 'catchafire', 'Nonprofit', 'Small', 'NY'],
  ['Oliver Wyman', 'lever', 'oliverwyman', 'Consulting', 'Large', 'NY'],
  ['Devoted Health', 'smartrecruiters', 'devotedhealth', 'Health Insurance', 'Midsize', 'MA'],
  ['Teladoc Health', 'smartrecruiters', 'teladochealth', 'Healthcare', 'Large', 'NY'],
  ['Sunnova', 'greenhouse', 'sunnova', 'Renewable Energy', 'Midsize', 'TX'],
  ['FleishmanHillard', 'greenhouse', 'fleishmanhillard', 'Marketing', 'Large', 'MO'],
  ['BoardSource', 'smartrecruiters', 'boardsource', 'Nonprofit', 'Small', 'DC'],
  ['Turner Construction', 'smartrecruiters', 'turnerconstruction', 'Construction', 'Large', 'NY'],
  ['Sutter Health', 'smartrecruiters', 'sutterhealth', 'Healthcare', 'Enterprise', 'CA'],
  ['Ramp', 'greenhouse', 'ramp', 'Fintech', 'Midsize', 'NY'],
  ['2U', 'greenhouse', '2u', 'Education', 'Large', 'MD'],
  ['Southwest Airlines', 'smartrecruiters', 'southwest', 'Transportation', 'Enterprise', 'TX'],


  // ------------------------------- state coverage (verified employer boards, all 50 states)
  // Resolved by scripts/cover-states.ts from each employer's own careers endpoint.
  ['Micron Technology', 'workday', 'micron/External', 'Manufacturing', 'Enterprise', 'ID'],
  ['Workiva', 'workday', 'workiva/careers', 'Software', 'Large', 'IA'],
  ['Hy-Vee', 'workday', 'hyvee/HyVeeCareers', 'Retail', 'Enterprise', 'IA'],
  ['First Interstate BancSystem', 'workday', 'fib/FIBCareers', 'Financial Services', 'Large', 'MT'],
  ['ONEOK', 'workday', 'oneok/ONEOK', 'Energy', 'Enterprise', 'OK'],
  ['Sonoco Products', 'workday', 'sonoco/CorporateCareers', 'Manufacturing', 'Enterprise', 'SC'],
  ['Rockwell Automation', 'workday', 'rockwellautomation/External_Rockwell_Automation', 'Manufacturing', 'Enterprise', 'WI'],
  ['Kohl’s', 'workday', 'kohls/kohlscareers', 'Retail', 'Enterprise', 'WI'],
  ['Xcel Energy', 'workday', 'xcelenergy/External', 'Utilities', 'Enterprise', 'MN'],
  ['Ochsner Health', 'workday', 'ochsner/Ochsner', 'Healthcare', 'Large', 'LA'],
  ['Stanford Health Care', 'workday', 'stanfordmedicine/SHC_External_Career_Site', 'Healthcare', 'Large', 'CA'],
  ['Geisinger', 'workday', 'geisinger/GeisingerExternal', 'Healthcare', 'Large', 'PA'],
  ['Highmark Health', 'workday', 'highmarkhealth/highmark', 'Health Insurance', 'Enterprise', 'PA'],
  ['Elevance Health', 'workday', 'elevancehealth/ANT', 'Health Insurance', 'Enterprise', 'IN'],
  ['Guidehouse', 'workday', 'guidehouse/External', 'Consulting', 'Large', 'VA'],
  ['Booz Allen Hamilton', 'workday', 'bah/BAH_Jobs', 'Government Contracting', 'Enterprise', 'VA'],
  ['Accenture', 'workday', 'accenture/AccentureCareers', 'Consulting', 'Enterprise', 'IL'],
  ['Protiviti', 'workday', 'roberthalf/ProtivitiNA', 'Consulting', 'Large', 'CA'],
  ['Huron Consulting Group', 'workday', 'huron/huroncareers', 'Consulting', 'Large', 'IL'],
  ['Ankura', 'workday', 'ankura/Ankura', 'Consulting', 'Large', 'DC'],
  ['Public Consulting Group', 'workday', 'pcg/PCG_External_Careers', 'Consulting', 'Large', 'MA'],
  ['RAND Corporation', 'workday', 'rand/External_Career_Site', 'Consulting', 'Large', 'CA'],
  ['Capital One', 'workday', 'capitalone/Capital_One', 'Financial Services', 'Enterprise', 'VA'],
  ['Bank of America', 'workday', 'ghr/lateral-us', 'Financial Services', 'Enterprise', 'NC'],
  ['Citigroup', 'workday', 'citi/2', 'Financial Services', 'Enterprise', 'NY'],
  ['Mastercard', 'workday', 'mastercard/CorporateCareers', 'Financial Services', 'Enterprise', 'NY'],
  ['State Street', 'workday', 'statestreet/Global', 'Financial Services', 'Enterprise', 'MA'],
  ['Northern Trust', 'workday', 'ntrs/northerntrust', 'Financial Services', 'Enterprise', 'IL'],
  ['Nationwide', 'workday', 'nationwide/Nationwide_Career', 'Insurance', 'Enterprise', 'OH'],
  ['Target', 'workday', 'target/targetcareers', 'Retail', 'Enterprise', 'MN'],
  ['The Coca-Cola Company', 'workday', 'coke/coca-cola-careers', 'Consumer Products', 'Enterprise', 'GA'],
  ['General Mills', 'workday', 'genmills/GMI_External_Careers', 'Consumer Products', 'Enterprise', 'MN'],


  // --------------- broad employer sweep: startups, nonprofits, consulting, health systems
  // Verified by scripts/probe-companies.ts, which confirms each board's own page name
  // matches the company before the board is accepted.
  ['Capco', 'greenhouse', 'capco', 'Consulting', 'Large', 'NY'],
  ['Roland Berger', 'smartrecruiters', 'rolandberger', 'Consulting', 'Large', 'NY'],
  ['ClearView Healthcare Partners', 'greenhouse', 'clearviewhealthcarepartners', 'Consulting', 'Small', 'MA'],
  ['Whoop', 'ashby', 'whoop', 'Consumer Products', 'Midsize', 'MA'],
  ['Snyk', 'ashby', 'snyk', 'Software', 'Large', 'MA'],
  ['Freshworks', 'smartrecruiters', 'freshworks', 'Software', 'Large', 'CA'],
  ['JFrog', 'greenhouse', 'jfrog', 'Software', 'Large', 'CA'],
  ['UnidosUS', 'greenhouse', 'unidosus', 'Nonprofit', 'Midsize', 'DC'],
  ['Endava', 'smartrecruiters', 'endava', 'Consulting', 'Large', 'NY'],
  ['Riveron', 'ashby', 'riveron', 'Consulting', 'Midsize', 'TX'],
  ['Starburst', 'greenhouse', 'starburst', 'Software', 'Midsize', 'MA'],
  ['Modern Treasury', 'ashby', 'moderntreasury', 'Fintech', 'Small', 'CA'],
  ['Unit', 'ashby', 'unit', 'Fintech', 'Small', 'NY'],
  ['ServiceTitan', 'smartrecruiters', 'servicetitan', 'Software', 'Large', 'CA'],
  ['Contentful', 'greenhouse', 'contentful', 'Software', 'Midsize', 'CO'],
  ['Sanity', 'ashby', 'sanity', 'Software', 'Small', 'CA'],
  ['Canva', 'smartrecruiters', 'canva', 'Software', 'Enterprise', 'CA'],
  ['Lattice', 'greenhouse', 'lattice', 'Software', 'Midsize', 'CA'],
  ['Workato', 'greenhouse', 'workato', 'Software', 'Large', 'CA'],
  ['Tray.ai', 'ashby', 'tray-ai', 'Software', 'Small', 'CA'],
  ['Sigma Computing', 'greenhouse', 'sigmacomputing', 'Software', 'Midsize', 'CA'],
  ['Imply', 'greenhouse', 'imply', 'Software', 'Small', 'CA'],
  ['CircleCI', 'greenhouse', 'circleci', 'Software', 'Midsize', 'CA'],
  ['Sift', 'ashby', 'sift', 'AI', 'Midsize', 'CA'],
  ['Glean', 'smartrecruiters', 'glean', 'AI', 'Midsize', 'CA'],
  ['Uber', 'smartrecruiters', 'uber', 'Marketplace', 'Enterprise', 'CA'],
  ['Wayfair', 'smartrecruiters', 'wayfair', 'Ecommerce', 'Enterprise', 'MA'],
  ['Calm', 'greenhouse', 'calm', 'Consumer Products', 'Midsize', 'CA'],
  ['One Medical', 'greenhouse', 'onemedical', 'Healthcare', 'Large', 'CA'],
  ['Human Rights Watch', 'greenhouse', 'humanrightswatch', 'Nonprofit', 'Midsize', 'NY'],
  ['United Way Worldwide', 'smartrecruiters', 'unitedwayworldwide', 'Nonprofit', 'Large', 'VA'],
  ['Vera Institute of Justice', 'greenhouse', 'verainstituteofjustice', 'Nonprofit', 'Midsize', 'NY'],
  ['Southern Poverty Law Center', 'greenhouse', 'southernpovertylawcenter', 'Nonprofit', 'Midsize', 'AL'],
  ['Penn Medicine', 'smartrecruiters', 'pennmedicine', 'Healthcare', 'Enterprise', 'PA'],
  ['Northwestern Medicine', 'smartrecruiters', 'northwesternmedicine', 'Healthcare', 'Enterprise', 'IL'],
  ['Froedtert Health', 'smartrecruiters', 'froedterthealth', 'Healthcare', 'Large', 'WI'],
  ['Texas Health Resources', 'smartrecruiters', 'texashealthresources', 'Healthcare', 'Large', 'TX'],
  ['Presbyterian Healthcare Services', 'smartrecruiters', 'presbyterianhealthcareservices', 'Healthcare', 'Large', 'NM'],
  ['MaineHealth', 'smartrecruiters', 'mainehealth', 'Healthcare', 'Large', 'ME'],


  // --------------- long tail: startups found through company directories
  // ATS link read from each company's own careers page, so attribution is correct
  // by construction rather than guessed from a slug.
  ['Zip', 'ashby', 'zip', 'B2B', 'Large', 'CA'],
  ['Nourish', 'greenhouse', 'usenourish', 'Healthcare', 'Large', 'NY'],
  ['Jeeves', 'lever', 'tryjeeves', 'Fintech', 'Midsize', 'FL'],
  ['Deepgram', 'ashby', 'deepgram', 'B2B', 'Midsize', 'CA'],
  ['Exa', 'ashby', 'exa', 'B2B', 'Midsize', 'CA'],
  ['REGENT', 'ashby', 'regent', 'Industrials', 'Small', 'RI'],
  ['Onebrief', 'ashby', 'onebrief', 'B2B', 'Midsize', 'HI'],
  ['Daybreak Health', 'greenhouse', 'daybreakhealth', 'Healthcare', 'Small', 'CA'],
  ['Confido', 'ashby', 'confido', 'B2B', 'Midsize', 'NY'],
  ['May Mobility', 'greenhouse', 'maymobility', 'Industrials', 'Large', 'MI'],
  ['ARQ', 'ashby', 'arq', 'Fintech', 'Midsize', 'CA'],
  ['Stepful', 'ashby', 'stepful', 'Education', 'Midsize', 'NY'],
  ['TetraScience', 'workable', 'tetrascience', 'Healthcare', 'Midsize', 'MA'],
  ['Jerry', 'ashby', 'jerry.ai', 'Fintech', 'Midsize', 'CA'],
  ['Prolific', 'greenhouse', 'prolific', 'B2B', 'Midsize', 'CA'],
  ['Platzi', 'workable', 'platzi', 'B2B', 'Midsize', 'CA'],
  ['Shepherd', 'ashby', 'shepherd', 'Fintech', 'Midsize', 'CA'],
  ['Nash', 'ashby', 'nash', 'B2B', 'Small', 'CA'],
  ['Gecko Robotics', 'ashby', 'gecko-robotics', 'Industrials', 'Midsize', 'PA'],
  ['RevenueCat', 'ashby', 'revenuecat', 'B2B', 'Midsize', 'CA'],
  ['Tavus', 'ashby', 'tavus', 'B2B', 'Midsize', 'CA'],
  ['AssemblyAI', 'greenhouse', 'assemblyai', 'B2B', 'Midsize', 'NY'],
  ['Pave', 'greenhouse', 'paveakatroveinformationtechnologies', 'B2B', 'Midsize', 'CA'],
  ['Ophelia', 'greenhouse', 'ophelia', 'Healthcare', 'Large', 'NY'],
  ['Thndr', 'ashby', 'thndr', 'Fintech', 'Midsize', 'CA'],
  ['Luminai', 'ashby', 'luminai', 'B2B', 'Midsize', 'CA'],
  ['Gridware', 'lever', 'gridware', 'Industrials', 'Midsize', 'CA'],
  ['MarqVision', 'greenhouse', 'marqvision', 'B2B', 'Midsize', 'CA'],
  ['Mach9', 'ashby', 'mach9', 'B2B', 'Small', 'CA'],
  ['Pyka', 'lever', 'pyka', 'Industrials', 'Midsize', 'CA'],
  ['Prodigal', 'greenhouse', 'prodigal', 'Fintech', 'Midsize', 'CA'],
  ['Triomics', 'ashby', 'triomics', 'Healthcare', 'Midsize', 'NY'],
  ['CircuitHub', 'ashby', 'circuithub', 'Industrials', 'Midsize', 'CA'],
  ['Mytos', 'lever', 'mytos', 'Healthcare', 'Small', 'CA'],
  ['SigNoz', 'ashby', 'signoz', 'B2B', 'Small', 'CA'],
  ['Ziina', 'ashby', 'ziina', 'Fintech', 'Midsize', 'CA'],
  ['Charge Robotics', 'ashby', 'charge-robotics', 'Industrials', 'Small', 'CA'],
  ['Tovala', 'lever', 'tovala', 'Consumer', 'Large', 'IL'],
  ['Promise', 'ashby', 'promise', 'Government', 'Midsize', 'CA'],
  ['Sorting Robotics', 'workable', 'sorting-robotics', 'B2B', 'Small', 'CA'],
  ['Emi Labs', 'lever', 'emilabs', 'B2B', 'Midsize', 'CA'],
  ['Recidiviz', 'greenhouse', 'recidiviz', 'Government', 'Midsize', 'NY'],
  ['Humaans', 'ashby', 'humaans', 'B2B', 'Small', 'CA'],
  ['Spellbrush', 'ashby', 'spellbrush', 'Consumer', 'Small', 'CA'],
  ['Blueberry Pediatrics', 'ashby', 'blueberrypediatrics', 'Healthcare', 'Small', 'CA'],
  ['Titan', 'ashby', 'titan', 'Fintech', 'Small', 'NY'],
  ['Blissway', 'ashby', 'blissway', 'Government', 'Small', 'CO'],
  ['Formal', 'ashby', 'formal', 'B2B', 'Small', 'CA'],
  ['Mashgin', 'lever', 'mashgin', 'B2B', 'Midsize', 'CA'],
  ['Duffel', 'ashby', 'duffel', 'Consumer', 'Midsize', 'CA'],
  ['Topline Pro', 'ashby', 'topline-pro', 'B2B', 'Small', 'NY'],
  ['Nova Credit', 'greenhouse', 'novacredit', 'Fintech', 'Midsize', 'NY'],
  ['Corvus Robotics', 'ashby', 'corvus-robotics', 'Industrials', 'Small', 'CA'],
  ['Bunkerhill Health', 'ashby', 'bunkerhillhealth', 'Healthcare', 'Small', 'CA'],
  ['Photoroom', 'ashby', 'photoroom', 'Consumer', 'Midsize', 'CA'],
  ['AtoB', 'ashby', 'atob', 'Fintech', 'Midsize', 'CA'],
  ['Arketa', 'ashby', 'arketa', 'B2B', 'Midsize', 'NY'],
  ['Anima', 'ashby', 'anima', 'Healthcare', 'Small', 'CA'],
  ['SPATE', 'workable', 'spate', 'B2B', 'Small', 'NY'],
  ['Glimpse', 'ashby', 'glimpse', 'B2B', 'Midsize', 'NY'],
  ['Axle Health', 'ashby', 'axle-health', 'Healthcare', 'Small', 'CA'],
  ['Kodex', 'ashby', 'kodex', 'B2B', 'Small', 'MA'],
  ['Tempo', 'greenhouse', 'tempo', 'Healthcare', 'Midsize', 'CA'],
  ['Ready', 'ashby', 'ready', 'Government', 'Midsize', 'CA'],
  ['Formance', 'ashby', 'formance', 'B2B', 'Small', 'CA'],
  ['Meticulous', 'ashby', 'meticulous', 'B2B', 'Small', 'CA'],
  ['CareMessage', 'ashby', 'caremessage', 'Healthcare', 'Small', 'TX'],
  ['Cambly', 'ashby', 'cambly', 'Education', 'Midsize', 'CA'],
  ['Ello', 'ashby', 'ello', 'Education', 'Small', 'CA'],
  ['Kingdom', 'ashby', 'kingdom', 'Healthcare', 'Small', 'NY'],
  ['authzed', 'ashby', 'authzed', 'B2B', 'Small', 'NY'],
  ['Vapi', 'ashby', 'vapi', 'B2B', 'Midsize', 'CA'],
  ['Double', 'ashby', 'double', 'B2B', 'Midsize', 'NY'],
  ['True Link', 'ashby', 'truelinkfinancial', 'Fintech', 'Midsize', 'NY'],
  ['Snapdocs', 'ashby', 'snapdocs', 'Real Estate and Construction', 'Large', 'OR'],
  ['Outschool', 'ashby', 'outschool', 'Education', 'Midsize', 'CA'],
  ['Benepass', 'ashby', 'benepass', 'B2B', 'Midsize', 'NY'],
  ['Cortex', 'greenhouse', 'cortex', 'B2B', 'Midsize', 'CA'],
  ['EasyPost', 'lever', 'easypost-2', 'B2B', 'Midsize', 'TX'],
  ['Inscribe', 'ashby', 'inscribeai', 'B2B', 'Small', 'CA'],
  ['Caribou', 'ashby', 'caribou', 'B2B', 'Small', 'CA'],
  ['Volta Labs, Inc.', 'lever', 'voltalabs', 'Healthcare', 'Midsize', 'MA'],
  ['Heart Aerospace', 'greenhouse', 'heartaerospace', 'Industrials', 'Midsize', 'CA'],
  ['NALA', 'workable', 'nalamoney', 'Fintech', 'Midsize', 'NY'],
  ['Verifiable', 'lever', 'verifiable', 'Healthcare', 'Small', 'CA'],
  ['FlutterFlow', 'ashby', 'flutterflow', 'B2B', 'Midsize', 'CA'],
  ['Svix', 'ashby', 'svix', 'B2B', 'Small', 'CA'],
  ['Front', 'ashby', 'frontcareers', 'B2B', 'Large', 'CA'],
  ['Mux', 'ashby', 'mux', 'B2B', 'Midsize', 'CA'],
  ['Modern Health', 'greenhouse', 'modernhealth', 'Healthcare', 'Large', 'MA'],
  ['Treasury Prime', 'greenhouse', 'treasuryprime', 'Fintech', 'Midsize', 'CA'],
  ['Tajir', 'ashby', 'tajir', 'B2B', 'Midsize', 'CA'],
  ['Datafold', 'ashby', 'datafold', 'B2B', 'Small', 'NY'],
  ['CarbonChain', 'greenhouse', 'carbonchain', 'Industrials', 'Small', 'CA'],
  ['Heron', 'ashby', 'herondata', 'Fintech', 'Midsize', 'NY'],
  ['Quicknode', 'ashby', 'quicknode', 'B2B', 'Midsize', 'FL'],
  ['Slope', 'ashby', 'slope', 'Fintech', 'Small', 'CA'],
  ['Replo', 'ashby', 'replo', 'B2B', 'Small', 'CA'],
  ['OneSchema', 'ashby', 'oneschema', 'B2B', 'Small', 'CA'],
  ['Tint', 'greenhouse', 'tintai', 'Fintech', 'Small', 'CA'],
  ['STARK BANK', 'lever', 'starkbank', 'Fintech', 'Midsize', 'CA'],


  // --------------- nonprofits and health systems from the IRS registry
  // Legal names normalised to brand form before probing; each board confirmed by name.
  ['Continental Divide Electric Cooperative Inc', 'smartrecruiters', 'continental', 'Nonprofit', 'Midsize', 'NM'],
  ['Pivotal Philanthropies Foundation', 'lever', 'pivotal', 'Nonprofit', 'Midsize', 'WA'],
  ['Rocky Mountain Health Maintenance Organization Incorporated', 'greenhouse', 'rockymountain', 'Nonprofit', 'Midsize', 'CO'],
  ['Roadrunner Food Bank Inc', 'ashby', 'roadrunner', 'Nonprofit', 'Midsize', 'NM'],
  ['Boston Medical Center Health Plan Inc', 'smartrecruiters', 'bostonmedicalcenter', 'Healthcare', 'Midsize', 'MA'],
  ['Centracare Health System', 'smartrecruiters', 'centracarehealth', 'Healthcare', 'Midsize', 'MN'],
  ['The Health Care Authority Of The City Of Anniston', 'lever', 'healthcare', 'Healthcare', 'Midsize', 'AL'],
  ['Newton Healthcare Corporation', 'lever', 'newton', 'Healthcare', 'Midsize', 'KS'],
  ['Advocate Health And Hospitals Corporation', 'lever', 'advocate', 'Healthcare', 'Midsize', 'IL'],
  ['Bayada Home Health Care Inc', 'smartrecruiters', 'bayadahomehealthcare', 'Healthcare', 'Midsize', 'NJ'],
  ['Mckenzie County Healthcare Systems Inc', 'smartrecruiters', 'mckenziecounty', 'Nonprofit', 'Midsize', 'ND'],
  ['Neighborhood Health Plan Of Rhode Island', 'smartrecruiters', 'neighborhoodhealth', 'Healthcare', 'Midsize', 'RI'],
  ['Yuma Regional Medical Center', 'smartrecruiters', 'yumaregionalmedicalcenter', 'Healthcare', 'Midsize', 'AZ'],
  ['Indiana University Foundation', 'smartrecruiters', 'indianauniversityfoundation', 'Nonprofit', 'Midsize', 'IN'],
  ['University Of Minnesota Physicians', 'smartrecruiters', 'universityofminnesotaphysicians', 'Healthcare', 'Midsize', 'MN'],
  ['Northwestern Medical Center Inc', 'smartrecruiters', 'northwesternmedicalcenter', 'Healthcare', 'Midsize', 'VT'],
  ['Chi St Lukes Health Baylor College Of Medicine Medical Center', 'smartrecruiters', 'chistlukes', 'Healthcare', 'Midsize', 'AZ'],
  ['Adventist Health System Sunbelt Inc', 'smartrecruiters', 'adventisthealthsystem', 'Healthcare', 'Midsize', 'FL'],
  ['Wellstar Health System Inc', 'greenhouse', 'wellstarhealthsysteminc', 'Healthcare', 'Midsize', 'GA'],
  ['Grady Memorial Hospital Corporation', 'smartrecruiters', 'gradymemorialhospital', 'Healthcare', 'Midsize', 'GA'],
  ['Saint Alphonsus Health System Inc', 'smartrecruiters', 'saintalphonsushealthsystem', 'Healthcare', 'Midsize', 'ID'],
  ['Princeton University', 'greenhouse', 'princetonuniversity', 'Nonprofit', 'Midsize', 'NJ'],
  ['Cleveland Clinic Foundation', 'smartrecruiters', 'clevelandclinicfoundation', 'Healthcare', 'Midsize', 'OH'],

];

/**
 * Workday boards are seeded from the resolved list rather than the open-ATS
 * table, because their coordinates are three-part (tenant / pod / site) and are
 * read from the live careers page instead of guessed.
 */
const WORKDAY_SEEDS: SeedEmployer[] = WORKDAY_EMPLOYERS.map((employer) => ({
  name: employer.name,
  ats: 'workday' as Ats,
  slug: `${employer.tenant}/${employer.site}`,
  industry: employer.industry,
  size: employer.size,
  hq: employer.hq,
  roleFamilies: familiesForIndustry(employer.industry),
  careersUrl: workdayCareersUrl(employer),
}));

const PORTAL_FEED_SEEDS: SeedEmployer[] = [
  {
    name: 'AutoZone',
    ats: 'oracle',
    slug: 'egud.fa.us2.oraclecloud.com/CX_1',
    industry: 'Retail',
    size: 'Enterprise',
    hq: 'TN',
    roleFamilies: familiesForIndustry('Retail'),
    careersUrl: 'https://egud.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions?mode=location',
  },
  {
    name: 'International Paper',
    ats: 'oracle',
    slug: 'iazbqy.fa.ocs.oraclecloud.com/CX_1',
    industry: 'Manufacturing',
    size: 'Enterprise',
    hq: 'TN',
    roleFamilies: familiesForIndustry('Manufacturing'),
    careersUrl: 'https://iazbqy.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions?mode=location',
  },
  {
    name: 'Bristol Bay Native Corporation',
    ats: 'dayforce',
    slug: 'https://us241.dayforcehcm.com/api/brs/V1/JobFeeds?includeActivePostingOnly=true',
    industry: 'Government Contracting',
    size: 'Midsize',
    hq: 'AK',
    roleFamilies: familiesForIndustry('Government Contracting'),
    careersUrl: 'https://us241.dayforcehcm.com/CandidatePortal/en-US/brs/Site/BBNCALLJOBSROLLUP',
  },
];

export const SEED_EMPLOYERS: SeedEmployer[] = [
  ...RAW.map(([name, ats, slug, industry, size, hq, explicitFamilies]) => ({
    name, ats, slug, industry, size, hq,
    roleFamilies: explicitFamilies?.length ? explicitFamilies : familiesForIndustry(industry),
  })),
  ...WORKDAY_SEEDS,
  ...PORTAL_FEED_SEEDS,
];

/**
 * The employer slice a role family should search.
 *
 * This is the only entry point the ingest cycle needs; it never filters on a
 * profession name itself.
 */
export function employersForRoleFamily(roleFamilyId: string): SeedEmployer[] {
  return SEED_EMPLOYERS.filter((employer) => employer.roleFamilies.includes(roleFamilyId));
}

/**
 * Employers tracked for ownership verification and manual checking where no
 * public job feed exists. They are stored inactive with the reason recorded so
 * the tracker never implies it searched a board that is not machine-readable.
 */
export interface WatchlistEmployer {
  name: string;
  industry: string;
  size: CompanySize;
  hq: string;
  careersUrl: string;
  /** Why the board is not machine-readable, phrased for the tracker UI. */
  note: string;
  roleFamilies: string[];
}

const WATCH_RAW: Omit<WatchlistEmployer, 'roleFamilies'>[] = [
  { name: 'H.J. Russell & Company', industry: 'Construction', size: 'Midsize', hq: 'GA', careersUrl: 'https://www.hjrussell.com/careers', note: 'Construction employer; no public ATS feed.' },
  { name: 'C.D. Moody Construction', industry: 'Construction', size: 'Small', hq: 'GA', careersUrl: 'https://www.cdmoody.com/careers', note: 'Construction employer; applications handled by email/form.' },
  { name: 'The Integral Group', industry: 'Real Estate', size: 'Midsize', hq: 'GA', careersUrl: 'https://integral-online.com/career/', note: 'Real-estate development employer; postings on own site (integral-online.com).' },
  { name: 'BITHGROUP Technologies', industry: 'IT Consulting', size: 'Small', hq: 'MD', careersUrl: 'https://www.bithgroup.com/careers', note: 'IT consulting employer; no public ATS feed.' },
  { name: 'Ariel Investments', industry: 'Financial Services', size: 'Midsize', hq: 'IL', careersUrl: 'https://www.arielinvestments.com/', note: 'Asset manager; no careers page on the site — postings are announced from the home page and LinkedIn page only.' },
  { name: 'Urban One', industry: 'Media', size: 'Large', hq: 'MD', careersUrl: 'https://urban1.com/careers/', note: 'Media employer; uses an internal careers portal.' },
  { name: 'Management Leadership for Tomorrow', industry: 'Nonprofit', size: 'Midsize', hq: 'NY', careersUrl: 'https://mlt.org/careers/', note: 'Nonprofit; postings on own site and Idealist.' },
  { name: 'UNCF', industry: 'Nonprofit', size: 'Large', hq: 'DC', careersUrl: 'https://uncf.org/careers', note: 'Nonprofit; Workday-based portal that blocks automated feeds.' },
  { name: 'World Wide Technology', industry: 'IT Consulting', size: 'Enterprise', hq: 'MO', careersUrl: 'https://www.wwt.com/corporate/who-we-are/careers', note: 'Largest Black-owned business (BE 100s #1); postings sit in an ADP portal the reader cannot render.' },
  { name: 'Vista Equity Partners', industry: 'Financial Services', size: 'Large', hq: 'TX', careersUrl: 'https://www.vistaequitypartners.com/careers/', note: 'Private-equity firm; postings on own careers page.' },
  { name: 'Blavity', industry: 'Media', size: 'Midsize', hq: 'CA', careersUrl: 'https://blavity.com/careers', note: 'Digital media; postings on own careers page.' },
  { name: 'Esusu', industry: 'Fintech', size: 'Midsize', hq: 'NY', careersUrl: 'https://www.esusurent.com/', note: 'Rent-reporting fintech; postings on own site.' },
  { name: 'RLJ Companies', industry: 'Financial Services', size: 'Midsize', hq: 'MD', careersUrl: 'https://rljcompanies.com/', note: 'Holding company; postings on own site.' },
  { name: 'Act 1 Group', industry: 'Staffing', size: 'Enterprise', hq: 'CA', careersUrl: 'https://www.actonegroup.com/careers', note: 'Staffing and workforce solutions (BE 100s #2); postings on own site.' },
  { name: 'Thompson Hospitality', industry: 'Hospitality', size: 'Large', hq: 'VA', careersUrl: 'https://www.thompsonhospitality.com/careers', note: 'Food-service and facilities management (BE 100s); postings on own site.' },
];

export const WATCHLIST: WatchlistEmployer[] = WATCH_RAW.map((entry) => ({
  ...entry,
  roleFamilies: familiesForIndustry(entry.industry),
}));
