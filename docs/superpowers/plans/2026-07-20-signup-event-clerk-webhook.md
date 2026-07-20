# Signup Event via Clerk Webhook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire the canonical `signup` PostHog event exactly once per new Clerk user, regardless of which UI entry point they signed up through (header button, save-action upsell modal, or the dedicated `/sign-up` page).

**Architecture:** Add a Clerk `user.created` webhook endpoint (`src/app/api/webhooks/clerk/route.ts` — the project's first Next.js Route Handler). Clerk POSTs to it once per new user; we verify the signature with `@clerk/nextjs/webhooks`' `verifyWebhook`, then capture a server-side `signup` PostHog event via a direct HTTP POST to PostHog's capture API (no `posthog-js` — that's browser-only and already owns the client-side event surface; no new dependency needed either, since `verifyWebhook` transitively pulls in `standardwebhooks`, not `svix`, and is already installed). This is server-truth, not a client heuristic: Clerk fires `user.created` once per account regardless of entry point, so no dedup/localStorage logic is needed on our side.

**Tech Stack:** Next.js App Router Route Handler, `@clerk/nextjs/webhooks` (already installed via `@clerk/nextjs@^7.5.20`), Vitest, no new npm dependencies.

## Global Constraints

- $0 operating cost — no new paid service or dependency (per `CLAUDE.md`).
- Event name and properties are canonical per `docs/prd.md` §2.3: `signup` — properties `method, bundle id`. This plan implements `method` (`"email"` or the OAuth provider name, e.g. `"google"`). `bundle_id` is deliberately omitted: Clerk's webhook payload carries no UI-flow context (it fires identically whether signup happened via the header button, the save-action modal, or the dedicated page), so there is no bundle to attach. This is a scoped, documented decision, not a bug.
- Any env var read by code that runs in a `"use client"` component must be `NEXT_PUBLIC_`-prefixed (see `docs/handover.md` Gotchas). This plan's new code all runs server-side only (Route Handler), so it correctly uses **non**-prefixed `CLERK_WEBHOOK_SIGNING_SECRET`. It reads the *existing* `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST` (already public, already used client-side) — reading a `NEXT_PUBLIC_` var server-side is always safe, only the reverse is broken.
- Vitest config: `environment: "node"`, alias `@` → `src/`, test files matched by `src/**/*.test.ts` (see `vitest.config.ts`).
- Never print secrets to chat/logs.

---

### Task 1: Signup method helper (pure, TDD)

**Files:**
- Create: `src/lib/webhooks/clerk-signup.ts`
- Test: `src/lib/webhooks/clerk-signup.test.ts`

**Interfaces:**
- Produces: `signupMethodFromExternalAccounts(externalAccounts: Array<{ provider: string }>): string` — used by Task 3's route handler.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/webhooks/clerk-signup.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/webhooks/clerk-signup.test.ts`
Expected: FAIL — `Cannot find module './clerk-signup'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/webhooks/clerk-signup.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/webhooks/clerk-signup.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhooks/clerk-signup.ts src/lib/webhooks/clerk-signup.test.ts
git commit -m "feat(analytics): add signup-method helper for Clerk webhook"
```

---

### Task 2: Server-side PostHog capture helper (TDD)

**Files:**
- Create: `src/lib/analytics-server.ts`
- Test: `src/lib/analytics-server.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `captureServerEvent(event: string, distinctId: string, properties?: Record<string, unknown>, fetchImpl?: typeof fetch): Promise<void>` — used by Task 3's route handler. Never throws (best-effort — a webhook handler must always ack Clerk even if PostHog is down).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics-server.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureServerEvent } from "./analytics-server";

describe("captureServerEvent", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("does nothing when no PostHog key is configured", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const fetchMock = vi.fn();

    await captureServerEvent("signup", "user_123", { method: "email" }, fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the PostHog capture API with the project key, event, distinct_id, and properties", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await captureServerEvent("signup", "user_123", { method: "google" }, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.api_key).toBe("phc_test_key");
    expect(body.event).toBe("signup");
    expect(body.distinct_id).toBe("user_123");
    expect(body.properties).toEqual({ method: "google" });
    expect(typeof body.timestamp).toBe("string");
  });

  it("falls back to the US PostHog host when none is configured", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    await captureServerEvent("signup", "user_123", undefined, fetchMock);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/i/v0/e/");
  });

  it("swallows fetch errors instead of throwing", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(
      captureServerEvent("signup", "user_123", undefined, fetchMock)
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/analytics-server.test.ts`
Expected: FAIL — `Cannot find module './analytics-server'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/analytics-server.ts

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/analytics-server.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics-server.ts src/lib/analytics-server.test.ts
git commit -m "feat(analytics): add server-side PostHog capture helper"
```

---

### Task 3: Clerk webhook route handler (TDD)

**Files:**
- Create: `src/app/api/webhooks/clerk/route.ts`
- Test: `src/app/api/webhooks/clerk/route.test.ts`

**Interfaces:**
- Consumes: `signupMethodFromExternalAccounts` from Task 1 (`@/lib/webhooks/clerk-signup`); `captureServerEvent` from Task 2 (`@/lib/analytics-server`); `verifyWebhook` from `@clerk/nextjs/webhooks`.
- Produces: `POST(request: Request): Promise<Response>` — the live endpoint Clerk's dashboard webhook config points at.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/webhooks/clerk/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyWebhookMock = vi.fn();
const captureServerEventMock = vi.fn();

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: verifyWebhookMock,
}));

vi.mock("@/lib/analytics-server", () => ({
  captureServerEvent: captureServerEventMock,
}));

import { POST } from "./route";

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    verifyWebhookMock.mockReset();
    captureServerEventMock.mockReset().mockResolvedValue(undefined);
  });

  it("captures a signup event on user.created", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: {
        id: "user_123",
        external_accounts: [{ provider: "oauth_google" }],
      },
    });

    const response = await POST(new Request("https://example.com/api/webhooks/clerk", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(captureServerEventMock).toHaveBeenCalledWith("signup", "user_123", { method: "google" });
  });

  it("does nothing but still acks for other event types", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.updated",
      data: { id: "user_123", external_accounts: [] },
    });

    const response = await POST(new Request("https://example.com/api/webhooks/clerk", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(captureServerEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 and skips capture when signature verification fails", async () => {
    verifyWebhookMock.mockRejectedValue(new Error("invalid signature"));

    const response = await POST(new Request("https://example.com/api/webhooks/clerk", { method: "POST" }));

    expect(response.status).toBe(400);
    expect(captureServerEventMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/webhooks/clerk/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/webhooks/clerk/route.ts
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { captureServerEvent } from "@/lib/analytics-server";
import { signupMethodFromExternalAccounts } from "@/lib/webhooks/clerk-signup";

export async function POST(request: Request): Promise<Response> {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch (err) {
    console.error("Clerk webhook signature verification failed", err);
    return new Response("Webhook verification failed", { status: 400 });
  }

  if (event.type === "user.created") {
    const method = signupMethodFromExternalAccounts(event.data.external_accounts);
    await captureServerEvent("signup", event.data.id, { method });
  }

  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/webhooks/clerk/route.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Run the full test suite + typecheck to confirm no regressions**

Run: `npm test && npx tsc --noEmit`
Expected: all suites green, no type errors (in particular, `event.data.external_accounts` / `event.data.id` must typecheck against `@clerk/backend`'s `UserJSON` — if `tsc` complains here, the webhook event type import needs narrowing; confirm `event.type === "user.created"` is enough for TS to narrow `event.data` to `UserJSON`, which it is per `@clerk/backend`'s discriminated union).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/clerk/route.ts src/app/api/webhooks/clerk/route.test.ts
git commit -m "feat(analytics): wire signup event to Clerk user.created webhook"
```

---

### Task 4: Env wiring + docs

**Files:**
- Modify: `.env.local.example`
- Modify: `docs/tasks.md`
- Modify: `docs/checkpoint.md`
- Modify: `docs/handover.md`

**Interfaces:** None (docs/config only).

- [ ] **Step 1: Add the new env var placeholder**

In `.env.local.example`, after the PostHog block, add:

```
# Clerk webhook (signup event) — from Clerk Dashboard → Webhooks → your endpoint → Signing Secret
CLERK_WEBHOOK_SIGNING_SECRET=
```

- [ ] **Step 2: Update `docs/tasks.md`**

Change this line in the "Auth & Saved Bundles (F7)" section:

```
- [~] P1 Events: `bundle_saved` fires on save. `signup` event NOT yet wired (Clerk sign-up completion isn't currently tracked → PostHog) — backlog
```

to:

```
- [x] P1 Events: `bundle_saved` fires on save. `signup` fires via a Clerk `user.created` webhook (`src/app/api/webhooks/clerk/route.ts`) — server-truth, exactly-once regardless of signup entry point (header button, save-upsell modal, or `/sign-up` page). **Owner action required before this is live**: add a webhook endpoint in the Clerk Dashboard (Webhooks → Add Endpoint) pointing at `https://perfectbundle.vercel.app/api/webhooks/clerk`, subscribed to `user.created`, then copy its Signing Secret into the `CLERK_WEBHOOK_SIGNING_SECRET` Vercel env var.
```

- [ ] **Step 3: Update `docs/checkpoint.md`**

Add a new bullet under "This Session" (create the section if today's date isn't already there) describing: the webhook route, why it's more correct than a client-side heuristic (Clerk fires `user.created` exactly once per account, independent of which UI surface triggered signup), that `bundle_id` was deliberately omitted from the event properties (webhook payload carries no UI-flow context), and that it's blocked-on-owner for the Clerk Dashboard webhook registration + `CLERK_WEBHOOK_SIGNING_SECRET` (same pattern as the existing Sovrn-key and PostHog-dashboard blocked items). Include the verification command results from Task 3 Step 5.

- [ ] **Step 4: Update `docs/handover.md`**

- Add to §2 "What's blocked": Clerk webhook needs to be registered in the Clerk Dashboard (`user.created` → `https://perfectbundle.vercel.app/api/webhooks/clerk`) and `CLERK_WEBHOOK_SIGNING_SECRET` set in Vercel — code is done and tested, this is the one manual step.
- Add to §4 "Immediate next steps (owner)": the same webhook registration step, with exact instructions (Clerk Dashboard → Webhooks → Add Endpoint → URL `https://perfectbundle.vercel.app/api/webhooks/clerk` → subscribe to `user.created` → copy Signing Secret → Vercel env var `CLERK_WEBHOOK_SIGNING_SECRET`, no `NEXT_PUBLIC_` prefix since it's server-only).
- Update §1 to note the signup event is code-complete, pending that one owner step.
- Update §5 "Immediate next steps (build, unblocked)" to remove the now-done "Wire the `signup` PostHog event" line.

- [ ] **Step 5: Commit**

```bash
git add .env.local.example docs/tasks.md docs/checkpoint.md docs/handover.md
git commit -m "docs: signup-event webhook — owner action + checkpoint update"
```

---

## Post-plan manual verification (owner, not part of automated tests)

Once the owner completes Task 4 Step 4's Clerk Dashboard step and redeploys with `CLERK_WEBHOOK_SIGNING_SECRET` set:
1. Sign up a fresh test account on the live site.
2. Check PostHog → Activity → Events for a `signup` event with the correct `method` property.
3. Check Clerk Dashboard → Webhooks → your endpoint → Message log for a `200` response.

This can't be automated in this session (no live Clerk webhook can be registered without dashboard access), so it's documented as the explicit follow-up rather than silently assumed to work.
