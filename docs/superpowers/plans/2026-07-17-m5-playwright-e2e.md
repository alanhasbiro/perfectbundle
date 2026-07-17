# M5 Sprint 1 — Playwright E2E Core Happy Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and configure Playwright, then write E2E specs covering the four core user journeys (landing, quiz→results, trending, share) against a real local dev server + local Convex backend, spending minimal real Gemini quota.

**Architecture:** Playwright's `webServer` config array starts both `npx convex dev` (health-checked at `http://127.0.0.1:3210/version`) and `npm run dev` (health-checked at `http://localhost:3000`) automatically before any test runs — one command (`npm run test:e2e`) is sufficient, no manual two-terminal setup. The share-page spec avoids a full quiz→share click-through (expensive, flaky) by seeding a known public bundle directly via a small test-only Convex mutation (`convex/testSupport.ts`), shelled out to once in a `beforeAll` hook. The quiz-flow spec limits itself to exactly one full quiz-to-results completion (real Gemini call) and asserts on whichever terminal state actually occurs (success or graceful fallback), since flakiness from an occasional free-tier API hiccup must not fail the suite.

**Tech Stack:** `@playwright/test`, chromium only (cross-browser matrix deferred), Node's `child_process` for the one-shot test-data seed.

## Global Constraints

- **$0 cost** — Playwright itself is free/OSS; no new paid services. Real Gemini calls in this suite are capped to a minimum (documented per-file) to conserve free-tier quota per `docs/planning.md` §3 cost policy.
- This suite runs locally only — NOT wired into GitHub Actions CI this sprint (Convex + a real Gemini key aren't appropriate CI dependencies without secrets management, which is out of scope here). Note this explicitly in Task 6.
- Do not modify `vitest.config.ts` or any existing `src/**/*.test.ts` — this is a fully separate suite in `tests/e2e/`.
- TypeScript strict; existing root `tsconfig.json` already includes `**/*.ts` so `tests/e2e/**` typechecks as part of `npm run typecheck` — no tsconfig changes needed unless typecheck fails and reveals otherwise.
- Cross-browser matrix, mobile-viewport testing, Lighthouse, and accessibility audit are explicitly OUT of scope for this sprint (left in `docs/tasks.md` as follow-up items) — this sprint is chromium-only, happy-path coverage.

---

### Task 1: Install and configure Playwright

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json` (add `test:e2e` script), `.gitignore` (Playwright artifacts)

**Interfaces:**
- Produces: `npm run test:e2e` — runs the full E2E suite, auto-starting both required servers.

- [ ] **Step 1: Install Playwright and the chromium browser binary**

```powershell
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false, // shares one Convex local backend + rate limiter — avoid cross-test interference
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
```

- [ ] **Step 3: Add the `test:e2e` script to `package.json`**

In the `"scripts"` block, add:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Add Playwright artifacts to `.gitignore`**

Append to `.gitignore`:
```
# Playwright
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 5: Commit**

```powershell
git add playwright.config.ts package.json package-lock.json .gitignore
git commit -m "chore: install and configure Playwright E2E (chromium, auto-start Convex+Next)"
```

---

### Task 2: Test-only Convex seed mutation (for the share spec)

**Files:**
- Create: `convex/testSupport.ts`

**Interfaces:**
- Produces: `mutation seedPublicBundle` — args `{}`, inserts one fully-formed, already-`isPublic: true` bundle document directly (no Gemini call) and returns its `Id<"bundles">` as a string. Consumed by `tests/e2e/share.spec.ts` (Task 4).

- [ ] **Step 1: Write `convex/testSupport.ts`**

```typescript
// TEST-ONLY: used by the Playwright E2E suite (tests/e2e/share.spec.ts) to seed
// a real public bundle without spending Gemini quota or depending on a full
// quiz->share click-through. Not gated behind auth since there is no auth
// system yet (same trust model as bundles:makePublic). If this project ever
// deploys with real users before an admin/auth layer exists, delete this file
// or gate it behind an environment check before launch — tracked in
// docs/tasks.md Milestone 6 backlog.
import { mutation } from "./_generated/server";

export const seedPublicBundle = mutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("bundles", {
      createdAt: Date.now(),
      quizHash: "e2e-test-fixture",
      quiz: {
        occasion: "Birthday",
        ageBand: "25-34",
        relationship: "Friend",
        interests: ["Testing"],
        budget: 50,
        currency: "USD",
        urgency: "normal",
        exclusions: [],
        country: "US",
      },
      theme: "E2E Test Bundle",
      rationale: "Seeded directly for Playwright share-page tests.",
      estTotal: "$40-50",
      items: [
        {
          name: "Test Item One",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "test item one",
          tags: ["test"],
        },
        {
          name: "Test Item Two",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$15-20",
          searchQuery: "test item two",
          tags: ["test"],
        },
        {
          name: "Test Item Three",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "test item three",
          tags: ["test"],
        },
      ],
      isPublic: true,
    });
    return id;
  },
});
```

- [ ] **Step 2: Push and typecheck**

Run: `npx convex dev --once; npm run typecheck`
Expected: both PASS.

- [ ] **Step 3: Manual verification**

```powershell
npx convex run testSupport:seedPublicBundle "{}"
```
Expected: prints a quoted bundle id string (e.g. `"j57..."`), no error.

- [ ] **Step 4: Commit**

```powershell
git add convex/testSupport.ts convex/_generated
git commit -m "test: Convex test-only mutation to seed a public bundle for E2E"
```

---

### Task 3: Landing page spec

**Files:**
- Create: `tests/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: nothing beyond the running app.

- [ ] **Step 1: Write `tests/e2e/landing.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("shows the headline and both CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Never wonder what to gift again." })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Start the quiz" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Or browse trending bundles" })).toBeVisible();
  });

  test("Start the quiz navigates to /quiz", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start the quiz" }).click();
    await expect(page).toHaveURL(/\/quiz$/);
  });

  test("Or browse trending bundles navigates to /trending", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Or browse trending bundles" }).click();
    await expect(page).toHaveURL(/\/trending$/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- landing.spec.ts`
Expected: 3 passed. (First run will be slower — both dev servers cold-start.)

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/landing.spec.ts
git commit -m "test(e2e): landing page headline + CTA navigation"
```

---

### Task 4: Share page spec

**Files:**
- Create: `tests/e2e/share.spec.ts`

**Interfaces:**
- Consumes: `testSupport:seedPublicBundle` (Task 2) via a one-time shell-out in `beforeAll`.

- [ ] **Step 1: Write `tests/e2e/share.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

let publicBundleId: string;

test.beforeAll(() => {
  // Seed one real public bundle directly (no Gemini call) — see convex/testSupport.ts.
  const output = execSync('npx convex run testSupport:seedPublicBundle "{}"', {
    encoding: "utf-8",
  });
  const line = output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.toLowerCase().includes("assertion failed"));
  if (!line) {
    throw new Error(`Could not parse a bundle id from convex run output:\n${output}`);
  }
  publicBundleId = line.replace(/^"|"$/g, "");
});

test.describe("share page", () => {
  test("renders a seeded public bundle's content and title", async ({ page }) => {
    await page.goto(`/b/${publicBundleId}`);
    await expect(
      page.getByRole("heading", { name: "A gift bundle, shared with you 🎁" })
    ).toBeVisible();
    await expect(page.getByText("E2E Test Bundle")).toBeVisible();
    await expect(page.getByText("Test Item One")).toBeVisible();
    await expect(page).toHaveTitle(/E2E Test Bundle/);
  });

  test("shows a not-available state for a nonexistent id", async ({ page }) => {
    await page.goto("/b/nonexistent00000000000000000000");
    await expect(page.getByText("This bundle isn't available.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Build your own" })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- share.spec.ts`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/share.spec.ts
git commit -m "test(e2e): share page renders seeded bundle; not-found state for bad id"
```

---

### Task 5: Trending page spec

**Files:**
- Create: `tests/e2e/trending.spec.ts`

**Interfaces:**
- Consumes: the 5 curated bundles seeded at M1 (`convex/seedData.ts`) — no new fixtures needed.

- [ ] **Step 1: Write `tests/e2e/trending.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

const SEEDED_TITLES = [
  "The Coffee Ritual",
  "The Cozy Reader",
  "New Parent Survival Kit",
  "Desk Upgrade, Under $50",
  "The Home Chef's Edge",
];

test.describe("trending page", () => {
  test("renders all 5 seeded curated bundles with retailer links", async ({ page }) => {
    await page.goto("/trending");
    await expect(page.getByRole("heading", { name: "Trending bundles" })).toBeVisible();

    for (const title of SEEDED_TITLES) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }

    await expect(page.getByRole("link", { name: "Find it on Amazon" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Find it on Etsy" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Find it on eBay" }).first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- trending.spec.ts`
Expected: 1 passed. If it fails because fewer than 5 titles are found, re-seed curated data with `npx convex run seed:seedCurated` (idempotent — safe to re-run) and retry.

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/trending.spec.ts
git commit -m "test(e2e): trending page renders all seeded curated bundles"
```

---

### Task 6: Quiz flow spec (back-nav + one full completion)

**Files:**
- Create: `tests/e2e/quiz-flow.spec.ts`

**Interfaces:**
- Consumes: the running quiz wizard (`src/components/quiz/steps/*`) and results page (`src/app/quiz/results/page.tsx`).

- [ ] **Step 1: Write `tests/e2e/quiz-flow.spec.ts`**

```typescript
import { test, expect, type Page } from "@playwright/test";

// NOTE: this file performs exactly ONE full quiz->results completion, which
// triggers one real (free-tier) Gemini call. Keep it at one — do not add more
// full completions here; add narrower tests (like back-nav below) instead.

async function fillOccasion(page: Page) {
  await page.getByRole("button", { name: "Birthday" }).click();
}

async function fillRecipient(page: Page) {
  await page.getByRole("button", { name: "Friend" }).click();
  await page.getByRole("button", { name: "25-34" }).click();
}

test.describe("quiz back-navigation", () => {
  test("preserves earlier answers when navigating back and forward", async ({ page }) => {
    await page.goto("/quiz");
    await fillOccasion(page);
    await page.getByRole("button", { name: "Next" }).click();

    await fillRecipient(page);

    // Go back to the occasion step.
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("button", { name: "Birthday" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Go forward again — recipient answers should still be selected.
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("button", { name: "Friend" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "25-34" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});

test.describe("quiz full completion", () => {
  test("completing all 6 steps reaches a usable results page", async ({ page }) => {
    await page.goto("/quiz");

    await fillOccasion(page);
    await page.getByRole("button", { name: "Next" }).click();

    await fillRecipient(page);
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Coffee & tea" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await page.fill("#budget", "50");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: /Within a couple of weeks/ }).click();
    await page.getByRole("button", { name: "Next" }).click();

    // Exclusions step has no required input — submit directly.
    await page.getByRole("button", { name: "Build my bundles" }).click();

    await expect(page).toHaveURL(/\/quiz\/results$/);

    // Generation takes several seconds and can, rarely, fail (free-tier API) —
    // assert on whichever terminal state actually occurs rather than assuming
    // success, so an occasional API hiccup doesn't make this suite flaky.
    const success = page.getByRole("heading", { name: "Your gift bundles 🎁" });
    const fallback = page.getByText("We hit a snag generating something new");
    await expect(success.or(fallback)).toBeVisible({ timeout: 45_000 });

    if (await success.isVisible()) {
      const retailerLinks = page.getByRole("link", { name: /Find it on/ });
      await expect(retailerLinks.first()).toBeVisible();
      expect(await retailerLinks.count()).toBeGreaterThanOrEqual(3);
    } else {
      // Fallback path: trending bundles must render, never a dead end.
      await expect(page.getByRole("link", { name: /Find it on/ }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "← Try the quiz again" })).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- quiz-flow.spec.ts`
Expected: 2 passed. The full-completion test may take 10-40s — this is expected (real Gemini call).

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/quiz-flow.spec.ts
git commit -m "test(e2e): quiz back-navigation + one full quiz-to-results completion"
```

---

### Task 7: Full suite run, docs update, push

**Files:**
- Modify: `docs/tasks.md`, `docs/checkpoint.md`

- [ ] **Step 1: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: 8 passed (3 landing + 2 share + 1 trending + 2 quiz-flow), 0 failed. If the full-completion quiz test fails due to a genuine app bug (not an API hiccup), fix the bug before proceeding — do not weaken the assertion to hide a real failure.

- [ ] **Step 2: Run the rest of the standard verification suite**

Run: `npm run typecheck; npm run lint; npm test; npm run build`
Expected: all PASS (unchanged from before this sprint — confirms the new `tests/e2e/**` and `convex/testSupport.ts` files don't break anything else).

- [ ] **Step 3: Update `docs/tasks.md`**

Under Milestone 5 "Automated Testing", check off:
```
- [x] E2E tests for critical user flows — Playwright, chromium: landing, quiz-flow (back-nav + one full completion), trending, share (docs/superpowers/plans/2026-07-17-m5-playwright-e2e.md)
```
Add a note directly beneath it:
```
- Note: E2E suite runs locally only (`npm run test:e2e`), not yet wired into GitHub Actions CI — doing so needs a CI-safe Gemini key/quota strategy, deferred.
- [ ] P1 Cross-browser Playwright matrix (firefox/webkit) — follow-up, not in this sprint
- [ ] P1 Mobile-viewport Playwright pass — follow-up, not in this sprint
- [ ] P1 Lighthouse performance/a11y pass — follow-up, not in this sprint
```

- [ ] **Step 4: Update `docs/checkpoint.md`**

Update progress, mark the E2E milestone item as landed, note the local-only CI caveat, add a change log entry, set Current Focus to whatever the next logical milestone is (M3 dashboard / M4 accounts, both pending owner-provided keys — or continue with M6 launch-prep items that need no keys, owner's call).

- [ ] **Step 5: Commit and push**

```powershell
git add -A
git commit -m "test: Playwright E2E core happy-path suite (landing, quiz, trending, share)"
git push
```

---

## Self-Review Notes

- **Spec coverage:** Playwright install/config → Task 1. Convex-backend-availability problem → solved via `webServer` array in Task 1 (no manual two-terminal step needed, as requested). All 4 required spec files → Tasks 3-6. Quota-safety for quiz-flow → capped at exactly 1 full completion, documented inline in the spec file itself (Task 6 Step 1 comment). Share-page test data → `testSupport.ts` seed mutation (Task 2), chosen over a full quiz→share click-through for reliability and zero Gemini cost; chosen over adding a `curated.getApprovedById` query because curated bundles live in a separate table from `bundles` and the share flow (`makePublic`/`getPublic`) is bundle-table-specific — extending curated bundles to be shareable would be actual scope creep, not needed for this test.
- **Placeholder scan:** clean — every step has complete, runnable code.
- **Type consistency:** `testSupport.ts`'s bundle document shape matches the `bundles` table validator in `convex/schema.ts` and the `BundleContentLike`/`BundleItemLike` shapes consumed by `<BundleCard>` exactly (theme, rationale, estTotal, items[] with all 6 fields) — the seeded fixture renders through the same `/b/[id]` code path as a real generated bundle, so the test is exercising real rendering logic, not a mock.
- **Known trade-off flagged, not hidden:** the "Building your bundles…" loading state is not asserted in Task 6 — by the time an automated assertion could run, generation may already be complete (cache hit, fast API response), making a deterministic assertion on that transient state inherently race-prone without mocking the network layer (which the brief allowed but this plan opts against, preferring a real end-to-end call for genuine confidence). The terminal-state assertion (success or fallback) is the behavior that actually matters and is asserted robustly.
