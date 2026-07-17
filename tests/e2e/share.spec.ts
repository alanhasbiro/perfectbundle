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
