import type { Capture } from './types';
import { exportFilename } from '../util/format';
import { logEvent } from '../diagnostics/log';

/** Minimal File System Access types (not yet in TypeScript's DOM lib). */
export type PermissionStateLike = 'granted' | 'prompt' | 'denied';
export interface WritableLike {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  createWritable(): Promise<WritableLike>;
}
export interface DirHandleLike {
  readonly name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionStateLike>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionStateLike>;
}
type PickerFn = (opts: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<DirHandleLike>;

/** What the album needs from the rest of the app (an interface, so it can be tested without a phone). */
export interface AlbumDeps {
  loadHandle(): Promise<DirHandleLike | undefined>;
  saveHandle(h: DirHandleLike | null): Promise<void>;
  listCaptures(): Promise<Capture[]>;
  blob(key: string | undefined): Promise<Blob | undefined>;
  markSaved(id: string, at: string): Promise<void>;
  /** ISO time the album was turned on; only captures from then on are auto-saved. */
  since(): string | null;
  setSince(iso: string | null): void;
  saveOriginals(): boolean;
  /** Optional transform before writing (e.g. adding EXIF). */
  decorate?(blob: Blob, c: Capture, which: 'output' | 'original'): Promise<Blob>;
  /** True while a capture should wait (e.g. its GPS fix hasn't arrived yet). */
  defer?(c: Capture): boolean;
}

export type AlbumState =
  | { status: 'unsupported' }
  | { status: 'off' }
  | { status: 'ready' | 'needs-permission' | 'denied'; folder: string };

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function extFor(type: string | undefined): string {
  return EXT[(type ?? '').toLowerCase()] ?? 'jpg';
}

/** tremuloides_YYYYMMDD_HHMMSS_<lens>_<id6>.jpg and …_original.<ext> */
export function albumFilenames(c: Capture, originalType?: string): { output: string; original: string } {
  const base = exportFilename(new Date(c.createdAt), c.lensId, extFor(c.outputType)).replace(/\.[a-z0-9]+$/, '');
  const tag = c.id.slice(-6).toLowerCase();
  return {
    output: `${base}_${tag}.${extFor(c.outputType)}`,
    original: `${base}_${tag}_original.${extFor(originalType)}`,
  };
}

/** Captures that should be in the album but aren't yet (oldest first). */
export function pendingCaptures(caps: readonly Capture[], since: string | null): Capture[] {
  if (!since) return [];
  // Plain imports (Original lens) are already on the phone; only renders made from them are copied.
  return caps.filter((c) => !c.albumSavedAt && c.createdAt >= since && !(c.source === 'import' && c.lensId === 'original')).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/**
 * Writes each capture (lens version + original) as normal image files into a folder the user
 * picked once (e.g. Pictures/Tremuloides), so they show up in Google Photos and the Files app.
 * Uses the File System Access API (Chrome on Android 132+). Everything is best-effort: the
 * in-app copy is always kept, and anything not yet written is retried on the next sync.
 */
/**
 * The browser's folder picker, bound to window. Calling the bare function with any other
 * `this` (e.g. as `this.picker(...)`) throws "Illegal invocation" in Chrome.
 */
export function nativePicker(scope: unknown = globalThis): PickerFn | undefined {
  const fn = (scope as { showDirectoryPicker?: PickerFn }).showDirectoryPicker;
  return typeof fn === 'function' ? (fn.bind(scope) as PickerFn) : undefined;
}

export class PhoneAlbum {
  private handle: DirHandleLike | null = null;
  private loaded = false;
  private syncing: Promise<number> | null = null;
  private again = false;
  private listeners = new Set<() => void>();
  lastError: string | null = null;
  savedThisSession = 0;

  constructor(
    private readonly deps: AlbumDeps,
    private readonly picker: PickerFn | undefined = nativePicker(),
  ) {}

  get supported(): boolean {
    return typeof this.picker === 'function';
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private async load(): Promise<DirHandleLike | null> {
    if (!this.loaded) {
      this.loaded = true;
      try {
        this.handle = (await this.deps.loadHandle()) ?? null;
      } catch (e) {
        logEvent('warn', 'album', 'Could not load album folder', e);
      }
    }
    return this.handle;
  }

  async state(): Promise<AlbumState> {
    if (!this.supported) return { status: 'unsupported' };
    const h = await this.load();
    if (!h) return { status: 'off' };
    const p = (await h.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt' as const)) ?? 'granted';
    return { status: p === 'granted' ? 'ready' : p === 'denied' ? 'denied' : 'needs-permission', folder: h.name };
  }

  /** Opens the folder picker (needs a tap). Turns the album on from now. */
  async choose(): Promise<AlbumState> {
    if (!this.picker) return { status: 'unsupported' };
    const h = await this.picker({ id: 'tremuloides-album', mode: 'readwrite', startIn: 'pictures' });
    this.handle = h;
    this.loaded = true;
    await this.deps.saveHandle(h);
    if (!this.deps.since()) this.deps.setSince(new Date().toISOString());
    logEvent('info', 'album', `Album folder set: ${h.name}`);
    this.emit();
    void this.sync();
    return this.state();
  }

  async turnOff(): Promise<void> {
    this.handle = null;
    this.loaded = true;
    await this.deps.saveHandle(null);
    this.deps.setSince(null);
    this.emit();
  }

  /**
   * Call from a tap (shutter, Render & save). If Android wants folder access re-approved,
   * this shows the one-tap prompt while the tap still counts as a user gesture.
   */
  async ensurePermission(): Promise<boolean> {
    const h = await this.load();
    if (!h) return false;
    try {
      const p = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
      if (p === 'granted') return true;
      if (p === 'denied') return false;
      const r = (await h.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
      this.emit();
      if (r === 'granted') {
        void this.sync();
        return true;
      }
    } catch (e) {
      logEvent('warn', 'album', 'Folder permission request failed', e);
    }
    return false;
  }

  /** Copies every capture since `since` (or all, for "copy existing photos") that isn't in the album yet. */
  sync(opts: { all?: boolean } = {}): Promise<number> {
    if (this.syncing) {
      this.again = true;
      return this.syncing;
    }
    this.syncing = (async () => {
      let total = 0;
      try {
        do {
          this.again = false;
          total += await this.syncOnce(opts.all === true);
        } while (this.again);
      } finally {
        this.syncing = null;
        this.emit();
      }
      return total;
    })();
    return this.syncing;
  }

  private async syncOnce(all: boolean): Promise<number> {
    const h = await this.load();
    if (!h) return 0;
    const p = (await h.queryPermission?.({ mode: 'readwrite' }).catch(() => 'prompt' as const)) ?? 'granted';
    if (p !== 'granted') return 0;
    const caps = await this.deps.listCaptures();
    const pending = pendingCaptures(caps, all ? '0000' : this.deps.since());
    const todo = pending.filter((c) => !this.deps.defer?.(c));
    if (todo.length < pending.length) setTimeout(() => void this.sync(), 10_000); // retry once GPS arrives
    let n = 0;
    for (const c of todo) {
      try {
        await this.writeCapture(h, c);
        await this.deps.markSaved(c.id, new Date().toISOString());
        n++;
        this.savedThisSession++;
        this.lastError = null;
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
        logEvent('warn', 'album', `Could not write ${c.id} to the album`, e);
        break; // folder gone or permission lost: retry on the next sync
      }
    }
    return n;
  }

  private async writeCapture(h: DirHandleLike, c: Capture): Promise<void> {
    const decorate = this.deps.decorate ?? (async (b: Blob) => b);
    const rawOut = await this.deps.blob(c.outputKey);
    const rawOrig = this.deps.saveOriginals() ? await this.deps.blob(c.originalKey) : undefined;
    const output = rawOut ? await decorate(rawOut, c, 'output') : undefined;
    const original = rawOrig ? await decorate(rawOrig, c, 'original') : undefined;
    const names = albumFilenames(c, original?.type);
    if (output) await writeFile(h, names.output, output);
    if (original) await writeFile(h, names.original, original);
  }
}

async function writeFile(dir: DirHandleLike, name: string, blob: Blob): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(blob);
  } finally {
    await w.close();
  }
}
