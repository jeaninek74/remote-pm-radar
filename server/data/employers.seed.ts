import type { Ats, CompanySize } from '../engine/types';

export interface SeedEmployer {
  name: string;
  ats: Ats;
  slug: string;
  industry: string;
  size: CompanySize;
  hq: string;
}

type Row = [string, Ats, string, string, CompanySize, string];

/**
 * Seed inventory of employers with PUBLIC applicant-tracking-system job feeds.
 *
 * Coverage is deliberately spread across industries (healthcare, government,
 * construction, energy, marketing, nonprofits, financial services, retail,
 * manufacturing, logistics), sizes (startups to enterprises) and headquarter
 * states. Slugs are verified live during the first refresh: any board that does
 * not answer is marked inactive instead of being reported as searched.
 */
const RAW: Row[] = [
  // ------------------------------------------------------------ AI
  ['OpenAI', 'ashby', 'openai', 'AI', 'Large', 'CA'],
  ['Anthropic', 'greenhouse', 'anthropic', 'AI', 'Large', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Stripe', 'greenhouse', 'stripe', 'Financial Services', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Software
  ['Databricks', 'greenhouse', 'databricks', 'Software', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Energy
  ['Crusoe', 'ashby', 'crusoe', 'Energy', 'Midsize', 'CO'],

  // ------------------------------------------------------------ Defense
  ['Shield AI', 'lever', 'shieldai', 'Defense', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Cloud Services
  ['Snowflake', 'ashby', 'snowflake', 'Cloud Services', 'Enterprise', 'MT'],

  // ------------------------------------------------------------ Financial Services
  ['Brex', 'greenhouse', 'brex', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Software
  ['Datadog', 'greenhouse', 'datadog', 'Software', 'Enterprise', 'NY'],

  // ------------------------------------------------------------ Defense
  ['Planet Labs', 'greenhouse', 'planetlabs', 'Defense', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Manufacturing
  ['Lucid Motors', 'greenhouse', 'lucidmotors', 'Manufacturing', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Software
  ['MongoDB', 'greenhouse', 'mongodb', 'Software', 'Enterprise', 'NY'],

  // ------------------------------------------------------------ Human Resources Services
  ['Justworks', 'greenhouse', 'justworks', 'Human Resources Services', 'Large', 'NY'],

  // ------------------------------------------------------------ Marketing
  ['Braze', 'greenhouse', 'braze', 'Marketing', 'Large', 'NY'],

  // ------------------------------------------------------------ Technology
  ['Pinterest', 'greenhouse', 'pinterest', 'Technology', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ AI
  ['Harvey', 'ashby', 'harvey', 'AI', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Cybersecurity
  ['Okta', 'greenhouse', 'okta', 'Cybersecurity', 'Large', 'CA'],

  // ------------------------------------------------------------ AI
  ['Scale AI', 'greenhouse', 'scaleai', 'AI', 'Large', 'CA'],

  // ------------------------------------------------------------ Cybersecurity
  ['Cloudflare', 'greenhouse', 'cloudflare', 'Cybersecurity', 'Large', 'CA'],

  // ------------------------------------------------------------ Health Insurance
  ['Oscar Health', 'greenhouse', 'oscar', 'Health Insurance', 'Large', 'NY'],

  // ------------------------------------------------------------ Software
  ['Notion', 'ashby', 'notion', 'Software', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Defense
  ['Astranis', 'greenhouse', 'astranis', 'Defense', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Coinbase', 'greenhouse', 'coinbase', 'Financial Services', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Marketing
  ['Klaviyo', 'greenhouse', 'klaviyo', 'Marketing', 'Large', 'MA'],

  // ------------------------------------------------------------ Renewable Energy
  ['Form Energy', 'ashby', 'formenergy', 'Renewable Energy', 'Midsize', 'MA'],
  ['Redwood Materials', 'greenhouse', 'redwoodmaterials', 'Renewable Energy', 'Midsize', 'NV'],

  // ------------------------------------------------------------ Software
  ['GitLab', 'greenhouse', 'gitlab', 'Software', 'Large', 'CA'],
  ['Qualtrics', 'greenhouse', 'qualtrics', 'Software', 'Enterprise', 'UT'],

  // ------------------------------------------------------------ Financial Services
  ['Affirm', 'greenhouse', 'affirm', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Software
  ['Intercom', 'greenhouse', 'intercom', 'Software', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Robinhood', 'greenhouse', 'robinhood', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Hospitality
  ['Airbnb', 'greenhouse', 'airbnb', 'Hospitality', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ Software
  ['Asana', 'greenhouse', 'asana', 'Software', 'Large', 'CA'],

  // ------------------------------------------------------------ Technology
  ['Reddit', 'greenhouse', 'reddit', 'Technology', 'Large', 'CA'],

  // ------------------------------------------------------------ Transportation
  ['Lyft', 'greenhouse', 'lyft', 'Transportation', 'Large', 'CA'],

  // ------------------------------------------------------------ AI
  ['ElevenLabs', 'ashby', 'elevenlabs', 'AI', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Banking
  ['Mercury', 'greenhouse', 'mercury', 'Banking', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Defense
  ['Palantir', 'lever', 'palantir', 'Defense', 'Enterprise', 'CO'],

  // ------------------------------------------------------------ E-Commerce
  ['Instacart', 'greenhouse', 'instacart', 'E-Commerce', 'Large', 'CA'],

  // ------------------------------------------------------------ Government
  ['OpenGov', 'ashby', 'opengov', 'Government', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Software
  ['Dropbox', 'greenhouse', 'dropbox', 'Software', 'Enterprise', 'CA'],

  // ------------------------------------------------------------ AI
  ['Sierra', 'ashby', 'sierra', 'AI', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Business Process Outsourcing
  ['TTEC Digital', 'lever', 'ttecdigital', 'Business Process Outsourcing', 'Large', 'CO'],

  // ------------------------------------------------------------ Cloud Services
  ['Twilio', 'greenhouse', 'twilio', 'Cloud Services', 'Large', 'CO'],

  // ------------------------------------------------------------ Education
  ['Duolingo', 'greenhouse', 'duolingo', 'Education', 'Midsize', 'PA'],

  // ------------------------------------------------------------ Financial Services
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

  // ------------------------------------------------------------ AI
  ['Perplexity', 'ashby', 'perplexity', 'AI', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Consulting
  ['Thoughtworks', 'greenhouse', 'thoughtworks', 'Consulting', 'Enterprise', 'IL'],

  // ------------------------------------------------------------ Defense
  ['Epirus', 'greenhouse', 'epirus', 'Defense', 'Startup', 'CA'],

  // ------------------------------------------------------------ Financial Services
  ['Bill.com', 'greenhouse', 'billcom', 'Financial Services', 'Large', 'CA'],
  ['Chime', 'greenhouse', 'chime', 'Financial Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Healthcare
  ['Headway', 'ashby', 'headway', 'Healthcare', 'Midsize', 'NY'],
  ['Included Health', 'lever', 'includedhealth', 'Healthcare', 'Large', 'CA'],

  // ------------------------------------------------------------ Hospitality
  ['ClassPass', 'greenhouse', 'classpass', 'Hospitality', 'Midsize', 'NY'],

  // ------------------------------------------------------------ Human Resources Services
  ['BetterUp', 'ashby', 'betterup', 'Human Resources Services', 'Large', 'CA'],
  ['Culture Amp', 'greenhouse', 'cultureamp', 'Human Resources Services', 'Midsize', 'CA'],
  ['Gusto', 'greenhouse', 'gusto', 'Human Resources Services', 'Large', 'CA'],

  // ------------------------------------------------------------ Logistics
  ['Flexport', 'greenhouse', 'flexport', 'Logistics', 'Large', 'CA'],
  ['project44', 'greenhouse', 'project44', 'Logistics', 'Midsize', 'IL'],

  // ------------------------------------------------------------ Marketing
  ['Attentive', 'greenhouse', 'attentive', 'Marketing', 'Large', 'NY'],

  // ------------------------------------------------------------ Nonprofit
  ['Mozilla', 'greenhouse', 'mozilla', 'Nonprofit', 'Large', 'CA'],

  // ------------------------------------------------------------ Renewable Energy
  ['Arcadia', 'lever', 'arcadia', 'Renewable Energy', 'Midsize', 'DC'],

  // ------------------------------------------------------------ Software
  ['Elastic', 'greenhouse', 'elastic', 'Software', 'Large', 'CA'],
  ['Mixpanel', 'greenhouse', 'mixpanel', 'Software', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Technology
  ['Discord', 'greenhouse', 'discord', 'Technology', 'Large', 'CA'],

  // ------------------------------------------------------------ Biotechnology
  ['Insitro', 'ashby', 'insitro', 'Biotechnology', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Construction
  ['Fieldwire', 'greenhouse', 'fieldwire', 'Construction', 'Midsize', 'CA'],

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

  // ------------------------------------------------------------ Hospitality
  ['Mindbody', 'greenhouse', 'mindbody', 'Hospitality', 'Large', 'CA'],

  // ------------------------------------------------------------ Human Resources Services
  ['Handshake', 'ashby', 'handshake', 'Human Resources Services', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Nonprofit
  ['Charity: Water', 'lever', 'charitywater', 'Nonprofit', 'Midsize', 'NY'],
  ['Code for America', 'greenhouse', 'codeforamerica', 'Nonprofit', 'Midsize', 'CA'],
  ['Wikimedia Foundation', 'greenhouse', 'wikimedia', 'Nonprofit', 'Midsize', 'CA'],

  // ------------------------------------------------------------ Renewable Energy
  ['ChargePoint', 'greenhouse', 'chargepoint', 'Renewable Energy', 'Large', 'CA'],

  // ------------------------------------------------------------ Software
  ['Collibra', 'greenhouse', 'collibra', 'Software', 'Midsize', 'NY'],
  ['Smartsheet', 'greenhouse', 'smartsheet', 'Software', 'Large', 'WA'],
  ['Squarespace', 'greenhouse', 'squarespace', 'Software', 'Large', 'NY'],

  // ------------------------------------------------------------ Utilities
  ['EnergyHub', 'greenhouse', 'energyhub', 'Utilities', 'Midsize', 'NY'],
];

export const SEED_EMPLOYERS: SeedEmployer[] = RAW.map(([name, ats, slug, industry, size, hq]) => ({
  name, ats, slug, industry, size, hq,
}));

/**
 * Employers tracked for ownership verification and manual checking where no
 * public job feed exists. They are stored inactive with the reason recorded so
 * the tracker never implies it searched a board that is not machine-readable.
 */
export const WATCHLIST: { name: string; industry: string; size: CompanySize; hq: string; careersUrl: string; note: string }[] = [
  { name: 'H.J. Russell & Company', industry: 'Construction', size: 'Midsize', hq: 'GA', careersUrl: 'https://www.hjrussell.com/careers', note: 'Construction/program management employer; no public ATS feed.' },
  { name: 'C.D. Moody Construction', industry: 'Construction', size: 'Small', hq: 'GA', careersUrl: 'https://www.cdmoody.com/careers', note: 'Construction employer; applications handled by email/form.' },
  { name: 'The Integral Group', industry: 'Real Estate', size: 'Midsize', hq: 'GA', careersUrl: 'https://www.integralgroup.com/careers', note: 'Real-estate development employer; no public ATS feed.' },
  { name: 'BITHGROUP Technologies', industry: 'IT Consulting', size: 'Small', hq: 'MD', careersUrl: 'https://www.bithgroup.com/careers', note: 'IT consulting employer; no public ATS feed.' },
  { name: 'Ariel Investments', industry: 'Financial Services', size: 'Midsize', hq: 'IL', careersUrl: 'https://www.arielinvestments.com/careers', note: 'Asset manager; postings appear on own careers page only.' },
  { name: 'Urban One', industry: 'Media', size: 'Large', hq: 'MD', careersUrl: 'https://urban1.com/careers/', note: 'Media employer; uses an internal careers portal.' },
  { name: 'Management Leadership for Tomorrow', industry: 'Nonprofit', size: 'Midsize', hq: 'NY', careersUrl: 'https://mlt.org/careers/', note: 'Nonprofit; postings on own site and Idealist.' },
  { name: 'Sponsors for Educational Opportunity', industry: 'Nonprofit', size: 'Midsize', hq: 'NY', careersUrl: 'https://www.seo-usa.org/careers/', note: 'Nonprofit; postings on own site.' },
  { name: 'UNCF', industry: 'Nonprofit', size: 'Large', hq: 'DC', careersUrl: 'https://uncf.org/careers', note: 'Nonprofit; Workday-based portal that blocks automated feeds.' },
  { name: 'SoLa Impact', industry: 'Real Estate', size: 'Midsize', hq: 'CA', careersUrl: 'https://www.solaimpact.com/careers', note: 'Impact real-estate developer; postings on own site.' },
];
