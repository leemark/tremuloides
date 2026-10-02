import { registerSW } from 'virtual:pwa-register';
import { logEvent } from '../diagnostics/log';
import type { SettingsStore } from '../storage/settings';

export type UpdateCheckResult = 'up-to-date' | 'downloading' | 'ready' | 'offline' | 'unsupported' | 'error';

export interface RemoteVersion {
  version: string;
  sha: string;
  date: string;
}

type PwaEvent = 'need-refresh' | 'offline-ready';

/** Service worker registration, offline-ready status and the prompt-to-update flow. */
export class PwaManager {
  needRefresh = false;
  private registration: ServiceWorkerRegistration | null = null;
  private updateSW: ((reload?: boolean) => Promise<void>) | null = null;
  private listeners = new Map<PwaEvent, Set<() => void>>();
  private lastAutoCheck = 0;

  constructor(private readonly settings: SettingsStore) {}

  init(): void {
    if (!('serviceWorker' in navigator)) {
      logEvent('warn', 'pwa', 'Service workers are not supported; offline mode unavailable');
      return;
    }
    this.updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        this.needRefresh = true;
        logEvent('info', 'pwa', 'Update downloaded and waiting');
        this.emit('need-refresh');
      },
      onOfflineReady: () => {
        this.settings.setFlag('offlineReady', '1');
        logEvent('info', 'pwa', 'App cached for offline use');
        this.emit('offline-ready');
      },
      onRegisteredSW: (_url, r) => {
        this.registration = r ?? null;
      },
      onRegisterError: (e: unknown) => logEvent('error', 'pwa', 'Service worker registration failed', e),
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.autoCheck();
    });
  }

  on(event: PwaEvent, fn: () => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit(event: PwaEvent): void {
    for (const fn of this.listeners.get(event) ?? []) fn();
  }

  /** True once every app file has been cached at least once. */
  get offlineReady(): boolean {
    return this.settings.flag('offlineReady') === '1' && !!navigator.serviceWorker?.controller;
  }

  get serviceWorkerState(): string {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const r = this.registration;
    if (!r) return navigator.serviceWorker.controller ? 'controlled (registration pending)' : 'not registered';
    const parts = [
      `active: ${r.active?.state ?? 'none'}`,
      `waiting: ${r.waiting ? 'yes' : 'no'}`,
      `installing: ${r.installing ? 'yes' : 'no'}`,
      `controlled: ${navigator.serviceWorker.controller ? 'yes' : 'no'}`,
    ];
    return parts.join(', ');
  }

  private async autoCheck(): Promise<void> {
    const now = Date.now();
    if (now - this.lastAutoCheck < 60_000) return;
    this.lastAutoCheck = now;
    await this.checkForUpdate();
  }

  async checkForUpdate(): Promise<UpdateCheckResult> {
    if (!navigator.onLine) return 'offline';
    const r = this.registration;
    if (!r) return 'unsupported';
    try {
      await r.update();
    } catch (e) {
      if (!navigator.onLine) return 'offline';
      logEvent('warn', 'pwa', 'Update check failed', e);
      return 'error';
    }
    if (this.needRefresh || r.waiting) return 'ready';
    if (r.installing) return 'downloading';
    return 'up-to-date';
  }

  /** Version of the deployed build (network only; null when offline). */
  async remoteVersion(): Promise<RemoteVersion | null> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return (await res.json()) as RemoteVersion;
    } catch {
      return null;
    }
  }

  /** Activates the waiting service worker and reloads once it has taken control. */
  async applyUpdate(): Promise<void> {
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    };
    // workbox-window only reloads for updates it found itself; listen directly so updates
    // found by our own update checks reload too.
    navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
    const waiting = this.registration?.waiting;
    if (!waiting) {
      reload(); // already activated (e.g. by another tab)
      return;
    }
    waiting.postMessage({ type: 'SKIP_WAITING' });
    if (this.updateSW) await this.updateSW(true);
    setTimeout(reload, 4000); // safety net if controllerchange never arrives
  }
}
