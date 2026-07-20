import { describe, it, expect } from "vitest";
import { signupMethodFromExternalAccounts } from "./clerk-signup";

describe("signupMethodFromExternalAccounts", () => {
  it("returns 'email' when there are no external (OAuth) accounts", () => {
    expect(signupMethodFromExternalAccounts([])).toBe("email");
  });

  it("strips the 'oauth_' prefix from a Clerk provider id", () => {
    expect(signupMethodFromExternalAccounts([{ provider: "oauth_google" }])).toBe("google");
  });

  it("passes through a provider id that has no 'oauth_' prefix", () => {
    expect(signupMethodFromExternalAccounts([{ provider: "saml_okta" }])).toBe("saml_okta");
  });

  it("uses the first external account when multiple are present", () => {
    expect(
      signupMethodFromExternalAccounts([{ provider: "oauth_github" }, { provider: "oauth_google" }])
    ).toBe("github");
  });
});
