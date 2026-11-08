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
console.log(`Master baseline for US scope without remote language: ${noRemoteDescription.remote}/${noRemoteDescription.ca}`);
check('US scope without remote language preserves master result', noRemoteDescription.remote === 'onsite' && noRemoteDescription.ca === 'unknown');

const cityLocation = evaluateLocation({ locations: ['San Francisco, CA'], description: 'fully remote' });
console.log(`Master baseline for city location with remote description: ${cityLocation.remote}/${cityLocation.ca}`);
check('city location preserves master result', cityLocation.remote === 'onsite' && cityLocation.ca === 'unknown');

const nonUs = evaluateLocation({ locations: ['Germany'], description: 'fully remote' });
check('non-US location is not remote or US-wide', nonUs.remote !== 'remote' && nonUs.ca !== 'us_wide');

const usAlias = evaluateLocation({ locations: ['US'], description: 'Fully remote role' });
check('US alias is remote and US-wide', usAlias.remote === 'remote' && usAlias.ca === 'us_wide');

if (failures) {
  console.error(`${failures} location check(s) failed`);
  process.exit(1);
}
console.log('All location checks passed.');
