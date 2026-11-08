import { buildIdFromDocument, buildIdFromHtml, reloadIfBuildChanged } from '../client/src/buildVersion';

function check(name: string, condition: boolean): void {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) process.exitCode = 1;
}

const sampleHtml = '<script src="/assets/main-a.js"></script>'
  + '<script src="/assets/app-b.js"></script>'
  + '<link rel="stylesheet" href="/assets/screen-c.css">';
const sampleDocument = {
  querySelectorAll(selector: string) {
    const urls = selector === 'script[src]'
      ? ['/assets/main-a.js', '/assets/app-b.js']
      : ['/assets/screen-c.css'];
    return urls.map((url) => ({ getAttribute: () => url }));
  },
} as unknown as Document;
check('server build id includes sorted JavaScript and CSS asset basenames',
  buildIdFromHtml(sampleHtml) === 'app-b.js+main-a.js+screen-c.css');
check('client document build id matches the server HTML build id',
  buildIdFromDocument(sampleDocument) === buildIdFromHtml(sampleHtml));
check('client document has no build id when no assets are present',
  buildIdFromDocument({ querySelectorAll: () => [] } as unknown as Document) === null);

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
