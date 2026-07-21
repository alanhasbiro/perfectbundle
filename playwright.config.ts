import { defineConfig, devices } from "@playwright/test";

// Next.js and Convex's dev servers (spawned below via webServer) each load
// .env.local themselves automatically. The Playwright config/test-runner
// process does not — load it explicitly so clerkSetup() and the auth test's
// direct Backend API calls can read CLERK_SECRET_KEY /
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local not present (e.g. CI) — Clerk-dependent tests will fail to
  // authenticate, but the rest of the suite is unaffected.
}

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
    // Exercises the same reduced-motion path real users get (see
    // src/components/motion-config-provider.tsx) — also avoids axe-core
    // catching Framer Motion entrance animations mid-transition.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "setup",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
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
