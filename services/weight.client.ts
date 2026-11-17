import type { WeightRecord, WeightSyncRequest, WeightSyncResponse } from '~/shared/weight-record';
import { SyncError } from '~/services/records.client';

// Typed client-side API access for weight records. Mirrors the
// blood-pressure service; UI code calls this rather than fetch directly.

async function requestWeight<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (cause) {
    throw new SyncError('network', 'Network unreachable.', cause);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new SyncError('payload', 'Server returned a non-JSON response.', cause, response.status);
  }

  if (!response.ok) {
    const message = (payload as { error?: string })?.error || `Request failed with HTTP ${response.status}.`;
    throw new SyncError('server', message, null, response.status);
  }
  return payload as T;
}

// GET /api/weight — all server weight records, newest first.
export async function getServerWeightRecords(): Promise<WeightRecord[]> {
  const records = await requestWeight<WeightRecord[]>('/api/weight');
  if (!Array.isArray(records)) {
    throw new SyncError('payload', 'Server returned an unexpected weight records payload.');
  }
  return records;
}

// POST /api/weight/sync — sends queued records, gets acknowledged ids.
export async function syncWeightRecords(records: WeightRecord[]): Promise<WeightSyncResponse> {
  const body: WeightSyncRequest = { records };
  return requestWeight<WeightSyncResponse>('/api/weight/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// PUT /api/weight/:id — replaces a stored weight record (edits).
export async function updateServerWeightRecord(record: WeightRecord): Promise<WeightRecord> {
  return requestWeight<WeightRecord>(`/api/weight/${record.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
}

// POST /api/weight/delete — batch-deletes stored records; acks all ids.
export async function deleteServerWeightRecords(ids: string[]): Promise<{ acked: string[]; removed: string[] }> {
  return requestWeight<{ acked: string[]; removed: string[] }>('/api/weight/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}
