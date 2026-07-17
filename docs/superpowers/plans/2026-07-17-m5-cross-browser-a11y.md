# M5 Sprint 2 — Cross-Browser, Mobile Viewport, Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing 8-test Playwright suite to run across chromium, firefox, webkit, and a mobile viewport without quadrupling real Gemini API usage; add a baseline accessibility audit.

**Architecture:** Add three new Playwright `projects` entries reusing the existing spec files as-is (no per-browser duplication). The one Gemini-calling test gets a project-scoped `test.skip` so it still runs exactly once total, on chromium only. A new `accessibility.spec.ts` runs `@axe-core/playwright` against the three static/low-risk pages.

**Tech Stack:** `@playwright/test` (already installed), `@axe-core/playwright` (new).

## Global Constraints

- **$0 cost** — no new paid services; `@axe-core/playwright` is OSS.
- Do not duplicate spec files per browser — the existing 4 spec files must run unmodified (except the one Gemini-call skip) across all projects.
- The real Gemini API call in `quiz-flow.spec.ts` must total exactly ONE run across the entire multi-project suite, not one per project.
- If accessibility violations of "serious" or "critical" impact are found, fix the actual markup — do not weaken the assertion to pass around a real issue.
- Lighthouse performance scoring is explicitly OUT of scope this sprint (separate tooling, lower priority at this project stage) — leave it as a documented open item in `docs/tasks.md`, not silently dropped.

---

### Task 1: Add cross-browser + mobile viewport projects

**Files:**
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/quiz-flow.spec.ts` (project-scoped skip on the Gemini-calling test)

**Interfaces:**
- Produces: `npx playwright test` now runs the existing 8 tests × 4 projects, except the full-completion test which still runs exactly once (chromium only) — so `landing`(3) + `quiz-flow back-nav`(1) + `trending`(1) + `share`(2) = 7 tests × 4 projects = 28, plus the 1 chromium-only full-completion test = 29 total.

- [ ] **Step 1: Install browser binaries for firefox and webkit**

```powershell
npx playwright install firefox webkit
```

- [ ] **Step 2: Add the skip guard to the Gemini-calling test in `tests/e2e/quiz-flow.spec.ts`**

Find this line near the top of the `"completing all 6 steps reaches a usable results page"` test:
```typescript
test("completing all 6 steps reaches a usable results page", async ({ page }) => {
  await page.goto("/quiz");
```

Replace with:
```typescript
test("completing all 6 steps reaches a usable results page", async ({ page }, testInfo) => {
  // Real Gemini API call — run on exactly one project to avoid multiplying
  // real (free-tier) API usage across the cross-browser/mobile matrix.
  test.skip(
    testInfo.project.name !== "chromium",
    "Real Gemini call — runs once on chromium only to conserve free-tier quota"
  );
  await page.goto("/quiz");
```

- [ ] **Step 3: Add the new projects to `playwright.config.ts`**

Find the existing `projects` array:
```typescript
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
```

Replace with:
```typescript
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
```

- [ ] **Step 4: Run the full suite and verify totals**

Run: `npm run test:e2e`
Expected: 29 passed, 3 skipped (the full-completion test skipped on firefox/webkit/mobile-chrome), 0 failed. This will take longer than the single-project run (roughly 4x the cheap tests) — expect a few minutes.

- [ ] **Step 5: Commit**

```powershell
git add playwright.config.ts tests/e2e/quiz-flow.spec.ts
git commit -m "test(e2e): cross-browser (firefox, webkit) + mobile viewport projects; cap Gemini call at one run"
```

---

### Task 2: Accessibility audit

**Files:**
- Create: `tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `@axe-core/playwright`'s `AxeBuilder`.
- Produces: a spec asserting no "serious"/"critical" axe violations on `/`, `/quiz`, `/trending`.

- [ ] **Step 1: Install `@axe-core/playwright`**

```powershell
npm install -D @axe-core/playwright
```

- [ ] **Step 2: Write `tests/e2e/accessibility.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Pragmatic baseline: assert zero "serious"/"critical" impact violations
// rather than full strict WCAG AA (zero violations of any severity), since a
// full-strictness pass may surface pre-existing minor issues (e.g. color
// contrast edge cases) that deserve separate triage rather than blocking this
// sprint. Tighten this threshold in a future pass once the baseline is clean.
const SERIOUS_IMPACTS = ["serious", "critical"];

async function seriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => SERIOUS_IMPACTS.includes(v.impact ?? ""));
}

test.describe("accessibility", () => {
  test("landing page has no serious/critical violations", async ({ page }) => {
    await page.goto("/");
    const violations = await seriousViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("quiz first step has no serious/critical violations", async ({ page }) => {
    await page.goto("/quiz");
    await expect(page.getByRole("button", { name: "Birthday" })).toBeVisible();
    const violations = await seriousViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("trending page has no serious/critical violations", async ({ page }) => {
    await page.goto("/trending");
    await expect(page.getByRole("heading", { name: "Trending bundles" })).toBeVisible();
    const violations = await seriousViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it (chromium only first, for a fast signal)**

Run: `npx playwright test accessibility.spec.ts --project=chromium`
Expected: either 3 passed, OR failures listing real violations with full JSON detail (rule id, impact, affected elements).

- [ ] **Step 4: If violations are found, fix the real markup issue**

There is no way to predict here whether violations exist — if Step 3 fails, read the violation JSON (each entry has `id`, `impact`, `description`, `nodes[].target` CSS selectors, `nodes[].failureSummary`), locate the offending element in the relevant component under `src/`, and fix it directly (common fixes: add an accessible name to an icon-only button, fix a heading-level skip, add `alt` text, fix color contrast in `globals.css` or a Tailwind class). Re-run Step 3 until it passes. Do not modify the test's severity threshold to work around a real finding.

- [ ] **Step 5: Run across all 4 projects**

Run: `npx playwright test accessibility.spec.ts`
Expected: 12 passed (3 tests × 4 projects), 0 failed.

- [ ] **Step 6: Commit**

```powershell
git add tests/e2e/accessibility.spec.ts package.json package-lock.json
git commit -m "test(e2e): baseline accessibility audit (axe-core) for landing, quiz, trending"
```

(If Step 4 required a source fix outside `tests/e2e/`, include those files in this commit too, or as a preceding commit — whichever the actual diff naturally produces.)

---

### Task 3: Full suite verification, docs update, push

**Files:**
- Modify: `docs/tasks.md`, `docs/checkpoint.md`

- [ ] **Step 1: Run the complete E2E suite one final time**

Run: `npm run test:e2e`
Expected: 41 passed (29 from Task 1 + 12 from Task 2), 3 skipped, 0 failed.

- [ ] **Step 2: Run the standard verification suite**

Run: `npm run typecheck; npm run lint; npm test; npm run build`
Expected: all PASS.

- [ ] **Step 3: Update `docs/tasks.md`**

Under Milestone 5, update:
```
- [x] P0 Cross-browser + mobile viewport pass — chromium, firefox, webkit, mobile-chrome (Pixel 7) all covered via `tests/e2e/` (docs/superpowers/plans/2026-07-17-m5-cross-browser-a11y.md); the one Gemini-calling test intentionally runs on chromium only (quota-conscious)
- [ ] P1 Lighthouse ≥90 (performance, a11y) on quiz + results — still not run; separate tooling/CI setup, deferred
- [x] P1 Accessibility audit (keyboard nav, contrast, labels) — baseline axe-core scan (serious/critical impact threshold) on landing, quiz, trending — passing across all 4 browser projects
```

- [ ] **Step 4: Update `docs/checkpoint.md`**

Update progress (M5 percentage), add completed items, change log entry, and note any accessibility fixes made in Task 2 Step 4 (or note "no violations found" if none were).

- [ ] **Step 5: Commit and push**

```powershell
git add -A
git commit -m "docs: M5 sprint 2 (cross-browser, mobile viewport, a11y) complete"
git push
```

---

## Self-Review Notes

- **Spec coverage:** firefox/webkit/mobile projects → Task 1. Gemini-call quota cap → Task 1 Step 2 (project-scoped skip, verified by the "29 passed, 3 skipped" expectation in Step 4). Accessibility audit with documented pragmatic threshold → Task 2. Lighthouse explicitly deferred, not dropped → Task 3 Step 3.
- **Placeholder scan:** clean, except Task 2 Step 4 is necessarily conditional ("if violations are found") since the actual DOM hasn't been scanned yet at plan-writing time — this is an unavoidable real unknown, not a lazy placeholder, and the step gives the implementer everything needed to act on either outcome (exact JSON shape, exact fields to read, concrete example fix categories).
- **Type consistency:** the `seriousViolations` helper's return type flows directly from `AxeBuilder.analyze()`'s `results.violations` (no custom type invented); the `Page` type import matches the pattern already used in `tests/e2e/quiz-flow.spec.ts` (`type Page` from `@playwright/test`).
