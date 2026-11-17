import { ref } from 'vue';

import { kgToLb, lbToKg } from '~/shared/weight-record';

// Display-unit preference for weight. Kilograms stay canonical everywhere
// (CSV, API, IndexedDB); this only controls what the UI shows and accepts.
export type WeightUnit = 'kg' | 'lb';

const STORAGE_KEY = 'bp-weight-unit';
const unit = ref<WeightUnit>('kg');
let loaded = false;

function load() {
  if (loaded) {
    return;
  }
  loaded = true;
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'kg' || saved === 'lb') {
      unit.value = saved;
    }
  }
}

export function useWeightUnits() {
  load();

  function setUnit(next: WeightUnit) {
    unit.value = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  function toggleUnit() {
    setUnit(unit.value === 'kg' ? 'lb' : 'kg');
  }

  // Canonical kg -> display value (one decimal).
  function toDisplay(kg: number): number {
    return unit.value === 'kg' ? Math.round(kg * 10) / 10 : kgToLb(kg);
  }

  // Display value -> canonical kg (one decimal).
  function fromDisplay(value: number): number {
    return unit.value === 'kg' ? Math.round(value * 10) / 10 : lbToKg(value);
  }

  return {
    unit,
    setUnit,
    toggleUnit,
    toDisplay,
    fromDisplay,
  };
}
