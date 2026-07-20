// Server-side counterpart to src/lib/analytics.ts's `track()`. posthog-js is
// browser-only, so server contexts (this webhook handler today; future
// server-fired events later) POST directly to PostHog's capture API instead.
// Mirrors the same key/host env vars and fallback as instrumentation-client.ts.
export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return; // no-op without a key, same convention as track()

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  try {
    await fetchImpl(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Best-effort: a webhook handler must always ack the caller (Clerk) even
    // if PostHog is unreachable — never let analytics delivery block it.
  }
}
