import type { WeightRecord } from '~/shared/weight-record';
import { parseWeightRecord, validateWeightRecord } from '#shared/utils/weight-validation';
import { getDb } from './db';

export async function getLocalWeightRecords(): Promise<WeightRecord[]> {
  const db = await getDb();
  return (await db.getAll('weight')).map(parseWeightRecord);
}

export async function getWeightPendingIds(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('weightPending')) as string[];
}

export async function getWeightPendingRecords(): Promise<WeightRecord[]> {
  const db = await getDb();
  const tombstoned = new Set(await getWeightDeletionIds());
  const ids = (await db.getAllKeys('weightPending')) as string[];
  const records = await Promise.all(
    ids.map(async (id) => {
      const found = await db.get('weight', id);
      return found ? parseWeightRecord(found) : null;
    }),
  );
  return records.filter((r): r is WeightRecord => r !== null && !tombstoned.has(r.id));
}

// Record a new weight: writes the record and queues its id in one
// transaction.
export async function addWeightToStores(record: unknown): Promise<WeightRecord> {
  const db = await getDb();
  const validation = validateWeightRecord(record);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  const normalized = parseWeightRecord(record);
  const tx = db.transaction(['weight', 'weightPending'], 'readwrite');
  tx.objectStore('weight').put(normalized);
  tx.objectStore('weightPending').put({ id: normalized.id });
  await tx.done;
  return normalized;
}

// Edit: writes the updated record and re-queues its id in one transaction.
export async function updateWeightRecord(record: unknown): Promise<WeightRecord> {
  return addWeightToStores(record);
}

// Deletion: removes the record and pending entry while writing a tombstone,
// all in one transaction, so removals survive offline periods.
export async function deleteWeightLocally(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['weight', 'weightPending', 'weightDeletions'], 'readwrite');
  tx.objectStore('weight').delete(id);
  tx.objectStore('weightPending').delete(id);
  tx.objectStore('weightDeletions').put({ id });
  await tx.done;
}

export async function getWeightDeletionIds(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAllKeys('weightDeletions')) as string[];
}

export async function clearWeightDeletion(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('weightDeletions', 'readwrite');
  tx.store.delete(id);
  await tx.done;
}

// Upserts server records into the local cache; tombstoned ids are never
// resurrected.
export async function upsertRemoteWeightRecords(records: WeightRecord[]): Promise<void> {
  const db = await getDb();
  const tombstoned = new Set(await getWeightDeletionIds());
  const tx = db.transaction('weight', 'readwrite');
  for (const record of records) {
    if (validateWeightRecord(record).valid && !tombstoned.has(record.id)) {
      tx.store.put(parseWeightRecord(record));
    }
  }
  await tx.done;
}

export async function clearWeightPending(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('weightPending', 'readwrite');
  tx.store.delete(id);
  await tx.done;
}

export async function countWeightPending(): Promise<number> {
  const db = await getDb();
  return db.count('weightPending');
}

export async function countWeightDeletions(): Promise<number> {
  const db = await getDb();
  return db.count('weightDeletions');
}
