// End-to-end tests against the production build (service worker included), at phone and desktop sizes.
//   npm run e2e        (builds, serves on :4173, runs tests/e2e)
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Use the preinstalled Chromium when present (cloud sessions); otherwise Playwright's own.
const localChromium = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {};
// E2E_BASE_URL points the tests at an already-running server (e.g. the dev server) instead of a fresh build.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: external ?? 'http://127.0.0.1:4173/Bash-app/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium', launchOptions } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 }, browserName: 'chromium', launchOptions } },
  ],
  webServer: external
    ? undefined
    : {
        command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173/Bash-app/',
        reuseExistingServer: true,
        timeout: 240_000,
      },
});
