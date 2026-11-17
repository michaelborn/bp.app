/* bp-sync.js
 * Loaded into the generated service worker via importScripts. Adds
 * Background Sync handlers that replay queued work from IndexedDB (the
 * same stores the local services use) to the sync APIs. Runs entirely
 * outside the app UI.
 */
const DB_NAME = 'bp-app';
const COLLECTIONS = [
  {
    tag: 'bp-app-records-sync',
    store: 'records',
    pending: 'pending',
    deletions: 'deletions',
    endpoint: '/api/records/sync',
    deleteEndpoint: '/api/records/delete',
  },
  {
    tag: 'bp-app-weight-sync',
    store: 'weight',
    pending: 'weightPending',
    deletions: 'weightDeletions',
    endpoint: '/api/weight/sync',
    deleteEndpoint: '/api/weight/delete',
  },
];

function openLocalDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
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

async function readPending(db, collection) {
  const records = [];
  const tx = db.transaction([collection.pending, collection.store], 'readonly');
  const pendingStore = tx.objectStore(collection.pending);
  const recordsStore = tx.objectStore(collection.store);
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

async function readDeletionIds(db, collection) {
  const tx = db.transaction(collection.deletions, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(collection.deletions).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearKeys(db, storeName, ids) {
  if (!ids.length) {
    return;
  }
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const id of ids) {
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

async function replayCollection(db, collection) {
  const records = await readPending(db, collection);
  if (records.length) {
    const response = await fetch(collection.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    if (!response.ok) {
      throw new Error(response.status >= 400 && response.status < 500 ? 'bad-request' : 'server-error');
    }
    const payload = await response.json();
    await clearKeys(db, collection.pending, (payload && payload.acked) || []);
  }

  const deletionIds = await readDeletionIds(db, collection);
  if (deletionIds.length) {
    const response = await fetch(collection.deleteEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: deletionIds }),
    });
    if (!response.ok) {
      throw new Error(response.status >= 400 && response.status < 500 ? 'bad-request' : 'server-error');
    }
    const payload = await response.json();
    await clearKeys(db, collection.deletions, (payload && payload.acked) || []);
  }
}

self.addEventListener('sync', (event) => {
  const collection = COLLECTIONS.find((c) => c.tag === event.tag);
  if (!collection) {
    return;
  }
  // A rejected waitUntil promise makes the browser retry with backoff.
  event.waitUntil(
    openLocalDb().then(async (db) => {
      try {
        await replayCollection(db, collection);
        await notifyClients();
      } finally {
        db.close();
      }
    }),
  );
});
