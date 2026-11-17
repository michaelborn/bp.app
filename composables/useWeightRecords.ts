import type { WeightRecord } from '~/shared/weight-record';
import * as local from '~/services/weight.local';
import {
  deleteServerWeightRecords,
  getServerWeightRecords,
  syncWeightRecords,
  updateServerWeightRecord,
} from '~/services/weight.client';
import { validateWeightRecord } from '#shared/utils/weight-validation';
import { createRecordsCollection } from '~/composables/createRecordsCollection';
import { last14Days } from '~/composables/useBPRecords';

const SYNC_TAG = 'bp-app-weight-sync';

// Y-axis bounds for the weight chart: the data's lowest/highest displayed
// value with a margin (weight varies more gradually than blood pressure, so
// the margin is tighter), snapped to whole display units.
export function weightChartBounds(
  records: { weight: number }[],
  margin = 2,
): { min: number; max: number } {
  const values = records.map((r) => r.weight);
  if (!values.length) {
    return { min: 0, max: 100 };
  }
  const roundDown = (v: number) => Math.floor(v);
  const roundUp = (v: number) => Math.ceil(v);
  return {
    min: Math.max(0, roundDown(Math.min(...values) - margin)),
    max: roundUp(Math.max(...values) + margin),
  };
}

const weight = createRecordsCollection<WeightRecord>({
  name: 'weight',
  syncTag: SYNC_TAG,
  validate: validateWeightRecord,
  local: {
    getLocalRecords: local.getLocalWeightRecords,
    getPendingIds: local.getWeightPendingIds,
    getPendingRecords: local.getWeightPendingRecords,
    addRecordToStores: local.addWeightToStores,
    updateRecord: local.updateWeightRecord,
    deleteRecordLocally: local.deleteWeightLocally,
    getDeletionIds: local.getWeightDeletionIds,
    clearPending: local.clearWeightPending,
    clearDeletion: local.clearWeightDeletion,
    upsertRemoteRecords: local.upsertRemoteWeightRecords,
    countPending: local.countWeightPending,
    countDeletions: local.countWeightDeletions,
  },
  api: {
    getServerRecords: getServerWeightRecords,
    syncRecords: syncWeightRecords,
    updateServerRecord: updateServerWeightRecord,
    deleteServerRecords: deleteServerWeightRecords,
  },
});

export function useWeightRecords() {
  const chartRecords = computed(() => last14Days(weight.records.value as WeightRecord[]));

  return {
    ...weight,
    chartRecords,
  };
}

export { SYNC_TAG as WEIGHT_SYNC_TAG };
