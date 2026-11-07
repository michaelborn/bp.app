import { ref, computed } from 'vue';

import type { BPRecord } from '~/shared/bp-record';
import * as local from '~/services/records.local';
import { getServerRecords, syncRecords } from '~/services/records.client';

export type SyncStatus = 'synced' | 'waiting' | 'offline' | 'error';

const SYNC_TAG = 'bp-app-records-sync';
const MAX_AUTO_SYNC_BATCH = 1000;
// Poll for connectivity retry while pending records exist (30–60s window).
const SYNC_POLL_INTERVAL_MS = 30000;

// Single client-side records service state (module scope, shared by
// composable callers across components).
const records = ref<BPRecord[]>([]);
const pendingIds = ref<Set<string>>(new Set());
const loading = ref(false);
const lastSyncedAt = ref<string | null>(null);
const syncError = ref<string | null>(null);
const isOnline = ref(true);
let syncInFlight = false;
let started = false;

// Most recent 14 calendar days (including today) of records, chronological.
export function last14Days(sortedNewestFirst: BPRecord[], now = new Date()): BPRecord[] {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 13);
  return sortedNewestFirst
    .filter((r) => new Date(r.recordedAt) >= cutoff && new Date(r.recordedAt) <= endOfToday(now))
    .sort((a, b) => (a.recordedAt === b.recordedAt ? (a.id < b.id ? -1 : 1) : a.recordedAt < b.recordedAt ? -1 : 1));
}

function endOfToday(now: Date): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function useBPRecords() {
  // Loads the local cache immediately, then merges current server records
  // when online. Safe to call multiple times.
  async function initialize(): Promise<void> {
    loading.value = true;
    try {
      const cached = await local.getPendingIds().catch(() => [] as string[]);
      pendingIds.value = new Set(cached);
      records.value = sortByNewestFirst(await local.getLocalRecords());
    } finally {
      loading.value = false;
    }
    if (navigator.onLine) {
      await Promise.allSettled([startSync(), pullServerRecords()]);
    }
    installTriggers();
  }

  async function refresh(): Promise<void> {
    records.value = sortByNewestFirst(await local.getLocalRecords());
    pendingIds.value = new Set(await local.getPendingIds());
  }

  // Saves a record locally first (never blocked by connectivity), then
  // kicks off a sync if online.
  async function saveRecord(systolic: number, diastolic: number, recordedAt?: string): Promise<BPRecord> {
    const record = {
      id: crypto.randomUUID(),
      // Keep millisecond precision so distinct saves never tie on the
      // same second.
      recordedAt: recordedAt ?? new Date().toISOString(),
      systolic,
      diastolic,
    };
    await local.addRecordToStores(record);
    await refresh();
    if (navigator.onLine) {
      startSync().catch(() => {});
    }
    return record;
  }

  // Uploads pending records until the server acknowledges them. Returns
  // without action when offline or another sync is running.
  async function startSync(): Promise<void> {
    if (syncInFlight || !navigator.onLine) {
      return;
    }
    syncInFlight = true;
    syncError.value = null;
    try {
      const pending = await local.getPendingRecords();
      if (pending.length === 0) {
        lastSyncedAt.value = new Date().toISOString();
        return;
      }
      const response = await syncRecords(pending.slice(0, MAX_AUTO_SYNC_BATCH));
      for (const id of response.acked) {
        await local.clearPending(id);
      }
      pendingIds.value = new Set((await local.getPendingIds()).filter((id) => !response.acked.includes(id)));
      if (response.records?.length) {
        await local.upsertRemoteRecords(response.records);
      }
      lastSyncedAt.value = new Date().toISOString();
      await refresh();
      // Keep going if more remain queued.
      if ((await local.countPending()) > 0) {
        setTimeout(() => startSync().catch(() => {}), 1000);
      }
    } catch (error) {
      syncError.value = error instanceof Error ? error.message : 'Sync failed.';
    } finally {
      syncInFlight = false;
    }
  }

  // Merges current server records by id, replacing local copies with the
  // server record. Pending local records remain visible while sync is
  // pending.
  async function pullServerRecords(): Promise<void> {
    if (!navigator.onLine) {
      return;
    }
    try {
      const remote = await getServerRecords();
      if (remote.length) {
        await local.upsertRemoteRecords(remote);
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
    // changes (NAT transitions, captive portals), so retry pending records
    // on a fixed interval while the app is open.
    window.setInterval(() => {
      if (!navigator.onLine || (!hasPending.value && !syncError.value)) {
        return;
      }
      startSync().catch(() => {});
      if (!hasPending.value) {
        pullServerRecords();
      }
    }, SYNC_POLL_INTERVAL_MS);

    // Background Sync where supported (a subset of Chromium browsers).
    navigator.serviceWorker?.ready
      .then((registration) => {
        const syncManager = (registration as ServiceWorkerRegistration & {
          sync?: { register(tag: string): Promise<void> };
        }).sync;
        return syncManager?.register(SYNC_TAG).catch(() => {});
      })
      .catch(() => {});

    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'RECORDS_SYNCED' || event.data === 'sync:complete') {
        pullServerRecords();
        refreshPendingFromLocal().catch(() => {});
      }
    });
  }

  async function refreshPendingFromLocal(): Promise<void> {
    await refresh();
  }

  const chartRecords = computed(() => last14Days(records.value));
  const allRecords = computed(() => records.value);
  const sortedRecords = computed(() => sortByNewestFirst(records.value));
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

  function statusFor(record: BPRecord): SyncStatus {
    return pendingIds.value.has(record.id) ? 'waiting' : 'synced';
  }

  return {
    records: allRecords,
    chartRecords,
    sortedRecords,
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
    startSync,
    pullServerRecords,
  };
}

// Sorts records newest-first (consistent everywhere records are shown).
export function sortByNewestFirst(list: BPRecord[]): BPRecord[] {
  return [...list].sort((a, b) => {
    if (a.recordedAt === b.recordedAt) {
      return a.id < b.id ? 1 : -1;
    }
    return a.recordedAt < b.recordedAt ? 1 : -1;
  });
}

export { SYNC_TAG };
