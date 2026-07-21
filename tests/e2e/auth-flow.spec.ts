import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { clerk } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

// Chromium-only: this test creates a real (throwaway) Clerk user against the
// project's Clerk instance and only "setup" -> chromium is wired for auth
// (see playwright.config.ts). It seeds its bundle directly via
// testSupport:seedPopularBundle rather than a real quiz completion, so it
// spends zero Gemini quota (the suite's one real Gemini call stays in
// quiz-flow.spec.ts).
//
// Uses the email-based sign-in overload (clerk.signIn({ emailAddress, page }))
// rather than strategy: "password" - this Clerk instance has
// password.used_for_first_factor: false (only email_code is a first factor),
// so the password-strategy branch in @clerk/testing silently no-ops instead
// of throwing. The email-based overload creates a real backend sign-in token
// and uses the ticket strategy instead, which works regardless of which
// first factors are configured, and it explicitly waits for the session to
// become active. (A password is still required at user-creation time -
// password.required: true at the instance level - even though it's unused
// for sign-in.)
test.describe("authenticated flow: signup, save, profile", () => {
  test("a new user can save a bundle and create a recipient profile", async ({ page }, testInfo) => {
    // Real Clerk user creation — runs once on chromium only. Note:
    // "mobile-chrome" also runs on the Chromium engine (Pixel 7 emulation),
    // so checking browserName here would not skip it — testInfo.project.name
    // is the right check, matching quiz-flow.spec.ts's convention.
    test.skip(
      testInfo.project.name !== "chromium",
      "Real Clerk user creation — runs once on chromium only"
    );

    const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

    const output = execSync('npx convex run testSupport:seedPopularBundle "{}"', {
      encoding: "utf-8",
    });
    const rawLine = output
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.toLowerCase().includes("assertion failed"));
    if (!rawLine) {
      throw new Error(`Could not parse a bundle id from convex run output:\n${output}`);
    }
    const bundleIdLine = rawLine.replace(/^"|"$/g, "");

    const email = `pb-e2e-auth-${Date.now()}+clerk_test@example.com`;
    const user = await clerkClient.users.createUser({
      emailAddress: [email],
      password: `TestPassword${Date.now()}!aB`,
      skipPasswordChecks: true,
    });

    try {
      // --- Sign in ---
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: email });
      await page.goto("/");
      await expect(page.getByRole("link", { name: "My bundles" })).toBeVisible();

      // --- Save a bundle (seeded via testSupport:seedPopularBundle, visible on /popular) ---
      await page.goto("/popular");
      // Scoped by the exact bundle id, not its theme text — repeated local
      // dev/test runs against the same persistent Convex dev backend can
      // leave multiple bundles with the same "E2E Popular Bundle" theme.
      const bundleCard = page.getByTestId(`bundle-card-${bundleIdLine}`);
      const saveButton = bundleCard.getByRole("button", { name: "Save" });

      // A hard page.goto() reload (unlike a real user's client-side <Link>
      // navigation, which never remounts Clerk) can leave a deeply nested
      // component's useAuth() briefly behind the header's — SaveButton's
      // signed-out (SignInButton) and signed-in-but-unsaved (SavedToggle)
      // states render byte-identical markup ("Save", same classes), so a
      // click can land on the stale guest-mode button and silently no-op
      // (Clerk blocks opening a sign-in modal while already signed in, in
      // single-session mode). toPass() retries the click until it actually
      // takes effect once the component catches up.
      await expect(async () => {
        await saveButton.click();
        await expect(bundleCard.getByRole("button", { name: "Saved ✓" })).toBeVisible({
          timeout: 1000,
        });
      }).toPass({ timeout: 15_000 });

      // --- Verify it shows up on /my-bundles ---
      await page.goto("/my-bundles");
      await expect(page.getByText("E2E Popular Bundle")).toBeVisible();

      // --- Create a recipient profile ---
      await page.goto("/profiles");
      await page.getByRole("button", { name: "+ New profile" }).click();
      await page.fill("#pname", "E2E Test Person");
      await page.getByRole("button", { name: "Friend" }).click();
      await page.getByRole("button", { name: "25-34" }).click();
      await page.getByRole("button", { name: "Reading" }).click();
      await page.getByRole("button", { name: "Save profile" }).click();

      await expect(page.getByRole("heading", { name: "E2E Test Person" })).toBeVisible();
      await expect(page.getByText("Friend · 25-34")).toBeVisible();
    } finally {
      await clerkClient.users.deleteUser(user.id);
    }
  });
});
