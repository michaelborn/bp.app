import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  // POC is an offline-first installable app shell; SPA mode emits the
  // static index.html the service worker uses as the navigation fallback.
  ssr: false,
  devtools: { enabled: false },

  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1',
      htmlAttrs: { lang: 'en' },
    },
  },

  modules: ['@vite-pwa/nuxt'],

  nitro: {
    prerender: {
      crawlLinks: false,
      // Emits the static index.html app shell that the service worker
      // precaches and serves for offline navigation requests.
      routes: ['/'],
    },
  },

  pwa: {
    includeAssets: ['favicon.ico', 'bp-sync.js'],
    manifest: {
      name: 'bp.app',
      short_name: 'bp.app',
      description: 'Track your blood pressure. Works offline.',
      theme_color: '#0e7490',
      background_color: '#f8fafc',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icons/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Precache the app shell and static assets; NavigationRequests fall
      // back to the app shell so the app opens offline after first load.
      globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff,woff2}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      // bp-sync.js adds a Background Sync handler (sync replay of queued
      // records) to the generated service worker.
      importScripts: ['/bp-sync.js'],
    },
    client: {
      installPrompt: false,
    },
    devOptions: {
      enabled: false,
    },
  },
});
