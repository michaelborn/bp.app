<script setup lang="ts">
import type { BPRecord } from '~/shared/bp-record';

const props = defineProps<{
  records: BPRecord[];
  pendingIds?: Set<string>;
}>();

function isPending(record: BPRecord): boolean {
  return props.pendingIds?.has(record.id) ?? false;
}
</script>

<template>
  <section class="bp-table-section" aria-labelledby="bp-table-heading">
    <h2 id="bp-table-heading" class="bp-table-h">All readings</h2>

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
            <th scope="col" class="col-status"><span class="visually-hidden">Sync status</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in props.records" :key="record.id">
            <th scope="row" class="col-date">{{ new Date(record.recordedAt).toLocaleString() }}</th>
            <td class="col-number">{{ record.systolic }}</td>
            <td class="col-number">{{ record.diastolic }}</td>
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

.bp-table-h {
  margin: 0 0 0.75rem;
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

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 26rem) {
  .bp-table th,
  .bp-table td {
    padding: 0.4rem 0.4rem;
  }
}
</style>
