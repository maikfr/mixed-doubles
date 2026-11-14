import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dir = new URL('../dist/web/browser/', import.meta.url);
const path = new URL('index.html', dir);
let html = readFileSync(path, 'utf8');
const root = dirname(path.pathname);
html = html.replace(
  /<link rel="stylesheet" href="([^"]+)"[^>]*>/g,
  (_, file) => `<style>${readFileSync(join(root, file), 'utf8')}</style>`,
);
html = html.replace(
  /<script src="([^"]+)" type="module"><\/script>/g,
  (_, file) => `<script type="module">${readFileSync(join(root, file), 'utf8')}</script>`,
);
if (/<script src=|<link rel="stylesheet" href=/.test(html)) {
  throw new Error('Not all Angular assets were embedded.');
}
const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
const thirdPartyLicenses = readFileSync(
  new URL('../dist/web/3rdpartylicenses.txt', import.meta.url),
  'utf8',
);
const notices = `${license}\nThird-party licenses\n\n${thirdPartyLicenses}`;
if (notices.includes('-->'))
  throw new Error('License notices cannot be embedded in an HTML comment.');
html = html.replace(/<!doctype html>/i, (doctype) => `${doctype}\n<!--\n${notices}\n-->`);
writeFileSync(new URL('../dist/offline.html', import.meta.url), html);
console.log('Offline browser app: dist/offline.html');
