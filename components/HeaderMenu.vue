<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

// Accessible header dropdown menu (WAI-ARIA menu pattern): a trigger
// button that opens a role="menu" panel. Items are slotted in by the
// parent as [role="menuitem"] buttons; activating one closes the menu
// and returns focus to the trigger. Escape closes, arrow keys move
// between items, and pointerdown outside dismisses.
const props = withDefaults(
  defineProps<{
    // Visible trigger text; omit for icon-only triggers (set ariaLabel).
    text?: string;
    // Accessible name for icon-only triggers (e.g. the gear).
    ariaLabel?: string;
    icon?: 'hamburger' | 'gear';
    variant?: 'primary' | 'default';
  }>(),
  { variant: 'default' },
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const triggerId = useId();
const menuId = useId();

function menuItems(): HTMLElement[] {
  if (!menu.value) {
    return [];
  }
  return [...menu.value.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
}

function openMenu() {
  open.value = true;
  nextTick(() => menuItems()[0]?.focus());
}

function close(returnFocus: boolean) {
  open.value = false;
  if (returnFocus) {
    trigger.value?.focus();
  }
}

function onTriggerClick() {
  if (open.value) {
    close(false);
  } else {
    openMenu();
  }
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!open.value) {
      openMenu();
    } else {
      menuItems()[0]?.focus();
    }
  }
}

function onMenuKeydown(event: KeyboardEvent) {
  const items = menuItems();
  if (!items.length) {
    return;
  }
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'Escape') {
    event.preventDefault();
    close(true);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    items[(currentIndex + 1) % items.length].focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    items[(currentIndex - 1 + items.length) % items.length].focus();
  } else if (event.key === 'Home') {
    event.preventDefault();
    items[0].focus();
  } else if (event.key === 'End') {
    event.preventDefault();
    items[items.length - 1].focus();
  } else if (event.key === 'Tab') {
    close(false);
  }
}

// Activating any item (a click that reaches a menuitem) runs the item's
// own handler first, then closes the menu and refocuses the trigger.
function onMenuClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('[role="menuitem"]')) {
    close(true);
  }
}

function onDocumentPointerdown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) {
    close(false);
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocumentPointerdown);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerdown);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerdown);
});
</script>

<template>
  <div ref="root" class="bp-menu">
    <button
      :id="triggerId"
      ref="trigger"
      type="button"
      class="bp-button bp-menu-trigger"
      :class="{ 'bp-button-primary': props.variant === 'primary' }"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-controls="menuId"
      :aria-label="props.ariaLabel"
      @click="onTriggerClick"
      @keydown="onTriggerKeydown"
    >
      <svg
        v-if="props.icon === 'hamburger'"
        class="bp-menu-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
      <svg
        v-else-if="props.icon === 'gear'"
        class="bp-menu-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span v-if="props.text">{{ props.text }}</span>
    </button>

    <div
      v-if="open"
      :id="menuId"
      ref="menu"
      class="bp-menu-list"
      role="menu"
      :aria-labelledby="triggerId"
      @keydown="onMenuKeydown"
      @click="onMenuClick"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bp-menu {
  position: relative;
}

.bp-menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.bp-menu-icon {
  width: 1rem;
  height: 1rem;
  flex: none;
}

.bp-button-primary {
  background: var(--bp-accent);
  border-color: var(--bp-accent);
  color: var(--bp-accent-contrast);
}

.bp-menu-list {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 30;
  min-width: 11rem;
  display: flex;
  flex-direction: column;
  padding: 0.25rem;
  background: var(--bp-surface);
  border: 1px solid var(--bp-border);
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.15);
}

.bp-menu-list :deep([role='menuitem']) {
  text-align: left;
  padding: 0.5rem 0.75rem;
  border: none;
  border-radius: 0.35rem;
  background: none;
  color: var(--bp-text);
  font: inherit;
  cursor: pointer;
}

.bp-menu-list :deep([role='menuitem']:hover) {
  background: var(--bp-background);
}

.bp-menu-list :deep([role='menuitem']:focus-visible) {
  outline: 2px solid var(--bp-accent);
  outline-offset: -2px;
}

.bp-menu-list :deep([role='menuitem']:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
