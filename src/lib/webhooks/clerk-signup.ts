const OAUTH_PREFIX = "oauth_";

// Clerk's webhook payload has no concept of "how the user signed up" beyond
// externalAccounts (OAuth) vs. none (email/password) — this maps that shape
// to the PRD's `method` property for the `signup` analytics event.
export function signupMethodFromExternalAccounts(
  externalAccounts: Array<{ provider: string }>
): string {
  const provider = externalAccounts[0]?.provider;
  if (!provider) return "email";
  return provider.startsWith(OAUTH_PREFIX) ? provider.slice(OAUTH_PREFIX.length) : provider;
}
