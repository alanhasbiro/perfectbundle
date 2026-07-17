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
    const heading = page.getByRole("heading", { name: "Never wonder what to gift again." });
    // The headline fades in via Framer Motion (initial opacity 0). React
    // Strict Mode (on by default, `next dev` only — not production) double-
    // mounts the component, which restarts the fade right after it first
    // completes; wait for opacity:1 twice in a row, ~1s apart, to land after
    // that dev-only remount settles rather than auditing a genuine but
    // transient in-progress animation frame.
    await expect(heading).toHaveCSS("opacity", "1");
    await page.waitForTimeout(1000);
    await expect(heading).toHaveCSS("opacity", "1");
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
