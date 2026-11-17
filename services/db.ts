import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// Single shared IndexedDB for all record collections. Both
// services/records.local.ts and services/weight.local.ts use this module so
// the schema is created exactly once, regardless of which module opens the
// database first.

export const DB_NAME = 'bp-app';
export const DB_VERSION = 3;

type BPDB = DBSchema & {
  // Blood pressure collection
  records: {
    key: string;
    value: { id: string; recordedAt: string; systolic: number; diastolic: number };
    indexes: { 'by-recordedAt': string };
  };
  pending: {
    key: string;
    value: { id: string };
  };
  deletions: {
    key: string;
    value: { id: string };
  };
  // Weight collection
  weight: {
    key: string;
    value: { id: string; recordedAt: string; weight: number };
    indexes: { 'by-recordedAt': string };
  };
  weightPending: {
    key: string;
    value: { id: string };
  };
  weightDeletions: {
    key: string;
    value: { id: string };
  };
};

let dbPromise: Promise<IDBPDatabase<BPDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<BPDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BPDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('records')) {
          const records = db.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('by-recordedAt', 'recordedAt');
        }
        if (!db.objectStoreNames.contains('pending')) {
          db.createObjectStore('pending', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('deletions')) {
          db.createObjectStore('deletions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('weight')) {
          const weight = db.createObjectStore('weight', { keyPath: 'id' });
          weight.createIndex('by-recordedAt', 'recordedAt');
        }
        if (!db.objectStoreNames.contains('weightPending')) {
          db.createObjectStore('weightPending', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('weightDeletions')) {
          db.createObjectStore('weightDeletions', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}
