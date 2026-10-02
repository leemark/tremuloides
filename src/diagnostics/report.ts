import type { Services } from '../app/services';
import { imageCaptureSupported } from '../camera/camera';
import { APP_VERSION, BUILD_DATE, BUILD_SHA } from '../version';
import { SCHEMA_VERSION } from '../storage/db';

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function storageInfo(): Promise<StorageInfo> {
  const s = navigator.storage;
  const est = await s?.estimate?.().catch(() => null);
  const persisted = await s?.persisted?.().catch(() => null);
  return { usage: est?.usage ?? null, quota: est?.quota ?? null, persisted: persisted ?? null };
}

/** Compact JSON report for pasting into a bug report. */
export async function buildReport(s: Services): Promise<Record<string, unknown>> {
  const [storage, captures, logs] = await Promise.all([
    storageInfo(),
    s.store.count().catch(() => null),
    s.store.logs().catch(() => []),
  ]);
  return {
    app: { version: APP_VERSION, sha: BUILD_SHA, built: BUILD_DATE, schema: SCHEMA_VERSION },
    device: {
      userAgent: navigator.userAgent,
      screen: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
      viewport: `${innerWidth}×${innerHeight}`,
      standalone: matchMedia('(display-mode: standalone)').matches,
      online: navigator.onLine,
    },
    gl: s.renderer?.info() ?? { error: s.rendererError },
    camera: s.diag.camera,
    imageCaptureSupported: imageCaptureSupported(),
    preview: {
      lens: s.diag.lensId,
      size: s.renderer?.lastPreviewSize,
      scale: Number(s.diag.previewScale.toFixed(2)),
      fps: Number(s.diag.fps.toFixed(1)),
    },
    temporal: s.renderer?.temporalInfo() ?? null,
    storage: { ...storage, captures },
    serviceWorker: s.pwa.serviceWorkerState,
    offlineReady: s.pwa.offlineReady,
    settings: s.settings.get(),
    recentLogs: logs.slice(0, 30),
  };
}
