/* bp-sync.js
 * Loaded into the generated service worker via importScripts. Adds a
 * Background Sync "sync" handler that replays queued records from
 * IndexedDB (the same store `services/records.local.ts` uses) to
 * POST /api/records/sync. Runs entirely outside the app UI.
 */
const DB_NAME = 'bp-app';
const SYNC_TAG = 'bp-app-records-sync';

function openLocalDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

async function readPending(db) {
  const records = [];
  const tx = db.transaction(['pending', 'records'], 'readonly');
  const pendingStore = tx.objectStore('pending');
  const recordsStore = tx.objectStore('records');
  const pendingIds = await new Promise((resolve, reject) => {
    const req = pendingStore.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const id of pendingIds) {
    const record = await new Promise((resolve) => {
      const req = recordsStore.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (record) {
      records.push(record);
    }
  }
  return records;
}

async function clearPending(db, ackedIds) {
  if (!ackedIds.length) {
    return;
  }
  const tx = db.transaction('pending', 'readwrite');
  const store = tx.objectStore('pending');
  for (const id of ackedIds) {
    store.delete(id);
  }
  await txPromise(tx);
}

async function notifyClients() {
  const clientList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clientList) {
    client.postMessage({ type: 'RECORDS_SYNCED' });
  }
}

async function replayPendingRecords() {
  const db = await openLocalDb();
  try {
    const records = await readPending(db);
    if (!records.length) {
      return;
    }
    const response = await fetch('/api/records/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    if (!response.ok) {
      // Keep the queue intact; retry on the next sync trigger.
      if (response.status >= 400 && response.status < 500) {
        throw new Error('bad-request');
      }
      throw new Error('server-error');
    }
    const payload = await response.json();
    await clearPending(db, (payload && payload.acked) || []);
    await notifyClients();
  } finally {
    db.close();
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) {
    return;
  }
  // A rejected waitUntil promise makes the browser retry with backoff.
  event.waitUntil(replayPendingRecords());
});
