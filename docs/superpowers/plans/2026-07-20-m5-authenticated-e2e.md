# Authenticated E2E Coverage (Signup → Save → Profile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `docs/tasks.md` Milestone 5 gap "Playwright E2E: signup → save → profile → regenerate" — currently only the signed-out guest-gate paths are tested (`tests/e2e/saved-bundles.spec.ts`, `tests/e2e/profiles.spec.ts`), with an explicit comment that Clerk test tokens aren't wired in yet. M4 (auth, save, profiles) is now live, so this is unblocked.

**Architecture:** Use Clerk's official `@clerk/testing/playwright` package for auth: a Playwright "setup project" runs `clerkSetup()` once per suite run (fetches a bot-bypass testing token), then the test itself creates a throwaway Clerk user directly via the Backend API (`@clerk/backend`'s `createClerkClient(...).users.createUser(...)`, already a transitive dependency via `@clerk/nextjs` — no new package for that part) and signs in with Clerk's `clerk.signIn()` helper (`strategy: "password"`). This deliberately does **not** drive Clerk's prebuilt `<SignUp>` form UI — that component is Clerk's own tested surface, not ours, and `clerk.signIn()` is Clerk's documented, blessed way to get a Playwright test into an authenticated state. To avoid spending a second real Gemini API call (the suite already has exactly one, in `quiz-flow.spec.ts`, deliberately capped), the bundle being saved is seeded directly via the existing `convex/testSupport.ts` `seedPopularBundle` mutation (same pattern `share.spec.ts` already uses) and viewed via `/popular` (the only page besides `/quiz/results` and `/my-bundles` that renders `<BundleCard>` with a working `bundleId`, per `src/app/popular/page.tsx`).

**Tech Stack:** `@clerk/testing` (new devDependency), `@clerk/backend` (already installed transitively), Playwright, existing `convex/testSupport.ts` test-only mutations.

## Global Constraints

- $0 operating cost — `@clerk/testing` and `@clerk/backend` are both free/already-licensed under the existing `@clerk/nextjs` dependency; no new paid service.
- `workers: 1`, `fullyParallel: false` in `playwright.config.ts` — the whole suite runs serially; don't fight this.
- Real Gemini API calls are quota-gated to chromium-only via `test.skip(testInfo.project.name !== "chromium", ...)` — this plan adds **zero** new Gemini calls (seeds a bundle directly instead), but the new test still runs chromium-only to avoid creating a fresh Clerk test user on every browser project (4x per full suite run) against the same Clerk instance that also serves real production users.
- Never print API keys/secrets into chat; read `.env.local` via shell redirection only.
- This project's Clerk instance is a **development** instance serving production (no separate prod Clerk instance exists yet) — `+clerk_test` email addresses and Clerk's shared OAuth/test-mode behavior work here specifically because of that; this stays true only until a real production Clerk instance is provisioned.

---

### Task 1: Clerk testing infrastructure (global setup + smoke test)

**Files:**
- Modify: `package.json` (add `@clerk/testing` devDependency — already installed this session via `npm install --save-dev @clerk/testing`, so this step just confirms it's present in the committed file)
- Create: `tests/e2e/clerk.setup.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces: a Playwright project named `"setup"` that later projects can depend on via `dependencies: ["setup"]`; `process.env.CLERK_SECRET_KEY` / `process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` loaded into the Playwright test-runner process itself (previously only the spawned `next dev`/`convex dev` child processes had these, since Next.js and Convex each self-load `.env.local` — the Playwright config/test process does not do this automatically).

- [ ] **Step 1: Confirm `@clerk/testing` is a committed devDependency**

Run: `grep '"@clerk/testing"' package.json`
Expected: a line like `"@clerk/testing": "^1.x.x",` under `devDependencies`. (It was installed via `npm install --save-dev @clerk/testing` earlier this session — this step just verifies `package.json`/`package-lock.json` actually recorded it before continuing.)

- [ ] **Step 2: Load `.env.local` into the Playwright config process, and add the Clerk setup project**

Replace the full contents of `playwright.config.ts`:

```ts
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
```

Only `chromium` depends on `"setup"` — firefox/webkit/mobile-chrome don't run any Clerk-authenticated test (Task 2's test is chromium-only, see Global Constraints), so they don't need the testing-token fetch to succeed.

- [ ] **Step 3: Write the Clerk setup project's test file**

```ts
// tests/e2e/clerk.setup.ts
import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

setup.describe.configure({ mode: "serial" });

setup("global setup", async () => {
  await clerkSetup({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });
});
```

- [ ] **Step 4: Add a minimal smoke test proving sign-in works, before building the full flow**

```ts
// tests/e2e/auth-smoke.spec.ts
import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

test.describe("Clerk test auth wiring", () => {
  // Creates and signs in a real (throwaway) Clerk user — proves the
  // clerkSetup() + clerk.signIn() plumbing works before Task 2 builds the
  // full save/profile flow on top of it. Chromium-only: see
  // playwright.config.ts, only chromium depends on the "setup" project.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Clerk auth smoke test runs once on chromium only"
  );

  test("a freshly created user can sign in", async ({ page }) => {
    const email = `pb-e2e-smoke-${Date.now()}+clerk_test@example.com`;
    const password = `TestPassword${Date.now()}!aB`;

    const user = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      skipPasswordChecks: true,
    });

    try {
      await page.goto("/");
      await clerk.signIn({
        page,
        signInParams: { strategy: "password", identifier: email, password },
      });
      await page.goto("/");

      await expect(page.getByRole("link", { name: "My bundles" })).toBeVisible();
    } finally {
      await clerkClient.users.deleteUser(user.id);
    }
  });
});
```

Note: `test.skip` here uses the `({ browserName }) => boolean` form (fixture-based), not `testInfo.project.name` — both work in Playwright, this form reads slightly cleaner when no `testInfo` is otherwise needed in the test.

- [ ] **Step 5: Run it**

Run: `npx playwright test tests/e2e/auth-smoke.spec.ts --project=chromium`
Expected: PASS — 1 passed. If it fails with a Clerk auth error, run `npx playwright test tests/e2e/auth-smoke.spec.ts --project=chromium --debug` and check that `.env.local` actually has non-empty `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`grep -c '^CLERK_SECRET_KEY=' .env.local` should print `1`, not `0` — never print the value itself).

- [ ] **Step 6: Delete the smoke test (superseded by Task 2) and commit the infrastructure**

The smoke test's only job was to prove the plumbing works in isolation before building the real flow on top — Task 2's test covers the same sign-in path plus everything else, so keeping both would be a redundant real Clerk-API call on every run.

```bash
rm tests/e2e/auth-smoke.spec.ts
git add package.json package-lock.json playwright.config.ts tests/e2e/clerk.setup.ts
git commit -m "test(e2e): wire up @clerk/testing for authenticated Playwright flows"
```

---

### Task 2: Full signup → save → profile E2E test

**Files:**
- Create: `tests/e2e/auth-flow.spec.ts`

**Interfaces:**
- Consumes: `clerkSetup`/`clerk` from `@clerk/testing/playwright` and `createClerkClient` from `@clerk/backend` (Task 1); `testSupport:seedPopularBundle` (existing Convex mutation, returns `Id<"bundles">` as a JSON string when invoked via `npx convex run`, per `share.spec.ts`'s established parsing pattern); `RELATIONSHIPS`/`AGE_BANDS`/`INTERESTS` string literals from `src/lib/quiz/options.ts` (`"Friend"`, `"25-34"`, `"Reading"` used below).
- Produces: nothing consumed elsewhere — this is a leaf E2E test.

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/auth-flow.spec.ts
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { clerk } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

// Chromium-only: this test creates a real (throwaway) Clerk user against the
// project's Clerk instance and only "setup" -> chromium is wired for auth
// (see playwright.config.ts). It seeds its bundle directly via
// testSupport:seedPopularBundle rather than a real quiz completion, so it
// spends zero Gemini quota (the suite's one real Gemini call stays in
// quiz-flow.spec.ts).
test.describe("authenticated flow: signup, save, profile", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Real Clerk user creation — runs once on chromium only"
  );

  test("a new user can save a bundle and create a recipient profile", async ({ page }) => {
    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    const output = execSync('npx convex run testSupport:seedPopularBundle "{}"', {
      encoding: "utf-8",
    });
    const bundleIdLine = output
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.toLowerCase().includes("assertion failed"));
    if (!bundleIdLine) {
      throw new Error(`Could not parse a bundle id from convex run output:\n${output}`);
    }

    const email = `pb-e2e-auth-${Date.now()}+clerk_test@example.com`;
    const password = `TestPassword${Date.now()}!aB`;
    const user = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      skipPasswordChecks: true,
    });

    try {
      // --- Sign in ---
      await page.goto("/");
      await clerk.signIn({
        page,
        signInParams: { strategy: "password", identifier: email, password },
      });
      await page.goto("/");
      await expect(page.getByRole("link", { name: "My bundles" })).toBeVisible();

      // --- Save a bundle (seeded via testSupport:seedPopularBundle, visible on /popular) ---
      await page.goto("/popular");
      const saveButton = page.getByRole("button", { name: "Save" }).first();
      await saveButton.click();
      await expect(page.getByRole("button", { name: "Saved ✓" }).first()).toBeVisible();

      // --- Verify it shows up on /my-bundles ---
      await page.goto("/my-bundles");
      await expect(page.getByText("E2E Popular Bundle")).toBeVisible();

      // --- Create a recipient profile ---
      await page.goto("/profiles");
      await page.getByRole("button", { name: "+ New profile" }).click();
      await page.fill("#pname", "E2E Test Person");
      await page.getByRole("button", { name: "Friend" }).click();
      await page.getByRole("button", { name: "25-34" }).click();
      await page.getByRole("button", { name: "Reading" }).click();
      await page.getByRole("button", { name: "Save profile" }).click();

      await expect(page.getByRole("heading", { name: "E2E Test Person" })).toBeVisible();
      await expect(page.getByText("Friend · 25-34")).toBeVisible();
    } finally {
      await clerkClient.users.deleteUser(user.id);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/auth-flow.spec.ts --project=chromium`
Expected: PASS — 1 passed. Common failure modes and fixes:
  - Timeout on `"My bundles"` link after sign-in → the Convex↔Clerk JWT handshake or Clerk session propagation is slower than expected; increase this specific assertion's timeout (`{ timeout: 15_000 }`) rather than the global test timeout.
  - `"+ New profile"` button not found → confirm exact button text in `src/app/profiles/page.tsx` (`+ New profile`) hasn't changed.
  - Bundle id parse failure → run `npx convex run testSupport:seedPopularBundle "{}"` manually in a terminal first to confirm it still returns a bare id string with no extra output.

- [ ] **Step 3: Run the full existing E2E suite to confirm no regressions**

Run: `npm run test:e2e`
Expected: all previously-passing tests (guest-gate tests in `saved-bundles.spec.ts`/`profiles.spec.ts`, `quiz-flow.spec.ts`, `share.spec.ts`, `popular.spec.ts`, `trending.spec.ts`, `landing.spec.ts`, `bundle-images.spec.ts`, `affiliate-buy.spec.ts`, `accessibility.spec.ts`) still pass, plus the two new tests from this plan (`clerk.setup.ts`'s setup step + `auth-flow.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/auth-flow.spec.ts
git commit -m "test(e2e): add authenticated signup -> save -> profile flow"
```

---

### Task 3: Update docs

**Files:**
- Modify: `docs/tasks.md`

- [ ] **Step 1: Flip the checkbox**

In the Milestone 5 section, change:

```
- [ ] P1 Playwright E2E: signup → save → profile → regenerate — blocked on M4 (no auth/save/profiles exist yet)
```

to:

```
- [x] P1 Playwright E2E: signup → save → profile — `tests/e2e/auth-flow.spec.ts`, uses `@clerk/testing`'s `clerk.signIn()` against a throwaway Clerk user created via the Backend API (not a real sign-up-form click-through — that's Clerk's own tested surface), bundle seeded via `testSupport:seedPopularBundle` to spend zero extra Gemini quota. `regenerate` isn't covered yet — that's per-bundle regenerate, a separate not-yet-built feature (see Backlog); extend this test once it exists.
```

- [ ] **Step 2: Commit**

```bash
git add docs/tasks.md
git commit -m "docs: mark M5 authenticated E2E coverage complete"
```

---

## Self-Review Notes

- **Spec coverage:** signup (via programmatic auth, deliberately not the UI form — documented rationale in Architecture) ✅, save ✅, profile ✅. `regenerate` explicitly deferred to the separate item-swap/regenerate plan being written this session — Task 3's doc update says so explicitly rather than silently dropping it.
- **Placeholder scan:** no TBD/TODO; all code blocks are complete and were derived from real, verified `.d.ts` files and live API checks this session (not guessed).
- **Type consistency:** `createClerkClient({ secretKey })` and `.users.createUser({ emailAddress, password, skipPasswordChecks })` / `.users.deleteUser(id)` signatures verified against `node_modules/@clerk/backend/dist/index.d.ts` and `UserApi.d.ts` directly. `clerk.signIn({ page, signInParams: { strategy: "password", identifier, password } })` verified against `node_modules/@clerk/testing/dist/types/playwright/helpers.d.ts`.
