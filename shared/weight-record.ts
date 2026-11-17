export type WeightRecord = {
  id: string;           // UUID generated once on the client; idempotency key
  recordedAt: string;   // ISO-8601 UTC timestamp
  weight: number;       // kilograms, one decimal place (canonical unit)
};

export type WeightSyncRequest = { records: WeightRecord[] };

export type WeightSyncResponse = {
  acked: string[];
  records: WeightRecord[];
};

// Unit conversion. Kilograms are canonical everywhere (CSV, API, IndexedDB);
// pounds are a display-unit conversion only.
export const LB_PER_KG = 2.2046226218;

export function kgToLb(kg: number): number {
  return Math.round(kg * LB_PER_KG * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / LB_PER_KG) * 10) / 10;
}
