import { defineConfig } from '@playwright/test';

// End-to-end tests run against the built CLI and viewer (npm run build first).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: { viewport: { width: 1400, height: 820 } },
});
