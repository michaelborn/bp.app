import type { BPRecord } from '~/shared/bp-record';
import * as local from '~/services/records.local';
import { deleteServerRecords, getServerRecords, syncRecords, updateServerRecord } from '~/services/records.client';
import { validateRecord } from '#shared/utils/record-validation';
import { createRecordsCollection } from '~/composables/createRecordsCollection';

const SYNC_TAG = 'bp-app-records-sync';

// Most recent 14 calendar days (including today) of records, chronological.
export function last14Days<T extends { id: string; recordedAt: string }>(
  sortedNewestFirst: T[],
  now = new Date(),
): T[] {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 13);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return sortedNewestFirst
    .filter((r) => new Date(r.recordedAt) >= cutoff && new Date(r.recordedAt) <= end)
    .sort((a, b) => (a.recordedAt === b.recordedAt ? (a.id < b.id ? -1 : 1) : a.recordedAt < b.recordedAt ? -1 : 1));
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

// Y-axis bounds for the chart: the data's lowest/highest value with a
// margin, snapped to multiples of 5 so the ticks stay readable. Blood
// pressure changes are much easier to see when the window hugs the data
// instead of spanning 40–220 mmHg.
export function bpChartBounds(
  records: { systolic: number; diastolic: number }[],
  margin = 15,
): { min: number; max: number } {
  const values = records.flatMap((r) => [r.systolic, r.diastolic]);
  if (!values.length) {
    return { min: 40, max: 220 };
  }
  const roundDown = (v: number) => Math.floor(v / 5) * 5;
  const roundUp = (v: number) => Math.ceil(v / 5) * 5;
  return {
    min: Math.max(0, roundDown(Math.min(...values) - margin)),
    max: roundUp(Math.max(...values) + margin),
  };
}

const bloodPressure = createRecordsCollection<BPRecord>({
  name: 'blood-pressure',
  syncTag: SYNC_TAG,
  validate: validateRecord,
  local,
  api: {
    getServerRecords: getServerRecords,
    syncRecords: syncRecords,
    updateServerRecord: updateServerRecord,
    deleteServerRecords: deleteServerRecords,
  },
});

export function useBPRecords() {
  const chartRecords = computed(() => last14Days(bloodPressure.records.value as BPRecord[]));

  return {
    ...bloodPressure,
    chartRecords,
  };
}

export { SYNC_TAG };
