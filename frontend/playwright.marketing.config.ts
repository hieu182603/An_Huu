import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: ['marketing.spec.ts', 'assets.spec.ts', 'auth.spec.ts', 'demo.spec.ts'],
  workers: 1, timeout: 60000,
  use: { baseURL: process.env.MARKETING_BASE_URL || 'http://127.0.0.1:8450', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: process.env.MARKETING_BASE_URL ? undefined : { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 8450 --strictPort', url: 'http://127.0.0.1:8450', reuseExistingServer: false },
});
