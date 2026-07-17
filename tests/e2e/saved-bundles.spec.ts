import { test, expect } from "@playwright/test";

// The authenticated save→persist→list flow needs a signed-in Clerk user
// (Clerk test tokens aren't wired into this suite yet — same gap as the rest
// of the suite, which has no auth-dependent tests). What we CAN verify without
// auth is the guest gate: My bundles must prompt sign-in rather than error or
// leak an empty authed view. The Save-button→signup-modal upsell is verified
// manually against the live site (it only appears on generated result cards,
// which additionally depend on the Gemini API being up).

test("My bundles gates behind sign-in for guests", async ({ page }) => {
  await page.goto("/my-bundles");
  await expect(
    page.getByRole("heading", { name: "Your saved bundles" })
  ).toBeVisible();
  await expect(page.getByText("Sign in to see the bundles")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Sign in" })
  ).toBeVisible();
});
