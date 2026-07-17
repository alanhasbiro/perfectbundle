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
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await fillRecipient(page);

    // Go back to the occasion step.
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("button", { name: "Birthday" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Go forward again — recipient answers should still be selected.
    await page.getByRole("button", { name: "Next", exact: true }).click();
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
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await fillRecipient(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("button", { name: "Coffee & tea" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.fill("#budget", "50");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByRole("button", { name: /Within a couple of weeks/ }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();

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
