# M2 Sprint 3 — Results UI + Share + Trending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/quiz/results` stub with a real results page that calls the Gemini engine and renders 3 bundles with buy links; add a public `/b/<id>` share page and a `/trending` browse page — completing Milestone 2's P0 scope.

**Architecture:** A single reusable `<BundleCard>` client component renders both freshly-generated and curated bundles. The results page calls the `generate` action, then reactively queries the resulting bundle docs; on failure it falls back to the same curated list the trending page uses (never a dead end). The share page is a Server Component using `fetchQuery` from `convex/nextjs` for correct SSR + OG metadata.

**Tech Stack:** Next.js 16 App Router (Server Components for `/b/[id]`, Client Components elsewhere), Convex (`useAction`, `useQuery`, `useMutation`, `fetchQuery`), Vitest for pure helpers.

## Global Constraints

- **$0 cost** — no new services.
- `src/lib/session-id.ts` and any new pure helpers stay free of React/Next imports (session-id needs `localStorage`, which is inherently browser-only, but must not import React).
- Analytics event names only from `docs/prd.md` §2.3 / existing `AnalyticsEvent` union in `src/lib/analytics.ts` — do not invent new ones.
- Never a dead end: generation failure must always resolve to a usable screen (trending fallback), never a blank/broken page.
- No live-price claims anywhere in new UI copy — estimates only.
- TypeScript strict; components PascalCase, files kebab-case; TDD for pure functions only (this sprint is UI/wiring-heavy — see Testing Approach below).
- Playwright E2E is explicitly Milestone 5 — do not add Playwright tests this sprint.
- Per project convention: read `convex/_generated/ai/guidelines.md` before writing new `convex/*.ts` code if anything here conflicts with prior sprints' patterns (arg validators, `ctx.db.patch("table", id, value)` 3-arg form, etc. — already followed in `convex/bundles.ts`).

**Testing approach for this sprint:** TDD (red→green) for the two new pure helpers (`session-id.ts`, `budget-status.ts`). Convex mutation/query additions verified manually via `npx convex run` (same pattern as the engine sprint), capped at a handful of calls. Page-level components verified via `npm run typecheck && npm run lint && npm run build` plus a manual dev-server click-through — the same depth used for the quiz wizard sprint. No new Playwright tests.

---

### Task 1: Session ID helper (TDD)

**Files:**
- Create: `src/lib/session-id.ts`
- Test: `src/lib/session-id.test.ts`

**Interfaces:**
- Produces: `getOrCreateSessionId(): string` — reads `localStorage["pb.sessionId"]`; if absent, generates one (`crypto.randomUUID()` when available, else a fallback), persists it, and returns it. Returns a fresh (non-persisted) id if `localStorage` is unavailable (SSR or disabled storage), so it never throws.
- Consumed by the results page (Task 5) as the Convex `generate` action's `rateLimitKey`.

- [ ] **Step 1: Write the failing test — `src/lib/session-id.test.ts`**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrCreateSessionId } from "./session-id";

describe("getOrCreateSessionId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a non-empty string", () => {
    const id = getOrCreateSessionId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("persists and returns the same id on repeated calls", () => {
    const first = getOrCreateSessionId();
    const second = getOrCreateSessionId();
    expect(second).toBe(first);
  });

  it("stores the id under the pb.sessionId localStorage key", () => {
    const id = getOrCreateSessionId();
    expect(localStorage.getItem("pb.sessionId")).toBe(id);
  });

  it("reuses an id already present in localStorage", () => {
    localStorage.setItem("pb.sessionId", "existing-id-123");
    expect(getOrCreateSessionId()).toBe("existing-id-123");
  });

  it("falls back gracefully when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => getOrCreateSessionId()).not.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Configure Vitest with a DOM environment for this file (localStorage needs one)**

Vitest's default `environment: "node"` (set in `vitest.config.ts`) has no `localStorage`. Rather than switching the whole project to a DOM environment, add a per-file environment override using a Vitest docblock at the top of the test file — insert this as the very first line of `src/lib/session-id.test.ts`, above the existing `import` line:

```typescript
// @vitest-environment jsdom
```

Then install `jsdom` as a dev dependency:

```powershell
npm install -D jsdom
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./session-id`.

- [ ] **Step 4: Write `src/lib/session-id.ts`**

```typescript
// NOTE: keep this file free of React imports — it's a plain browser utility.
// localStorage makes it inherently browser-only (unlike src/lib/quiz and
// src/lib/engine, which are pure enough for the future mobile app too).

const STORAGE_KEY = "pb.sessionId";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = randomId();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // localStorage unavailable (SSR, disabled storage, private mode edge cases) —
    // return a non-persisted id so the caller never breaks.
    return randomId();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/session-id.ts src/lib/session-id.test.ts package.json package-lock.json
git commit -m "feat: browser session id helper for rate-limit key (TDD)"
```

---

### Task 2: Budget status + band helpers (TDD)

**Files:**
- Create: `src/lib/bundles/budget-status.ts`
- Test: `src/lib/bundles/budget-status.test.ts`

**Interfaces:**
- Produces:
  - `classifyBudgetStatus(estTotal: string, budget: number): "within" | "over" | "under" | "unknown"` — parses numeric range out of `estTotal` (e.g. `"$45-60"`, `"£35-£50"`, `"40"`); `"over"` if the range's max exceeds `budget * 1.2`; `"under"` if the range's max is below `budget * 0.5`; `"within"` otherwise; `"unknown"` if no numbers could be parsed.
  - `budgetBand(budget: number): string` — buckets a raw quiz budget number into one of `"<25" | "25-50" | "50-100" | "100-200" | "200+"`, for the `bundles_generated` analytics event.
- Consumed by `<BundleCard>` (Task 3, budget badge) and the results page (Task 5, `bundles_generated` event property).

- [ ] **Step 1: Write the failing test — `src/lib/bundles/budget-status.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { classifyBudgetStatus, budgetBand } from "./budget-status";

describe("classifyBudgetStatus", () => {
  it("classifies a range comfortably within budget", () => {
    expect(classifyBudgetStatus("$45-60", 55)).toBe("within");
  });

  it("classifies a range that overshoots by more than 20% as over", () => {
    expect(classifyBudgetStatus("$80-100", 50)).toBe("over");
  });

  it("classifies a range far below budget as under", () => {
    expect(classifyBudgetStatus("$10-15", 100)).toBe("under");
  });

  it("handles currency symbols placed before each number", () => {
    expect(classifyBudgetStatus("£35-£50", 45)).toBe("within");
  });

  it("handles a single number (no range)", () => {
    expect(classifyBudgetStatus("$50", 50)).toBe("within");
  });

  it("returns unknown when no numbers are present", () => {
    expect(classifyBudgetStatus("varies", 50)).toBe("unknown");
  });
});

describe("budgetBand", () => {
  it("buckets budgets into the expected bands", () => {
    expect(budgetBand(10)).toBe("<25");
    expect(budgetBand(25)).toBe("25-50");
    expect(budgetBand(49)).toBe("25-50");
    expect(budgetBand(50)).toBe("50-100");
    expect(budgetBand(150)).toBe("100-200");
    expect(budgetBand(300)).toBe("200+");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./budget-status`.

- [ ] **Step 3: Write `src/lib/bundles/budget-status.ts`**

```typescript
// NOTE: keep this file free of React/Next imports — pure display-logic helpers.

export type BudgetStatus = "within" | "over" | "under" | "unknown";

function parseNumbers(estTotal: string): number[] {
  const matches = estTotal.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

export function classifyBudgetStatus(estTotal: string, budget: number): BudgetStatus {
  const numbers = parseNumbers(estTotal);
  if (numbers.length === 0) return "unknown";
  const max = Math.max(...numbers);
  if (max > budget * 1.2) return "over";
  if (max < budget * 0.5) return "under";
  return "within";
}

export function budgetBand(budget: number): string {
  if (budget < 25) return "<25";
  if (budget < 50) return "25-50";
  if (budget < 100) return "50-100";
  if (budget < 200) return "100-200";
  return "200+";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/bundles/budget-status.ts src/lib/bundles/budget-status.test.ts
git commit -m "feat: budget status + band pure helpers for bundle display/analytics (TDD)"
```

---

### Task 3: Convex share mutation + query

**Files:**
- Modify: `convex/bundles.ts` (add `makePublic` mutation and `getPublic` query alongside existing `storeGenerated`/`getByIds`)

**Interfaces:**
- Produces:
  - `mutation makePublic` — args `{ id: v.id("bundles") }`, sets `isPublic: true` on that bundle, returns `null`. Public (client-callable). No auth/ownership check yet (no auth system exists — anyone holding a generated bundle's id from their own session can share it; acceptable for MVP, noted inline).
  - `query getPublic` — args `{ id: v.id("bundles") }`, returns the bundle document only if it exists and `isPublic === true`, else `null`.

- [ ] **Step 1: Add to `convex/bundles.ts`** (append after the existing `getByIds` export)

```typescript
export const makePublic = mutation({
  args: { id: v.id("bundles") },
  handler: async (ctx, { id }) => {
    // No ownership check: there's no auth system yet (M4). Anyone who generated
    // a bundle in their own session already has its id and can choose to share
    // it — this is the same trust model as "anyone with the link" doc sharing.
    await ctx.db.patch("bundles", id, { isPublic: true });
    return null;
  },
});

export const getPublic = query({
  args: { id: v.id("bundles") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get("bundles", id);
    if (!doc || !doc.isPublic) return null;
    return doc;
  },
});
```

- [ ] **Step 2: Update the import line at the top of `convex/bundles.ts`**

Change:
```typescript
import { internalMutation, query } from "./_generated/server";
```
to:
```typescript
import { internalMutation, mutation, query } from "./_generated/server";
```

- [ ] **Step 3: Push and typecheck**

Run: `npx convex dev --once; npm run typecheck`
Expected: both PASS.

- [ ] **Step 4: Manual verification**

Using one of the bundle IDs generated during the engine sprint's live test (or generate a fresh one if those were cleaned up), run:
```powershell
npx convex run bundles:makePublic '{"id": "<a real bundle _id from your local deployment>"}'
npx convex run bundles:getPublic '{"id": "<same id>"}'
```
Expected: first call returns `null` with no error; second call returns the full bundle document (not `null`). Then test the negative case with any *other* valid-looking id that was never made public — expected: `null`.

- [ ] **Step 5: Commit**

```powershell
git add convex/bundles.ts convex/_generated
git commit -m "feat: Convex makePublic mutation + getPublic query for share links"
```

---

### Task 4: `<BundleCard>` shared component

**Files:**
- Create: `src/components/bundles/bundle-card.tsx`
- Create: `src/components/bundles/bundle-card-types.ts`

**Interfaces:**
- Produces:
  - `interface BundleItemLike { name: string; description: string; why: string; estPriceRange: string; searchQuery: string; tags: string[] }` (bundle-card-types.ts)
  - `interface BundleContentLike { theme: string; rationale: string; estTotal: string; items: BundleItemLike[] }` (bundle-card-types.ts)
  - `<BundleCard content: BundleContentLike; budget?: number; country: string; urgency: "fast" | "normal" | "no_rush"; bundleId?: Id<"bundles">; onLinkClick?: (retailer: string, item: BundleItemLike) => void />`
    - Renders theme, rationale, an `estTotal` vs `budget` badge (via `classifyBudgetStatus`, only when `budget` is provided), and each item with its 3 retailer buttons (via `buildRetailerLinks`, opening in a new tab, calling `onLinkClick` before navigation).
    - When `bundleId` is provided: renders a "Share" button (calls `makePublic` mutation, copies `/b/<id>` to clipboard, shows "Link copied!" for 2s, fires `bundle_shared`) and a disabled "Save" button with `title="Sign in to save (coming soon)"`.
    - When `bundleId` is absent (curated bundles from the trending page): Share/Save buttons are omitted entirely.
- Consumes: `buildRetailerLinks` (`src/lib/links/retailer-links.ts`), `classifyBudgetStatus` (Task 2), `track` (`src/lib/analytics.ts`), `Id` type (`convex/_generated/dataModel`), `api.bundles.makePublic` (`convex/_generated/api`), `useMutation` (`convex/react`).

- [ ] **Step 1: Write `src/components/bundles/bundle-card-types.ts`**

```typescript
export interface BundleItemLike {
  name: string;
  description: string;
  why: string;
  estPriceRange: string;
  searchQuery: string;
  tags: string[];
}

export interface BundleContentLike {
  theme: string;
  rationale: string;
  estTotal: string;
  items: BundleItemLike[];
}
```

- [ ] **Step 2: Write `src/components/bundles/bundle-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { buildRetailerLinks } from "@/lib/links/retailer-links";
import { classifyBudgetStatus } from "@/lib/bundles/budget-status";
import { track } from "@/lib/analytics";
import type { BundleContentLike, BundleItemLike } from "./bundle-card-types";

const BUDGET_LABEL: Record<string, string> = {
  within: "Within budget",
  over: "A bit over budget",
  under: "Well under budget",
  unknown: "",
};

export function BundleCard({
  content,
  budget,
  country,
  urgency,
  bundleId,
  onLinkClick,
}: {
  content: BundleContentLike;
  budget?: number;
  country: string;
  urgency: "fast" | "normal" | "no_rush";
  bundleId?: Id<"bundles">;
  onLinkClick?: (retailer: string, item: BundleItemLike) => void;
}) {
  const makePublic = useMutation(api.bundles.makePublic);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "copied">("idle");

  const status = budget !== undefined ? classifyBudgetStatus(content.estTotal, budget) : "unknown";
  const budgetLabel = BUDGET_LABEL[status];

  const handleShare = async () => {
    if (!bundleId) return;
    setShareState("sharing");
    await makePublic({ id: bundleId });
    const url = `${window.location.origin}/b/${bundleId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard unavailable — the URL is still valid, user can copy manually
      // from wherever the app surfaces it; sharing state still confirms success.
    }
    track("bundle_shared", { bundle_id: bundleId });
    setShareState("copied");
    setTimeout(() => setShareState("idle"), 2000);
  };

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-foreground/15 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">{content.theme}</h3>
          <p className="mt-1 text-sm opacity-70">{content.rationale}</p>
        </div>
        {bundleId ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              title="Sign in to save (coming soon)"
              disabled
              className="rounded-full border border-foreground/15 px-3 py-1.5 text-xs opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={shareState === "sharing"}
              className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"
            >
              {shareState === "copied" ? "Link copied!" : "Share"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Est. total: {content.estTotal}</span>
        {budgetLabel ? <span className="opacity-60">· {budgetLabel}</span> : null}
      </div>

      <ul className="flex flex-col gap-4">
        {content.items.map((item) => {
          const links = buildRetailerLinks(item.searchQuery, country, urgency);
          return (
            <li key={item.name} className="rounded-xl border border-foreground/10 p-4">
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-sm opacity-70">{item.description}</p>
              <p className="mt-1 text-sm italic opacity-60">{item.why}</p>
              <p className="mt-2 text-sm font-medium">{item.estPriceRange}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {links.map((link) => (
                  <a
                    key={link.retailer}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onLinkClick?.(link.retailer, item)}
                    className="rounded-full border border-foreground/20 px-3 py-1.5 text-xs transition hover:border-foreground/50"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
```

- [ ] **Step 3: Verify typecheck/lint**

Run: `npm run typecheck; npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/components/bundles
git commit -m "feat: shared BundleCard component (theme, items, retailer links, share/save)"
```

---

### Task 5: Results page — wire the engine, render bundles, fallback to trending

**Files:**
- Modify: `src/app/quiz/results/page.tsx` (full rewrite, replacing the stub)

**Interfaces:**
- Consumes: `useQuiz`-free — this page reads `sessionStorage["pb.quizAnswers"]` directly (same key the quiz wizard's `submit()` writes); `getOrCreateSessionId` (Task 1); `<BundleCard>` (Task 4); `api.generateBundles.generate`, `api.bundles.getByIds`, `api.curated.listApproved` (`convex/_generated/api`); `useAction`, `useQuery` (`convex/react`); `track`, `budgetBand` (Task 2).
- Produces: the real `/quiz/results` page. No new exports consumed elsewhere.

- [ ] **Step 1: Replace `src/app/quiz/results/page.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { QuizAnswers } from "@/lib/quiz/types";
import { getOrCreateSessionId } from "@/lib/session-id";
import { budgetBand } from "@/lib/bundles/budget-status";
import { track } from "@/lib/analytics";
import { BundleCard } from "@/components/bundles/bundle-card";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";

type AnswersState = { loaded: false } | { loaded: true; answers: QuizAnswers | null };

function readAnswers(): QuizAnswers | null {
  try {
    const raw = sessionStorage.getItem("pb.quizAnswers");
    if (raw) return JSON.parse(raw) as QuizAnswers;
  } catch {
    // corrupt storage — treat as no answers
  }
  return null;
}

export default function ResultsPage() {
  const [answersState, setAnswersState] = useState<AnswersState>({ loaded: false });
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return; // StrictMode double-invoke guard
    mountedRef.current = true;
    setAnswersState({ loaded: true, answers: readAnswers() });
  }, []);

  if (!answersState.loaded) return null;

  if (!answersState.answers) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">No quiz answers found.</p>
        <Link href="/quiz" className="rounded-full bg-foreground px-6 py-2.5 text-background">
          Take the quiz
        </Link>
      </main>
    );
  }

  return <ResultsForAnswers answers={answersState.answers} />;
}

function ResultsForAnswers({ answers }: { answers: QuizAnswers }) {
  const generate = useAction(api.generateBundles.generate);
  type GenState =
    | { phase: "generating" }
    | { phase: "ok"; bundleIds: string[]; cacheHit: boolean }
    | { phase: "failed"; reason: string };
  const [genState, setGenState] = useState<GenState>({ phase: "generating" });
  const requestedRef = useRef(false);
  const trackedOutcomeRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) return; // StrictMode double-invoke guard
    requestedRef.current = true;
    (async () => {
      const rateLimitKey = getOrCreateSessionId();
      const result = await generate({ quiz: answers, rateLimitKey });
      if (result.status === "ok") {
        setGenState({ phase: "ok", bundleIds: result.bundleIds, cacheHit: result.cacheHit });
      } else if (result.status === "rate_limited") {
        setGenState({ phase: "failed", reason: "rate_limited" });
      } else {
        setGenState({ phase: "failed", reason: result.reason });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const generatedBundles = useQuery(
    api.bundles.getByIds,
    genState.phase === "ok" ? { ids: genState.bundleIds as never } : "skip"
  );
  const curated = useQuery(api.curated.listApproved);

  useEffect(() => {
    if (trackedOutcomeRef.current) return;
    if (genState.phase === "ok" && generatedBundles) {
      trackedOutcomeRef.current = true;
      track("bundles_generated", {
        cache_hit: genState.cacheHit,
        budget_band: budgetBand(answers.budget),
      });
    } else if (genState.phase === "failed") {
      trackedOutcomeRef.current = true;
      track("bundle_generation_failed", { reason: genState.reason });
    }
  }, [genState, generatedBundles, answers.budget]);

  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("retailer_link_clicked", { retailer, bundle_id: bundleId, item_tags: item.tags });
  };

  if (genState.phase === "generating") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg">Building your bundles…</p>
        <p className="text-sm opacity-60">This usually takes a few seconds.</p>
      </main>
    );
  }

  if (genState.phase === "failed") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <p className="rounded-xl border border-foreground/15 p-4 text-sm opacity-70">
          We hit a snag generating something new — here are some crowd-pleasers instead.
        </p>
        {curated === undefined ? (
          <p className="opacity-60">Loading…</p>
        ) : (
          curated.map((bundle) => (
            <BundleCard
              key={bundle._id}
              content={bundle}
              country="US"
              urgency="normal"
              onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
            />
          ))
        )}
        <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
          ← Try the quiz again
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-semibold">Your gift bundles 🎁</h1>
      {generatedBundles === undefined ? (
        <p className="opacity-60">Loading…</p>
      ) : (
        generatedBundles.map((bundle) => (
          <BundleCard
            key={bundle._id}
            content={bundle}
            budget={answers.budget}
            country={answers.country}
            urgency={answers.urgency}
            bundleId={bundle._id}
            onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
          />
        ))
      )}
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        ← Start over
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `npm run typecheck; npm run lint`
Expected: PASS. If `useQuery(api.bundles.getByIds, ... as never)` produces a type error instead of silently working, replace `genState.bundleIds as never` with a properly typed `Id<"bundles">[]` by importing `Id` from `../../../../convex/_generated/dataModel` and typing `bundleIds: Id<"bundles">[]` in the `GenState` union instead of `string[]` — prefer this cleaner fix over the cast if typecheck flags it.

- [ ] **Step 3: Commit**

```powershell
git add src/app/quiz/results/page.tsx
git commit -m "feat: wire results page to bundle engine with trending fallback"
```

---

### Task 6: Share page

**Files:**
- Create: `src/app/b/[id]/page.tsx`
- Create: `src/app/b/[id]/share-view-tracker.tsx` (tiny client component, fires the view event without making the whole page a Client Component)

**Interfaces:**
- Consumes: `fetchQuery` (`convex/nextjs`), `api.bundles.getPublic`, `<BundleCard>` (Task 4), `track` (`src/lib/analytics.ts`).
- Produces: public route `/b/[id]`.

- [ ] **Step 1: Write `src/app/b/[id]/share-view-tracker.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

export function ShareViewTracker({ bundleId }: { bundleId: string }) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("shared_bundle_viewed", { bundle_id: bundleId });
  }, [bundleId]);
  return null;
}
```

- [ ] **Step 2: Write `src/app/b/[id]/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BundleCard } from "@/components/bundles/bundle-card";
import { ShareViewTracker } from "./share-view-tracker";

async function getBundle(id: string) {
  try {
    return await fetchQuery(api.bundles.getPublic, { id: id as Id<"bundles"> });
  } catch {
    // malformed id or backend error — treat identically to "not found"
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle) {
    return { title: "Gift bundle — PerfectBundle" };
  }
  return {
    title: `${bundle.theme} — PerfectBundle`,
    description: bundle.rationale,
    openGraph: { title: bundle.theme, description: bundle.rationale },
  };
}

export default async function SharedBundlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getBundle(id);

  if (!bundle) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="opacity-70">This bundle isn&apos;t available.</p>
        <Link href="/quiz" className="rounded-full bg-foreground px-6 py-2.5 text-background">
          Build your own
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <ShareViewTracker bundleId={id} />
      <h1 className="text-3xl font-semibold">A gift bundle, shared with you 🎁</h1>
      <BundleCard
        content={bundle}
        country={bundle.quiz.country}
        urgency={bundle.quiz.urgency}
      />
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        Build your own bundle →
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Verify typecheck/lint/build**

Run: `npm run typecheck; npm run lint; npm run build`
Expected: PASS; build output lists `/b/[id]` as a route.

- [ ] **Step 4: Commit**

```powershell
git add src/app/b
git commit -m "feat: public share page /b/[id] with OG metadata"
```

---

### Task 7: Trending page + landing nav link

**Files:**
- Create: `src/app/trending/page.tsx`
- Modify: `src/app/page.tsx` (add a "Browse trending" link)

**Interfaces:**
- Consumes: `api.curated.listApproved`, `useQuery` (`convex/react`), `<BundleCard>` (Task 4), `track`.
- Produces: `/trending` route; landing page nav link.

- [ ] **Step 1: Write `src/app/trending/page.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BundleCard } from "@/components/bundles/bundle-card";
import { track } from "@/lib/analytics";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";

// Curated bundles aren't tied to a quiz, so there's no known shopper country/
// urgency yet. Defaulting to US/normal is a known simplification — revisit if
// client-side country detection (src/lib/quiz/country.ts) gets threaded through
// browse pages too.
const DEFAULT_COUNTRY = "US";
const DEFAULT_URGENCY = "normal" as const;

export default function TrendingPage() {
  const curated = useQuery(api.curated.listApproved);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track("trending_viewed");
  }, []);

  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("curated_bundle_opened", { bundle_id: bundleId, retailer, item_tags: item.tags });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold">Trending bundles</h1>
        <p className="mt-2 text-sm opacity-70">
          Crowd-pleasing bundles you can browse without taking the quiz.
        </p>
      </div>
      {curated === undefined ? (
        <p className="opacity-60">Loading…</p>
      ) : (
        curated.map((bundle) => (
          <BundleCard
            key={bundle._id}
            content={bundle}
            country={DEFAULT_COUNTRY}
            urgency={DEFAULT_URGENCY}
            onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
          />
        ))
      )}
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        Or take the quiz for a bundle picked just for someone →
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Add a trending link to `src/app/page.tsx`**

In the landing page's CTA block, immediately after the existing `<Link href="/quiz" ...>Start the quiz</Link>` motion block, add a second, lower-emphasis link. Find this existing block:

```tsx
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
      >
        <Link
          href="/quiz"
          className="rounded-full bg-foreground px-8 py-3 text-background transition hover:opacity-85"
        >
          Start the quiz
        </Link>
      </motion.div>
```

Replace it with:

```tsx
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="flex flex-col items-center gap-3"
      >
        <Link
          href="/quiz"
          className="rounded-full bg-foreground px-8 py-3 text-background transition hover:opacity-85"
        >
          Start the quiz
        </Link>
        <Link href="/trending" className="text-sm underline opacity-70 hover:opacity-100">
          Or browse trending bundles
        </Link>
      </motion.div>
```

- [ ] **Step 3: Verify typecheck/lint/build**

Run: `npm run typecheck; npm run lint; npm run build`
Expected: PASS; build output lists `/trending` as a route.

- [ ] **Step 4: Commit**

```powershell
git add src/app/trending src/app/page.tsx
git commit -m "feat: trending page (browse-without-quiz) + landing nav link"
```

---

### Task 8: Full verification, manual smoke test, docs update, push

**Files:**
- Modify: `docs/tasks.md`, `docs/checkpoint.md`

- [ ] **Step 1: Full verification suite**

Run: `npx convex dev --once; npm run typecheck; npm run lint; npm test; npm run build`
Expected: all PASS.

- [ ] **Step 2: Manual dev-server smoke test**

Run `npm run dev`, then:
1. Open `/quiz`, complete it, confirm it lands on `/quiz/results`, shows "Building your bundles…", then renders 3 bundle cards with working retailer link buttons (they should open real Amazon/Etsy/eBay search tabs).
2. Click "Share" on a bundle card — confirm the button shows "Link copied!" briefly. Paste the copied URL into a new tab — confirm it renders the same bundle content on `/b/<id>`.
3. Open `/trending` directly (no quiz) — confirm the 5 seeded curated bundles render with working retailer buttons.
4. From the landing page `/`, confirm the new "Or browse trending bundles" link navigates to `/trending`.
5. Temporarily rename `.env.local`'s `GEMINI_API_KEY` line (or unset the Convex env var with `npx convex env remove GEMINI_API_KEY`) and re-run the quiz to confirm the failure path shows the "We hit a snag…" message with trending bundles rendered inline, never a blank page — then restore the key with `npx convex env set GEMINI_API_KEY <value>` (read it back from `.env.local`, don't ask the user to retype it).

- [ ] **Step 3: Update `docs/tasks.md`**

Flip the "Bundle Results UI (F2/F4)" and "Share (F5)" and "Trending (F6)" checkboxes under Milestone 2 to `[x]`, except explicitly leave "Item swap" unchecked and add it to the Backlog section with a note: `[ ] P1 Single-item swap ("show me another") — needs engine support for regenerating one bundle slot; deferred from M2 results UI sprint`. Also add `retailer_link_clicked` as checked now (fired from `BundleCard`).

- [ ] **Step 4: Update `docs/checkpoint.md`**

Update progress, mark Milestone 2 P0 scope as complete (only P1 "Popular tab" and P1 monetization prep remain, which belong to Milestone 4), set Current Focus to Milestone 3 (verify analytics events + PostHog dashboard) or Milestone 4 (accounts) as the logical next step, add a change log entry.

- [ ] **Step 5: Commit and push**

```powershell
git add -A
git commit -m "docs: M2 results UI + share + trending complete; M2 P0 scope done"
git push
```

---

## Self-Review Notes

- **Spec coverage:** Results UI (F2/F4) → Tasks 4, 5. Share (F5) → Task 6. Trending (F6) → Task 7. Fallback-never-dead-end → Task 5's failed branch reusing the same curated data as Task 7. All required analytics events (`bundles_generated`, `bundle_generation_failed`, `retailer_link_clicked`, `bundle_shared`, `shared_bundle_viewed`, `trending_viewed`, `curated_bundle_opened`) are wired; `bundle_saved` intentionally NOT fired (Save is a visual-only stub per scope, explicit in Task 4). `item_swapped`/`bundle_regenerated` intentionally NOT wired this sprint — explicitly deferred to backlog in Task 8 Step 3, matching the scope note in the arguments.
- **Type consistency:** `BundleContentLike`/`BundleItemLike` (Task 4) match the shape already produced by `bundleContentSchema`/`bundleItemSchema` (`src/lib/engine/schemas.ts`) and by Convex's `bundles`/`curatedBundles` table docs — both generated bundle docs and curated bundle docs satisfy this shape structurally (TypeScript structural typing), so `<BundleCard content={bundle} />` works for both without adapters. `GenerateResult`'s three-way status union (from `convex/generateBundles.ts`) is handled exhaustively in Task 5 (`ok`/`rate_limited`/`failed`, with the latter two collapsed into one UI failure branch as designed).
- **Placeholder scan:** clean — every step has complete, runnable code.
- **Known simplification flagged, not hidden:** curated-bundle retailer links use US/normal defaults (Task 7 code comment) since curated bundles have no attached quiz; per-visitor country detection for browse pages is left as a documented future improvement, not silently wrong.
