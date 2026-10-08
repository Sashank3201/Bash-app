/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The app is served from https://<user>.github.io/Bash-app/
const base = process.env.BASE_PATH ?? '/Bash-app/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Ink & Shell — Bash for Security Analysts',
        short_name: 'Ink & Shell',
        description: 'Learn Bash scripting for defensive security in 21 days.',
        theme_color: '#F6F3EC',
        background_color: '#F6F3EC',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,wasm}'],
        // The Real Linux Lab (kernel, initramfs, emulator) is downloaded only by people who open it.
        globIgnores: ['linux/**', '**/v86-*.wasm'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // The Real Linux Lab image is large: cache it the first time it is used.
            urlPattern: ({ url }) => url.pathname.includes('/linux/') || /\/v86-[^/]*\.wasm$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'linux-lab',
              expiration: { maxEntries: 4000 },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/diff/**/*.test.ts', 'tests/content/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
