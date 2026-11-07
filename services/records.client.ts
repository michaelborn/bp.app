import type { BPRecord, SyncRequest, SyncResponse } from '~/shared/bp-record';

// Typed client-side API access. UI components call this service rather
// than embedding API details.

async function requestRecords<T>(input: string, init?: RequestInit): Promise<T> {
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
    const message
      = (payload as { error?: string })?.error
      || `Request failed with HTTP ${response.status}.`;
    throw new SyncError('server', message, null, response.status);
  }
  return payload as T;
}

export type SyncErrorKind = 'network' | 'server' | 'payload';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  readonly status?: number;

  constructor(kind: SyncErrorKind, message: string, cause?: unknown, status?: number) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind;
    this.status = status;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

// GET /api/records — all server records, newest first.
export async function getServerRecords(): Promise<BPRecord[]> {
  const records = await requestRecords<BPRecord[]>('/api/records');
  if (!Array.isArray(records)) {
    throw new SyncError('payload', 'Server returned an unexpected records payload.');
  }
  return records;
}

// POST /api/records/sync — sends queued records, gets acknowledged ids.
export async function syncRecords(records: BPRecord[]): Promise<SyncResponse> {
  const body: SyncRequest = { records };
  return requestRecords<SyncResponse>('/api/records/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
