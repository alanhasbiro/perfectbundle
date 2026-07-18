import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeAll(() => {
  // Seed one public generated bundle + engagement counters (no Gemini call) —
  // see convex/testSupport.ts. We don't need the returned id; the page lists it.
  execSync('npx convex run testSupport:seedPopularBundle "{}"', { encoding: "utf-8" });
});

test.describe("popular page", () => {
  test("renders the heading and the seeded popular bundle", async ({ page }) => {
    await page.goto("/popular");
    await expect(page.getByRole("heading", { name: "Popular bundles" })).toBeVisible();
    // The shared local Convex backend accumulates a seeded row per run, so the
    // same-titled bundle can appear more than once — assert the first match.
    await expect(
      page.getByRole("heading", { name: "E2E Popular Bundle" }).first()
    ).toBeVisible();
    await expect(page.getByText("Popular Item One").first()).toBeVisible();
  });

  test("cross-links to trending", async ({ page }) => {
    await page.goto("/popular");
    await expect(page.getByRole("link", { name: /Browse trending bundles/ })).toBeVisible();
  });
});
