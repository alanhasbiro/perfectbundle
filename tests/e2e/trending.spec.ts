import { test, expect } from "@playwright/test";

// BundleCard renders content.theme as its <h3> heading, not the curated
// bundle's admin-facing `title` field — assert on the theme strings that
// actually appear on screen (see convex/seedData.ts).
const SEEDED_THEMES = [
  "Slow coffee mornings",
  "A perfect reading night in",
  "Comfort for exhausted new parents",
  "Office Secret Santa that doesn't feel generic",
  "Level up a keen cook's kitchen",
];

test.describe("trending page", () => {
  test("renders all 5 seeded curated bundles with retailer links", async ({ page }) => {
    await page.goto("/trending");
    await expect(page.getByRole("heading", { name: "Trending bundles" })).toBeVisible();

    for (const theme of SEEDED_THEMES) {
      await expect(page.getByRole("heading", { name: theme })).toBeVisible();
    }

    await expect(page.getByRole("link", { name: "Find it on Amazon" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Find it on eBay" }).first()).toBeVisible();
    // Etsy removed 2026-07-18 (developer app rejected) — must not reappear.
    await expect(page.getByRole("link", { name: /Etsy/ })).toHaveCount(0);
  });
});
