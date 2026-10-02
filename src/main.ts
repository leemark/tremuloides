import './styles.css';
import { App } from './app/app';
import { createServices } from './app/services';
import { showBanner, toast } from './app/ui';
import { installGlobalErrorHandlers, logEvent, setLogSink } from './diagnostics/log';
import { APP_VERSION, VERSION_LABEL, WHATS_NEW } from './version';
import { formatVersion } from './util/format';

installGlobalErrorHandlers();
const services = createServices();
setLogSink((entry) => {
  void services.store.addLog(entry).catch(() => undefined);
});
logEvent('info', 'app', `Started ${VERSION_LABEL}`);

// Ask the browser not to evict our data (installed PWAs are usually granted this).
void navigator.storage
  ?.persist?.()
  .then((granted) => logEvent('info', 'storage', `Persistent storage ${granted ? 'granted' : 'not granted'}`))
  .catch(() => undefined);

// ---------- Offline + updates ----------
const pwa = services.pwa;
let removeBanner: (() => void) | null = null;
let bannerDismissed = false;

async function showUpdateBanner() {
  if (!pwa.needRefresh || removeBanner || bannerDismissed) return;
  if (services.busy.active) return; // re-checked when the busy state clears
  const remote = await pwa.remoteVersion();
  if (removeBanner || services.busy.active) return;
  const label = remote ? `Update ready: ${formatVersion(remote.version, remote.sha)}` : 'Update ready';
  removeBanner = showBanner(
    label,
    'Reload',
    () => {
      if (services.busy.active) {
        toast('Finishing a render first…');
        return;
      }
      void pwa.applyUpdate();
    },
    () => {
      removeBanner = null;
      bannerDismissed = true;
    },
  );
}

pwa.on('need-refresh', () => {
  bannerDismissed = false;
  void showUpdateBanner();
});
pwa.on('offline-ready', () => toast('✓ Ready to work offline', { duration: 4000 }));
services.busy.onChange((busy) => {
  if (!busy) void showUpdateBanner();
});
pwa.init();

// ---------- What's new (first launch after an update) ----------
const lastSeen = services.settings.flag('lastSeenVersion');
if (lastSeen && lastSeen !== APP_VERSION && WHATS_NEW && WHATS_NEW.version === APP_VERSION) {
  const first = WHATS_NEW.notes[0];
  setTimeout(() => toast(`Updated to v${APP_VERSION}${first ? `: ${first}` : ''}`, { duration: 6000 }), 800);
}
services.settings.setFlag('lastSeenVersion', APP_VERSION);

// ---------- One-time: Ink & Wash becomes the default lens (v0.2.0) ----------
if (services.settings.flag('defaultLens') !== 'ink-wash') {
  services.settings.set('currentLens', 'ink-wash');
  services.settings.setFlag('defaultLens', 'ink-wash');
}
services.diag.lensId = services.settings.get().currentLens;

// ---------- Start ----------
const root = document.getElementById('app');
if (root) new App(root, services).start();
