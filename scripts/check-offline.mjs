#!/usr/bin/env node
// Fails the build if the app would need the network at runtime, or if the
// service worker's precache list misses any file the app needs offline.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk(DIST).map((p) => relative(DIST, p).split(sep).join('/'));
} catch {
  console.error('check:offline: dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

// 1. No external URLs in shipped text assets (except non-fetching identifiers).
const ALLOWED = [
  /^http:\/\/www\.w3\.org\//, // SVG / XML namespaces
  /^http:\/\/www\.inkscape\.org\/namespaces\/inkscape$/, // SVG layer namespace in Topo exports (not fetched)
  /^https?:\/\/github\.com\/leemark\/tremuloides/, // project link (not fetched)
  /^https:\/\/bit\.ly\/wb-/, // Workbox console-warning doc links (never fetched)
];
const TEXT = /\.(html|js|mjs|css|webmanifest|json|svg)$/;
const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/g;
for (const f of files.filter((f) => TEXT.test(f))) {
  const text = readFileSync(join(DIST, f), 'utf8');
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    if (!ALLOWED.some((re) => re.test(url))) problems.push(`external URL in ${f}: ${url}`);
  }
}

// 2. Precache manifest covers every file the app needs.
const sw = files.includes('sw.js') ? readFileSync(join(DIST, 'sw.js'), 'utf8') : null;
if (!sw) {
  problems.push('dist/sw.js is missing (service worker not generated)');
} else {
  const precached = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));
  const required = files.filter(
    (f) =>
      f === 'index.html' ||
      f === 'manifest.webmanifest' ||
      (f.startsWith('assets/') && /\.(js|css)$/.test(f)) ||
      /worker/i.test(f) ||
      f.startsWith('icons/') ||
      f === 'icon.svg',
  );
  for (const f of required) if (!precached.has(f)) problems.push(`not precached: ${f}`);
  if (precached.size === 0) problems.push('precache manifest is empty');
  console.log(`check:offline: ${precached.size} files precached, ${required.length} required.`);
}

if (problems.length) {
  console.error('check:offline FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('check:offline: OK (no runtime network dependencies, precache complete)');
