import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false, // no parallelism within a file either
  workers: 1, // all spec files share one Convex local backend + rate limiter — run serially to avoid cross-test interference
  retries: 1, // one retry absorbs an occasional real-API hiccup without masking real bugs
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    locale: "en-US", // pins src/lib/quiz/country.ts detection to US/USD for deterministic selectors
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npx convex dev",
      url: "http://127.0.0.1:3210/version",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
