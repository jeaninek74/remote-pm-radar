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

if (failures) {
  console.error(`${failures} location check(s) failed`);
  process.exit(1);
}
console.log('All location checks passed.');
