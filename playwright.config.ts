import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // The suite drives one shared browser context with the extension loaded.
  workers: 1,
  reporter: 'list',
});
