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
