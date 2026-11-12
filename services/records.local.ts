import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { BPRecord } from '~/shared/bp-record';
import { parseRecord, validateRecord } from '#shared/utils/record-validation';

// IndexedDB-backed local record cache, pending-sync queue, and deletion
// tombstones. All records (cached and pending) are stored in one 'records'
// store; the 'pending' store holds only the ids queued for sync, and
// 'deletions' holds tombstoned ids whose removal still needs to reach the
// server.

const DB_NAME = 'bp-app';
const DB_VERSION = 2;

type BPDB = DBSchema & {
  records: {
    key: string;
    value: BPRecord;
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
};

let dbPromise: Promise<IDBPDatabase<BPDB>> | null = null;

function getDb(): Promise<IDBPDatabase<BPDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BPDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('records')) {
          const records = db.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('by-recordedAt', 'recordedAt');
        }
        if (!db.objectStoreNames.contains('pending')) {
          db.createObjectStore('pending', { keyPath: 'id' });
        }
        if (!oldVersion || oldVersion < 2) {
          if (!db.objectStoreNames.contains('deletions')) {
            db.createObjectStore('deletions', { keyPath: 'id' });
          }
        }
      },
    });
  }
  return dbPromise;
}

// All current cached records (synced + pending).
export async function getLocalRecords(): Promise<BPRecord[]> {
  const db = await getDb();
  return (await db.getAll('records')).map(parseRecord);
}

// Get the id of every record queued for sync.
export async function getPendingIds(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('pending')) as string[];
}

export async function getPendingRecords(): Promise<BPRecord[]> {
  const db = await getDb();
  const tombstoned = new Set(await getDeletionIds());
  const ids = (await db.getAllKeys('pending')) as string[];
  const records = await Promise.all(
    ids.map(async (id) => {
      const found = await db.get('records', id);
      return found ? parseRecord(found) : null;
    }),
  );
  return records.filter((r): r is BPRecord => r !== null && !tombstoned.has(r.id));
}

export async function getParsedRecord(id: string): Promise<BPRecord | null> {
  const db = await getDb();
  const found = await db.get('records', id);
  return found ? parseRecord(found) : null;
}

// Recommended (also in test): addRecordToStores — writes the record into
// 'records' and queues its id in 'pending' in one transaction.
export async function addRecordToStores(record: unknown): Promise<BPRecord> {
  const db = await getDb();
  const validation = validateRecord(record);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const normalized = parseRecord(record);
  const tx = db.transaction(['records', 'pending'], 'readwrite');
  tx.objectStore('records').put(normalized);
  tx.objectStore('pending').put({ id: normalized.id });
  await tx.done;
  return normalized;
}

// Upserts server records into the local cache; local copies with the same id
// are replaced by the server record. Tombstoned (pending-deletion) ids are
// never resurrected.
export async function upsertRemoteRecords(records: BPRecord[]): Promise<void> {
  const db = await getDb();
  const tombstoned = new Set(await getDeletionIds());
  const tx = db.transaction('records', 'readwrite');
  for (const record of records) {
    if (validateRecord(record).valid && !tombstoned.has(record.id)) {
      tx.store.put(parseRecord(record));
    }
  }
  await tx.done;
}

// Acknowledged record: remove the id from the pending queue but keep the
// record itself in the cache.
export async function clearPending(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pending', 'readwrite');
  tx.store.delete(id);
  await tx.done;
}

export async function clearAllPending(): Promise<void> {
  const db = await getDb();
  await db.clear('pending');
}

// Edit: writes the updated record and re-queues its id for sync in one
// transaction (already-synced records are pushed again after the edit).
export async function updateRecord(record: unknown): Promise<BPRecord> {
  const db = await getDb();
  const validation = validateRecord(record);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const normalized = parseRecord(record);
  const tx = db.transaction(['records', 'pending'], 'readwrite');
  tx.objectStore('records').put(normalized);
  tx.objectStore('pending').put({ id: normalized.id });
  await tx.done;
  return normalized;
}

// Deletion: removes the record and its pending entry while writing a
// tombstone id — all in one transaction — so the removal survives offline
// periods and syncs to the server later.
export async function deleteRecordLocally(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['records', 'pending', 'deletions'], 'readwrite');
  tx.objectStore('records').delete(id);
  tx.objectStore('pending').delete(id);
  tx.objectStore('deletions').put({ id });
  await tx.done;
}

export async function getDeletionIds(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('deletions')) as string[];
}

export async function clearDeletion(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('deletions', 'readwrite');
  tx.store.delete(id);
  await tx.done;
}

export async function countDeletions(): Promise<number> {
  const db = await getDb();
  return db.count('deletions');
}

// Test helper: count pending ids without reading records.
export async function countPending(): Promise<number> {
  const db = await getDb();
  return (await db.count('pending'));
}
