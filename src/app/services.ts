import { Renderer } from '../gl/renderer';
import { CaptureStore } from '../storage/captures';
import { SettingsStore } from '../storage/settings';
import { PwaManager } from '../pwa/pwa';
import { Busy } from './busy';
import { CaptureQueue } from './queue';
import { logEvent, errorMessage } from '../diagnostics/log';

export interface DiagState {
  camera: Record<string, unknown> | null;
  fps: number;
  previewScale: number;
  lensId: string;
}

export interface Services {
  renderer: Renderer | null;
  rendererError: string | null;
  store: CaptureStore;
  settings: SettingsStore;
  pwa: PwaManager;
  busy: Busy;
  queue: CaptureQueue;
  diag: DiagState;
}

export function createServices(): Services {
  const settings = new SettingsStore();
  let renderer: Renderer | null = null;
  let rendererError: string | null = null;
  try {
    renderer = new Renderer();
  } catch (e) {
    rendererError = errorMessage(e);
    logEvent('error', 'gl', 'Renderer unavailable', e);
  }
  return {
    renderer,
    rendererError,
    store: new CaptureStore(),
    settings,
    pwa: new PwaManager(settings),
    busy: new Busy(),
    queue: new CaptureQueue(),
    diag: { camera: null, fps: 0, previewScale: 0, lensId: settings.get().currentLens },
  };
}
