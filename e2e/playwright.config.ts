import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import path from 'node:path'

// Per-run temp DB keeps the dev bank.db untouched.
const E2E_DB_PATH = path.join(
  mkdtempSync(path.join(tmpdir(), 'acme-e2e-')),
  'bank-e2e.db',
)

const BACKEND_PORT = '5050'
const FRONTEND_PORT = '5174'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'go run .',
      cwd: '../backend',
      env: {
        PORT: BACKEND_PORT,
        DB_PATH: E2E_DB_PATH,
      },
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      cwd: '../frontend',
      env: {
        VITE_PORT: FRONTEND_PORT,
        VITE_API_URL: `http://localhost:${BACKEND_PORT}`,
      },
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
