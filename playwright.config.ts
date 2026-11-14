import { defineConfig, devices } from '@playwright/test';

const API_PORT = 8788;
const WEB_PORT = 5174;
const useBuild = !!process.env.E2E_USE_BUILD; // CI: test the production bundle via `vite preview`

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  // The server's debug switch (failure injection) is process-wide: run serially.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 860 } }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: 'pnpm --filter @keyring/server exec tsx src/index.ts',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(API_PORT),
        DATABASE_PATH: ':memory:',
        SEED_ON_EMPTY: 'false',
        MOCK_SPEED: '0.35',
        RATE_LIMIT_PER_MINUTE: '1000',
        ENABLE_DEBUG: 'true',
        WEB_ORIGIN: '*',
        ANTHROPIC_API_KEY: '',
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: useBuild
        ? `pnpm --filter @keyring/web exec vite preview --port ${WEB_PORT} --strictPort`
        : `pnpm --filter @keyring/web exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      env: { KEYRING_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
});
