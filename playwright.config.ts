import { defineConfig, devices } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/coordinator.json";

// Environments that pre-provision Chromium may ship a build that does not match
// this Playwright version; point at it explicitly rather than downloading a
// second copy.
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : undefined;

/** End-to-end run over a real server and database. */
export default defineConfig({
  testDir: "./e2e",
  // Clear students left by earlier runs so capacity assertions start from a
  // known state.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    ...(launchOptions ? { launchOptions } : {}),
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      // Reuse the session saved by the setup project: Better Auth rate-limits
      // sign-in, so authenticating once per suite is both faster and correct.
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
