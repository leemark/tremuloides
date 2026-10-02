/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { latestChangelogEntry } from './src/util/changelog.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
const rawBase = process.env.BASE_PATH ?? '/';
const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

function readChangelog(): string {
  try {
    return readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8');
  } catch {
    return '';
  }
}

const build = {
  version: pkg.version,
  sha: gitSha(),
  date: new Date().toISOString(),
};
const whatsNew = latestChangelogEntry(readChangelog());

/** Emits version.json so a running app can show which version an update contains. */
function versionJson(): Plugin {
  return {
    name: 'tremuloides-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build) });
    },
  };
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(build.version),
    __BUILD_SHA__: JSON.stringify(build.sha),
    __BUILD_DATE__: JSON.stringify(build.date),
    __WHATS_NEW__: JSON.stringify(whatsNew),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  plugins: [
    versionJson(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false, // already covered by globPatterns
      manifest: {
        id: base,
        name: 'Tremuloides',
        short_name: 'Tremuloides',
        description: 'Offline camera with algorithmic photo lenses.',
        lang: 'en',
        theme_color: '#0e0f11',
        background_color: '#0e0f11',
        display: 'standalone',
        orientation: 'any',
        scope: base,
        start_url: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        // Bust-parameter version checks (version.json?t=…) must go to the network, not the precache.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
