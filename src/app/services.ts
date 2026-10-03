import { Renderer } from '../gl/renderer';
import { CaptureStore } from '../storage/captures';
import { SettingsStore } from '../storage/settings';
import { PwaManager } from '../pwa/pwa';
import { Busy } from './busy';
import { CaptureQueue } from './queue';
import { FieldLogService } from '../fieldlog/service';
import { PhoneAlbum, type DirHandleLike } from '../storage/album';
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
  fieldlog: FieldLogService;
  album: PhoneAlbum;
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
  const store = new CaptureStore();
  return {
    renderer,
    rendererError,
    store,
    fieldlog: new FieldLogService(store),
    album: new PhoneAlbum({
      loadHandle: () => store.kvGet<DirHandleLike>('albumDir'),
      saveHandle: (h) => (h ? store.kvSet('albumDir', h) : store.kvDelete('albumDir')),
      listCaptures: () => store.list(),
      blob: (k) => store.blob(k),
      markSaved: (id, at) => store.setAlbumSaved(id, at),
      since: () => settings.flag('albumSince') || null,
      setSince: (iso) => settings.setFlag('albumSince', iso ?? ''),
      saveOriginals: () => settings.get().albumOriginals,
    }),
    settings,
    pwa: new PwaManager(settings),
    busy: new Busy(),
    queue: new CaptureQueue(),
    diag: { camera: null, fps: 0, previewScale: 0, lensId: settings.get().currentLens },
  };
}
