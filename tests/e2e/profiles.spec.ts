import { test, expect } from "@playwright/test";

// Same auth gap as saved-bundles.spec.ts: the authed profile CRUD +
// "New bundles for X" prefill flow needs a signed-in Clerk user (test tokens
// aren't wired into this suite). The prefill mapping itself is unit-tested in
// src/lib/quiz/prefill.test.ts. Here we verify the guest gate: /profiles must
// prompt sign-in rather than error or leak an empty authed view.

test("Profiles gates behind sign-in for guests", async ({ page }) => {
  await page.goto("/profiles");
  await expect(
    page.getByRole("heading", { name: "Recipient profiles" })
  ).toBeVisible();
  await expect(page.getByText("Sign in to save the people you buy for")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Sign in" })
  ).toBeVisible();
});
