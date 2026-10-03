import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type { Capture } from './types';
import type { LogEntry } from '../diagnostics/log';

export const DB_NAME = 'tremuloides';

export interface TremDB extends DBSchema {
  captures: { key: string; value: Capture; indexes: { createdAt: string } };
  blobs: { key: string; value: Blob };
  logs: { key: number; value: LogEntry };
  /** Small structured values that can't live in localStorage (e.g. directory handles). */
  kv: { key: string; value: unknown };
}

export type UpgradeTx = IDBPTransaction<TremDB, StoreNames<TremDB>[], 'versionchange'>;

/**
 * Migration n upgrades the database from version n-1 to n.
 * Rules: additive only. Never delete stores or captures. Each migration gets a test.
 */
export type Migration = (db: IDBPDatabase<TremDB>, tx: UpgradeTx) => void;

export const MIGRATIONS: readonly Migration[] = [
  // v1: initial schema
  (db) => {
    const captures = db.createObjectStore('captures', { keyPath: 'id' });
    captures.createIndex('createdAt', 'createdAt');
    db.createObjectStore('blobs');
    db.createObjectStore('logs', { autoIncrement: true });
  },
  // v2: key/value store for the phone album folder handle
  (db) => {
    db.createObjectStore('kv');
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Opens the database, running every migration between the stored version and the latest. */
export function openAppDB(
  name: string = DB_NAME,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<IDBPDatabase<TremDB>> {
  return openDB<TremDB>(name, migrations.length, {
    upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? migrations.length;
      for (let v = oldVersion + 1; v <= target; v++) {
        const migrate = migrations[v - 1];
        if (migrate) migrate(db, tx);
      }
    },
    blocked() {
      // Another tab holds an older version open. It will reload on its versionchange event.
    },
    blocking() {
      // A newer version of the app wants to upgrade: close so it can proceed.
      void dbPromise?.then((d) => d.close());
    },
  });
}

let dbPromise: Promise<IDBPDatabase<TremDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<TremDB>> {
  dbPromise ??= openAppDB();
  return dbPromise;
}

/** For tests only. */
export function resetDBForTests(): void {
  dbPromise = null;
}
