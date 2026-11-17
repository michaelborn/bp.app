import { computed, ref } from 'vue';

// Generic local-first records collection. Both blood-pressure and weight
// data flow through this factory: each metric supplies its validation,
// IndexedDB stores, and API client; the factory provides the shared
// behavior — local-first saves, pending queue, deletion tombstones, sync on
// startup/online/poll/Background Sync, and the waiting/synced status.

export type SyncStatus = 'synced' | 'waiting' | 'offline' | 'error';

const SYNC_POLL_INTERVAL_MS = 30000;
const MAX_AUTO_SYNC_BATCH = 1000;

export type LocalStores<T extends { id: string; recordedAt: string }> = {
  getLocalRecords(): Promise<T[]>;
  getPendingIds(): Promise<string[]>;
  getPendingRecords(): Promise<T[]>;
  addRecordToStores(record: unknown): Promise<T>;
  updateRecord(record: unknown): Promise<T>;
  deleteRecordLocally(id: string): Promise<void>;
  getDeletionIds(): Promise<string[]>;
  clearPending(id: string): Promise<void>;
  clearDeletion(id: string): Promise<void>;
  upsertRemoteRecords(records: T[]): Promise<void>;
  countPending(): Promise<number>;
  countDeletions(): Promise<number>;
};

export type RemoteApi<T extends { id: string; recordedAt: string }> = {
  getServerRecords(): Promise<T[]>;
  syncRecords(records: T[]): Promise<{ acked: string[]; records: T[] }>;
  updateServerRecord(record: T): Promise<T>;
  deleteServerRecords(ids: string[]): Promise<{ acked: string[] }>;
};

export type CollectionConfig<T extends { id: string; recordedAt: string }> = {
  name: string;
  syncTag: string;
  validate: (value: unknown) => { valid: boolean; error?: string };
  local: LocalStores<T>;
  api: RemoteApi<T>;
};

// Fields a caller may pass to saveRecord. recordedAt is optional: omitted,
// it defaults to the moment of the save (dialog default); the dialogs pass
// an explicit one when the user back-dates via the manual datetime input.
type RecordFields<T> = Partial<Omit<T, 'id'>>;

export function createRecordsCollection<T extends { id: string; recordedAt: string }>(
  config: CollectionConfig<T>,
) {
  const records = ref<T[]>([]);
  const pendingIds = ref<Set<string>>(new Set());
  const loading = ref(false);
  const lastSyncedAt = ref<string | null>(null);
  const syncError = ref<string | null>(null);
  const isOnline = ref(true);
  let syncInFlight = false;
  let started = false;

  function sortByNewestFirst(list: T[]): T[] {
    return [...list].sort((a, b) => {
      if (a.recordedAt === b.recordedAt) {
        return a.id < b.id ? 1 : -1;
      }
      return a.recordedAt < b.recordedAt ? 1 : -1;
    });
  }

  async function refresh(): Promise<void> {
    records.value = sortByNewestFirst(await config.local.getLocalRecords());
    pendingIds.value = new Set(await config.local.getPendingIds());
  }

  async function initialize(): Promise<void> {
    loading.value = true;
    try {
      await refresh();
    } finally {
      loading.value = false;
    }
    if (navigator.onLine) {
      await Promise.allSettled([startSync(), pullServerRecords()]);
    }
    installTriggers();
  }

  // Saves a record locally first (never blocked by connectivity), then
  // kicks off a sync if online.
  async function saveRecord(fields: RecordFields<T>): Promise<T> {
    const record = {
      id: crypto.randomUUID(),
      // Keep millisecond precision so distinct saves never tie on the
      // same second.
      recordedAt: new Date().toISOString(),
      ...fields,
    } as T;
    await config.local.addRecordToStores(record);
    await refresh();
    if (navigator.onLine) {
      startSync().catch(() => {});
    }
    return record;
  }

  // Edits an existing record: local write + re-queue first, then sync.
  async function updateRecord(record: T): Promise<void> {
    await config.local.updateRecord(record);
    await refresh();
    if (navigator.onLine) {
      startSync().catch(() => {});
    }
  }

  // Deletes a record: tombstone + local removal first, then sync.
  async function deleteRecord(id: string): Promise<void> {
    await config.local.deleteRecordLocally(id);
    await refresh();
    if (navigator.onLine) {
      startSync().catch(() => {});
    }
  }

  // Uploads pending records until the server acknowledges them, then pushes
  // pending deletions. Returns without action when offline or another sync
  // is running.
  async function startSync(): Promise<void> {
    if (syncInFlight || !navigator.onLine) {
      return;
    }
    syncInFlight = true;
    syncError.value = null;
    try {
      const pending = await config.local.getPendingRecords();
      const deletions = await config.local.getDeletionIds();

      if (pending.length > 0) {
        const response = await config.api.syncRecords(pending.slice(0, MAX_AUTO_SYNC_BATCH));
        for (const id of response.acked) {
          await config.local.clearPending(id);
        }
        if (response.records?.length) {
          await config.local.upsertRemoteRecords(response.records as unknown as T[]);
        }
      }

      if (deletions.length > 0) {
        const response = await config.api.deleteServerRecords(deletions);
        for (const id of response.acked) {
          await config.local.clearDeletion(id);
        }
      }

      lastSyncedAt.value = new Date().toISOString();
      pendingIds.value = new Set(await config.local.getPendingIds());
      await refresh();
      if ((await config.local.countPending()) > 0 || (await config.local.countDeletions()) > 0) {
        setTimeout(() => startSync().catch(() => {}), 1000);
      }
    } catch (error) {
      syncError.value = error instanceof Error ? error.message : 'Sync failed.';
    } finally {
      syncInFlight = false;
    }
  }

  // Merges current server records by id, replacing local copies with the
  // server record (tombstoned ids are filtered by the local layer).
  async function pullServerRecords(): Promise<void> {
    if (!navigator.onLine) {
      return;
    }
    try {
      const remote = await config.api.getServerRecords();
      if (remote.length) {
        await config.local.upsertRemoteRecords(remote);
        await refresh();
      }
      syncError.value = null;
    } catch (error) {
      syncError.value = error instanceof Error ? error.message : 'Could not load server records.';
    }
  }

  function installTriggers(): void {
    if (started) {
      return;
    }
    started = true;
    isOnline.value = navigator.onLine;

    window.addEventListener('online', () => {
      isOnline.value = true;
      startSync().catch(() => {});
      pullServerRecords();
    });
    window.addEventListener('offline', () => {
      isOnline.value = false;
    });

    // Connectivity polling: the browser `online` event can miss network
    // changes, so retry pending work on a fixed interval while open.
    window.setInterval(() => {
      if (!navigator.onLine || (pendingIds.value.size === 0 && !syncError.value)) {
        return;
      }
      startSync().catch(() => {});
      if (pendingIds.value.size === 0) {
        pullServerRecords();
      }
    }, SYNC_POLL_INTERVAL_MS);

    // Background Sync where supported.
    navigator.serviceWorker?.ready
      .then((registration) => {
        const syncManager = (registration as ServiceWorkerRegistration & {
          sync?: { register(tag: string): Promise<void> };
        }).sync;
        return syncManager?.register(config.syncTag).catch(() => {});
      })
      .catch(() => {});

    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'RECORDS_SYNCED') {
        pullServerRecords();
        refresh().catch(() => {});
      }
    });
  }

  const hasPending = computed(() => pendingIds.value.size > 0);

  const syncStatus = computed<SyncStatus>(() => {
    if (pendingIds.value.size > 0) {
      return isOnline.value ? 'waiting' : 'offline';
    }
    if (syncError.value) {
      return 'error';
    }
    return 'synced';
  });

  function statusFor(record: T): SyncStatus {
    return pendingIds.value.has(record.id) ? 'waiting' : 'synced';
  }

  return {
    records: computed(() => records.value),
    sortedRecords: computed(() => sortByNewestFirst(records.value as unknown as T[])),
    pendingIds,
    loading,
    lastSyncedAt,
    syncError,
    isOnline,
    hasPending,
    syncStatus,
    statusFor,
    initialize,
    refresh,
    saveRecord,
    updateRecord,
    deleteRecord,
    startSync,
    pullServerRecords,
    validate: config.validate,
  };
}

export type RecordsCollection<T extends { id: string; recordedAt: string }> = ReturnType<
  typeof createRecordsCollection<T>
>;
