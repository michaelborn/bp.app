<script setup lang="ts">
import BPChart from '~/components/BPChart.vue';
import RecordBPDialog from '~/components/RecordBPDialog.vue';
import BPRecordsTable from '~/components/BPRecordsTable.vue';
import { useBPRecords } from '~/composables/useBPRecords';

definePageMeta({
  name: 'index',
});

type ViewName = 'chart' | 'table';

const { chartRecords, sortedRecords, pendingIds, loading, syncStatus, isOnline, hasPending, initialize, saveRecord, startSync, lastSyncedAt } = useBPRecords();

const currentView = ref<ViewName>('chart');
const recordDialogOpen = ref(false);
const lastSavedResult = ref<'local' | 'offline' | null>(null);
const chartTab = ref<HTMLButtonElement | null>(null);
const tableTab = ref<HTMLButtonElement | null>(null);

onMounted(() => {
  initialize();
});

// Arrow-key navigation between tabs (WAI-ARIA tabs pattern).
function onTabKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }
  event.preventDefault();
  const next: ViewName = currentView.value === 'chart' ? 'table' : 'chart';
  currentView.value = next;
  nextTick(() => {
    (next === 'table' ? tableTab.value : chartTab.value)?.focus();
  });
}

function openRecordDialog() {
  lastSavedResult.value = null;
  recordDialogOpen.value = true;
}

async function handleSave(payload: { systolic: number; diastolic: number }) {
  const wasOffline = !navigator.onLine;
  await saveRecord(payload.systolic, payload.diastolic);
  lastSavedResult.value = wasOffline ? 'offline' : 'local';
}

const syncStatusText = computed(() => {
  if (!isOnline.value) {
    return hasPending.value ? 'Waiting to sync' : 'Offline — showing records saved on this device';
  }
  switch (syncStatus.value) {
    case 'waiting':
      return 'Waiting to sync';
    case 'error':
      return 'Sync error — will retry';
    case 'offline':
      return 'Waiting to sync';
    default:
      return lastSyncedAt.value
        ? `Synced ${formatRelativeTime(lastSyncedAt.value)}`
        : 'Synced';
  }
});

function formatRelativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} min ago`;
  }
  return new Date(iso).toLocaleString();
}

// Downloads every stored record as a CSV file with the same shape the
// server persists: id,recorded_at,systolic,diastolic.
function exportCsv(): void {
  const rows = sortedRecords.value.map((record) => {
    const cells = [record.id, record.recordedAt, String(record.systolic), String(record.diastolic)];
    return cells.map((cell) => (/[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell)).join(',');
  });
  const csv = ['id,recorded_at,systolic,diastolic', ...rows].join('\n') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bp-app-records-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
</script>

<template>
  <main class="bp-page">
    <header class="bp-header">
      <div class="bp-header-row">
        <div class="bp-header-left">
          <h1 class="bp-title">bp.app</h1>
          <p class="bp-sync" :data-status="syncStatus" role="status">
            <span class="bp-sync-dot" aria-hidden="true" /> {{ syncStatusText }}
          </p>
        </div>
        <div class="bp-header-actions">
          <button
            type="button"
            class="bp-button"
            data-test="export-csv"
            :disabled="!sortedRecords.length"
            @click="exportCsv"
          >
            Export CSV
          </button>
          <button type="button" class="bp-button bp-button-primary" data-test="record-bp" @click="openRecordDialog">
            Record BP
          </button>
        </div>
      </div>

      <nav class="bp-tabs" role="tablist" aria-label="Record views" @keydown="onTabKeydown">
        <button
          id="tab-chart"
          ref="chartTab"
          type="button"
          role="tab"
          class="bp-tab"
          :class="{ 'bp-tab-active': currentView === 'chart' }"
          :aria-selected="currentView === 'chart'"
          :tabindex="currentView === 'chart' ? 0 : -1"
          data-test="tab-chart"
          @click="currentView = 'chart'"
        >
          Chart
        </button>
        <button
          id="tab-table"
          ref="tableTab"
          type="button"
          role="tab"
          class="bp-tab"
          :class="{ 'bp-tab-active': currentView === 'table' }"
          :aria-selected="currentView === 'table'"
          :tabindex="currentView === 'table' ? 0 : -1"
          data-test="tab-table"
          @click="currentView = 'table'"
        >
          Table
        </button>
      </nav>
    </header>

    <p v-if="lastSavedResult" class="bp-save-feedback" role="status" data-test="save-feedback">
      <template v-if="lastSavedResult === 'offline'">
        Saved on this device — will sync when you're back online.
      </template>
      <template v-else>
        Saved on this device.
      </template>
    </p>

    <section v-if="loading" class="bp-notice" aria-live="polite">
      Loading records…
    </section>

    <template v-else>
      <div
        v-show="currentView === 'chart'"
        role="tabpanel"
        aria-labelledby="tab-chart"
        data-test="panel-chart"
      >
        <BPChart :records="chartRecords" />
      </div>
      <div
        v-show="currentView === 'table'"
        role="tabpanel"
        aria-labelledby="tab-table"
        data-test="panel-table"
      >
        <BPRecordsTable :records="sortedRecords" :pending-ids="pendingIds ?? undefined" />
      </div>
    </template>

    <RecordBPDialog
      v-model:open="recordDialogOpen"
      @save="handleSave"
    />
  </main>
</template>

<style scoped>
.bp-page {
  max-width: 46rem;
  margin: 0 auto;
  padding: 1rem 1rem 3rem;
}

.bp-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.bp-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.bp-header-left {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.bp-title {
  margin: 0;
  font-size: 1.5rem;
}

/* Tab navigation */
.bp-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--bp-border);
}

.bp-tab {
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 0.5rem 0.5rem 0 0;
  background: transparent;
  color: var(--bp-muted);
  cursor: pointer;
  font: inherit;
  transform: translateY(1px);
}

.bp-tab:focus-visible {
  outline: 2px solid var(--bp-accent);
  outline-offset: -2px;
}

.bp-tab:hover {
  color: var(--bp-text);
}

.bp-tab-active {
  background: var(--bp-surface);
  border-color: var(--bp-border);
  color: var(--bp-text);
  font-weight: 600;
}

.bp-sync {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--bp-muted);
  font-size: 0.875rem;
}

.bp-sync-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--bp-muted);
}

.bp-sync[data-status='synced'] .bp-sync-dot {
  background: #15803d;
}

.bp-sync[data-status='waiting'] .bp-sync-dot,
.bp-sync[data-status='offline'] .bp-sync-dot {
  background: #d97706;
}

.bp-sync[data-status='error'] .bp-sync-dot {
  background: var(--bp-danger);
}

.bp-header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.bp-button {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bp-border);
  background: var(--bp-surface);
  color: var(--bp-text);
  cursor: pointer;
  flex-shrink: 0;
}

.bp-button:focus-visible {
  outline: 2px solid var(--bp-accent);
  outline-offset: 2px;
}

.bp-button-primary {
  background: var(--bp-accent);
  border-color: var(--bp-accent);
  color: var(--bp-accent-contrast);
}

.bp-save-feedback {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.bp-notice {
  color: var(--bp-muted);
}
</style>
