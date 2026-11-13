import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
writeFileSync(new URL('../dist/offline.html', import.meta.url), html);
const releaseDir = new URL('../release/', import.meta.url);
mkdirSync(releaseDir, { recursive: true });
writeFileSync(new URL('offline.html', releaseDir), html);
console.log('Offline browser app: dist/offline.html and release/offline.html');
