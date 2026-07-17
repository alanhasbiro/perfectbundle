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
