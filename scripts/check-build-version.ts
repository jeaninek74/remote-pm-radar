import { reloadIfBuildChanged } from '../client/src/buildVersion';

function check(name: string, condition: boolean): void {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) process.exitCode = 1;
}

let reloads = 0;
const reload = () => { reloads += 1; };
check('first build id establishes a baseline without reloading',
  !reloadIfBuildChanged(null, 'bundle-a.js', false, reload) && reloads === 0);
check('unchanged build id does not reload',
  !reloadIfBuildChanged('bundle-a.js', 'bundle-a.js', false, reload) && reloads === 0);
check('changed build id calls reload',
  reloadIfBuildChanged('bundle-a.js', 'bundle-b.js', false, reload) && reloads === 1);
check('changed build id waits while an overlay or input is active',
  !reloadIfBuildChanged('bundle-a.js', 'bundle-b.js', true, reload) && reloads === 1);
check('a deferred build change reloads on the next clear poll',
  reloadIfBuildChanged('bundle-a.js', 'bundle-b.js', false, reload) && reloads === 2);
