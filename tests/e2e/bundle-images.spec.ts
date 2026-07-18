import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeAll(() => {
  execSync('npx convex run testSupport:seedPopularBundle "{}"', { encoding: "utf-8" });
});

test.describe("bundle item images", () => {
  test("renders an item image with a representative caption on /popular", async ({ page }) => {
    await page.goto("/popular");
    // The seeded popular bundle carries an image on its first item.
    await expect(page.getByRole("img", { name: "Popular Item One" }).first()).toBeVisible();
    await expect(page.getByText("Representative image").first()).toBeVisible();
  });
});
