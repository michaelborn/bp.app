<script setup lang="ts">
import { WEIGHT_MAX_KG, WEIGHT_MIN_KG } from '#shared/utils/weight-validation';
import { useWeightUnits } from '~/composables/useWeightUnits';
import { useManualTimestamp } from '~/composables/useManualTimestamp';

const open = defineModel<boolean>('open', { default: false });

const emit = defineEmits<{
  (e: 'save', payload: { weightKg: number; recordedAt: string }): void;
  (e: 'close'): void;
}>();

const { unit, toDisplay, fromDisplay } = useWeightUnits();

const weightInput = ref<string>('');
const errorMessage = ref<string | null>(null);
const weightField = ref<HTMLInputElement | null>(null);
// Destructured to top-level bindings so the refs auto-unwrap in the
// template (nested refs inside a plain object would not).
const {
  automatic: automaticTimestamp,
  manual: manualTimestamp,
  reset: resetTimestamp,
  resolve: resolveTimestamp,
} = useManualTimestamp();

function resetForm() {
  weightInput.value = '';
  errorMessage.value = null;
  resetTimestamp();
}

watch(open, (isOpen) => {
  if (isOpen) {
    resetForm();
    nextTick(() => weightField.value?.focus());
    document.addEventListener('keydown', onEscape);
  } else {
    document.removeEventListener('keydown', onEscape);
  }
});

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    close();
  }
}

function close() {
  open.value = false;
  emit('close');
}

// Bounds as entered in the active display unit.
function bounds(): { min: number; max: number } {
  return unit.value === 'kg'
    ? { min: WEIGHT_MIN_KG, max: WEIGHT_MAX_KG }
    : { min: toDisplay(WEIGHT_MIN_KG), max: toDisplay(WEIGHT_MAX_KG) };
}

function submit() {
  const value = Number(weightInput.value);
  const { min, max } = bounds();

  if (weightInput.value === '') {
    errorMessage.value = 'Enter a weight.';
    return;
  }
  if (!Number.isFinite(value) || Math.round(value * 10) !== value * 10) {
    errorMessage.value = 'Enter a weight with at most one decimal place.';
    return;
  }
  if (value < min || value > max) {
    errorMessage.value = `Weight must be between ${min} and ${max} ${unit.value}.`;
    return;
  }
  errorMessage.value = null;
  const resolved = resolveTimestamp();
  if (!resolved.ok) {
    errorMessage.value = resolved.error;
    return;
  }
  emit('save', { weightKg: fromDisplay(value), recordedAt: resolved.recordedAt });
  close();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="bp-dialog-backdrop"
      @click.self="close"
    >
      <div
        class="bp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-weight-title"
      >
        <h2 id="record-weight-title" class="bp-dialog-title">Record weight</h2>
        <form class="bp-dialog-form" novalidate @submit.prevent="submit">
          <label class="bp-field">
            <span class="bp-field-label">Weight ({{ unit }})</span>
            <input
              ref="weightField"
              v-model="weightInput"
              class="bp-input"
              type="number"
              inputmode="decimal"
              name="weight"
              step="0.1"
              autocomplete="off"
              data-test="weight-input"
            >
          </label>

          <label class="bp-checkbox">
            <input
              v-model="automaticTimestamp"
              type="checkbox"
              data-test="auto-timestamp"
            >
            <span>Date and time are recorded automatically</span>
          </label>

          <div v-if="!automaticTimestamp" class="bp-field">
            <span class="bp-field-label">Date &amp; time</span>
            <input
              v-model="manualTimestamp"
              class="bp-input"
              type="datetime-local"
              step="1"
              name="recordedAt"
              autocomplete="off"
              data-test="manual-datetime"
            >
          </div>

          <p
            v-if="errorMessage"
            class="bp-error"
            role="alert"
          >
            {{ errorMessage }}
          </p>

          <div class="bp-dialog-actions">
            <button type="button" class="bp-button" @click="close">Cancel</button>
            <button type="submit" class="bp-button bp-button-primary" data-test="weight-save">Save</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.bp-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 40;
}

.bp-dialog {
  background: var(--bp-surface);
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.2);
  padding: 1.25rem;
  box-sizing: border-box;
  width: 100%;
  max-width: 22rem;
}

.bp-dialog-title {
  margin: 0 0 1rem;
  font-size: 1.125rem;
}

.bp-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bp-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.bp-field-label {
  font-size: 0.8125rem;
  line-height: 1.2;
  color: var(--bp-muted);
  white-space: nowrap;
}

.bp-input {
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bp-border);
  background: var(--bp-background);
}

.bp-input:focus-visible {
  outline: 2px solid var(--bp-accent);
  outline-offset: 1px;
}

input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.bp-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--bp-muted);
}

.bp-checkbox input {
  accent-color: var(--bp-accent);
  margin: 0;
}

.bp-error {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--bp-danger);
}

.bp-dialog-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.bp-button-primary {
  background: var(--bp-accent);
  border-color: var(--bp-accent);
  color: var(--bp-accent-contrast);
}
</style>
