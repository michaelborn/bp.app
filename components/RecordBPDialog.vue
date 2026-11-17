<script setup lang="ts">
import { validateBPInput } from '#shared/utils/record-validation';
import { useManualTimestamp } from '~/composables/useManualTimestamp';

const open = defineModel<boolean>('open', { default: false });

const emit = defineEmits<{
  (e: 'save', payload: { systolic: number; diastolic: number; recordedAt: string }): void;
  (e: 'close'): void;
}>();

const systolic = ref<string>('');
const diastolic = ref<string>('');
const errorMessage = ref<string | null>(null);
// Destructured to top-level bindings so the refs auto-unwrap in the
// template (nested refs inside a plain object would not).
const {
  automatic: automaticTimestamp,
  manual: manualTimestamp,
  reset: resetTimestamp,
  resolve: resolveTimestamp,
} = useManualTimestamp();

const systolicInput = ref<HTMLInputElement | null>(null);

function resetForm() {
  systolic.value = '';
  diastolic.value = '';
  errorMessage.value = null;
  resetTimestamp();
}

watch(open, (isOpen) => {
  if (isOpen) {
    resetForm();
    nextTick(() => systolicInput.value?.focus());
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

function submit() {
  const parsing = validateBPInput({ systolic: systolic.value, diastolic: diastolic.value });
  if (!parsing.valid) {
    errorMessage.value = parsing.error ?? 'Enter valid readings.';
    return;
  }
  const resolved = resolveTimestamp();
  if (!resolved.ok) {
    errorMessage.value = resolved.error;
    return;
  }
  errorMessage.value = null;
  emit('save', {
    systolic: Number(systolic.value),
    diastolic: Number(diastolic.value),
    recordedAt: resolved.recordedAt,
  });
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
        aria-labelledby="record-bp-title"
      >
        <h2 id="record-bp-title" class="bp-dialog-title">Record BP</h2>
        <form class="bp-dialog-form" novalidate @submit.prevent="submit">
          <div class="bp-fields">
            <label class="bp-field">
              <span class="bp-field-label">Systolic (mmHg)</span>
              <input
                ref="systolicInput"
                v-model="systolic"
                class="bp-input"
                type="number"
                inputmode="numeric"
                name="systolic"
                step="1"
                autocomplete="off"
              >
            </label>
            <label class="bp-field">
              <span class="bp-field-label">Diastolic (mmHg)</span>
              <input
                v-model="diastolic"
                class="bp-input"
                type="number"
                inputmode="numeric"
                name="diastolic"
                step="1"
                autocomplete="off"
              >
            </label>
          </div>

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
            <button type="submit" class="bp-button bp-button-primary">Save</button>
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

/* Two fields side by side, proportioned equally; they split the full
   dialog width and shrink within it instead of overflowing. */
.bp-fields {
  display: flex;
  gap: 0.75rem;
  width: 100%;
}

.bp-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1 1 0;
  min-width: 0;
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
