import { ref } from 'vue';

// Shared dialog behavior for the "date and time are recorded automatically"
// checkbox: checked (default) stamps the record at save time; unchecked
// reveals a datetime-local input so the reading can be back-dated.

// Date -> 'YYYY-MM-DDTHH:MM:SS' in local time, the format
// <input type="datetime-local"> expects.
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export type TimestampResolution =
  | { ok: true; recordedAt: string }
  | { ok: false; error: string };

export function useManualTimestamp() {
  const automatic = ref(true);
  const manual = ref('');

  // Called when the dialog opens: restore the default and prefill the
  // manual input with "now" so an uncheck-then-edit flow starts sensibly.
  function reset() {
    automatic.value = true;
    manual.value = toLocalInputValue(new Date());
  }

  function resolve(): TimestampResolution {
    if (automatic.value) {
      return { ok: true, recordedAt: new Date().toISOString() };
    }
    if (!manual.value) {
      return { ok: false, error: 'Enter a valid date and time.' };
    }
    const date = new Date(manual.value);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: 'Enter a valid date and time.' };
    }
    return { ok: true, recordedAt: date.toISOString() };
  }

  return { automatic, manual, reset, resolve };
}
