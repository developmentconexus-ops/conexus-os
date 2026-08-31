import { defineConfig } from '@playwright/test'

export default defineConfig({
  timeout: 30_000,
  workers: 1,
  retries: 0,
  reporter: 'line',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
