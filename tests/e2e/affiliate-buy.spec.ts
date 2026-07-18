import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeAll(() => {
  execSync('npx convex run testSupport:seedPopularBundle "{}"', { encoding: "utf-8" });
});

test.describe("affiliate buy links", () => {
  test("renders a Buy-at-merchant button, real price, and the disclosure", async ({ page }) => {
    await page.goto("/popular");
    // The seeded popular bundle's second item carries a Sovrn-style product link.
    const buy = page.getByRole("link", { name: "Buy at TestMart" }).first();
    await expect(buy).toBeVisible();
    await expect(buy).toHaveAttribute("href", /example-retailer\.test\/buy/);
    await expect(page.getByText("$17.99").first()).toBeVisible();
    await expect(page.getByText(/affiliate links/i).first()).toBeVisible();
  });
});
