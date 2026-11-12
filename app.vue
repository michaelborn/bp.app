<script setup lang="ts">
useHead({
  title: 'bp.app',
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/icons/pwa-192.png' },
  ],
  meta: [{ name: 'theme-color', content: '#0e7490' }],
});
</script>

<template>
  <NuxtPage />
</template>

<style>
:root {
  --bp-background: #f8fafc;
  --bp-surface: #ffffff;
  --bp-text: #0f172a;
  --bp-muted: #64748b;
  --bp-accent: #0e7490;
  --bp-accent-contrast: #ffffff;
  --bp-border: #dbe3ec;
  --bp-danger: #b91c1c;

  color-scheme: light;
}

html,
body,
#__nuxt {
  height: 100%;
}

body {
  margin: 0;
  background: var(--bp-background);
  color: var(--bp-text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
}

button {
  font: inherit;
}

/* Shared base button styles (used by header, table, dialog, chart). */
.bp-button {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--bp-border);
  background: var(--bp-surface);
  color: var(--bp-text);
  cursor: pointer;
}

.bp-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bp-button:focus-visible {
  outline: 2px solid var(--bp-accent);
  outline-offset: 2px;
}
</style>
