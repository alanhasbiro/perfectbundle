# Popular Tab + Engagement Counters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the `engagementCounters` table from real user actions (link clicks, saves, shares, views), then add a `/popular` browse tab that ranks publicly-shared user-generated bundles by their engagement score — distinct from the editorially-curated `/trending` tab.

**Architecture:** A single client-callable `engagement.record` mutation upserts a per-bundle counter row and increments one field, fired fire-and-forget from each existing analytics touchpoint. A pure `popularityScore` function (unit-tested) computes `3·linkClicks + 2·saves + 2·shares + views` per `docs/data-schema.md`. A `listPopular` query joins generated public bundles to their counters, ranks, and limits. The `/popular` page renders those with `BundleCard`, a graceful empty state for cold start, and cross-links with `/trending`.

**Tech Stack:** Convex (mutation, query), TypeScript, Vitest for the pure scorer, Playwright for the browse-page E2E.

## Global Constraints

- **$0 operating cost** — pure Convex + existing infra; no new services.
- Keep `src/lib/bundles/*.ts` free of React/Next/Convex imports (pure, mobile-reusable) — the scorer is a plain function.
- **Never invent analytics event names** (CLAUDE.md / `docs/prd.md` §2.3). The Popular page reuses `retailer_link_clicked` for its link clicks and relies on PostHog's automatic `page_view` — there is NO `popular_viewed` event and one must not be added.
- `engagementCounters` schema already exists (`convex/schema.ts:78-85`): `{ bundleId: v.string(), kind: "curated"|"generated", linkClicks, saves, shares, views }`, index `by_bundleId`. No schema change is needed.
- Popularity formula is canonical in `docs/data-schema.md:34`: `3·linkClicks + 2·saves + 2·shares + views`.
- Engagement recording is an unauthenticated client mutation — same trust model as the existing unauthenticated `bundles.makePublic`. Acceptable at MVP scale; noted for a future abuse-hardening pass.

---

## Task 1: Pure popularity score function

**Files:**
- Create: `src/lib/bundles/popularity.ts`
- Test: `src/lib/bundles/popularity.test.ts`

**Interfaces:**
- Produces: `interface EngagementCounts { linkClicks: number; saves: number; shares: number; views: number }` and `popularityScore(c: EngagementCounts): number`. Convex counter documents (which carry extra fields like `bundleId`, `kind`, `_id`) satisfy `EngagementCounts` structurally, so the full doc can be passed directly.

- [ ] **Step 1: Write the failing test**

Create `src/lib/bundles/popularity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { popularityScore } from "./popularity";

describe("popularityScore", () => {
  it("weights clicks highest, then saves/shares, then views", () => {
    expect(popularityScore({ linkClicks: 0, saves: 0, shares: 0, views: 0 })).toBe(0);
    expect(popularityScore({ linkClicks: 1, saves: 0, shares: 0, views: 0 })).toBe(3);
    expect(popularityScore({ linkClicks: 0, saves: 1, shares: 0, views: 0 })).toBe(2);
    expect(popularityScore({ linkClicks: 0, saves: 0, shares: 1, views: 0 })).toBe(2);
    expect(popularityScore({ linkClicks: 0, saves: 0, shares: 0, views: 1 })).toBe(1);
  });

  it("sums all weighted terms", () => {
    expect(popularityScore({ linkClicks: 2, saves: 1, shares: 3, views: 4 })).toBe(
      3 * 2 + 2 * 1 + 2 * 3 + 4
    );
  });

  it("accepts objects carrying extra fields (a full counter doc)", () => {
    const doc = {
      bundleId: "abc",
      kind: "generated" as const,
      linkClicks: 1,
      saves: 1,
      shares: 1,
      views: 1,
    };
    expect(popularityScore(doc)).toBe(3 + 2 + 2 + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bundles/popularity.test.ts`
Expected: FAIL — module `./popularity` does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/bundles/popularity.ts`:

```ts
// NOTE: keep this file free of React/Next/Convex imports — pure + mobile-reusable.

export interface EngagementCounts {
  linkClicks: number;
  saves: number;
  shares: number;
  views: number;
}

// Popularity weighting is canonical in docs/data-schema.md: a retailer-link
// click is the strongest buy-intent signal, a save/share a medium signal, a
// view the weakest.
export function popularityScore(c: EngagementCounts): number {
  return 3 * c.linkClicks + 2 * c.saves + 2 * c.shares + c.views;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bundles/popularity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bundles/popularity.ts src/lib/bundles/popularity.test.ts
git commit -m "feat(m4): pure popularity score function for engagement ranking"
```

---

## Task 2: `convex/engagement.ts` — record mutation + listPopular query

**Files:**
- Create: `convex/engagement.ts`

**Interfaces:**
- Consumes: `popularityScore` (Task 1).
- Produces: `api.engagement.record({ bundleId: string, kind: "curated"|"generated", type: "linkClicks"|"saves"|"shares"|"views" }) -> null`; `api.engagement.listPopular({ limit?: number }) -> Array<Doc<"bundles"> & { score: number }>` (public generated bundles only, highest score first, default limit 20).

- [ ] **Step 1: Implement the module**

Create `convex/engagement.ts` (relative import for `src/lib`, per project convention — the `@/` alias doesn't resolve in Convex's typecheck):

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { popularityScore } from "../src/lib/bundles/popularity";

const counterType = v.union(
  v.literal("linkClicks"),
  v.literal("saves"),
  v.literal("shares"),
  v.literal("views")
);

// Client-callable, unauthenticated (same trust model as bundles.makePublic).
// Upserts the per-bundle counter row and increments one field. Fire-and-forget
// from the UI — a failure here must never block the user action that triggered
// it, so callers do not await/handle the result.
export const record = mutation({
  args: {
    bundleId: v.string(),
    kind: v.union(v.literal("curated"), v.literal("generated")),
    type: counterType,
  },
  handler: async (ctx, { bundleId, kind, type }) => {
    const existing = await ctx.db
      .query("engagementCounters")
      .withIndex("by_bundleId", (q) => q.eq("bundleId", bundleId))
      .unique();
    if (existing) {
      await ctx.db.patch("engagementCounters", existing._id, {
        [type]: existing[type] + 1,
      });
    } else {
      await ctx.db.insert("engagementCounters", {
        bundleId,
        kind,
        linkClicks: 0,
        saves: 0,
        shares: 0,
        views: 0,
        [type]: 1,
      });
    }
    return null;
  },
});

// Ranks publicly-shared user-generated bundles by engagement score. Curated
// bundles are excluded — they live on /trending, ranked editorially by
// sortWeight. Reads all counter rows and joins per-bundle: fine at MVP scale;
// revisit with an index/pagination if the counter table grows large.
export const listPopular = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const counters = await ctx.db.query("engagementCounters").collect();
    const scored: Array<Awaited<ReturnType<typeof scoreOne>>> = [];
    async function scoreOne(counter: (typeof counters)[number]) {
      const bundle = await ctx.db.get("bundles", counter.bundleId as Id<"bundles">);
      if (!bundle || !bundle.isPublic) return null;
      return { ...bundle, score: popularityScore(counter) };
    }
    for (const counter of counters) {
      if (counter.kind !== "generated") continue;
      const row = await scoreOne(counter);
      if (row) scored.push(row);
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit ?? 20);
  },
});
```

Note: if the inline `scoreOne`/`Awaited<ReturnType<...>>` pattern trips Convex's typecheck, replace the `scored` typing with an explicit type and a plain loop:

```ts
    type Ranked = Doc<"bundles"> & { score: number };
    const scored: Ranked[] = [];
    for (const counter of counters) {
      if (counter.kind !== "generated") continue;
      const bundle = await ctx.db.get("bundles", counter.bundleId as Id<"bundles">);
      if (!bundle || !bundle.isPublic) continue;
      scored.push({ ...bundle, score: popularityScore(counter) });
    }
```

with `import type { Doc, Id } from "./_generated/dataModel";`. Prefer this simpler form.

- [ ] **Step 2: Convex push / typecheck**

Run: `npx convex dev --once`
Expected: functions ready, no validator/type errors; `api.engagement.record` and `api.engagement.listPopular` appear in generated API.

- [ ] **Step 3: Commit**

```bash
git add convex/engagement.ts
git commit -m "feat(m4): engagement record mutation + popular ranking query"
```

---

## Task 3: Wire `engagement.record` at every touchpoint

**Files:**
- Modify: `src/components/bundles/bundle-card.tsx` (share)
- Modify: `src/components/bundles/save-button.tsx` (save)
- Modify: `src/app/quiz/results/page.tsx` (generated link click)
- Modify: `src/app/trending/page.tsx` (curated link click)
- Modify: `src/app/b/[id]/share-view-tracker.tsx` (view)

**Interfaces:**
- Consumes: `api.engagement.record` (Task 2).

- [ ] **Step 1: Share — `bundle-card.tsx`**

Add a mutation hook and record a share inside `handleShare`, right after the existing `track("bundle_shared", …)`:

```ts
  const makePublic = useMutation(api.bundles.makePublic);
  const record = useMutation(api.engagement.record);
```

```ts
    track("bundle_shared", { bundle_id: bundleId });
    void record({ bundleId, kind: "generated", type: "shares" });
    setShareState("copied");
```

- [ ] **Step 2: Save — `save-button.tsx`**

In `SavedToggle`, add the hook and record a save in the `else` (newly-saved) branch, after the existing `track("bundle_saved", …)`:

```ts
  const saved = useQuery(api.savedBundles.isSaved, { bundleId });
  const save = useMutation(api.savedBundles.save);
  const remove = useMutation(api.savedBundles.remove);
  const record = useMutation(api.engagement.record);
```

```ts
    } else {
      await save({ bundleId });
      track("bundle_saved", { bundle_id: bundleId });
      void record({ bundleId, kind: "generated", type: "saves" });
    }
```

- [ ] **Step 3: Generated link click — `results/page.tsx`**

In `ResultsForAnswers`, add the hook and record a click in `handleLinkClick`, after the existing `track("retailer_link_clicked", …)`:

```ts
  const generate = useAction(api.generateBundles.generate);
  const record = useMutation(api.engagement.record);
```

`useMutation` is already imported here (`import { useAction, useQuery } from "convex/react";` → change to `import { useAction, useMutation, useQuery } from "convex/react";`). Then:

```ts
  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("retailer_link_clicked", { retailer, bundle_id: bundleId, item_tags: item.tags });
    void record({ bundleId, kind: "generated", type: "linkClicks" });
  };
```

- [ ] **Step 4: Curated link click — `trending/page.tsx`**

Add `useMutation` to the convex import (`import { useMutation, useQuery } from "convex/react";`), add the hook, and record a curated click in `handleLinkClick`:

```ts
  const curated = useQuery(api.curated.listApproved);
  const record = useMutation(api.engagement.record);
```

```ts
  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("curated_bundle_opened", { bundle_id: bundleId, retailer, item_tags: item.tags });
    void record({ bundleId, kind: "curated", type: "linkClicks" });
  };
```

- [ ] **Step 5: View — `share-view-tracker.tsx`**

This currently only fires the analytics event. Add the Convex mutation. Because the mutation import needs the generated api path (this file is at `src/app/b/[id]/`), and the component is already `"use client"`:

```ts
"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { track } from "@/lib/analytics";

export function ShareViewTracker({ bundleId }: { bundleId: string }) {
  const firedRef = useRef(false);
  const record = useMutation(api.engagement.record);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("shared_bundle_viewed", { bundle_id: bundleId });
    void record({ bundleId, kind: "generated", type: "views" });
    // record is a stable Convex mutation ref; bundleId is the only real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId]);
  return null;
}
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add src/components/bundles/bundle-card.tsx src/components/bundles/save-button.tsx src/app/quiz/results/page.tsx src/app/trending/page.tsx src/app/b/[id]/share-view-tracker.tsx
git commit -m "feat(m4): record engagement counters at click/save/share/view touchpoints"
```

---

## Task 4: `/popular` page + cross-linking + test seed helper

**Files:**
- Create: `src/app/popular/page.tsx`
- Modify: `src/app/trending/page.tsx` (add a link to `/popular`)
- Modify: `convex/testSupport.ts` (add `seedPopularBundle`)

**Interfaces:**
- Consumes: `api.engagement.listPopular`, `api.engagement.record` (Task 2).
- Produces: `api.testSupport.seedPopularBundle({}) -> Id<"bundles">` (TEST-ONLY) that inserts a public generated bundle plus a matching `engagementCounters` row so the Popular page has deterministic content in E2E.

- [ ] **Step 1: Create the Popular page**

Create `src/app/popular/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { BundleCard } from "@/components/bundles/bundle-card";
import { track } from "@/lib/analytics";
import type { BundleItemLike } from "@/components/bundles/bundle-card-types";

export default function PopularPage() {
  const popular = useQuery(api.engagement.listPopular, {});
  const record = useMutation(api.engagement.record);

  const handleLinkClick = (bundleId: string, retailer: string, item: BundleItemLike) => {
    track("retailer_link_clicked", { retailer, bundle_id: bundleId, item_tags: item.tags });
    void record({ bundleId, kind: "generated", type: "linkClicks" });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-semibold">Popular bundles</h1>
        <p className="mt-2 text-sm opacity-70">
          Real bundles people made and shared, ranked by what others clicked, saved, and shared.
        </p>
      </div>
      {popular === undefined ? (
        <p className="opacity-60">Loading…</p>
      ) : popular.length === 0 ? (
        <p className="rounded-xl border border-foreground/15 p-4 text-sm opacity-70">
          No popular bundles yet — take the quiz and share yours to get things started.
        </p>
      ) : (
        popular.map((bundle) => (
          <BundleCard
            key={bundle._id}
            content={bundle}
            country={bundle.quiz.country}
            urgency={bundle.quiz.urgency}
            bundleId={bundle._id}
            onLinkClick={(retailer, item) => handleLinkClick(bundle._id, retailer, item)}
          />
        ))
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/trending" className="underline opacity-70 hover:opacity-100">
          Browse trending bundles →
        </Link>
        <Link href="/quiz" className="underline opacity-70 hover:opacity-100">
          Take the quiz →
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Cross-link from Trending**

In `src/app/trending/page.tsx`, replace the single closing quiz link with quiz + popular links. Change:

```tsx
      <Link href="/quiz" className="text-sm underline opacity-70 hover:opacity-100">
        Or take the quiz for a bundle picked just for someone →
      </Link>
```

to:

```tsx
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/popular" className="underline opacity-70 hover:opacity-100">
          See what&apos;s popular →
        </Link>
        <Link href="/quiz" className="underline opacity-70 hover:opacity-100">
          Or take the quiz for a bundle picked just for someone →
        </Link>
      </div>
```

- [ ] **Step 3: Add the test seed helper**

In `convex/testSupport.ts`, add after the existing `seedPublicBundle` export (reuse the same `mutation` import already present):

```ts
// TEST-ONLY: seeds a public generated bundle plus an engagementCounters row so
// the /popular page (api.engagement.listPopular) has deterministic content in
// Playwright. Same trust caveat as seedPublicBundle above.
export const seedPopularBundle = mutation({
  args: {},
  handler: async (ctx) => {
    const id = await ctx.db.insert("bundles", {
      createdAt: Date.now(),
      quizHash: "e2e-popular-fixture",
      quiz: {
        occasion: "Birthday",
        ageBand: "25-34",
        relationship: "Friend",
        interests: ["Testing"],
        budget: 50,
        currency: "USD",
        urgency: "normal",
        exclusions: [],
        country: "US",
      },
      theme: "E2E Popular Bundle",
      rationale: "Seeded directly for Playwright popular-page tests.",
      estTotal: "$40-50",
      items: [
        {
          name: "Popular Item One",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "popular item one",
          tags: ["test"],
        },
        {
          name: "Popular Item Two",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$15-20",
          searchQuery: "popular item two",
          tags: ["test"],
        },
        {
          name: "Popular Item Three",
          description: "A test item.",
          why: "For testing.",
          estPriceRange: "$10-15",
          searchQuery: "popular item three",
          tags: ["test"],
        },
      ],
      isPublic: true,
    });
    await ctx.db.insert("engagementCounters", {
      bundleId: id,
      kind: "generated",
      linkClicks: 5,
      saves: 2,
      shares: 1,
      views: 10,
    });
    return id;
  },
});
```

- [ ] **Step 4: Convex push + typecheck + build**

Run: `npx convex dev --once` (expect functions ready)
Run: `npx tsc --noEmit` (expect no errors)
Run: `npm run build` (expect the `/popular` route to appear in the route list)

- [ ] **Step 5: Commit**

```bash
git add src/app/popular/page.tsx src/app/trending/page.tsx convex/testSupport.ts
git commit -m "feat(m4): Popular tab ranking shared user bundles by engagement"
```

---

## Task 5: E2E coverage + verification + docs closeout

**Files:**
- Create: `tests/e2e/popular.spec.ts`
- Modify: `docs/tasks.md`
- Modify: `docs/checkpoint.md`
- Modify: `docs/handover.md`

- [ ] **Step 1: Write the Popular E2E test**

Create `tests/e2e/popular.spec.ts` (mirrors `share.spec.ts`'s seed-via-`convex run` pattern):

```ts
import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeAll(() => {
  // Seed one public generated bundle + engagement counters (no Gemini call) —
  // see convex/testSupport.ts. We don't need the returned id; the page lists it.
  execSync('npx convex run testSupport:seedPopularBundle "{}"', { encoding: "utf-8" });
});

test.describe("popular page", () => {
  test("renders the heading and the seeded popular bundle", async ({ page }) => {
    await page.goto("/popular");
    await expect(page.getByRole("heading", { name: "Popular bundles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Popular Bundle" })).toBeVisible();
    await expect(page.getByText("Popular Item One")).toBeVisible();
  });

  test("cross-links to trending", async ({ page }) => {
    await page.goto("/popular");
    await page.getByRole("link", { name: /See what's popular|Browse trending/ }).first();
    await expect(page.getByRole("link", { name: /Browse trending bundles/ })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the Popular spec on chromium**

Run: `npx playwright test tests/e2e/popular.spec.ts --project=chromium`
Expected: 2 passing.

- [ ] **Step 3: Full regression**

Run: `npx vitest run` (expect all green, including the new popularity tests)
Run: `npx playwright test --project=chromium` (expect the prior pass count + 2 new)

- [ ] **Step 4: Update `docs/tasks.md`**

Under "Popular Tab (F6)" (Milestone 4), flip both boxes:

```
- [x] P1 Engagement score ranking from engagementCounters — `src/lib/bundles/popularity.ts` (pure, unit-tested; `3·clicks + 2·saves + 2·shares + views`), `convex/engagement.ts` `listPopular`
- [x] P1 Popular tab UI alongside Trending — `/popular` ranks publicly-shared user-generated bundles; cross-linked with `/trending`; graceful empty state
```

Under Milestone 3, flip the engagement counters line:

```
- [x] P1 Convex engagementCounters wired (clicks/saves/shares per bundle) — `convex/engagement.ts` `record` mutation fired fire-and-forget from link-click/save/share/view touchpoints (both curated + generated)
```

- [ ] **Step 5: Update `docs/checkpoint.md`**

Add to the `### This Session (2026-07-18)` Completed Items block:

```
- [x] M3/M4 engagement counters + Popular tab: `engagement.record` upserts per-bundle counters at every click/save/share/view touchpoint; pure unit-tested `popularityScore`; `/popular` ranks publicly-shared user-generated bundles (distinct from editorial `/trending`), cross-linked, with a cold-start empty state. Verified: Vitest green, tsc/build clean, Playwright chromium green incl. new popular.spec.
```

Add a Change Log row:

```
| 2026-07-18 | pending | M3/M4: engagementCounters wired + Popular tab (`convex/engagement.ts`, `src/lib/bundles/popularity.ts`, `/popular`) |
```

Bump the M3 and M4 milestone-progress rows to reflect engagement counters + Popular tab now done.

- [ ] **Step 6: Update `docs/handover.md`**

Remove "Popular tab (ranks by `engagementCounters`)" from the §5 unblocked next-steps list and add a one-line "Done 2026-07-18" note pointing at this plan, matching the past-bundle-memory entry's format.

- [ ] **Step 7: Final commit**

```bash
git add tests/e2e/popular.spec.ts docs/tasks.md docs/checkpoint.md docs/handover.md docs/superpowers/plans/2026-07-18-m4-popular-tab.md
git commit -m "test+docs: Popular tab E2E + M3/M4 closeout"
```

---

## Self-Review notes

- **Spec coverage:** PRD F6 Popular ("ranked by engagement score — link clicks, saves, shares") → Tasks 1-4; data-schema `engagementCounters` + formula → Tasks 1-3; tasks.md M3 "engagementCounters wired" + M4 "Popular tab" → all covered.
- **No invented events:** Popular page reuses `retailer_link_clicked`; no `popular_viewed`. Confirmed against the `AnalyticsEvent` union.
- **Type consistency:** `record` arg names (`bundleId`/`kind`/`type`) and `listPopular` return (`{...bundle, score}`) are used identically in Tasks 3-4. `popularityScore`/`EngagementCounts` identical across Tasks 1-2.
- **Deferred (backlog-worthy, not in scope):** folding curated bundles into Popular ranking; abuse-hardening the unauthenticated `record` mutation; an index on `engagementCounters.kind` if the table grows.
