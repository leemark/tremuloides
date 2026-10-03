import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { MIGRATIONS, SCHEMA_VERSION, openAppDB, type Migration } from '../src/storage/db';
import { CaptureStore } from '../src/storage/captures';
import type { Capture } from '../src/storage/types';

let n = 0;
const uniqueName = () => `test-db-${++n}-${Math.random()}`;

function meta(id: string, createdAt: string): Omit<Capture, 'originalKey' | 'outputKey' | 'thumbKey'> {
  return {
    id,
    createdAt,
    source: 'camera',
    outputType: 'image/jpeg',
    lensId: 'posterize',
    lensVersion: 1,
    params: { levels: 5 },
    seed: 1,
    width: 4,
    height: 3,
    appVersion: '0.1.0',
  };
}

// Small stand-ins for Blobs: fake-indexeddb clones values, and this keeps tests independent of Blob support.
const blobLike = (s: string) => s as unknown as Blob;

describe('storage', () => {
  it('schema version equals the number of migrations', () => {
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('saves, lists newest-first, tags location, and deletes with blobs', async () => {
    const name = uniqueName();
    const store = new CaptureStore(() => openAppDB(name));
    await store.save(meta('A', '2026-10-02T10:00:00.000Z'), { output: blobLike('out-a'), thumb: blobLike('th-a'), original: blobLike('or-a') });
    await store.save(meta('B', '2026-10-02T11:00:00.000Z'), { output: blobLike('out-b'), thumb: blobLike('th-b') });

    const list = await store.list();
    expect(list.map((c) => c.id)).toEqual(['B', 'A']);
    expect(list[1]?.originalKey).toBe('A:orig');
    expect(list[0]?.originalKey).toBeUndefined();
    expect((await store.latest())?.id).toBe('B');
    expect(await store.blob('A:out')).toBe('out-a');

    await store.setGeo('A', { lat: 37.9, lon: -107.7, accuracy: 5, altitude: 3000, altitudeAccuracy: 10, at: '2026-10-02T10:00:05.000Z' });
    expect((await store.get('A'))?.geo?.altitude).toBe(3000);

    await store.delete('A');
    expect(await store.count()).toBe(1);
    expect(await store.blob('A:out')).toBeUndefined();
    expect(await store.blob('A:orig')).toBeUndefined();
  });

  it('keeps the diagnostics log as a ring buffer of 200', async () => {
    const name = uniqueName();
    const store = new CaptureStore(() => openAppDB(name));
    for (let i = 0; i < 205; i++) await store.addLog({ t: `t${i}`, level: 'info', source: 'test', message: `m${i}` });
    const logs = await store.logs();
    expect(logs).toHaveLength(200);
    expect(logs[0]?.message).toBe('m204');
    expect(logs[199]?.message).toBe('m5');
  });

  it('upgrades an existing v1 database without losing captures', async () => {
    const name = uniqueName();
    const v1 = await openAppDB(name, MIGRATIONS.slice(0, 1));
    await v1.put('captures', { ...meta('KEEP', '2026-10-01T00:00:00.000Z'), outputKey: 'KEEP:out', thumbKey: 'KEEP:thumb' });
    v1.close();

    // A hypothetical future additive migration (v2) adds a store.
    const v2Migration: Migration = (db) => {
      (db as unknown as IDBDatabase).createObjectStore('future');
    };
    const upgraded = await openAppDB(name, [...MIGRATIONS.slice(0, 1), v2Migration]);
    expect(upgraded.version).toBe(2);
    expect(await upgraded.get('captures', 'KEEP')).toBeDefined();
    expect([...upgraded.objectStoreNames]).toContain('future');
    upgraded.close();
  });

  it('upgrades v1 to the current schema (adds kv) without losing captures', async () => {
    const name = uniqueName();
    const v1 = await openAppDB(name, MIGRATIONS.slice(0, 1));
    await v1.put('captures', { ...meta('OLD', '2026-10-01T00:00:00.000Z'), outputKey: 'OLD:out', thumbKey: 'OLD:thumb' });
    v1.close();
    const store = new CaptureStore(() => openAppDB(name));
    expect((await store.get('OLD'))?.id).toBe('OLD');
    await store.kvSet('albumDir', { name: 'Tremuloides' });
    expect(await store.kvGet<{ name: string }>('albumDir')).toEqual({ name: 'Tremuloides' });
    await store.setAlbumSaved('OLD', '2026-10-02T00:00:00.000Z');
    expect((await store.get('OLD'))?.albumSavedAt).toBe('2026-10-02T00:00:00.000Z');
  });

  it('runs every migration on a fresh database', async () => {
    const name = uniqueName();
    const db = await openAppDB(name);
    expect([...db.objectStoreNames].sort()).toEqual(['blobs', 'captures', 'kv', 'logs']);
    db.close();
    const raw = await openDB(name);
    expect(raw.version).toBe(SCHEMA_VERSION);
    raw.close();
  });
});
