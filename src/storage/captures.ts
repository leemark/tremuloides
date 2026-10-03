import type { IDBPDatabase } from 'idb';
import { getDB, type TremDB } from './db';
import type { Capture, FieldLogData, GeoTag } from './types';
import type { LogEntry } from '../diagnostics/log';

export interface NewCaptureBlobs {
  original?: Blob;
  output: Blob;
  thumb: Blob;
}

const MAX_LOGS = 200;

/** All persistence for captures, their blobs, and the diagnostics log. */
export class CaptureStore {
  constructor(private readonly db: () => Promise<IDBPDatabase<TremDB>> = getDB) {}

  async save(meta: Omit<Capture, 'originalKey' | 'outputKey' | 'thumbKey'>, blobs: NewCaptureBlobs): Promise<Capture> {
    const db = await this.db();
    const capture: Capture = {
      ...meta,
      outputKey: `${meta.id}:out`,
      thumbKey: `${meta.id}:thumb`,
      ...(blobs.original ? { originalKey: `${meta.id}:orig` } : {}),
    };
    const tx = db.transaction(['captures', 'blobs'], 'readwrite');
    const writes: Promise<unknown>[] = [
      tx.objectStore('blobs').put(blobs.output, capture.outputKey),
      tx.objectStore('blobs').put(blobs.thumb, capture.thumbKey),
      tx.objectStore('captures').put(capture),
    ];
    if (blobs.original && capture.originalKey) writes.push(tx.objectStore('blobs').put(blobs.original, capture.originalKey));
    await Promise.all([...writes, tx.done]);
    return capture;
  }

  /** Newest first. */
  async list(): Promise<Capture[]> {
    const db = await this.db();
    const all = await db.getAllFromIndex('captures', 'createdAt');
    return all.reverse();
  }

  async get(id: string): Promise<Capture | undefined> {
    return (await this.db()).get('captures', id);
  }

  async latest(): Promise<Capture | undefined> {
    const db = await this.db();
    const cursor = await db.transaction('captures').store.index('createdAt').openCursor(null, 'prev');
    return cursor?.value;
  }

  async count(): Promise<number> {
    return (await this.db()).count('captures');
  }

  async blob(key: string | undefined): Promise<Blob | undefined> {
    if (!key) return undefined;
    return (await this.db()).get('blobs', key);
  }

  async setGeo(id: string, geo: GeoTag): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('captures', 'readwrite');
    const c = await tx.store.get(id);
    if (c) await tx.store.put({ ...c, geo });
    await tx.done;
  }

  async setAlbumSaved(id: string, at: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('captures', 'readwrite');
    const c = await tx.store.get(id);
    if (c) await tx.store.put({ ...c, albumSavedAt: at });
    await tx.done;
  }

  async kvGet<T>(key: string): Promise<T | undefined> {
    return (await (await this.db()).get('kv', key)) as T | undefined;
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    await (await this.db()).put('kv', value, key);
  }

  async kvDelete(key: string): Promise<void> {
    await (await this.db()).delete('kv', key);
  }

  async setFieldlog(id: string, fieldlog: FieldLogData): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('captures', 'readwrite');
    const c = await tx.store.get(id);
    if (c) await tx.store.put({ ...c, fieldlog });
    await tx.done;
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['captures', 'blobs'], 'readwrite');
    const c = await tx.objectStore('captures').get(id);
    if (c) {
      const keys = [c.outputKey, c.thumbKey, c.originalKey].filter((k): k is string => !!k);
      await Promise.all(keys.map((k) => tx.objectStore('blobs').delete(k)));
      await tx.objectStore('captures').delete(id);
    }
    await tx.done;
  }

  async deleteAll(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['captures', 'blobs'], 'readwrite');
    await Promise.all([tx.objectStore('captures').clear(), tx.objectStore('blobs').clear(), tx.done]);
  }

  async addLog(entry: LogEntry): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('logs', 'readwrite');
    await tx.store.add(entry);
    const n = await tx.store.count();
    if (n > MAX_LOGS) {
      let cursor = await tx.store.openCursor();
      let excess = n - MAX_LOGS;
      while (cursor && excess > 0) {
        await cursor.delete();
        excess--;
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  }

  /** Newest first. */
  async logs(): Promise<LogEntry[]> {
    const all = await (await this.db()).getAll('logs');
    return all.reverse();
  }

  async clearLogs(): Promise<void> {
    await (await this.db()).clear('logs');
  }
}
