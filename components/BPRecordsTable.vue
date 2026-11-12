<script setup lang="ts">
import { reactive, ref, watch } from 'vue';

import type { BPRecord } from '~/shared/bp-record';
import { validateRecord } from '#shared/utils/record-validation';

const props = defineProps<{
  records: BPRecord[];
  pendingIds?: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'update-record', record: BPRecord): void;
  (e: 'delete-record', id: string): void;
}>();

const editing = ref(false);
type Draft = { recordedAt: string; systolic: string; diastolic: string };
const drafts = reactive(new Map<string, Draft>());
const rowErrors = reactive(new Map<string, string>());

function isPending(record: BPRecord): boolean {
  return props.pendingIds?.has(record.id) ?? false;
}

// ISO-8601 UTC -> value for <input type="datetime-local"> (local time).
function toInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function draftFor(record: BPRecord): Draft {
  let draft = drafts.get(record.id);
  if (!draft) {
    draft = reactive({
      recordedAt: toInputValue(record.recordedAt),
      systolic: String(record.systolic),
      diastolic: String(record.diastolic),
    });
    drafts.set(record.id, draft);
  }
  return draft;
}

function toggleEditing() {
  if (editing.value) {
    editing.value = false;
    drafts.clear();
    rowErrors.clear();
  } else {
    editing.value = true;
  }
}

// Called on input blur: validates the whole row and saves when valid.
// Invalid values show an inline error and are not silently discarded.
function commitField(record: BPRecord) {
  const draft = drafts.get(record.id);
  if (!draft) {
    return;
  }
  const date = new Date(draft.recordedAt);
  if (Number.isNaN(date.getTime())) {
    rowErrors.set(record.id, 'Enter a valid date and time.');
    return;
  }
  const candidate: BPRecord = {
    id: record.id,
    recordedAt: date.toISOString(),
    systolic: Number(draft.systolic),
    diastolic: Number(draft.diastolic),
  };
  const validation = validateRecord(candidate);
  if (!validation.valid) {
    rowErrors.set(record.id, validation.error ?? 'Invalid reading.');
    return;
  }
  rowErrors.delete(record.id);
  emit('update-record', candidate);
}

function onDelete(id: string) {
  if (!window.confirm('Delete this reading? This cannot be undone.')) {
    return;
  }
  drafts.delete(id);
  rowErrors.delete(id);
  emit('delete-record', id);
}

watch(() => props.records, (records) => {
  // Rows removed elsewhere (e.g. deletion) drop their drafts.
  const ids = new Set(records.map((r) => r.id));
  for (const id of [...drafts.keys()]) {
    if (!ids.has(id)) {
      drafts.delete(id);
      rowErrors.delete(id);
    }
  }
});
</script>

<template>
  <section class="bp-table-section" aria-labelledby="bp-table-heading">
    <div class="bp-table-heading-row">
      <h2 id="bp-table-heading" class="bp-table-h">All readings</h2>
      <button
        type="button"
        class="bp-button"
        data-test="edit-toggle"
        :disabled="!props.records.length && !editing"
        @click="toggleEditing"
      >
        {{ editing ? 'Done' : 'Edit' }}
      </button>
    </div>

    <p v-if="!props.records.length" class="bp-table-empty">
      No readings yet. Record BP to start your history.
    </p>

    <div v-else class="bp-table-scroll">
      <table class="bp-table">
        <thead>
          <tr>
            <th scope="col" class="col-date">Date &amp; time</th>
            <th scope="col" class="col-number">Systolic (mmHg)</th>
            <th scope="col" class="col-number">Diastolic (mmHg)</th>
            <th v-if="editing" scope="col" class="col-delete">
              <span class="visually-hidden">Delete</span>
            </th>
            <th scope="col" class="col-status"><span class="visually-hidden">Sync status</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in props.records" :key="record.id" :data-record-id="record.id">
            <template v-if="editing">
              <td class="col-date">
                <input
                  class="bp-cell-input"
                  type="datetime-local"
                  step="1"
                  name="recordedAt"
                  :value="draftFor(record).recordedAt"
                  data-test="date-input"
                  @input="draftFor(record).recordedAt = ($event.target as HTMLInputElement).value"
                  @blur="commitField(record)"
                >
                <span v-if="rowErrors.get(record.id)" class="bp-cell-error" role="alert">
                  {{ rowErrors.get(record.id) }}
                </span>
              </td>
              <td class="col-number">
                <input
                  class="bp-cell-input"
                  type="number"
                  inputmode="numeric"
                  name="systolic"
                  :value="draftFor(record).systolic"
                  data-test="systolic-input"
                  @input="draftFor(record).systolic = ($event.target as HTMLInputElement).value"
                  @blur="commitField(record)"
                >
              </td>
              <td class="col-number">
                <input
                  class="bp-cell-input"
                  type="number"
                  inputmode="numeric"
                  name="diastolic"
                  :value="draftFor(record).diastolic"
                  data-test="diastolic-input"
                  @input="draftFor(record).diastolic = ($event.target as HTMLInputElement).value"
                  @blur="commitField(record)"
                >
              </td>
              <td class="col-delete">
                <button
                  type="button"
                  class="bp-button bp-button-danger"
                  data-test="delete-row"
                  @click="onDelete(record.id)"
                >
                  Delete
                </button>
              </td>
            </template>
            <template v-else>
              <th scope="row" class="col-date">{{ new Date(record.recordedAt).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }}</th>
              <td class="col-number">{{ record.systolic }}</td>
              <td class="col-number">{{ record.diastolic }}</td>
            </template>
            <td class="col-status">
              <span v-if="isPending(record)" class="badge badge-waiting">Waiting to sync</span>
              <span v-else class="badge badge-synced">Synced</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.bp-table-section {
  background: var(--bp-surface);
  border: 1px solid var(--bp-border);
  border-radius: 0.75rem;
  padding: 1rem;
}

.bp-table-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.bp-table-h {
  margin: 0;
  font-size: 1rem;
}

.bp-table-empty {
  margin: 0;
  color: var(--bp-muted);
}

/* Vertically scrolls within the page; the container itself is a normal
   block, so the page scrolls naturally on narrow screens too. */
.bp-table-scroll {
  overflow-x: auto;
}

.bp-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.bp-table th,
.bp-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--bp-border);
  text-align: left;
  vertical-align: top;
}

.bp-table thead th {
  font-size: 0.8125rem;
  color: var(--bp-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: 2px solid var(--bp-border);
}

.bp-table tbody th {
  font-weight: 400;
  white-space: nowrap;
}

.col-number {
  text-align: right;
}

.col-delete {
  text-align: right;
  white-space: nowrap;
}

.col-status {
  white-space: nowrap;
  text-align: right;
}

.badge {
  display: inline-block;
  font-size: 0.6875rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  border: 1px solid var(--bp-border);
  color: var(--bp-muted);
}

.badge-waiting {
  border-color: #fcd34d;
  background: #fffbeb;
  color: #92400e;
}

.badge-synced {
  color: #15803d;
  border-color: #bbf7d0;
  background: #f0fdf4;
}

/* Editing */
.bp-cell-input {
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem 0.4rem;
  border-radius: 0.35rem;
  border: 1px solid var(--bp-border);
  background: var(--bp-background);
}

.bp-cell-input:focus-visible {
  outline: 2px solid var(--bp-accent);
  outline-offset: 1px;
}

.bp-cell-error {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--bp-danger);
}

.bp-button-danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: var(--bp-danger);
}

.bp-button-danger:focus-visible {
  outline: 2px solid var(--bp-danger);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 26rem) {
  .bp-table {
    font-size: 0.875rem;
  }

  .bp-table thead th {
    font-size: 0.6875rem;
    letter-spacing: 0.01em;
  }

  .bp-table th,
  .bp-table td {
    padding: 0.4rem 0.35rem;
  }

  /* Sync state lives in the header status line on narrow screens; drop the
     badge column so date and readings fit without horizontal scrolling. */
  .col-status {
    display: none;
  }
}
</style>
