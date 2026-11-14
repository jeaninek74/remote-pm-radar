import { evaluateLocation } from '../server/engine/location';

let failures = 0;

function check(label: string, passed: boolean): void {
  if (passed) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}`);
  }
}

const nationwide = evaluateLocation({
  locations: ['United States'],
  description: 'Fully remote opportunity with about 5% travel',
});
check('US scope with fully remote opportunity description', nationwide.remote === 'remote' && nationwide.ca === 'us_wide');

const remoteTeam = evaluateLocation({
  locations: ['United States'],
  description: "We're expanding our remote Client Services team",
});
check('US scope with remote Client Services team description', remoteTeam.remote === 'remote');

const underscoreLocation = evaluateLocation({ locations: ['Texas_Remote_Central; USA'] });
check('underscore-delimited Texas remote location', underscoreLocation.remote === 'remote' && underscoreLocation.ca === 'us_wide');

const hybrid = evaluateLocation({
  locations: ['United States'],
  description: 'This is a hybrid role, 3 days a week in office. Remote team.',
});
check('hybrid schedule is not remote', hybrid.remote !== 'remote');

const hybridWithoutLocation = evaluateLocation({
  locations: [],
  description: 'This is a hybrid role, 3 days in office',
});
check('hybrid description without a location is hybrid', hybridWithoutLocation.remote === 'hybrid');

const onsiteWithoutLocation = evaluateLocation({
  locations: [],
  description: 'This is an on-site role at our facility',
});
check('on-site description without a location is onsite', onsiteWithoutLocation.remote === 'onsite');

const occasionalOnsiteTraining = evaluateLocation({
  locations: [],
  description: 'Includes occasional on-site training',
});
check('occasional on-site training without a location is unknown', occasionalOnsiteTraining.remote === 'unknown');

const fullyRemoteHybridTeams = evaluateLocation({
  locations: [],
  description: 'Fully remote; hybrid teams across time zones',
});
check('fully remote hybrid-team description without a location is unknown', fullyRemoteHybridTeams.remote === 'unknown');

const noLocationOrDescription = evaluateLocation({ locations: [] });
check('no location or description remains unknown', noLocationOrDescription.remote === 'unknown');

const hybridCloudWithoutLocation = evaluateLocation({
  locations: [],
  description: 'Experience with hybrid cloud and multi-cloud environments',
});
check('hybrid cloud wording without a location is unknown', hybridCloudWithoutLocation.remote === 'unknown');

const occasionalOnsiteFacilityTraining = evaluateLocation({
  locations: [],
  description: 'Occasional on-site at our facility for training',
});
check('occasional on-site facility training without a location is unknown', occasionalOnsiteFacilityTraining.remote === 'unknown');

const hybridScheduleWithoutLocation = evaluateLocation({
  locations: [],
  description: 'This position is hybrid, 2 days a week in office',
});
check('hybrid schedule without a location is hybrid', hybridScheduleWithoutLocation.remote === 'hybrid');

const explicitOnsiteWithoutLocation = evaluateLocation({
  locations: [],
  description: 'Candidates must work on-site in Chicago',
});
check('explicit on-site requirement without a location is onsite', explicitOnsiteWithoutLocation.remote === 'onsite');

const virtualMeetingsWithoutLocation = evaluateLocation({
  locations: [],
  description: 'Meet 2 days a week in virtual meetings',
});
check('virtual meetings without a location are unknown', virtualMeetingsWithoutLocation.remote === 'unknown');

const officeDaysWithoutLocation = evaluateLocation({
  locations: [],
  description: '3 days a week in the office',
});
check('days in office without a location are hybrid', officeDaysWithoutLocation.remote === 'hybrid');

const commuteWithoutLocation = evaluateLocation({
  locations: [],
  description: 'Must live within 30 miles of our office',
});
check('commute requirement without a location is onsite', commuteWithoutLocation.remote === 'onsite');

const onsiteRequirementWithoutLocation = evaluateLocation({
  locations: [],
  description: 'There is an on-site requirement',
});
check('on-site requirement without a location is onsite', onsiteRequirementWithoutLocation.remote === 'onsite');

const negatedOnsiteRequirementWithoutLocation = evaluateLocation({
  locations: [],
  description: 'There is no on-site requirement',
});
check('negated on-site requirement without a location is unknown', negatedOnsiteRequirementWithoutLocation.remote === 'unknown');

const negatedHybridRoleWithoutLocation = evaluateLocation({
  locations: [],
  description: 'This is not a hybrid role',
});
check('negated hybrid role without a location is unknown', negatedHybridRoleWithoutLocation.remote === 'unknown');

const inPersonDaysWithoutLocation = evaluateLocation({
  locations: [],
  description: 'Required 2 days a week in person',
});
check('days in person without a location is hybrid', inPersonDaysWithoutLocation.remote === 'hybrid');

const noRemoteDescription = evaluateLocation({ locations: ['United States'], description: 'Join our team.' });
check(
  'US scope without remote language needs verification',
  noRemoteDescription.remote === 'unknown' && noRemoteDescription.ca === 'us_wide',
);

const cityStateLocation = evaluateLocation({
  locations: ['USA - South San Francisco, CA'],
  description: 'Join our team.',
});
check(
  'US location with a city and state remains unchanged',
  cityStateLocation.remote === 'onsite' && cityStateLocation.ca === 'unknown',
);

const usOnsite = evaluateLocation({
  locations: ['USA'],
  description: 'This role requires working on-site in our Boston office',
});
check('explicit on-site US role is not queued as unknown', usOnsite.remote !== 'remote' && usOnsite.remote !== 'unknown');

const inPersonUs = evaluateLocation({
  locations: ['USA'],
  description: 'This role is in-person at our Austin headquarters',
});
check('explicit in-person US role is not queued as unknown', inPersonUs.remote === 'onsite');

const nationwideResidency = evaluateLocation({
  locations: ['United States'],
  description: 'Fully remote; applicants must live within the United States',
});
check(
  'US residency eligibility does not count as an on-site requirement',
  nationwideResidency.remote === 'remote' && nationwideResidency.ca === 'us_wide',
);

const commuteRequirement = evaluateLocation({
  locations: ['USA'],
  description: 'must live within commuting distance of our Austin office',
});
check(
  'commuting-distance requirement is not queued as remote',
  commuteRequirement.remote === 'onsite' && commuteRequirement.ca === 'unknown',
);

const relocationAssistance = evaluateLocation({
  locations: ['United States'],
  description: 'Fully remote. Relocation assistance available.',
});
check(
  'relocation assistance alone does not exclude a remote role',
  relocationAssistance.remote === 'remote' && relocationAssistance.ca === 'us_wide',
);

const relocationRequired = evaluateLocation({
  locations: ['USA'],
  description: 'Applicants must relocate to Austin.',
});
check('explicit relocation requirement is not queued as remote', relocationRequired.remote === 'onsite');

const occasionalOnsiteVisits = evaluateLocation({
  locations: ['USA'],
  description: 'This role is fully remote with occasional onsite client visits',
});
check(
  'occasional onsite client visits do not override fully remote',
  occasionalOnsiteVisits.remote === 'remote' && occasionalOnsiteVisits.ca === 'us_wide',
);

const occasionalInPersonMeetings = evaluateLocation({
  locations: ['USA'],
  description: 'This is a remote-first role that may require travel to Boston for occasional in-person team meetings and company events.',
});
check(
  'occasional in-person meetings do not negate remote-first',
  occasionalInPersonMeetings.remote === 'remote' && occasionalInPersonMeetings.ca === 'us_wide',
);

const clientOnboardingTravel = evaluateLocation({
  locations: ['USA'],
  description: 'Travel up to 25% of the time to onboard main clients in person and support go-live.',
});
check(
  'client onboarding travel does not make the role explicitly on-site',
  clientOnboardingTravel.remote === 'unknown' && clientOnboardingTravel.ca === 'us_wide',
);

const cityLocation = evaluateLocation({ locations: ['San Francisco, CA'], description: 'fully remote' });
console.log(`Master baseline for city location with remote description: ${cityLocation.remote}/${cityLocation.ca}`);
check('city location preserves master result', cityLocation.remote === 'onsite' && cityLocation.ca === 'unknown');

const nonUs = evaluateLocation({ locations: ['Germany'], description: 'fully remote' });
check('non-US location is not remote or US-wide', nonUs.remote !== 'remote' && nonUs.ca !== 'us_wide');

const titledRemoteCases: [string, string][] = [
  ['Cloud Data Migration Specialist- Remote', 'Reston, Virginia, United States of America'],
  ['Salesforce Project Manager – (Remote US)', 'Reston, VA'],
  ['Project Manager - Disaster Recovery (REMOTE ROLE)', 'Reston, VA, USA'],
  ['CDBG Program Financial Lead - Disaster Management - Remote US', 'Reston, VA, USA'],
  ['Project Manager-Digital Banking Transformation (Remote)', 'Seattle, WA, 98101, USA'],
  ['IT Program Manager (Middle Office Migration) (100% Remote)', 'Reston, VA'],
  ['Fully Remote Program Manager', 'Reston, VA'],
  ['Work from Home Program Manager', 'Seattle, WA'],
  ['Work at Home Program Manager', 'Seattle, WA'],
];
for (const [title, location] of titledRemoteCases) {
  const verdict = evaluateLocation({ locations: [location], title });
  check(`remote title is US-wide despite office location: ${title}`,
    verdict.remote === 'remote' && verdict.ca === 'us_wide');
}

for (const title of [
  'Remote Sensing Program Manager',
  'Remote Monitoring Program Manager',
  'Remote Patient Program Manager',
]) {
  const verdict = evaluateLocation({ locations: ['Reston, VA'], title });
  check(`${title} is not mistaken for a remote role`,
    verdict.remote === 'onsite' && verdict.ca === 'unknown');
}

const hybridRemoteTitle = evaluateLocation({
  locations: ['Remote, US'],
  title: 'Project Manager - Remote / Hybrid',
});
check('hybrid wording in a remote title takes precedence', hybridRemoteTitle.remote !== 'remote');

const onsiteRemoteTitle = evaluateLocation({
  locations: ['Remote, US'],
  title: 'Project Manager - Remote, On-site',
});
check('on-site wording in a remote title takes precedence', onsiteRemoteTitle.remote !== 'remote');

const hybridScheduleWithRemoteTitle = evaluateLocation({
  locations: ['Remote, US'],
  title: 'Project Manager - Remote',
  workplaceType: 'remote',
  description: 'This is a hybrid schedule, with 3 days a week in the office.',
});
check('hybrid schedule in the description takes precedence over a remote title',
  hybridScheduleWithRemoteTitle.remote === 'hybrid');

const onsiteScheduleWithRemoteTitle = evaluateLocation({
  locations: ['Remote, US'],
  title: 'Project Manager - Remote',
  description: 'This is an on-site role at our office.',
});
check('on-site schedule in the description takes precedence over a remote title',
  onsiteScheduleWithRemoteTitle.remote === 'onsite');
const negatedInOfficeWithRemoteTitle = evaluateLocation({
  locations: ['Remote, US'],
  title: 'Program Manager (Remote)',
  description: 'This is not an in-office role.',
});
check('negated in-office wording does not override a remote title',
  negatedInOfficeWithRemoteTitle.remote === 'remote');
const negatedOnsiteWithRemoteTitle = evaluateLocation({
  locations: ['Remote, US'],
  title: 'Program Manager (Remote)',
  description: 'This is not an on-site position.',
});
check('negated on-site wording does not override a remote title',
  negatedOnsiteWithRemoteTitle.remote === 'remote');
const affirmativeInOfficeWithRemoteTitle = evaluateLocation({
  locations: ['Remote, US'],
  title: 'Program Manager (Remote)',
  description: 'This is an in-office role.',
});
check('affirmative in-office wording overrides a remote title',
  affirmativeInOfficeWithRemoteTitle.remote !== 'remote');

const remoteLondon = evaluateLocation({
  locations: ['London, United Kingdom'],
  title: 'Project Manager - Remote',
});
check('remote title with London remains non-US', remoteLondon.remote === 'remote' && remoteLondon.ca === 'not_us');
const remoteLondonKentucky = evaluateLocation({
  locations: ['London, KY'],
  title: 'Program Manager (Remote)',
});
check('US city London, Kentucky remains US-wide with a remote title',
  remoteLondonKentucky.remote === 'remote' && remoteLondonKentucky.ca === 'us_wide');
const remoteNewLondonConnecticut = evaluateLocation({
  locations: ['New London, CT, USA'],
  title: 'Program Manager (Remote)',
});
check('New London, Connecticut remains US-wide with a remote title',
  remoteNewLondonConnecticut.remote === 'remote' && remoteNewLondonConnecticut.ca === 'us_wide');

const usAlias = evaluateLocation({ locations: ['US'], description: 'Fully remote role' });
check('US alias is remote and US-wide', usAlias.remote === 'remote' && usAlias.ca === 'us_wide');

const texasWithCountry = evaluateLocation({
  locations: ['Remote'],
  restrictions: ['Texas, United States'],
  workplaceType: 'remote',
  description: 'remote',
});
check(
  'Texas restriction takes precedence over spelled-out country',
  texasWithCountry.remote === 'remote' && texasWithCountry.ca === 'state_restricted' && texasWithCountry.states.includes('TX'),
);

const splitTexasWithCountry = evaluateLocation({
  locations: ['Remote'],
  restrictions: ['Texas', 'United States'],
  workplaceType: 'remote',
  description: 'remote',
});
check(
  'separate Texas and country restrictions remain state-restricted',
  splitTexasWithCountry.remote === 'remote' && splitTexasWithCountry.ca === 'state_restricted' && splitTexasWithCountry.states.includes('TX'),
);

const californiaWithCountry = evaluateLocation({
  locations: ['Remote'],
  restrictions: ['California, United States'],
  workplaceType: 'remote',
  description: 'remote',
});
check(
  'California restriction with country remains CA-eligible',
  californiaWithCountry.remote === 'remote' && californiaWithCountry.ca === 'confirmed' && californiaWithCountry.states.includes('CA'),
);

const countryOnly = evaluateLocation({
  locations: ['Remote'],
  restrictions: ['United States'],
  workplaceType: 'remote',
  description: 'remote',
});
check(
  'bare country restriction remains US-wide',
  countryOnly.remote === 'remote' && countryOnly.ca === 'us_wide',
);

const countryExceptTexas = evaluateLocation({
  locations: ['Remote'],
  restrictions: ['United States except Texas'],
  workplaceType: 'remote',
  description: 'remote',
});
check(
  'excluded Texas does not become a state restriction',
  countryExceptTexas.remote === 'remote' && countryExceptTexas.ca === 'us_wide' && !countryExceptTexas.states.includes('TX'),
);

const countryExceptCalifornia = evaluateLocation({
  locations: ['Remote'],
  restrictions: ['United States except California'],
  workplaceType: 'remote',
  description: 'remote',
});
check(
  'excluded California is not CA-eligible',
  countryExceptCalifornia.remote === 'remote' && countryExceptCalifornia.ca === 'state_restricted',
);

const countryExceptTexasIncludingCalifornia = evaluateLocation({
  locations: ['Remote'],
  restrictions: ['United States except Texas; California'],
  workplaceType: 'remote',
  description: 'remote',
});
check(
  'state after exclusion semicolon remains eligible',
  countryExceptTexasIncludingCalifornia.remote === 'remote'
    && countryExceptTexasIncludingCalifornia.ca === 'confirmed'
    && countryExceptTexasIncludingCalifornia.states.includes('CA'),
);

const foreignExamples = [
  'Warsaw, POL',
  'Montreal, QC',
  'Bangkok, THA',
  'Sydney, NSW',
  'London, GBR',
  'San Jose,CRI',
  'Aurangabad, MH, Bengaluru, KA, Mumbai, MH',
  'Sweden (Remote)',
  'Sofia, Bulgaria',
  'Lithuania, remote',
  'Saudi Arabia - Remote',
  'Remote - Nicaragua',
  'Gurugram',
  'Deutschland',
  'Bucharest, Romania; Iasi, Romania; Remote - Romania',
  '3301-EDM S de RL de CV: Guadalajara, Zapopan, Jalisco,MX',
  'Escazu, CRI; Remote - Costa Rica',
  'Melbourne, VIC',
  'Dordrecht',
  'EU, Remote',
  'GBR, Remote',
  'London',
  'Bengaluru',
  'Panamá',
  'España',
  'México',
  'São Paulo',
  'Bogotá',
  'Regina, SK',
  'Brisbane, QLD',
];
for (const location of foreignExamples) {
  const verdict = evaluateLocation({
    locations: [location],
    workplaceType: 'remote',
    isRemote: true,
  });
  check(`${location} is outside the United States`, verdict.ca === 'not_us');
}

const allForeignNote = evaluateLocation({
  locations: ['Warsaw, POL'],
  workplaceType: 'remote',
  isRemote: true,
});
check('all-foreign note includes exact labels',
  allForeignNote.note === 'All listed locations are outside the United States (Warsaw, POL).');

const foreignWithUsResidencyRestriction = evaluateLocation({
  locations: ['London, GBR'],
  restrictions: ['Must reside in the United States'],
  workplaceType: 'remote',
  isRemote: true,
});
check('foreign location with US residency restriction stays eligible',
  foreignWithUsResidencyRestriction.ca !== 'not_us');

const foreignWithUsStateRestriction = evaluateLocation({
  locations: ['London, GBR'],
  restrictions: ['Remote within Texas'],
  workplaceType: 'remote',
  isRemote: true,
});
check('foreign location with US state restriction stays eligible',
  foreignWithUsStateRestriction.ca !== 'not_us');

const foreignWithExcludedState = evaluateLocation({
  locations: ['London, GBR'],
  restrictions: ['Remote, excluding New York'],
  workplaceType: 'remote',
  isRemote: true,
});
check('foreign location with excluded US state remains not_us',
  foreignWithExcludedState.ca === 'not_us');

const foreignWithUnavailableState = evaluateLocation({
  locations: ['London, GBR'],
  restrictions: ['Not available in California'],
  workplaceType: 'remote',
  isRemote: true,
});
check('foreign location with unavailable US state remains not_us',
  foreignWithUnavailableState.ca === 'not_us');

const lowercaseCode = evaluateLocation({
  locations: ['pol'],
  workplaceType: 'remote',
  isRemote: true,
});
check('lowercase ISO-3 text is not treated as a country code', lowercaseCode.ca !== 'not_us');

const protectedLocationExamples: [string, string[]][] = [
  ['Dublin, OH', ['Dublin, OH']],
  ['London, KY', ['London, KY']],
  ['Paris, TX', ['Paris, TX']],
  ['Toronto, OH', ['Toronto, OH']],
  ['Remote, United States', ['Remote, United States']],
  ['US and foreign locations in a mixed list', ['Sunnyvale, CA', 'Remote (CAN)', 'Remote (US)']],
  ['Canada and United States in a mixed list', ['Remote, Canada', 'Remote, United States']],
  ['US/CAN in one location', ['Remote (US/CAN)']],
  ['Irving', ['Irving']],
  ['empty locations', []],
];
for (const [label, locations] of protectedLocationExamples) {
  const verdict = evaluateLocation({ locations, workplaceType: 'remote', isRemote: true });
  check(`${label} is not classified outside the United States`, verdict.ca !== 'not_us');
}

if (failures) {
  console.error(`${failures} location check(s) failed`);
  process.exit(1);
}
console.log('All location checks passed.');
