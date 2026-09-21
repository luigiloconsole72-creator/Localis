import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  // `astro preview` non esiste con l'adapter Vercel, quindi gli e2e non
  // partivano affatto. `astro dev` e' l'unico server locale che esegue tutto
  // cio' che questi test toccano: middleware, rotte SSR (/thanks, /access) e
  // API. Le pagine prerenderizzate qui vengono rese su richiesta, percio' NON
  // passano dal middleware, esattamente come in produzione dove le serve la
  // CDN di Vercel.
  webServer: {
    command: 'pnpm dev --port 4321',
    env: { E2E: '1' },
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
