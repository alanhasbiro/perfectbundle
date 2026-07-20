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
    await expect(page.getByText(/Representative image/).first()).toBeVisible();
  });

  test("credits the photographer (required by Unsplash's API terms)", async ({ page }) => {
    await page.goto("/popular");
    const credit = page.getByRole("link", { name: "E2E Photographer" }).first();
    await expect(credit).toBeVisible();
    await expect(credit).toHaveAttribute("href", "https://unsplash.com/@e2e");
    await expect(page.getByText(/Photo by/).first()).toBeVisible();
    await expect(page.getByText(/on Unsplash/).first()).toBeVisible();
  });
});
