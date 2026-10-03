import { describe, expect, it } from 'vitest';
import { PhoneAlbum, albumFilenames, extFor, pendingCaptures, type AlbumDeps, type DirHandleLike, type PermissionStateLike } from '../src/storage/album';
import type { Capture } from '../src/storage/types';

function cap(id: string, createdAt: string, extra: Partial<Capture> = {}): Capture {
  return {
    id, createdAt, source: 'camera', outputKey: `${id}:out`, thumbKey: `${id}:thumb`, originalKey: `${id}:orig`, outputType: 'image/jpeg',
    lensId: 'ink-wash', lensVersion: 2, params: {}, seed: 1, width: 1, height: 1, appVersion: '0.6.0', ...extra,
  };
}

class FakeDir implements DirHandleLike {
  files = new Map<string, Blob>();
  perm: PermissionStateLike = 'granted';
  grantOnRequest = true;
  failWrites = false;
  constructor(readonly name = 'Tremuloides') {}
  async getFileHandle(name: string) {
    return {
      createWritable: async () => {
        if (this.failWrites) throw new Error('folder gone');
        let data: Blob | null = null;
        return {
          write: async (b: Blob) => void (data = b),
          close: async () => void (data && this.files.set(name, data)),
        };
      },
    };
  }
  async queryPermission() {
    return this.perm;
  }
  async requestPermission() {
    if (this.grantOnRequest) this.perm = 'granted';
    return this.perm;
  }
}

function setup(caps: Capture[], opts: { since?: string | null; originals?: boolean; handle?: FakeDir | null } = {}) {
  let handle: DirHandleLike | undefined = opts.handle ?? undefined;
  let since = opts.since ?? null;
  const saved = new Map<string, string>();
  const deps: AlbumDeps = {
    loadHandle: async () => handle,
    saveHandle: async (h) => void (handle = h ?? undefined),
    listCaptures: async () => caps.map((c) => (saved.has(c.id) ? { ...c, albumSavedAt: saved.get(c.id) } : c)),
    blob: async (k) => (k ? new Blob([k], { type: k.endsWith(':orig') ? 'image/heic' : 'image/jpeg' }) : undefined),
    markSaved: async (id, at) => void saved.set(id, at),
    since: () => since,
    setSince: (iso) => void (since = iso),
    saveOriginals: () => opts.originals ?? true,
  };
  return { deps, saved, getSince: () => since, getHandle: () => handle };
}

describe('phone album', () => {
  it('names files by date, lens and id, with the original’s real extension', () => {
    const c = cap('01JABCDEFGHJKMNPQRSTVWXYZ9', new Date(2026, 9, 2, 16, 5, 9).toISOString());
    const n = albumFilenames(c, 'image/heic');
    expect(n.output).toBe('tremuloides_20261002_160509_ink-wash_vwxyz9.jpg');
    expect(n.original).toBe('tremuloides_20261002_160509_ink-wash_vwxyz9_original.heic');
    expect(extFor(undefined)).toBe('jpg');
  });

  it('only auto-saves captures from when the album was turned on', () => {
    const caps = [cap('a', '2026-10-02T10:00:00Z'), cap('b', '2026-10-02T12:00:00Z'), cap('c', '2026-10-02T13:00:00Z', { albumSavedAt: 'x' })];
    expect(pendingCaptures(caps, null)).toEqual([]);
    expect(pendingCaptures(caps, '2026-10-02T11:00:00Z').map((c) => c.id)).toEqual(['b']);
    expect(pendingCaptures(caps, '0000').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('writes the lens version and the original, then marks the capture saved', async () => {
    const dir = new FakeDir();
    const env = setup([cap('ID0001', '2026-10-02T12:00:00Z')], { since: '2026-10-02T00:00:00Z', handle: dir });
    const album = new PhoneAlbum(env.deps, async () => dir);
    expect(await album.sync()).toBe(1);
    expect([...dir.files.keys()].sort()).toEqual([expect.stringMatching(/_id0001\.jpg$/), expect.stringMatching(/_id0001_original\.heic$/)].sort());
    expect(env.saved.has('ID0001')).toBe(true);
    expect(await album.sync()).toBe(0); // nothing left
  });

  it('skips originals when that setting is off', async () => {
    const dir = new FakeDir();
    const env = setup([cap('ID0002', '2026-10-02T12:00:00Z')], { since: '2026-10-02T00:00:00Z', handle: dir, originals: false });
    await new PhoneAlbum(env.deps, async () => dir).sync();
    expect([...dir.files.keys()]).toHaveLength(1);
  });

  it('waits for permission, then catches up', async () => {
    const dir = new FakeDir();
    dir.perm = 'prompt';
    const env = setup([cap('ID0003', '2026-10-02T12:00:00Z')], { since: '2026-10-02T00:00:00Z', handle: dir });
    const album = new PhoneAlbum(env.deps, async () => dir);
    expect(await album.sync()).toBe(0);
    expect((await album.state()).status).toBe('needs-permission');
    expect(await album.ensurePermission()).toBe(true);
    await album.sync();
    expect(env.saved.has('ID0003')).toBe(true);
  });

  it('keeps going later if the folder fails, without marking anything saved', async () => {
    const dir = new FakeDir();
    dir.failWrites = true;
    const env = setup([cap('ID0004', '2026-10-02T12:00:00Z')], { since: '2026-10-02T00:00:00Z', handle: dir });
    const album = new PhoneAlbum(env.deps, async () => dir);
    expect(await album.sync()).toBe(0);
    expect(album.lastError).toBe('folder gone');
    expect(env.saved.size).toBe(0);
    dir.failWrites = false;
    expect(await album.sync()).toBe(1);
  });

  it('choosing a folder turns it on from now; turning off forgets it', async () => {
    const dir = new FakeDir('Pictures/Tremuloides');
    const env = setup([]);
    const album = new PhoneAlbum(env.deps, async () => dir);
    expect((await album.state()).status).toBe('off');
    const st = await album.choose();
    expect(st).toEqual({ status: 'ready', folder: 'Pictures/Tremuloides' });
    expect(env.getSince()).not.toBeNull();
    await album.turnOff();
    expect(env.getHandle()).toBeUndefined();
    expect((await album.state()).status).toBe('off');
  });

  it('reports unsupported browsers', async () => {
    const album = new PhoneAlbum(setup([]).deps, undefined);
    expect(album.supported).toBe(false);
    expect((await album.state()).status).toBe('unsupported');
  });
});
