export type BPRecord = {
  id: string;           // UUID generated once on the client; idempotency key
  recordedAt: string;   // ISO-8601 UTC timestamp
  systolic: number;     // integer, mmHg
  diastolic: number;    // integer, mmHg
};

export type SyncRequest = { records: BPRecord[] };

export type SyncResponse = {
  acked: string[];
  records: BPRecord[];
};
