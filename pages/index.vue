<script setup lang="ts">
import BPChart from '~/components/BPChart.vue';
import WeightChart from '~/components/WeightChart.vue';
import RecordBPDialog from '~/components/RecordBPDialog.vue';
import RecordWeightDialog from '~/components/RecordWeightDialog.vue';
import BPRecordsTable from '~/components/BPRecordsTable.vue';
import WeightRecordsTable from '~/components/WeightRecordsTable.vue';
import HeaderMenu from '~/components/HeaderMenu.vue';
import { useBPRecords } from '~/composables/useBPRecords';
import { useWeightRecords } from '~/composables/useWeightRecords';
import { useWeightUnits } from '~/composables/useWeightUnits';

definePageMeta({
  name: 'index',
});

type ViewName = 'chart' | 'blood-pressure' | 'weight';

const bp = useBPRecords();
const weight = useWeightRecords();
const { unit, toggleUnit } = useWeightUnits();

const VIEW_ORDER: ViewName[] = ['chart', 'blood-pressure', 'weight'];
const VIEW_STORAGE_KEY = 'bp-active-view';

// The active tab persists across reloads, like the chart stack/split toggle.
// Read in onMounted (not setup) so SSR and hydration agree on 'chart' first.
const currentView = ref<ViewName>('chart');
watch(currentView, (view) => window.localStorage.setItem(VIEW_STORAGE_KEY, view));

// BP chart stack/split mode, toggled from the settings menu and persisted
// (previously owned by BPChart itself).
const CHART_MODE_STORAGE_KEY = 'bp-chart-mode';
const chartMode = ref<'split' | 'stack'>('split');
watch(chartMode, (mode) => window.localStorage.setItem(CHART_MODE_STORAGE_KEY, mode));

function toggleChartMode() {
  chartMode.value = chartMode.value === 'split' ? 'stack' : 'split';
}

const recordDialogOpen = ref(false);
const weightDialogOpen = ref(false);
const lastSavedResult = ref<'local' | 'offline' | null>(null);
const tabRefs = ref<Record<ViewName, HTMLButtonElement | null>>({
  chart: null,
  'blood-pressure': null,
  weight: null,
});

onMounted(() => {
  const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (VIEW_ORDER.includes(saved as ViewName)) {
    currentView.value = saved as ViewName;
  }
  const savedChartMode = window.localStorage.getItem(CHART_MODE_STORAGE_KEY);
  if (savedChartMode === 'split' || savedChartMode === 'stack') {
    chartMode.value = savedChartMode;
  }
  bp.initialize();
  weight.initialize();
});

// Arrow-key navigation between tabs (WAI-ARIA tabs pattern).
function onTabKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }
  event.preventDefault();
  const index = VIEW_ORDER.indexOf(currentView.value);
  const next = VIEW_ORDER[(index + (event.key === 'ArrowRight' ? 1 : VIEW_ORDER.length - 1)) % VIEW_ORDER.length];
  currentView.value = next;
  nextTick(() => tabRefs.value[next]?.focus());
}

function openRecordDialog() {
  lastSavedResult.value = null;
  recordDialogOpen.value = true;
}

function openWeightDialog() {
  lastSavedResult.value = null;
  weightDialogOpen.value = true;
}

async function handleSave(payload: { systolic: number; diastolic: number; recordedAt: string }) {
  const wasOffline = !navigator.onLine;
  await bp.saveRecord({
    systolic: payload.systolic,
    diastolic: payload.diastolic,
    recordedAt: payload.recordedAt,
  });
  lastSavedResult.value = wasOffline ? 'offline' : 'local';
}

async function handleWeightSave(payload: { weightKg: number; recordedAt: string }) {
  const wasOffline = !navigator.onLine;
  await weight.saveRecord({ weight: payload.weightKg, recordedAt: payload.recordedAt });
  lastSavedResult.value = wasOffline ? 'offline' : 'local';
}

// Combined sync status line: the header reflects whichever collection has
// outstanding work; "Synced" only when everything is acknowledged.
// Combined status for the header dot: any waiting/offline/error wins over
// "synced".
const syncStatusData = computed(() => {
  if (bp.syncStatus.value === 'error' || weight.syncStatus.value === 'error') {
    return 'error';
  }
  if (!bp.isOnline.value || !weight.isOnline.value) {
    return 'offline';
  }
  if (bp.syncStatus.value === 'waiting' || weight.syncStatus.value === 'waiting') {
    return 'waiting';
  }
  return 'synced';
});

const syncStatusText = computed(() => {
  if (!bp.isOnline.value || !weight.isOnline.value) {
    return bp.hasPending.value || weight.hasPending.value
      ? 'Waiting to sync'
      : 'Offline — showing records saved on this device';
  }
  if (bp.syncStatus.value === 'error' || weight.syncStatus.value === 'error') {
    return 'Sync error — will retry';
  }
  if (bp.syncStatus.value === 'waiting' || weight.syncStatus.value === 'waiting') {
    return 'Waiting to sync';
  }
  const timestamps = [bp.lastSyncedAt.value, weight.lastSyncedAt.value].filter(Boolean) as string[];
  if (!timestamps.length) {
    return 'Synced';
  }
  const newest = timestamps.reduce((a, b) => (a > b ? a : b));
  return `Synced ${formatRelativeTime(newest)}`;
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

// CSV serialization shared by both exports (RFC 4180).
function csvRows(records: Record<string, unknown>[], columns: string[]): string[] {
  return records.map((record) =>
    columns
      .map((column) => {
        const cell = String(record[column]);
        return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
      })
      .join(','),
  );
}

function downloadCsv(filename: string, header: string, rows: string[]): void {
  const csv = [header, ...rows].join('\n') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// One click exports both collections as separate CSV files, each in the
// same shape the server persists. Weights stay canonical (kg).
function exportCsv(): void {
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(
    `bp-app-bloodpressure-${date}.csv`,
    'id,recorded_at,systolic,diastolic',
    csvRows(bp.sortedRecords.value, ['id', 'recordedAt', 'systolic', 'diastolic']),
  );
  downloadCsv(
    `bp-app-weight-${date}.csv`,
    'id,recorded_at,weight',
    csvRows(weight.sortedRecords.value, ['id', 'recordedAt', 'weight']),
  );
}

const exportDisabled = computed(() => !bp.sortedRecords.value.length && !weight.sortedRecords.value.length);
</script>

<template>
  <main class="bp-page">
    <header class="bp-header">
      <div class="bp-header-row">
        <div class="bp-header-left">
          <h1 class="bp-title">bp.app</h1>
          <p class="bp-sync" :data-status="syncStatusData" role="status" data-test="sync-status">
            <span class="bp-sync-dot" aria-hidden="true" /> {{ syncStatusText }}
          </p>
        </div>
        <div class="bp-header-actions">
          <HeaderMenu text="Record" icon="hamburger" variant="primary" data-test="record-menu">
            <button type="button" role="menuitem" data-test="menu-record-bp" @click="openRecordDialog">
              Blood pressure
            </button>
            <button type="button" role="menuitem" data-test="menu-record-weight" @click="openWeightDialog">
              Weight
            </button>
          </HeaderMenu>
          <HeaderMenu icon="gear" aria-label="Settings" data-test="settings-menu">
            <button
              type="button"
              role="menuitem"
              data-test="unit-toggle"
              :aria-label="`Show weight in ${unit === 'kg' ? 'pounds' : 'kilograms'}`"
              @click="toggleUnit"
            >
              Units: {{ unit }}
            </button>
            <button type="button" role="menuitem" data-test="graph-toggle" @click="toggleChartMode">
              {{ chartMode === 'split' ? 'Stack graph' : 'Split graph' }}
            </button>
            <button
              type="button"
              role="menuitem"
              data-test="export-csv"
              :disabled="exportDisabled"
              @click="exportCsv"
            >
              Export CSV
            </button>
          </HeaderMenu>
        </div>
      </div>

      <nav class="bp-tabs" role="tablist" aria-label="Record views" @keydown="onTabKeydown">
        <button
          id="tab-chart"
          :ref="(el) => (tabRefs.chart = el as HTMLButtonElement)"
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
          id="tab-blood-pressure"
          :ref="(el) => (tabRefs['blood-pressure'] = el as HTMLButtonElement)"
          type="button"
          role="tab"
          class="bp-tab"
          :class="{ 'bp-tab-active': currentView === 'blood-pressure' }"
          :aria-selected="currentView === 'blood-pressure'"
          :tabindex="currentView === 'blood-pressure' ? 0 : -1"
          data-test="tab-blood-pressure"
          @click="currentView = 'blood-pressure'"
        >
          Blood pressure
        </button>
        <button
          id="tab-weight"
          :ref="(el) => (tabRefs.weight = el as HTMLButtonElement)"
          type="button"
          role="tab"
          class="bp-tab"
          :class="{ 'bp-tab-active': currentView === 'weight' }"
          :aria-selected="currentView === 'weight'"
          :tabindex="currentView === 'weight' ? 0 : -1"
          data-test="tab-weight"
          @click="currentView = 'weight'"
        >
          Weight
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

    <section v-if="bp.loading.value || weight.loading.value" class="bp-notice" aria-live="polite">
      Loading records…
    </section>

    <template v-else>
      <div
        v-show="currentView === 'chart'"
        role="tabpanel"
        aria-labelledby="tab-chart"
        data-test="panel-chart"
      >
        <BPChart v-model:mode="chartMode" :records="bp.chartRecords.value" />
        <WeightChart :records="weight.chartRecords.value" />
      </div>
      <div
        v-show="currentView === 'blood-pressure'"
        role="tabpanel"
        aria-labelledby="tab-blood-pressure"
        data-test="panel-blood-pressure"
      >
        <BPRecordsTable
          :records="bp.sortedRecords.value"
          :pending-ids="bp.pendingIds.value ?? undefined"
          @update-record="bp.updateRecord"
          @delete-record="bp.deleteRecord"
        />
      </div>
      <div
        v-show="currentView === 'weight'"
        role="tabpanel"
        aria-labelledby="tab-weight"
        data-test="panel-weight"
      >
        <WeightRecordsTable
          :records="weight.sortedRecords.value"
          :pending-ids="weight.pendingIds.value ?? undefined"
          @record="openWeightDialog"
          @update-record="weight.updateRecord"
          @delete-record="weight.deleteRecord"
        />
      </div>
    </template>

    <RecordBPDialog
      v-model:open="recordDialogOpen"
      @save="handleSave"
    />

    <RecordWeightDialog
      v-model:open="weightDialogOpen"
      @save="handleWeightSave"
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
